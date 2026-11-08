// THT Agent Hub – nơi theo dõi chung mọi AI Agent của THT (bot bản tin, bot kế toán, Zalo bot, agent XDCB…).
// Mỗi agent gửi "sự kiện" (bước nào, trạng thái gì, đã nghĩ gì, tốn bao nhiêu) → Hub lưu D1 → trang /hub hiển thị.
// Agent trong worker này gọi hubEvent() trực tiếp; agent bên ngoài POST /hub/api/event với header x-hub-key.

// Định nghĩa sẵn các agent đã biết (agent khác tự đăng ký qua POST /hub/api/agent)
export const KNOWN_AGENTS = {
  bantin: {
    name: "Bot Bản tin Thuế – Luật", icon: "📰", color: "#E8590C",
    description: "Dò văn bản & video chính sách, chọn 1 bài/ngày, soạn poster song ngữ, đăng Facebook/TikTok/YouTube",
    steps: [
      { id: "scout", label: "Dò tin & video" }, { id: "pick", label: "Chọn bài" }, { id: "draft", label: "Soạn nháp" },
      { id: "editor", label: "Tổng biên tập" }, { id: "render", label: "Dựng poster" }, { id: "review", label: "Chờ duyệt" },
      { id: "publish", label: "Đăng bài" }, { id: "video", label: "Dựng video" }, { id: "weekly", label: "Tự đánh giá tuần" },
    ],
  },
};

// Giá Claude (USD / 1 triệu token) – dùng để ước tính chi phí từng bước
const PRICE = { opus: [4, 20], sonnet: [2, 10], haiku: [0.1, 0.5] };
export function costOf(model, usage = {}) {
  const k = /opus/.test(model) ? "opus" : /haiku/.test(model) ? "haiku" : "sonnet";
  const [pi, po] = PRICE[k];
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25;
  const cached = (usage.cache_read_input_tokens || 0) * 0.05;
  const searches = usage.server_tool_use?.web_search_requests || 0;
  return ((inTok + cached) * pi + (usage.output_tokens || 0) * po) / 1e6 + searches * 0.01;
}

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS hub_agents (id TEXT PRIMARY KEY, name TEXT, icon TEXT, color TEXT, description TEXT, steps TEXT, last_seen TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS hub_runs (id TEXT PRIMARY KEY, agent_id TEXT, title TEXT, status TEXT, step TEXT, started_at TEXT, updated_at TEXT, cost REAL DEFAULT 0)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS hub_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, run_id TEXT, step TEXT, status TEXT, title TEXT, detail TEXT, cost REAL DEFAULT 0, ts TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS hub_ev_run ON hub_events(run_id, id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS hub_ev_ts ON hub_events(ts)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS hub_runs_agent ON hub_runs(agent_id, updated_at)`),
  ]);
  ready = true;
}

const RUN_STATUS = { start: "running", running: "running", waiting: "waiting", done: "done", error: "error" };
const clip = (s, n) => { s = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s, null, 1); return s.length > n ? s.slice(0, n) + "…" : s; };

// Ghi 1 sự kiện. Không bao giờ ném lỗi ra ngoài (Hub hỏng không được làm hỏng agent).
// status: start | done | waiting | error | info | ai
export async function hubEvent(env, e) {
  try {
    if (!env?.DB || !e?.run) return;
    await ensure(env);
    const ts = new Date().toISOString(), agent = e.agent || env.HUB_AGENT || "bantin";
    const def = KNOWN_AGENTS[agent] || e.agentDef;
    const stmts = [
      env.DB.prepare(`INSERT INTO hub_agents (id, name, icon, color, description, steps, last_seen) VALUES (?1,?2,?3,?4,?5,?6,?7)
        ON CONFLICT(id) DO UPDATE SET last_seen=?7`).bind(agent, def?.name || agent, def?.icon || "🤖", def?.color || "#4C6EF5", def?.description || "", JSON.stringify(def?.steps || []), ts),
      env.DB.prepare(`INSERT INTO hub_events (agent_id, run_id, step, status, title, detail, cost, ts) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(agent, e.run, e.step || "", e.status || "info", clip(e.title, 300), clip(e.detail, 12000), e.cost || 0, ts),
    ];
    const st = RUN_STATUS[e.status];
    stmts.push(env.DB.prepare(`INSERT INTO hub_runs (id, agent_id, title, status, step, started_at, updated_at, cost) VALUES (?1,?2,?3,?4,?5,?6,?6,?7)
      ON CONFLICT(id) DO UPDATE SET title=COALESCE(?8, title), status=COALESCE(?9, status), step=COALESCE(?10, step), updated_at=?6, cost=cost+?7`)
      .bind(e.run, agent, e.runTitle || e.title || e.run, st || "running", e.step || "", ts, e.cost || 0, e.runTitle || null, st || null, st ? e.step || null : null));
    await env.DB.batch(stmts);
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM hub_events WHERE ts < ?").bind(new Date(Date.now() - 90 * 86400e3).toISOString()).run();
  } catch (err) { console.log("hub", err.message); }
}

// Ghi chi phí 1 lần gọi AI vào bước đang chạy (env.HUB_RUN / env.HUB_STEP do agent đặt)
export async function hubAI(env, model, usage, label) {
  if (!env?.HUB_RUN) return;
  const cost = costOf(model, usage);
  const short = model.replace("claude-", "").replace(/-\d.*$/, "");
  await hubEvent(env, { run: env.HUB_RUN, step: env.HUB_STEP || "", status: "ai", cost,
    title: `${label || "Gọi AI"} · ${short} · ${(usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0)}→${usage?.output_tokens || 0} token · $${cost.toFixed(3)}` });
}

// ---------------- Đăng nhập nhúng từ My THT (không cần gõ mật khẩu) ----------------
// My THT (đã đăng nhập, quyền quản trị) ký 1 vé ngắn hạn bằng HUB_EMBED_SECRET → Hub đổi vé lấy phiên 12 giờ.
// Vé: base64url(JSON {u, r, exp}) + "." + base64url(HMAC-SHA256(secret, phần trước))
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
export async function signTicket(secret, payload) {
  const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}
async function verifyTicket(secret, t) {
  if (!secret || !t || !t.includes(".")) return null;
  const [body, sig] = t.split(".");
  if (!same(sig, await hmac(secret, body))) return null;
  try { const p = JSON.parse(new TextDecoder().decode(fromB64u(body))); return p.exp > Date.now() / 1000 ? p : null; } catch (_) { return null; }
}
const ADMIN_ROLES = /^(admin|owner|director|giamdoc|quantri|quản trị|giám đốc)$/i;
async function viewer(request, env) {
  if (same(request.headers.get("x-app-key"), env.APP_PASSWORD)) return { u: "mat-khau-ung-dung" };
  const p = await verifyTicket(env.HUB_EMBED_SECRET, request.headers.get("x-hub-session"));
  return p && p.kind === "session" ? p : null;
}

// ---------------- API cho trang /hub và agent bên ngoài ----------------
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const same = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export async function hubRoutes(request, env, url) {
  await ensure(env);
  const path = url.pathname.replace(/^\/hub\/api/, "");
  // Agent bên ngoài ghi sự kiện / đăng ký
  if (request.method === "POST" && (path === "/event" || path === "/agent")) {
    const key = request.headers.get("x-hub-key");
    if (!same(key, env.HUB_KEY || env.INTERNAL_KEY)) return J({ error: "Sai x-hub-key" }, 403);
    const b = await request.json();
    if (path === "/agent") {
      if (!b.id) return J({ error: "Thiếu id" }, 400);
      KNOWN_AGENTS[b.id] = { name: b.name || b.id, icon: b.icon || "🤖", color: b.color || "#4C6EF5", description: b.description || "", steps: b.steps || [] };
      await env.DB.prepare(`INSERT INTO hub_agents (id, name, icon, color, description, steps, last_seen) VALUES (?1,?2,?3,?4,?5,?6,?7)
        ON CONFLICT(id) DO UPDATE SET name=?2, icon=?3, color=?4, description=?5, steps=?6, last_seen=?7`)
        .bind(b.id, b.name || b.id, b.icon || "🤖", b.color || "#4C6EF5", b.description || "", JSON.stringify(b.steps || []), new Date().toISOString()).run();
      return J({ ok: true });
    }
    if (!b.agent || !b.run) return J({ error: "Thiếu agent hoặc run" }, 400);
    await hubEvent(env, b);
    return J({ ok: true });
  }
  // Đổi vé My THT lấy phiên xem 12 giờ (chỉ tài khoản quản trị)
  if (request.method === "POST" && path === "/session") {
    const { t } = await request.json().catch(() => ({}));
    const p = await verifyTicket(env.HUB_EMBED_SECRET, t);
    if (!p || p.kind === "session") return J({ error: "Vé đăng nhập không hợp lệ hoặc đã hết hạn" }, 401);
    if (!ADMIN_ROLES.test(String(p.r || ""))) return J({ error: "Chỉ Giám đốc/Quản trị được xem Agent Hub" }, 403);
    const session = await signTicket(env.HUB_EMBED_SECRET, { kind: "session", u: p.u, r: p.r, exp: Math.floor(Date.now() / 1000) + 12 * 3600 });
    return J({ session, user: p.u });
  }
  // Trang xem: mật khẩu ứng dụng (mở trực tiếp) hoặc phiên từ My THT (nhúng)
  if (!(await viewer(request, env))) return J({ error: "Sai mật khẩu" }, 401);
  const DB = env.DB;
  if (path === "/overview") {
    const day = new Date(Date.now() - 86400e3).toISOString();
    const month = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
    const [agents, stats, runs, recent, costMonth] = await Promise.all([
      DB.prepare("SELECT * FROM hub_agents ORDER BY last_seen DESC").all(),
      DB.prepare(`SELECT agent_id, COUNT(*) n, SUM(status='error') err, SUM(cost) cost FROM hub_events WHERE ts >= ? GROUP BY agent_id`).bind(day).all(),
      DB.prepare(`SELECT r.* FROM hub_runs r JOIN (SELECT agent_id, MAX(updated_at) m FROM hub_runs GROUP BY agent_id) x ON x.agent_id=r.agent_id AND x.m=r.updated_at`).all(),
      DB.prepare(`SELECT e.*, r.title run_title FROM hub_events e LEFT JOIN hub_runs r ON r.id=e.run_id WHERE e.status != 'ai' ORDER BY e.id DESC LIMIT 60`).all(),
      DB.prepare(`SELECT SUM(cost) c FROM hub_events WHERE substr(ts,1,7) = ?`).bind(month).first(),
    ]);
    const waiting = await DB.prepare(`SELECT COUNT(*) n FROM hub_runs WHERE status='waiting'`).first();
    const running = await DB.prepare(`SELECT COUNT(*) n FROM hub_runs WHERE status='running' AND updated_at >= ?`).bind(new Date(Date.now() - 30 * 60e3).toISOString()).first();
    return J({ agents: agents.results, stats: stats.results, latest: runs.results, recent: recent.results,
      totals: { cost_month: costMonth?.c || 0, waiting: waiting?.n || 0, running: running?.n || 0, errors_24h: (stats.results || []).reduce((a, x) => a + (x.err || 0), 0) } });
  }
  let m;
  if ((m = path.match(/^\/agent\/([\w-]+)$/))) {
    const id = m[1], week = new Date(Date.now() - 7 * 86400e3).toISOString();
    const [agent, steps, runs] = await Promise.all([
      DB.prepare("SELECT * FROM hub_agents WHERE id=?").bind(id).first(),
      DB.prepare(`SELECT step, COUNT(*) n, SUM(status='error') err FROM hub_events WHERE agent_id=? AND ts>=? AND status IN ('start','done','waiting','error') GROUP BY step`).bind(id, week).all(),
      DB.prepare(`SELECT * FROM hub_runs WHERE agent_id=? ORDER BY updated_at DESC LIMIT 40`).bind(id).all(),
    ]);
    if (!agent) return J({ error: "Không có agent này" }, 404);
    return J({ agent, steps: steps.results, runs: runs.results });
  }
  if ((m = path.match(/^\/run\/([\w:.-]+)$/))) {
    const run = await DB.prepare("SELECT * FROM hub_runs WHERE id=?").bind(m[1]).first();
    const ev = await DB.prepare("SELECT * FROM hub_events WHERE run_id=? ORDER BY id").bind(m[1]).all();
    return J({ run, events: ev.results });
  }
  return J({ error: "Không có API này" }, 404);
}
