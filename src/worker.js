// THT Bản tin – Cloudflare Worker
// • Web app (/, /api/*): tải file trên trình duyệt, soạn bằng Claude, xem trước, đăng Facebook
// • Bot Telegram (/tg/*): thả file → chọn mẫu → xem trước → duyệt → đăng FB / Story / TikTok / YouTube
// • Trang tra cứu công khai (/tc/<tên>)
import { generateContent, reviseContent } from "./claude.js";
import { withFbFooter } from "./contact.js";
import { lookupPage } from "./lookup.js";
import { postToPage } from "./facebook.js";
import { brandOf } from "./render.js";
import { handleUpdate, processTask, internal, tiktokRoutes, setupWebhook } from "./bot.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (msg, status = 400) => json({ error: msg }, status);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/tg/webhook" && request.method === "POST") {
        if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TG_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env).catch((e) => console.error("tg", e)));
        return new Response("ok");
      }
      if (url.pathname === "/tg/setup") return await setupWebhook(url, env);
      if (url.pathname.startsWith("/tiktok/")) return await tiktokRoutes(url, env);
      if (url.pathname.startsWith("/api/internal/")) return await internal(request, env, url);
      if (url.pathname.startsWith("/tc/")) return await serveLookup(url, env);
      if (url.pathname.startsWith("/api/")) {
        if (!authorized(request, env)) return fail("Sai mật khẩu ứng dụng", 401);
        switch (`${request.method} ${url.pathname}`) {
          case "GET /api/config": return json(config(env));
          case "POST /api/generate": {
            const b = await request.json();
            if (!b.parts?.length) return fail("Chưa có tài liệu");
            const r = await generateContent(env, { parts: b.parts, note: b.note, verify: b.verify !== false, quality: b.quality || "fast", pages: b.pages || "auto" });
            if (r.content) r.content.facebook_caption = withFbFooter(r.content.facebook_caption);
            return json({ content: r.content, checks: r.checks });
          }
          case "POST /api/revise": {
            const b = await request.json();
            if (!b.content || !b.instruction) return fail("Thiếu nội dung hoặc yêu cầu sửa");
            const rc = await reviseContent(env, b.content, b.instruction, b.quality || "fast");
            if (rc) rc.facebook_caption = withFbFooter(rc.facebook_caption);
            return json({ content: rc });
          }
          case "POST /api/lookup": return await saveLookup(await request.json(), env, url);
          case "POST /api/publish": return await publishWeb(await request.json(), env);
          case "GET /api/history": return await history(env);
          default: return fail("Không có API này", 404);
        }
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return fail(e.message || String(e), 500);
    }
  },

  // Queue consumer: slow Telegram work (Claude, rendering, publishing)
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try { await processTask(msg.body, env); } catch (e) { console.error("task", e); }
      msg.ack();
    }
  },
};

// ---------- web app auth ----------
function authorized(request, env) {
  const expected = env.APP_PASSWORD || "";
  const given = request.headers.get("x-app-key") || "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const config = (env) => ({
  dryRun: env.DRY_RUN === "1",
  facebookReady: Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN),
  model: env.CLAUDE_MODEL || "claude-haiku-5-5",
  defaultQr: env.DEFAULT_QR_URL || "https://form.thtaudit.com.vn/",
});

// ---------- lookup pages ----------
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
async function saveLookup(body, env, url) {
  const { slug, title, subtitle, cols, mst, rows } = body;
  if (!SLUG.test(slug || "")) return fail("Tên đường dẫn chỉ gồm chữ thường, số, gạch ngang (2–40 ký tự)");
  if (!Array.isArray(rows) || !rows.length) return fail("Danh sách trống");
  await env.FILES.put(`tc/${slug}.json`, JSON.stringify({ title, subtitle, cols, mst, rows }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json({ url: `${env.PUBLIC_BASE_URL || url.origin}/tc/${slug}`, count: rows.length });
}
async function serveLookup(url, env) {
  const m = url.pathname.match(/^\/tc\/([a-z0-9-]+)(\/data\.json)?\/?$/);
  if (!m) return new Response("Không tìm thấy", { status: 404 });
  const obj = await env.FILES.get(`tc/${m[1]}.json`);
  if (!obj) return new Response("Không tìm thấy trang tra cứu", { status: 404 });
  if (m[2]) return new Response(obj.body, { headers: { ...JSON_HEADERS, "cache-control": "public, max-age=300" } });
  const meta = JSON.parse(await obj.text());
  return new Response(lookupPage({ title: meta.title, subtitle: meta.subtitle, total: meta.rows.length, slug: m[1], brand: brandOf(env) }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

// ---------- web app publish (1–3 page images) ----------
async function publishWeb(body, env) {
  const { caption, title = "", style = "" } = body;
  const images = body.images || (body.image ? [body.image] : []);
  if (!images.length || !caption) return fail("Thiếu ảnh poster hoặc nội dung bài đăng");
  const id = crypto.randomUUID();
  const bytesList = images.map((im) => Uint8Array.from(atob(im.replace(/^data:image\/\w+;base64,/, "")), (c) => c.charCodeAt(0)));
  const key = `posts/${new Date().toISOString().slice(0, 10)}/${id}`;
  for (const [i, b] of bytesList.entries()) await env.FILES.put(`${key}-${i + 1}.png`, b, { httpMetadata: { contentType: "image/png" } });
  let link = "", status = "dry_run";
  if (env.DRY_RUN !== "1") {
    try { link = await postToPage(env, bytesList, caption); status = "published"; }
    catch (e) { await record(env, { id, title, style, caption, link: "", key, status: "error" }); return fail(e.message, 502); }
  }
  await record(env, { id, title, style, caption, link, key, status });
  return json({ id, link, status });
}
async function record(env, r) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO posts (id, created_at, title, style, caption, fb_link, image_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(r.id, new Date().toISOString(), r.title, r.style, r.caption, r.link, r.key, r.status).run();
}
async function history(env) {
  if (!env.DB) return json({ items: [] });
  const { results } = await env.DB.prepare("SELECT id, created_at, title, style, fb_link, status FROM posts ORDER BY created_at DESC LIMIT 30").all();
  return json({ items: results });
}
