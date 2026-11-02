// Telegram bot: webhook (fast) + queue tasks (slow work) + endpoints used by the GitHub video workflow.
// Chạy được cả trong chat riêng lẫn nhóm (group/supergroup).
import { generateContent, reviseContent } from "./claude.js";
import { readBuffer } from "./extract.js";
import { renderJob, STYLE_NAMES } from "./render.js";
import { postToPage } from "./facebook.js";
import { tg, send, keyboard, download, sendAlbum, sendVideo } from "./telegram.js";
import { sendWordSet } from "./word.js";

const now = () => new Date().toISOString();
const URL_RE = /https?:\/\/\S+/;

// ---------------- D1 helpers ----------------
async function getJob(env, id) {
  const r = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
  if (!r) return null;
  return { ...r, files: JSON.parse(r.files || "[]"), content: r.content ? JSON.parse(r.content) : null, render: r.render ? JSON.parse(r.render) : null };
}
async function saveJob(env, j) {
  await env.DB.prepare(`INSERT INTO jobs (id, chat_id, status, style, pages, quality, note, qr_url, files, content, checks, render, media_group, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
    ON CONFLICT(id) DO UPDATE SET status=?3, style=?4, pages=?5, quality=?6, note=?7, qr_url=?8, files=?9, content=?10, checks=?11, render=?12, media_group=?13, updated_at=?15`)
    .bind(j.id, j.chat_id, j.status, j.style || null, j.pages || "auto", j.quality || "fast", j.note || "", j.qr_url || null,
      JSON.stringify(j.files || []), j.content ? JSON.stringify(j.content) : null, j.checks || "", j.render ? JSON.stringify(j.render) : null,
      j.media_group || null, j.created_at || now(), now()).run();
}
const kvGet = async (env, k) => (await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first())?.v ?? null;
const kvSet = (env, k, v) => env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
const kvDel = (env, k) => env.DB.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
async function openJob(env, chatId) {
  const r = await env.DB.prepare("SELECT id FROM jobs WHERE chat_id = ? AND status = 'collecting' ORDER BY created_at DESC LIMIT 1").bind(chatId).first();
  return r ? getJob(env, r.id) : null;
}

// ---------------- keyboards ----------------
const styleKb = (id) => keyboard([
  [["1. Navy & cam", `st:${id}:1`], ["2. Swiss", `st:${id}:2`]],
  [["3. Xanh ngọc", `st:${id}:3`], ["4. Legal Brief", `st:${id}:4`]],
  [["5. Infographic", `st:${id}:5`]],
]);
const pagesKb = (id) => keyboard([
  [["Tự động (ưu tiên 1 trang)", `pg:${id}:auto`]],
  [["1 trang", `pg:${id}:1`], ["2 trang", `pg:${id}:2`], ["3 trang", `pg:${id}:3`]],
]);
const reviewKb = (id) => keyboard([
  [["✅ Đăng tất cả", `pub:${id}:fb,story,tiktok,youtube`]],
  [["📘 FB bài viết", `pub:${id}:fb`], ["📱 FB Story (nhạc)", `pub:${id}:story`]],
  [["🎵 TikTok", `pub:${id}:tiktok`], ["▶️ YouTube Shorts", `pub:${id}:youtube`]],
  [["✏️ Sửa", `ed:${id}`], ["🎨 Đổi mẫu", `rs:${id}`], ["🧠 Soạn kỹ (Sonnet)", `hq:${id}`]],
  [["📄 Word 4 bản", `wd:${id}`], ["❌ Huỷ", `x:${id}`]],
]);

const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
const allowed = (env, uid) => list(env.TG_ALLOWED_IDS).includes(String(uid));
const isGroupChat = (chat) => chat?.type === "group" || chat?.type === "supergroup";
// TG_ALLOWED_CHATS (tuỳ chọn): ID các nhóm được dùng bot, cách nhau dấu phẩy. Để trống = mọi nhóm (vẫn chỉ người trong TG_ALLOWED_IDS được ra lệnh).
const chatAllowed = (env, chat) => !isGroupChat(chat) || !list(env.TG_ALLOWED_CHATS).length || list(env.TG_ALLOWED_CHATS).includes(String(chat.id));
// "/moi@THTBot tham số" → "/moi"
const commandOf = (text) => {
  const t = (text || "").trim();
  return t.startsWith("/") ? t.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase() : "";
};
const editKey = (chat, uid) => `edit:${chat}:${uid}`;
const armKey = (chat, uid) => `arm:${chat}:${uid}`;

// ---------------- webhook: must answer fast ----------------
export async function handleUpdate(update, env) {
  if (update.callback_query) return onButton(update.callback_query, env);
  const m = update.message;
  if (!m) return;
  const chat = m.chat.id, uid = m.from?.id;
  const group = isGroupChat(m.chat);
  const cmd = commandOf(m.text);
  const captionCmd = commandOf(m.caption);

  if (cmd === "/id") return send(env, chat, group ? `ID Telegram của anh/chị: ${uid}\nID nhóm này: ${chat}` : `ID Telegram: ${uid}`);
  if (!allowed(env, uid) || !chatAllowed(env, m.chat)) {
    if (cmd === "/start" && !group) await send(env, chat, `Bot nội bộ THT. ID Telegram của anh/chị: ${uid}`);
    return;
  }
  if (cmd === "/start" || cmd === "/help") {
    return send(env, chat, "Gửi văn bản mới (Word, Excel, PDF hoặc ảnh chụp). Em soạn bản tin, anh chọn mẫu và số trang, xem trước rồi bấm đăng. " +
      "Có poster xong em tự soạn thêm 4 bản Word: Tiếng Việt · Anh–Việt · Trung giản thể–Việt · Trung phồn thể–Việt.\n" +
      "• Chú thích kèm file = ghi chú cho em. Có đường link trong chú thích → mã QR trỏ tới link đó.\n" +
      (group ? "• Trong nhóm: gõ /moi rồi gửi file, hoặc gửi file kèm chú thích /bantin. Ghi chú thêm: trả lời (reply) tin nhắn của bot.\n" : "") +
      `Lệnh: /moi bài mới · /bantin (nhóm) · /id xem ID${env.DRY_RUN === "1" ? "\n⚠️ Đang CHẾ ĐỘ THỬ (không đăng thật)" : ""}`);
  }
  if (cmd === "/moi" || cmd === "/bantin") {
    await env.DB.prepare("UPDATE jobs SET status='cancelled' WHERE chat_id = ? AND status = 'collecting'").bind(chat).run();
    await kvDel(env, editKey(chat, uid));
    if (group) await kvSet(env, armKey(chat, uid), "1");
    return send(env, chat, "OK, gửi file cho bài mới nhé.");
  }

  const doc = m.document, photo = m.photo?.[m.photo.length - 1];
  if (doc || photo) {
    let job = await openJob(env, chat);
    if (group) {
      // Trong nhóm chỉ nhận file khi: đã gõ /moi (/bantin), chú thích có /bantin, hoặc là ảnh/file cùng album với file đã nhận.
      const armed = (await kvGet(env, armKey(chat, uid))) !== null;
      const sameAlbum = job && m.media_group_id && job.media_group === m.media_group_id;
      if (!armed && captionCmd !== "/bantin" && !sameAlbum) return;
      if (!armed) await kvSet(env, armKey(chat, uid), "1");
    }
    if (!job) job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "collecting", files: [], note: "", created_at: now() };
    job.files.push(doc ? { file_id: doc.file_id, name: doc.file_name || "file", mime: doc.mime_type || "" } : { file_id: photo.file_id, name: `anh${job.files.length + 1}.jpg`, mime: "image/jpeg" });
    if (m.caption) {
      const cap = m.caption.replace(/^\/bantin(@\w+)?/i, "");
      const u = cap.match(URL_RE); if (u) job.qr_url = u[0];
      job.note = `${job.note} ${cap.replace(URL_RE, "")}`.trim();
    }
    const sameGroup = m.media_group_id && job.media_group === m.media_group_id;
    job.media_group = m.media_group_id || null;
    await saveJob(env, job);
    if (!sameGroup) await send(env, chat, `Đã nhận ${job.files.length} file. Gửi thêm nếu cần, hoặc chọn mẫu poster:`, styleKb(job.id));
    return;
  }

  if (m.text && !cmd) {
    const editing = await kvGet(env, editKey(chat, uid));
    if (editing) {
      await kvDel(env, editKey(chat, uid));
      await send(env, chat, "Đang sửa theo yêu cầu…");
      return env.JOBS.send({ type: "revise", jobId: editing, instruction: m.text });
    }
    // Trong nhóm, tin nhắn thường chỉ là ghi chú khi trả lời (reply) tin của bot – tránh lấy nhầm chuyện trò trong nhóm.
    if (group && !m.reply_to_message?.from?.is_bot) return;
    const job = await openJob(env, chat);
    if (job) {
      const u = m.text.match(URL_RE); if (u) job.qr_url = u[0];
      job.note = `${job.note} ${m.text.replace(URL_RE, "")}`.trim();
      await saveJob(env, job);
      return send(env, chat, "Đã ghi chú thêm. Chọn mẫu để bắt đầu:", styleKb(job.id));
    }
    if (!group) return send(env, chat, "Gửi file văn bản (Word, Excel, PDF, ảnh) để em làm bản tin nhé.");
  }
}

async function onButton(q, env) {
  const chat = q.message.chat.id, uid = q.from.id;
  if (!allowed(env, uid) || !chatAllowed(env, q.message.chat)) {
    return tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Anh/chị chưa được cấp quyền dùng bot này.", show_alert: true });
  }
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
  const [act, id, arg] = q.data.split(":");
  const job = await getJob(env, id);
  if (!job) return send(env, chat, "Bài này không còn, gửi file để làm bài mới.");
  const clearKb = () => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (act === "st") {
    job.style = arg;
    await saveJob(env, job);
    if (job.content) { await clearKb(); await send(env, chat, `Đổi sang mẫu ${arg} – ${STYLE_NAMES[arg]}, đang dựng lại…`); return env.JOBS.send({ type: "render", jobId: id }); }
    return tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `Mẫu ${arg} – ${STYLE_NAMES[arg]}. Bản tin mấy trang?`, ...pagesKb(id) });
  }
  if (act === "pg") {
    job.pages = arg; job.status = "working";
    await saveJob(env, job);
    await kvDel(env, armKey(chat, uid));
    await tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `Mẫu ${job.style} · ${arg === "auto" ? "tự động số trang" : arg + " trang"}. Đang đọc văn bản và kiểm chứng (1–2 phút)…` });
    return env.JOBS.send({ type: "generate", jobId: id });
  }
  if (act === "rs") return send(env, chat, "Chọn mẫu khác:", styleKb(id));
  if (act === "ed") { await kvSet(env, editKey(chat, uid), id); return send(env, chat, "Anh nhắn yêu cầu sửa (vd: “đổi tiêu đề thành…”, “gộp còn 1 trang”, “thêm thời hạn 30 ngày”)."); }
  if (act === "hq") { await clearKb(); job.quality = "strong"; await saveJob(env, job); await send(env, chat, "Đang soạn lại bằng Claude Sonnet (kỹ hơn, chi phí cao hơn)…"); return env.JOBS.send({ type: "generate", jobId: id }); }
  if (act === "wd") { await send(env, chat, "📄 Đang soạn lại 4 bản Word…"); return env.JOBS.send({ type: "word", jobId: id }); }
  if (act === "x") { await clearKb(); job.status = "cancelled"; await saveJob(env, job); return send(env, chat, "Đã huỷ bài này."); }
  if (act === "pub") { await clearKb(); return env.JOBS.send({ type: "publish", jobId: id, targets: arg.split(",") }); }
}

// ---------------- queue tasks (slow work) ----------------
export async function processTask(task, env) {
  const job = await getJob(env, task.jobId);
  if (!job) return;
  try {
    if (task.type === "generate") { await generate(env, job); await queueWord(env, job); }
    else if (task.type === "render") await renderAndPreview(env, job);
    else if (task.type === "revise") { job.content = await reviseContent(env, job.content, task.instruction, job.quality); await saveJob(env, job); await renderAndPreview(env, job); await queueWord(env, job); }
    else if (task.type === "word") await sendWordSet(env, job);
    else if (task.type === "publish") await publish(env, job, task.targets);
  } catch (e) {
    console.error(e);
    await send(env, job.chat_id, `Có lỗi: ${e.message}\nAnh thử lại, hoặc /moi để làm lại.`, reviewKbIfReady(job));
  }
}
const reviewKbIfReady = (job) => (job.content ? reviewKb(job.id) : {});

// Sau khi có poster: tự soạn 4 bản Word ở một tác vụ riêng (WORD_AUTO = "0" để tắt).
async function queueWord(env, job) {
  if (env.WORD_AUTO === "0" || !job.content) return;
  await send(env, job.chat_id, "📄 Đang soạn 4 bản Word (Việt · Anh–Việt · Trung giản–Việt · Trung phồn–Việt)…");
  await env.JOBS.send({ type: "word", jobId: job.id });
}

async function generate(env, job) {
  const parts = []; let table = null;
  for (const f of job.files) {
    const buf = await download(env, f.file_id);
    const r = await readBuffer(f.name, f.mime, buf);
    parts.push(r.part); table = table || r.table;
  }
  const { content, checks } = await generateContent(env, { parts, note: job.note, verify: env.WEB_VERIFY !== "0", quality: job.quality, pages: job.pages || "auto" });
  job.content = content; job.checks = checks;
  if (table && !job.qr_url) {
    const slug = (content.slug || job.id).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || job.id;
    await env.FILES.put(`tc/${slug}.json`, JSON.stringify({ title: "Tra cứu danh sách doanh nghiệp", subtitle: content.doc_ref || "", ...table }),
      { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    job.qr_url = `${env.PUBLIC_BASE_URL}/tc/${slug}`;
    job.lookup_rows = table.rows.length;
  }
  if (!job.qr_url) job.qr_url = env.DEFAULT_QR_URL || "https://form.thtaudit.com.vn/";
  job.status = "review";
  await saveJob(env, job);
  await renderAndPreview(env, job, table ? table.rows.length : 0);
}

async function renderAndPreview(env, job, lookupRows = 0) {
  job.render = await renderJob(env, job);
  job.status = "review";
  await saveJob(env, job);
  const images = [];
  for (const [i, k] of job.render.pages.entries()) images.push({ name: `trang${i + 1}.png`, bytes: new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()) });
  const c = job.content;
  await sendAlbum(env, job.chat_id, images, `Bản xem trước · mẫu ${job.style} – ${STYLE_NAMES[job.style]} · ${images.length} trang`);
  const notes = [];
  if (c.corrections?.length) notes.push("⚠️ Đã chỉnh so với nguồn:\n" + c.corrections.map((x) => `• ${x}`).join("\n"));
  if (c.uncertain?.length) notes.push("❓ Cần anh kiểm tra:\n" + c.uncertain.map((x) => `• ${x}`).join("\n"));
  if (lookupRows) notes.push(`🔎 Trang tra cứu ${lookupRows.toLocaleString("vi-VN")} dòng: ${job.qr_url} (mã QR trỏ tới đây)`);
  if (notes.length) await send(env, job.chat_id, notes.join("\n\n"));
  await send(env, job.chat_id, "📘 Bài Facebook (chuẩn SEO):\n\n" + c.facebook_caption);
  await send(env, job.chat_id,
    `▶️ YouTube: ${c.youtube_title}\n🎵 TikTok/Story mở đầu: “${c.story_hook}”\n🔑 Từ khoá: ${(c.seo_keywords || []).join(", ")}\n\n` +
    `Duyệt và chọn nơi đăng${env.DRY_RUN === "1" ? " (CHẾ ĐỘ THỬ – không đăng thật)" : ""}:`, reviewKb(job.id));
}

async function publish(env, job, targets) {
  const out = [];
  const dry = env.DRY_RUN === "1";
  if (targets.includes("fb")) {
    if (dry) out.push("📘 Facebook: chế độ thử, chưa đăng");
    else {
      try {
        const imgs = [];
        for (const k of job.render.pages) imgs.push(new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()));
        out.push(`📘 Facebook: ${await postToPage(env, imgs, job.content.facebook_caption)}`);
      } catch (e) { out.push(`📘 Facebook lỗi: ${e.message}`); }
    }
  }
  const video = targets.filter((t) => ["story", "tiktok", "youtube"].includes(t));
  if (video.length) {
    try {
      await dispatchVideo(env, job.id, video);
      out.push(`🎬 Đang dựng video có nhạc cho: ${video.join(", ")} (2–4 phút), xong em báo.`);
    } catch (e) { out.push(`🎬 Không khởi động được luồng video: ${e.message}`); }
  }
  job.status = "published";
  await saveJob(env, job);
  await send(env, job.chat_id, out.join("\n"));
}

async function dispatchVideo(env, jobId, targets) {
  if (!env.GH_REPO || !env.GH_TOKEN) throw new Error("Chưa cấu hình GH_REPO / GH_TOKEN");
  const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/video.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "tht-bantin", "content-type": "application/json" },
    body: JSON.stringify({ ref: env.GH_REF || "main", inputs: { job_id: jobId, targets: targets.join(",") } }),
  });
  if (res.status !== 204) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---------------- endpoints for the GitHub video workflow ----------------
export async function internal(request, env, url) {
  if ((request.headers.get("x-internal-key") || "") !== env.INTERNAL_KEY || !env.INTERNAL_KEY) return new Response("forbidden", { status: 403 });
  const parts = url.pathname.split("/").filter(Boolean); // api, internal, <what>, <id>
  const what = parts[2], id = parts[3];
  if (what === "job") {
    const job = await getJob(env, id);
    if (!job) return new Response("not found", { status: 404 });
    const c = job.content;
    return Response.json({
      id: job.id, dry_run: env.DRY_RUN === "1", stories: job.render.stories, pages: job.render.pages,
      story_hook: c.story_hook, facebook_caption: c.facebook_caption, tiktok_caption: c.tiktok_caption,
      youtube_title: c.youtube_title, youtube_description: c.youtube_description, youtube_tags: c.youtube_tags || [],
      hashtags: c.hashtags || [], tiktok_mode: env.TIKTOK_MODE || "inbox", tiktok_privacy: env.TIKTOK_PRIVACY || "SELF_ONLY",
      youtube_privacy: env.YOUTUBE_PRIVACY || "private",
    });
  }
  if (what === "file") {
    const key = decodeURIComponent(parts.slice(3).join("/"));
    if (!key.startsWith("jobs/")) return new Response("forbidden", { status: 403 });
    const obj = await env.FILES.get(key);
    return obj ? new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream" } }) : new Response("not found", { status: 404 });
  }
  if (what === "video" && request.method === "PUT") {
    const job = await getJob(env, id);
    const bytes = new Uint8Array(await request.arrayBuffer());
    await env.FILES.put(`jobs/${id}/story.mp4`, bytes, { httpMetadata: { contentType: "video/mp4" } });
    if (job) await sendVideo(env, job.chat_id, bytes, "🎬 Video story/Shorts đã dựng xong");
    return Response.json({ ok: true });
  }
  if (what === "notify" && request.method === "POST") {
    const { results = [] } = await request.json();
    const job = await getJob(env, id);
    if (job) await send(env, job.chat_id, results.join("\n") || "Luồng video đã chạy xong.");
    return Response.json({ ok: true });
  }
  if (what === "tiktok-token") return Response.json({ access_token: await tiktokAccessToken(env) });
  return new Response("not found", { status: 404 });
}

// ---------------- TikTok OAuth (token kept in D1, refreshed here) ----------------
export async function tiktokRoutes(url, env) {
  const redirect = `${env.PUBLIC_BASE_URL}/tiktok/callback`;
  if (url.pathname === "/tiktok/login") {
    if (url.searchParams.get("key") !== env.APP_PASSWORD) return new Response("Sai mật khẩu", { status: 403 });
    const state = crypto.randomUUID();
    await kvSet(env, "tiktok_state", state);
    const q = new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || "").trim(), scope: env.TIKTOK_MODE === "direct" ? "user.info.basic,video.publish,video.upload" : "user.info.basic,video.upload", response_type: "code", redirect_uri: redirect, state });
    return Response.redirect(`https://www.tiktok.com/v2/auth/authorize/?${q}`, 302);
  }
  if (url.pathname === "/tiktok/callback") {
    if (url.searchParams.get("state") !== (await kvGet(env, "tiktok_state"))) return new Response("Phiên đăng nhập không hợp lệ", { status: 400 });
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || "").trim(), client_secret: String(env.TIKTOK_CLIENT_SECRET || "").trim(), code: url.searchParams.get("code") || "", grant_type: "authorization_code", redirect_uri: redirect }) });
    const tok = await res.json();
    if (!tok.access_token) return new Response(`TikTok không cấp token: ${JSON.stringify(tok)}`, { status: 400 });
    await kvSet(env, "tiktok_token", JSON.stringify({ ...tok, obtained_at: Date.now() }));
    return new Response("Đã kết nối TikTok cho bot THT. Có thể đóng trang này.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("not found", { status: 404 });
}

async function tiktokAccessToken(env) {
  const raw = await kvGet(env, "tiktok_token");
  if (!raw) throw new Error("Chưa kết nối TikTok (mở /tiktok/login?key=...)");
  const tok = JSON.parse(raw);
  if (Date.now() < tok.obtained_at + (tok.expires_in - 300) * 1000) return tok.access_token;
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || "").trim(), client_secret: String(env.TIKTOK_CLIENT_SECRET || "").trim(), grant_type: "refresh_token", refresh_token: tok.refresh_token }) });
  const n = await res.json();
  if (!n.access_token) throw new Error("Làm mới token TikTok thất bại, cần kết nối lại");
  await kvSet(env, "tiktok_token", JSON.stringify({ ...n, obtained_at: Date.now() }));
  return n.access_token;
}

// ---------------- one-click webhook setup ----------------
export async function setupWebhook(url, env) {
  if (url.searchParams.get("key") !== env.APP_PASSWORD) return new Response("Sai mật khẩu", { status: 403 });
  const r = await tg(env, "setWebhook", { url: `${env.PUBLIC_BASE_URL || url.origin}/tg/webhook`, secret_token: env.TG_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg(env, "setMyCommands", { commands: [
    { command: "moi", description: "Bắt đầu bài mới" },
    { command: "bantin", description: "Bài mới (dùng trong nhóm)" },
    { command: "id", description: "Xem ID Telegram / ID nhóm" },
    { command: "help", description: "Hướng dẫn" },
  ] });
  return new Response(r.ok ? "Đã nối webhook Telegram. Mở bot và gửi /start." : `Lỗi: ${r.description}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
