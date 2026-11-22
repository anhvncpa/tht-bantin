// Đăng đa kênh ngoài Facebook: Instagram (ảnh/carousel), Threads (chữ + ảnh poster).
// Instagram Reels / Facebook Reels đăng từ luồng video (video/run.py) vì cần file video vừa dựng.
// Ảnh/video được Meta tải về qua link công khai có chữ ký: /m/<jobId>/<file>?s=<hmac>
import { zaloUrl } from "./contact.js";
import { claude, modelFor } from "./claude.js";
import { screenshot, pageDocument } from "./render.js";

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.INTERNAL_KEY || env.APP_PASSWORD || "tht"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg))).slice(0, 32);
}

// ---------- link công khai có chữ ký (chỉ file trong jobs/<id>/) ----------
export async function mediaUrl(env, jobId, file) {
  return `${env.PUBLIC_BASE_URL}/m/${jobId}/${file}?s=${await hmac(env, `${jobId}/${file}`)}`;
}
export async function serveMedia(url, env) {
  const m = url.pathname.match(/^\/m\/([A-Za-z0-9-]{4,40})\/([a-z0-9_.-]{3,40})$/);
  if (!m || url.searchParams.get("s") !== (await hmac(env, `${m[1]}/${m[2]}`))) return new Response("forbidden", { status: 403 });
  const obj = await env.FILES.get(`jobs/${m[1]}/${m[2]}`);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public, max-age=86400" } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const graph = (env) => `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v26.0"}`;

// ---------- Instagram ----------
async function igPost(env, path, params) {
  const r = await fetch(`${graph(env)}/${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || `HTTP ${r.status}`);
  return j;
}
async function igGet(env, path, params = {}) {
  const r = await fetch(`${graph(env)}/${path}?${new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN })}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}
// ID tài khoản Instagram chuyên nghiệp nối với fanpage (tự dò, có thể đặt sẵn biến IG_USER_ID)
export async function igUserId(env, kvGet, kvSet) {
  if (env.IG_USER_ID) return env.IG_USER_ID;
  const cached = kvGet ? await kvGet(env, "ig:user") : null;
  if (cached) return cached;
  const p = await igGet(env, env.FB_PAGE_ID, { fields: "instagram_business_account" });
  const id = p.instagram_business_account?.id;
  if (!id) throw new Error("Fanpage chưa nối tài khoản Instagram chuyên nghiệp (Cài đặt trang → Tài khoản đã liên kết → Instagram)");
  if (kvSet) await kvSet(env, "ig:user", id);
  return id;
}
async function igWait(env, id, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const s = await igGet(env, id, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram xử lý ảnh lỗi (${s.status_code})`);
    await sleep(3000);
  }
  throw new Error("Instagram xử lý quá lâu");
}

// Instagram chỉ nhận JPEG → dựng lại các trang poster dạng JPEG (lưu cache trong R2)
async function jpegPages(env, job) {
  const files = [];
  for (let i = 0; i < job.render.pages.length; i++) {
    const key = `jobs/${job.id}/page${i + 1}.jpg`;
    if (!(await env.FILES.head(key))) {
      const bytes = await screenshot(env, pageDocument(job.style, job.content, env, job.qr_url, i, "a4"), 794, 1123, "jpeg");
      await env.FILES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    }
    files.push(`page${i + 1}.jpg`);
  }
  return files;
}

export function igCaption(fbText) {
  // Instagram: tối đa 2.200 ký tự, 30 hashtag; link không bấm được nên giữ nguyên chữ
  let t = String(fbText || "");
  const tags = t.match(/#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > 30) for (const x of tags.slice(30)) t = t.replace(x, "");
  return t.length > 2200 ? t.slice(0, 2190).replace(/\s+\S*$/, "") + "…" : t;
}

export async function postInstagram(env, job, caption, kvGet, kvSet) {
  if (!env.FB_PAGE_TOKEN) throw new Error("Chưa có FB_PAGE_TOKEN");
  const ig = await igUserId(env, kvGet, kvSet);
  const files = await jpegPages(env, job);
  const urls = [];
  for (const f of files) urls.push(await mediaUrl(env, job.id, f));
  let creation;
  if (urls.length === 1) {
    creation = (await igPost(env, `${ig}/media`, { image_url: urls[0], caption })).id;
  } else {
    const kids = [];
    for (const u of urls.slice(0, 10)) kids.push((await igPost(env, `${ig}/media`, { image_url: u, is_carousel_item: "true" })).id);
    for (const k of kids) await igWait(env, k);
    creation = (await igPost(env, `${ig}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption })).id;
  }
  await igWait(env, creation);
  const pub = await igPost(env, `${ig}/media_publish`, { creation_id: creation });
  try { return (await igGet(env, pub.id, { fields: "permalink" })).permalink || `Instagram ${pub.id}`; }
  catch (_) { return `Instagram ${pub.id}`; }
}

// ---------- Threads ----------
const TH = "https://graph.threads.net";
export async function threadsRoutes(url, env, kvGet, kvSet) {
  const redirect = `${env.PUBLIC_BASE_URL}/threads/callback`;
  if (url.pathname === "/threads/login") {
    if (url.searchParams.get("key") !== env.APP_PASSWORD) return new Response("Sai mật khẩu", { status: 403 });
    if (!env.THREADS_APP_ID) return new Response("Chưa đặt THREADS_APP_ID trong Cloudflare", { status: 400 });
    const state = crypto.randomUUID();
    await kvSet(env, "threads_state", state);
    const q = new URLSearchParams({ client_id: env.THREADS_APP_ID, redirect_uri: redirect, scope: "threads_basic,threads_content_publish,threads_manage_insights", response_type: "code", state });
    return Response.redirect(`https://threads.net/oauth/authorize?${q}`, 302);
  }
  if (url.pathname === "/threads/callback") {
    if (url.searchParams.get("state") !== (await kvGet(env, "threads_state"))) return new Response("Phiên đăng nhập không hợp lệ", { status: 400 });
    const r = await fetch(`${TH}/oauth/access_token`, { method: "POST", body: new URLSearchParams({
      client_id: env.THREADS_APP_ID, client_secret: env.THREADS_APP_SECRET || "", grant_type: "authorization_code", redirect_uri: redirect, code: (url.searchParams.get("code") || "").replace(/#_$/, "") }) });
    const short = await r.json();
    if (!short.access_token) return new Response(`Threads không cấp token: ${JSON.stringify(short)}`, { status: 400 });
    const l = await (await fetch(`${TH}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: env.THREADS_APP_SECRET || "", access_token: short.access_token })}`)).json();
    const tok = l.access_token ? l : { access_token: short.access_token, expires_in: 3600 };
    await kvSet(env, "threads_token", JSON.stringify({ access_token: tok.access_token, expires_in: tok.expires_in, user_id: short.user_id, obtained_at: Date.now() }));
    return new Response("Đã kết nối Threads cho bot THT. Có thể đóng trang này.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("not found", { status: 404 });
}

export async function threadsToken(env, kvGet, kvSet) {
  const raw = await kvGet(env, "threads_token");
  if (!raw) return null;
  const t = JSON.parse(raw);
  // token dài hạn 60 ngày: làm mới khi đã quá 7 ngày
  if (Date.now() - t.obtained_at > 7 * 86400e3) {
    try {
      const n = await (await fetch(`${TH}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: t.access_token })}`)).json();
      if (n.access_token) { const nt = { ...t, access_token: n.access_token, expires_in: n.expires_in, obtained_at: Date.now() }; await kvSet(env, "threads_token", JSON.stringify(nt)); return nt; }
    } catch (_) {}
  }
  return t;
}

// Bài Threads ≤ 500 ký tự, viết lại cho văn phong Threads (Haiku, rất rẻ); lưu vào content để không viết lại
const THREADS_TOOL = { name: "threads_post", description: "Bài Threads", input_schema: { type: "object", properties: { text: { type: "string", description: "≤ 480 ký tự" } }, required: ["text"] } };
export async function threadsText(env, content) {
  if (content.threads_text) return content.threads_text;
  let text = "";
  try {
    const msg = await claude(env, { model: modelFor(env, "cheap"), max_tokens: 700,
      system: "Viết 1 bài Threads tiếng Việt cho THT Audit (kiểm toán – thuế). Tối đa 480 ký tự, không markdown. Dòng 1: tin chính có con số/hạn chót. 2–3 dòng: ai bị ảnh hưởng, việc cần làm (dùng • ). Dòng cuối: 1 câu hỏi mời thảo luận. Tối đa 1 hashtag chủ đề. Chỉ dùng thông tin có trong dữ liệu. Gọi threads_post.",
      tools: [THREADS_TOOL], tool_choice: { type: "tool", name: "threads_post" },
      messages: [{ role: "user", content: JSON.stringify({ tieu_de: [content.title_line1, content.title_line2].filter(Boolean).join(" "), nhom_chiu_anh_huong: content.audience, y_chinh: content.points, viec_can_lam: content.actions, khuyen_nghi: content.recommendation, can_cu: content.doc_ref, bai_fb: String(content.facebook_caption || "").slice(0, 1500) }) }] });
    text = msg.content.find((b) => b.type === "tool_use")?.input?.text || "";
  } catch (_) {}
  if (!text) text = String(content.facebook_caption || "").split("\n").filter(Boolean).slice(0, 5).join("\n");
  text = text.length > 495 ? text.slice(0, 490).replace(/\s+\S*$/, "") + "…" : text;
  content.threads_text = text;
  return text;
}

// Gắn link nhóm Zalo cuối bài Threads, giữ tổng ≤ 500 ký tự (giới hạn của Threads)
function withZalo(text, env) {
  const url = zaloUrl(env);
  if (!url || String(text).includes(url)) return text;
  const tail = `\n\n👥 Nhóm Zalo THT Audit: ${url}`;
  let body = String(text || "").trim();
  if (body.length + tail.length > 500) body = body.slice(0, 500 - tail.length - 1).replace(/\s+\S*$/, "") + "…";
  return body + tail;
}

export async function postThreads(env, job, kvGet, kvSet) {
  const t = await threadsToken(env, kvGet, kvSet);
  if (!t) throw new Error("Chưa kết nối Threads (mở /threads/login?key=...)");
  const text = withZalo(await threadsText(env, job.content), env);
  const params = { access_token: t.access_token, text };
  if (job.render?.pages?.length) { params.media_type = "IMAGE"; params.image_url = await mediaUrl(env, job.id, "page1.png"); }
  else params.media_type = "TEXT";
  const c = await (await fetch(`${TH}/v1.0/me/threads`, { method: "POST", body: new URLSearchParams(params) })).json();
  if (!c.id) throw new Error(c.error?.message || JSON.stringify(c).slice(0, 200));
  if (params.media_type === "IMAGE") {
    for (let i = 0; i < 15; i++) {
      const s = await (await fetch(`${TH}/v1.0/${c.id}?fields=status,error_message&access_token=${encodeURIComponent(t.access_token)}`)).json();
      if (s.status === "FINISHED") break;
      if (s.status === "ERROR") throw new Error(`Threads xử lý ảnh lỗi: ${s.error_message || ""}`);
      await sleep(3000);
    }
  }
  const p = await (await fetch(`${TH}/v1.0/me/threads_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: t.access_token }) })).json();
  if (!p.id) throw new Error(p.error?.message || JSON.stringify(p).slice(0, 200));
  try {
    const l = await (await fetch(`${TH}/v1.0/${p.id}?fields=permalink&access_token=${encodeURIComponent(t.access_token)}`)).json();
    return l.permalink || `Threads ${p.id}`;
  } catch (_) { return `Threads ${p.id}`; }
}

// ---------- số người theo dõi các kênh (báo cáo tuần) ----------
export async function channelStats(env, kvGet, kvSet) {
  const out = {};
  try {
    const ig = await igUserId(env, kvGet, kvSet);
    const j = await igGet(env, ig, { fields: "followers_count,media_count,username" });
    out.instagram = { followers: j.followers_count, posts: j.media_count, user: j.username };
  } catch (e) { out.instagram = { error: e.message.slice(0, 120) }; }
  try {
    const t = await threadsToken(env, kvGet, kvSet);
    if (t) {
      const since = Math.floor((Date.now() - 7 * 86400e3) / 1000), until = Math.floor(Date.now() / 1000);
      const j = await (await fetch(`${TH}/v1.0/me/threads_insights?${new URLSearchParams({ metric: "views,likes,replies,reposts,followers_count", since: String(since), until: String(until), access_token: t.access_token })}`)).json();
      const val = (n) => { const m = (j.data || []).find((x) => x.name === n); return m ? (m.total_value?.value ?? (m.values || []).reduce((a, v) => a + (v.value || 0), 0)) : null; };
      out.threads = j.error ? { error: j.error.message } : { followers: val("followers_count"), views_7d: val("views"), likes_7d: val("likes"), replies_7d: val("replies"), reposts_7d: val("reposts") };
    } else out.threads = { error: "chưa kết nối" };
  } catch (e) { out.threads = { error: e.message.slice(0, 120) }; }
  return out;
}
