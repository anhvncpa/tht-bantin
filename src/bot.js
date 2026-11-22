// Telegram bot: webhook (fast) + queue tasks (slow work) + endpoints used by the GitHub video workflow.
// Chạy được cả trong chat riêng lẫn nhóm (group/supergroup).
import { generateContent, reviseContent } from "./claude.js";
import { readBuffer } from "./extract.js";
import { renderJob, STYLE_NAMES } from "./render.js";
import { postToPage, postLink } from "./facebook.js";
import { tg, send, keyboard, download, sendAlbum, sendVideo } from "./telegram.js";
import { sendLetter, LETTER_KINDS } from "./word.js";
import { withFbFooter, fbCaption, FB_FOOTER } from "./contact.js";
import { withSeries, firstComment, trackPost, pollComments, replyButton, takeQuestions } from "./engage.js";
import { scout, itemSource, nextSlots, vnLabel } from "./agent.js";
import { planWeek, ideaSource, weeklyInsights, PILLARS } from "./growth.js";
import { healPlan, healMessage, videoRunStatus } from "./healer.js";
import { scoutVideos, videoSource, findVideoUrl } from "./videoscout.js";
import { withStrategy, tagJob, markPublished, getStrategy } from "./strategy.js";
import { claude, modelFor, hubTag } from "./claude.js";
import { hubEvent } from "./hub.js";
import { postInstagram, igCaption, postThreads, mediaUrl, igUserId } from "./social.js";
import { researchTrends, trendMessage, trendLook } from "./trends.js";
import { researchAdvice, reviseAdvice, adviceSource, adviceSummary, letterHtml, htmlToPdf, saveLetter, nextLetterNumber, syncLetter, retryLetterSync, letterFileName } from "./advice.js";
import { sendDocument } from "./telegram.js";
import { councilReview, panelText, verifyUncertain } from "./council.js";
import { posterQA, qaText, crossCheck, adviceFacts, mismatchesToUncertain } from "./gemini.js";
import { pageToken } from "./facebook.js";
import { threadsToken } from "./social.js";
import { tiktokPostRoutes, tiktokPostUrl, tiktokAudited } from "./tiktokpost.js";
import { handbookOutline, outlineText, writeHandbook, reviseHandbook, handbookFacts, finalizeDoc, renderHandbook, nextHandbookNumber, handbookFileName, handbookCaption } from "./handbook_agent.js";

// Kênh đăng: "all" = bài ảnh/chữ, "allv" = kèm các kênh video (dựng trên GitHub Actions)
const POST_TARGETS = (env) => list(env.POST_TARGETS || "fb,story,ig,threads");
const VIDEO_TARGETS = (env) => list(env.VIDEO_TARGETS || "tiktok,youtube,reels,igreels");
const VIDEO_KINDS = ["story", "tiktok", "youtube", "reels", "igreels"];
// Dòng kết quả lỗi → nút "Thử lại" đúng kênh lỗi + nút mở lại bảng chọn kênh
const FAIL_MAP = [["🎬 Video", "vid"], ["📘 Facebook", "fb"], ["📱 FB Story", "story"], ["📸 Instagram", "ig"], ["🧵 Threads", "threads"], ["🎵 TikTok", "tiktok"], ["▶️ YouTube", "youtube"], ["🎞 FB Reels", "reels"], ["🎞 IG Reels", "igreels"]];
function retryKb(id, lines) {
  const failed = FAIL_MAP.filter(([p]) => lines.some((l) => l.startsWith(p) && /lỗi/i.test(l))).map(([, t]) => t);
  const row = failed.length ? [[`🔁 Thử lại ${failed.map((t) => TARGET_NAMES[t]).join(", ")}`.slice(0, 60), `pub:${id}:${failed.join(",")}`]] : [];
  return keyboard([[...row, ["📤 Đăng lại kênh khác", `rk:${id}`]]]);
}
function expandTargets(env, arg) {
  const out = [];
  for (const t of String(arg || "").split(",")) {
    if (t === "all") out.push(...POST_TARGETS(env));
    else if (t === "allv") out.push(...POST_TARGETS(env), ...VIDEO_TARGETS(env));
    else if (t === "vid") out.push(...VIDEO_TARGETS(env));
    else if (t) out.push(t);
  }
  return [...new Set(out)];
}

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
export const kvGet = async (env, k) => (await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first())?.v ?? null;
export const kvSet = (env, k, v) => env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run();
const kvDel = (env, k) => env.DB.prepare("DELETE FROM kv WHERE k = ?").bind(k).run();
async function openJob(env, chatId) {
  const r = await env.DB.prepare("SELECT id FROM jobs WHERE chat_id = ? AND status = 'collecting' ORDER BY created_at DESC LIMIT 1").bind(chatId).first();
  return r ? getJob(env, r.id) : null;
}

// ---------------- keyboards ----------------
// Sau khi nhận file: em tự soạn & tự chọn mẫu sau vài giây; anh có thể bấm soạn ngay hoặc tự chọn mẫu
const AUTO_GO_SEC = 20;
const goKb = (id) => keyboard([[["▶️ Soạn ngay", `st:${id}:auto`], ["🎨 Tự chọn mẫu", `rs:${id}`]]]);
async function scheduleAutoGo(env, job) {
  const at = String(Date.now());
  await kvSet(env, `go:${job.id}`, at);
  await env.JOBS.send({ type: "autogo", jobId: job.id, at }, { delaySeconds: AUTO_GO_SEC });
}
const styleKb = (id) => keyboard([
  [["1 Navy-cam", `st:${id}:1`], ["2 Swiss", `st:${id}:2`], ["3 Xanh ngọc", `st:${id}:3`]],
  [["4 Legal", `st:${id}:4`], ["5 Infographic", `st:${id}:5`], ["6 Trang vở ✍️", `st:${id}:6`]],
]);
const pagesKb = (id) => keyboard([
  [["Tự động", `pg:${id}:auto`], ["1 trang", `pg:${id}:1`], ["2 trang", `pg:${id}:2`], ["3 trang", `pg:${id}:3`]],
]);
// Bàn phím gọn khi gửi bản xem trước; "⋯ Thêm" mở bàn phím đầy đủ (không huỷ tự đăng)
const reviewKbShort = (id) => keyboard([
  [["✅ Duyệt – đăng tất cả", `pub:${id}:allv`]],
  [["✏️ Sửa", `ed:${id}`], ["⏰ Hẹn giờ", `sh:${id}`], ["❌ Huỷ", `x:${id}`], ["⋯ Thêm", `more:${id}`]],
]);
const reviewKb = (id, video = true) => keyboard([
  [["✅ Duyệt – đăng tất cả", `pub:${id}:allv`], ["⏰ Hẹn giờ", `sh:${id}`], ["✉️ Thư", `lm:${id}`], ["🌐 VI⇄EN", `bi:${id}`]],
  [["📘 FB", `pub:${id}:fb`], ["📱 Story", `pub:${id}:story`], ["📸 Instagram", `pub:${id}:ig`], ["🧵 Threads", `pub:${id}:threads`]],
  [["🎵 TikTok", `pub:${id}:tiktok`], ["▶️ YouTube", `pub:${id}:youtube`], ["🎞 FB Reels", `pub:${id}:reels`], ["🎞 IG Reels", `pub:${id}:igreels`]],
  [["🎬 Dựng lại video – đăng 4 kênh video", `pub:${id}:vid`]],
  [["✏️ Sửa", `ed:${id}`], ["🎨 Mẫu", `rs:${id}`], ["🧠 Soạn kỹ", `hq:${id}`], ["❌ Huỷ", `x:${id}`]],
]);
// Hẹn đăng vào giờ vàng (FB bài viết + Story theo AGENT_TARGETS)
const schedKb = (env, id) => keyboard([
  nextSlots(env, 3).map((at) => [`⏰ ${vnLabel(at)}`, `sc:${id}:${Math.round(at / 60000)}`]),
  [["🚫 Không hẹn", `uc:${id}`]],
]);
const TARGET_NAMES = { fb: "FB bài viết", story: "FB Story", ig: "Instagram", threads: "Threads", tiktok: "TikTok", youtube: "YouTube", reels: "FB Reels", igreels: "IG Reels", all: "5 kênh (bài)", allv: "5 kênh + video", vid: "4 kênh video (dựng lại)" };
const targetsLabel = (t) => String(t).split(",").map((x) => TARGET_NAMES[x] || x).join(" + ");
// Thư tư vấn chỉ làm khi người dùng bấm chọn (mặc định không làm, không tốn API)
const letterKb = (id) => keyboard([
  [["📝 Chỉ text", `lt:${id}:text`], ["Word VI", `lt:${id}:VI`], ["VI–EN", `lt:${id}:VI-EN`]],
  [["VI–ZH phồn", `lt:${id}:VI-ZHT`], ["VI–ZH giản", `lt:${id}:VI-ZHS`], ["📦 Cả 4", `lt:${id}:all`]],
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
const askKey = (chat, uid) => `ask:${chat}:${uid}`;     // đang chờ anh nhắn vấn đề cần tư vấn
const reviseKey = (chat, uid) => `advfix:${chat}:${uid}`; // đang chờ anh nhắn yêu cầu sửa thư
const hbAskKey = (chat, uid) => `hbask:${chat}:${uid}`;   // đang chờ anh nhắn chủ đề Cẩm nang
const hbFixKey = (chat, uid) => `hbfix:${chat}:${uid}`;   // đang chờ yêu cầu sửa dàn ý/bản nháp Cẩm nang ("<id>:outline|doc")
const hbOutlineKb = (id) => keyboard([[["✅ Duyệt dàn ý – viết bài", `hb:${id}:go`]], [["✏️ Sửa dàn ý", `hb:${id}:eo`], ["❌ Huỷ", `hb:${id}:x`]]]);
const hbDraftKb = (id, theme) => keyboard([[["✅ Duyệt – cấp số, lưu My THT", `hb:${id}:ok`]], [["✏️ Sửa", `hb:${id}:ed`], [theme === "noir" ? "🎨 Mẫu trắng" : "🎨 Mẫu đen – vàng", `hb:${id}:th`], ["❌ Huỷ", `hb:${id}:x`]]]);
// Bước 1 – chọn đầu ra; bước 2 – duyệt bản nháp thư
const advKb = (id) => keyboard([[["✉️ Thư tư vấn PDF", `av:${id}:letter`], ["🖼 Poster", `av:${id}:poster`], ["📦 Cả hai", `av:${id}:both`]]]);
const letterKbd = (id) => keyboard([
  [["✅ Duyệt – lưu vào My THT", `av:${id}:ok`]],
  [["✏️ Sửa thư", `av:${id}:fix`], ["🖼 Làm thêm poster", `av:${id}:poster`], ["❌ Huỷ", `av:${id}:drop`]],
]);

// ---------------- webhook: must answer fast ----------------
export async function handleUpdate(update, env) {
  env = await withStrategy(env, kvGet);
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
      "Thư tư vấn gửi khách chỉ làm khi anh bấm ✉️ Thư tư vấn rồi chọn dạng (text, Word VI, VI–EN, VI–ZH phồn/giản, cả 4).\n" +
      "• Chú thích kèm file = ghi chú cho em. Có đường link trong chú thích → mã QR trỏ tới link đó.\n" +
      "• Dán link video chính sách (Facebook, YouTube, Báo Chính phủ…) kèm 1–2 câu video nói gì → em soạn bài chia sẻ có ghi nguồn + video tóm tắt cho TikTok.\n" +
      "• Agent: mỗi sáng tự chọn 1 bài tốt nhất (chỉ tiêu mặc định 7 bài FB + 4 video/tuần); Chủ nhật tự đánh giá, gửi báo cáo + kế hoạch tuần tới.\n" +
      "• Gửi nhiều ảnh cùng lúc (album) = 1 bài. Gửi thêm ảnh sau đó vẫn cộng vào bài đang làm; muốn sang bài khác gõ /moi.\n" +
      "• Poster mặc định song ngữ Việt – Anh, bài Facebook có phần English below. Bấm 🌐 VI⇄EN để đổi sang chỉ tiếng Việt.\n" +
      (group ? "• Trong nhóm bot: gửi file/ảnh là bot nhận luôn. Ghi chú thêm: trả lời (reply) tin nhắn của bot.\n" : "") +
      `Lệnh: /moi bài mới · /bantin (nhóm) · /quet Agent tìm tin mới · /video tìm video chính sách · /kehoach kế hoạch tuần · /xuhuong xu hướng tuần · /baocao báo cáo fanpage · /tuvan hỏi một vấn đề → Thư tư vấn PDF + Poster · /chuyende Cẩm nang Giám đốc 8–10 trang · /lich lịch đăng · /danglai đăng lại bài gần nhất · /soanlai soạn lại bài lỗi · /id xem ID${env.DRY_RUN === "1" ? "\n⚠️ Đang CHẾ ĐỘ THỬ (không đăng thật)" : ""}`);
  }
  if (cmd === "/quet") {
    await send(env, chat, "🤖 Đang quét các trang Cục Thuế, Bộ Tài chính, VACPA, Chính phủ… (2–4 phút)");
    return env.JOBS.send({ type: "scout", chat, manual: true });
  }
  if (cmd === "/lich") return send(env, chat, await scheduleList(env));
  if (cmd === "/soanlai") {
    const r = await env.DB.prepare("SELECT id FROM jobs WHERE chat_id = ? AND content IS NULL AND status IN ('working','review') ORDER BY created_at DESC LIMIT 1").bind(chat).first();
    if (!r) return send(env, chat, "Không có bài nào đang bị lỗi để soạn lại.");
    await send(env, chat, "🔁 Đang soạn lại bài bị lỗi gần nhất…");
    return env.JOBS.send({ type: "generate", jobId: r.id });
  }
  if (cmd === "/chuyende" || cmd === "/camnang") {
    const t = m.text.replace(/^\/\S+\s*/, "").trim();
    if (!t) { await kvSet(env, hbAskKey(chat, uid), "1"); return send(env, chat, "📘 Anh nhắn chủ đề Cẩm nang Giám đốc (vd: “Tổng hợp các trường hợp ưu đãi thuế TNDN theo quy định hiện hành”)."); }
    return startHandbook(env, chat, t);
  }
  if (cmd === "/tuvan" || cmd === "/hoi") {
    const q = m.text.replace(/^\/\S+\s*/, "").trim();
    if (!q) { await kvSet(env, askKey(chat, uid), "1"); return send(env, chat, "Anh nhắn vấn đề cần tư vấn (vd: “Cá nhân cho thuê nhà 150 triệu/năm phải nộp thuế gì?”)."); }
    await send(env, chat, `🔎 Em đang tra cứu nguồn chính thức cho vấn đề:\n“${q}”\n(2–4 phút, xong em gửi tóm tắt để anh chọn Thư tư vấn / Poster)`);
    return env.JOBS.send({ type: "advise", chat, q });
  }
  if (cmd === "/tiktokpage") {
    const rows = (await env.DB.prepare("SELECT id FROM jobs WHERE chat_id = ? AND content IS NOT NULL ORDER BY updated_at DESC LIMIT 10").bind(chat).all()).results || [];
    for (const r of rows) if (await env.FILES.head(`jobs/${r.id}/story.mp4`)) return sendTikTokLink(env, await getJob(env, r.id));
    return send(env, chat, "Chưa có bài nào đã dựng video.");
  }
  if (cmd === "/danglai") {
    const r = await env.DB.prepare("SELECT id FROM jobs WHERE chat_id = ? AND content IS NOT NULL AND render IS NOT NULL AND status IN ('published','review','scheduled') ORDER BY updated_at DESC LIMIT 1").bind(chat).first();
    if (!r) return send(env, chat, "Chưa có bài nào để đăng lại.");
    const j = await getJob(env, r.id);
    return send(env, chat, `📤 Đăng lại bài: ${j.content.title_line1 || j.id}\nChọn kênh:`, reviewKb(j.id, true));
  }
  if (cmd === "/video") {
    await send(env, chat, "🎬 Đang tìm video chính sách mới từ Báo Chính phủ, Cục Thuế, Bộ Tài chính, VTV… (2–4 phút)");
    return env.JOBS.send({ type: "vscout", chat, manual: true });
  }
  if (cmd === "/xuhuong") { await send(env, chat, "📈 Đang nghiên cứu xu hướng tuần (1–3 phút)…"); return env.JOBS.send({ type: "trends", chat }); }
  if (cmd === "/kehoach") { await send(env, chat, "🗓 Đang lập kế hoạch nội dung tuần (2–4 phút)…"); return env.JOBS.send({ type: "plan", chat }); }
  if (cmd === "/baocao") { await send(env, chat, "📊 Đang lấy số liệu fanpage…"); return env.JOBS.send({ type: "insights", chat }); }
  if (cmd === "/moi" || cmd === "/bantin") {
    await env.DB.prepare("UPDATE jobs SET status='cancelled' WHERE chat_id = ? AND status = 'collecting'").bind(chat).run();
    await kvDel(env, editKey(chat, uid));
    if (group) await kvSet(env, armKey(chat, uid), "1");
    return send(env, chat, "OK, gửi file cho bài mới nhé.");
  }

  const doc = m.document, photo = m.photo?.[m.photo.length - 1];
  if (doc || photo) {
    // Nhóm bot riêng (TG_ALLOWED_CHATS): người được phép gửi file/ảnh là bot nhận luôn, không cần /moi.
    // Nhóm khác (không khai báo) vẫn cần /moi hoặc chú thích /bantin như trước.
    if (group && !list(env.TG_ALLOWED_CHATS).includes(String(chat))) {
      const armed = (await kvGet(env, armKey(chat, uid))) !== null;
      if (!armed && captionCmd !== "/bantin") return;
    }
    const file = doc ? { file_id: doc.file_id, name: doc.file_name || "file", mime: doc.mime_type || "" }
      : { file_id: photo.file_id, name: "anh.jpg", mime: "image/jpeg" };
    const caption = m.caption ? m.caption.replace(/^\/bantin(@\w+)?/i, "").trim() : "";
    if (m.media_group_id) {
      // Album (nhiều ảnh/file gửi cùng lúc): Telegram gửi từng ảnh thành tin riêng, gần như đồng thời.
      // Lưu từng ảnh thành 1 dòng riêng (không tranh nhau ghi), ảnh đầu tiên hẹn gom cả album sau 4 giây.
      await kvSet(env, `mg:${chat}:${m.media_group_id}:${String(m.message_id).padStart(12, "0")}`, JSON.stringify({ ...file, caption }));
      const first = await env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, '1') ON CONFLICT(k) DO NOTHING").bind(`mgq:${chat}:${m.media_group_id}`).run();
      if (first.meta?.changes) await env.JOBS.send({ type: "album", chat, mg: m.media_group_id }, { delaySeconds: 4 });
      return;
    }
    let job = await openJob(env, chat);
    if (!job) job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "collecting", files: [], note: "", created_at: now() };
    if (!doc) file.name = `anh${job.files.length + 1}.jpg`;
    job.files.push(file);
    addCaption(job, caption);
    job.media_group = null;
    await saveJob(env, job);
    await scheduleAutoGo(env, job);
    return send(env, chat, `Đã nhận ${job.files.length} file cho bài này. Gửi thêm nếu cần (bài khác: /moi). Em sẽ tự chọn mẫu và soạn sau ${AUTO_GO_SEC} giây.`, goKb(job.id));
  }

  if (m.text && !cmd) {
    if (await kvGet(env, askKey(chat, uid))) {
      await kvDel(env, askKey(chat, uid));
      const q = m.text.trim();
      await send(env, chat, `🔎 Em đang tra cứu nguồn chính thức cho vấn đề:\n“${q}”\n(2–4 phút)`);
      return env.JOBS.send({ type: "advise", chat, q });
    }
    if (await kvGet(env, hbAskKey(chat, uid))) { await kvDel(env, hbAskKey(chat, uid)); return startHandbook(env, chat, m.text.trim()); }
    const rpEdit = await kvGet(env, `rpedit:${chat}:${uid}`);
    if (rpEdit) { await kvDel(env, `rpedit:${chat}:${uid}`); return replyButton(env, { ...engDeps(env), chat }, rpEdit, "ok", m.text.trim()); }
    const hbFix = await kvGet(env, hbFixKey(chat, uid));
    if (hbFix) {
      await kvDel(env, hbFixKey(chat, uid));
      const [hid, mode] = hbFix.split(":");
      await send(env, chat, mode === "outline" ? "✏️ Đang sửa dàn ý…" : "✏️ Đang sửa bản nháp Cẩm nang (2–4 phút)…");
      return env.JOBS.send(mode === "outline" ? { type: "hb_outline", id: hid, instruction: m.text.trim() } : { type: "hb_revise", id: hid, instruction: m.text.trim() });
    }
    const fixing = await kvGet(env, reviseKey(chat, uid));
    if (fixing) {
      await kvDel(env, reviseKey(chat, uid));
      await send(env, chat, "✏️ Đang sửa thư theo yêu cầu…");
      return env.JOBS.send({ type: "advletter", advId: fixing, instruction: m.text.trim() });
    }
    const editing = await kvGet(env, editKey(chat, uid));
    if (editing) {
      await kvDel(env, editKey(chat, uid));
      await kvDel(env, `ap:${editing}`);
      await send(env, chat, "Đang sửa theo yêu cầu…");
      return env.JOBS.send({ type: "revise", jobId: editing, instruction: m.text });
    }
    // Dán link video (Facebook, YouTube, Báo Chính phủ…) → soạn bài chia sẻ có ghi nguồn
    const vurl = findVideoUrl(m.text);
    if (vurl && !m.reply_to_message?.from?.is_bot) {
      const note = m.text.replace(vurl, "").trim();
      await startShareJob(env, chat, { title: note || "Video chính sách", url: vurl, source: "", summary: note }, true);
      return;
    }
    // Trong nhóm, tin nhắn thường chỉ là ghi chú khi trả lời (reply) tin của bot – tránh lấy nhầm chuyện trò trong nhóm.
    if (group && !m.reply_to_message?.from?.is_bot) return;
    const job = await openJob(env, chat);
    if (job) {
      const u = m.text.match(URL_RE); if (u) job.qr_url = u[0];
      job.note = `${job.note} ${m.text.replace(URL_RE, "")}`.trim();
      await saveJob(env, job);
      await scheduleAutoGo(env, job);
      return send(env, chat, `Đã ghi chú thêm. Em sẽ tự soạn sau ${AUTO_GO_SEC} giây.`, goKb(job.id));
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
  if (act === "ip") return pickIdeas(env, chat, q, arg);
  if (act === "av") return onAdviceButton(env, chat, uid, q, id, arg);
  if (act === "hb") return onHandbookButton(env, chat, uid, q, id, arg);
  if (act === "rp") {
    await tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (arg === "ed") { await kvSet(env, `rpedit:${chat}:${uid}`, id); return send(env, chat, "✏️ Anh nhắn câu trả lời muốn đăng cho bình luận này."); }
    return replyButton(env, { ...engDeps(env), chat }, id, arg);
  }
  if (act === "sg") {
    await kvSet(env, "growth:strategy_off", arg === "off" ? "1" : "0");
    return send(env, chat, arg === "off" ? "↩️ Đã tạm không áp dụng điều chỉnh tự động, bot chạy theo cấu hình gốc. Bật lại: bấm nút ✅ ở báo cáo tuần." : "✅ Đã bật lại điều chỉnh tự động theo tự đánh giá tuần.");
  }
  if (act === "more" || act === "less") {
    const kb = act === "more" ? reviewKb(id) : reviewKbShort(id);
    if (act === "more") kb.reply_markup.inline_keyboard.push([{ text: "‹ Thu gọn", callback_data: `less:${id}` }]);
    return tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, ...kb });
  }
  const job = await getJob(env, id);
  if (!job) return send(env, chat, "Bài này không còn, gửi file để làm bài mới.");
  await kvDel(env, `ap:${id}`); // anh đã thao tác → không tự đăng nữa
  const clearKb = () => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });

  if (act === "st") {
    job.style = arg;
    if (job.content?.trend_look) delete job.content.trend_look;   // anh tự chọn mẫu → dùng đúng mẫu THT
    await saveJob(env, job);
    if (arg === "auto" && job.content) return;
    if (job.status !== "collecting" && !job.content) return; // đã bắt đầu soạn rồi
    await kvDel(env, `go:${id}`);
    if (job.content) { await clearKb(); await send(env, chat, `Đổi sang mẫu ${arg} – ${STYLE_NAMES[arg]}, đang dựng lại…`); return env.JOBS.send({ type: "render", jobId: id }); }
    // Số trang: AI tự chọn, ưu tiên gói gọn 1 trang (chỉ thêm trang khi văn bản quá nhiều thủ tục/bảng biểu)
    job.pages = "auto"; job.status = "working";
    await saveJob(env, job);
    await kvDel(env, armKey(chat, uid));
    await tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: arg === "auto" ? "Đang đọc văn bản, kiểm chứng, tự chọn mẫu và soạn bản tin (1–2 phút)…" : `Mẫu ${arg} – ${STYLE_NAMES[arg]}. Đang đọc văn bản, kiểm chứng và soạn bản tin (1–2 phút)…` });
    return env.JOBS.send({ type: "generate", jobId: id });
  }
  if (act === "pg") {
    job.pages = arg; job.status = "working";
    await saveJob(env, job);
    await kvDel(env, armKey(chat, uid));
    await tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `Mẫu ${job.style} · ${arg === "auto" ? "tự động số trang" : arg + " trang"}. Đang đọc văn bản và kiểm chứng (1–2 phút)…` });
    return env.JOBS.send({ type: "generate", jobId: id });
  }
  if (act === "rs") return send(env, chat, "Chọn mẫu khác:", styleKb(id));
  if (act === "rg") { await clearKb(); await send(env, chat, "🔁 Đang soạn lại…"); return env.JOBS.send({ type: "generate", jobId: id }); }
  if (act === "ed") { await kvSet(env, editKey(chat, uid), id); return send(env, chat, "Anh nhắn yêu cầu sửa (vd: “đổi tiêu đề thành…”, “gộp còn 1 trang”, “thêm thời hạn 30 ngày”)."); }
  if (act === "bi") {
    if (!job.content) return;
    job.content.bilingual_off = !job.content.bilingual_off; await saveJob(env, job); await clearKb();
    await send(env, chat, job.content.bilingual_off ? "🇻🇳 Chuyển sang poster chỉ tiếng Việt, đang dựng lại…" : "🇻🇳🇬🇧 Chuyển sang poster song ngữ Việt – Anh, đang dựng lại…");
    return env.JOBS.send({ type: "render", jobId: id });
  }
  if (act === "hq") { await clearKb(); job.quality = "strong"; await saveJob(env, job); await send(env, chat, "Đang soạn lại bằng Claude Opus (kỹ nhất, chi phí cao hơn)…"); return env.JOBS.send({ type: "generate", jobId: id }); }
  if (act === "lm") return send(env, chat, "✉️ Thư tư vấn gửi khách – chọn dạng cần làm:", letterKb(id));
  if (act === "lt") {
    if (!LETTER_KINDS[arg]) return;
    await tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `✉️ Đang soạn thư tư vấn: ${LETTER_KINDS[arg]}…` });
    return env.JOBS.send({ type: "word", jobId: id, kind: arg });
  }
  if (act === "sh") return send(env, chat, `⏰ Chọn giờ đăng (${targetsLabel(env.AGENT_TARGETS || POST_TARGETS(env).join(","))}${(await wantsVideo(env, id)) ? " + video" : ""}):`, schedKb(env, id));
  if (act === "sc") {
    const at = Number(arg) * 60000, targets = expandTargets(env, (env.AGENT_TARGETS || "all") + ((await wantsVideo(env, id)) ? "," + VIDEO_TARGETS(env).join(",") : "")).join(",");
    await kvSet(env, `sched:${id}`, JSON.stringify({ at, targets }));
    await hubEvent(env, { run: id, step: "review", status: "waiting", title: `Anh duyệt, hẹn đăng ${targetsLabel(targets)} lúc ${vnLabel(at)}` });
    job.status = "scheduled"; await saveJob(env, job);
    return tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `✅ Đã hẹn đăng ${targetsLabel(targets)} lúc ${vnLabel(at)}. Xem/huỷ: /lich` });
  }
  if (act === "uc") {
    await kvDel(env, `sched:${id}`);
    if (job.status === "scheduled") { job.status = "review"; await saveJob(env, job); }
    return tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: "Đã huỷ hẹn giờ cho bài này." });
  }
  if (act === "x") { await hubEvent(env, { run: id, step: "review", status: "done", title: "Anh đã huỷ bài này" }); await clearKb(); job.status = "cancelled"; await saveJob(env, job); return send(env, chat, "Đã huỷ bài này."); }
  if (act === "rk") return send(env, chat, "📤 Chọn kênh muốn đăng lại:", reviewKb(id, true));
  if (act === "pub") { await hubEvent(env, { run: id, step: "review", status: "done", title: `Anh duyệt: đăng ngay → ${targetsLabel(arg)}` }); await clearKb(); return env.JOBS.send({ type: "publish", jobId: id, targets: expandTargets(env, arg) }); }
}

// ---------------- queue tasks (slow work) ----------------
export async function processTask(task, env) {
  env = await withStrategy(env, kvGet);
  if (task.type === "scout") return runScout(env, task.chat, task.manual);
  if (task.type === "due") return runDue(env);
  if (task.type === "plan") return runPlan(env, task.chat);
  if (task.type === "album") return collectAlbum(env, task.chat, task.mg);
  if (task.type === "autogo") return autoGo(env, task.jobId, task.at);
  if (task.type === "vscout") return runVideoScout(env, task.chat, task.manual);
  if (task.type === "daily") return runDaily(env);
  if (task.type === "pool") {
    const RUN = `pool-${dayKey()}`; env = { ...env, HUB_RUN: RUN, HUB_STEP: "scout", HUB_LABEL: "Dò tin & video" };
    await hubEvent(env, { run: RUN, step: "scout", status: "start", runTitle: `Dò thêm buổi chiều ${dayKey().split("-").reverse().join("/")}`, title: "Dò văn bản & video, đưa vào kho" });
    await runScout(env); await runVideoScout(env);
    const pool = JSON.parse((await kvGet(env, "pool")) || "[]");
    return hubEvent(env, { run: RUN, step: "scout", status: "done", title: `Kho hiện có ${pool.length} ứng viên`, detail: pool.map((x) => `[${x.kind}] ${x.score}/10 · ${x.title}`).join("\n") });
  }
  if (task.type === "insights") return runInsights(env, task.chat);
  if (task.type === "trends") return runTrends(env, task.chat, task.thenPlan);
  if (task.type === "advise") return runAdvise(env, task.chat, task.q);
  if (task.type?.startsWith("hb_")) return runHandbookTask(env, task);
  if (task.type === "advletter") return makeAdviceLetter(env, task.advId, task.instruction);
  if (task.type === "advok") return approveAdviceLetter(env, task.advId);
  if (task.type === "autopub") return runAutoPublish(env, task.jobId, task.token);
  const job = await getJob(env, task.jobId);
  if (!job) return;
  env = { ...env, HUB_RUN: job.id };
  try {
    if (task.type === "generate") { await generate(env, job); await offerLetter(env, job); }
    else if (task.type === "render") await renderAndPreview(env, job);
    else if (task.type === "revise") { await hubEvent(env, { run: job.id, step: "draft", status: "start", title: `Sửa theo yêu cầu của anh: ${task.instruction}` }); hubTag(env, "draft", "Sửa bài"); const off = job.content?.bilingual_off; job.content = await reviseContent(env, job.content, task.instruction, job.quality); if (off) job.content.bilingual_off = true; await attachShare(env, job); await saveJob(env, job); await renderAndPreview(env, job); await offerLetter(env, job); }
    else if (task.type === "word") await sendLetter(env, job, task.kind || "all");
    else if (task.type === "publish") await publish(env, job, task.targets);
  } catch (e) {
    console.error(e);
    await hubEvent(env, { run: job.id, step: env.HUB_STEP || task.type, status: "error", title: `Lỗi: ${e.message}`, detail: String(e.stack || e).slice(0, 2000) });
    await send(env, job.chat_id, `Có lỗi: ${e.message}\nAnh thử lại, hoặc /moi để làm lại.`, job.content ? reviewKb(job.id) : keyboard([[["🔁 Soạn lại", `rg:${job.id}`]]]));
  }
}
const reviewKbIfReady = (job) => (job.content ? reviewKb(job.id) : {});

// Thư tư vấn mặc định KHÔNG làm. Chỉ làm khi bấm "✉️ Thư tư vấn" và chọn dạng.
// (Tuỳ chọn) LETTER_AUTO = "text" | "VI" | "VI-EN" | "VI-ZHT" | "VI-ZHS" | "all" để tự làm luôn sau mỗi poster.
async function offerLetter(env, job) {
  const auto = env.LETTER_AUTO || "";
  if (!job.content || !LETTER_KINDS[auto]) return;
  await send(env, job.chat_id, `✉️ Đang soạn thư tư vấn: ${LETTER_KINDS[auto]}…`);
  return env.JOBS.send({ type: "word", jobId: job.id, kind: auto });
}

async function generate(env, job) {
  const parts = []; let table = null;
  const meta0 = JSON.parse((await kvGet(env, `meta:${job.id}`)) || "{}");
  const srcLabel = { agent: "Agent dò tin", plan: "Kế hoạch tuần", video: "Video chính sách", manual: "Anh gửi", weekly: "Tổng hợp tuần", advice: "Tư vấn" }[meta0.source] || "Anh gửi";
  await hubEvent(env, { run: job.id, step: "draft", status: "start", runTitle: `${srcLabel}: ${(job.note || "").split("\n").find((l) => l.trim() && !/^VIDEO CHÍNH/.test(l))?.replace(/^(Tên|Tiêu đề|Tiêu đề đề xuất): /, "").slice(0, 90) || `${job.files.length} file`}`,
    title: `Bắt đầu soạn (${job.quality === "strong" ? "Opus – soạn kỹ" : "Sonnet"}) · nguồn: ${srcLabel}`, detail: (job.note || "").slice(0, 3000) || `${job.files.length} file: ${job.files.map((f) => f.name).join(", ")}` });
  for (const f of job.files) {
    const buf = await download(env, f.file_id);
    const r = await readBuffer(f.name, f.mime, buf);
    parts.push(r.part); table = table || r.table;
  }
  if (!(await kvGet(env, `meta:${job.id}`))) await tagJob(env, kvSet, job.id, { source: "manual" });
  const recent = JSON.parse((await kvGet(env, "style:recent")) || "[]");
  const { content, checks, draft } = await generateContent(env, { parts, note: job.note, verify: env.WEB_VERIFY !== "0", quality: job.quality, pages: job.pages || "auto", recentStyles: recent });
  const finalTitle = [content.title_line1, content.title_line2].filter(Boolean).join(" ");
  await hubEvent(env, { run: job.id, step: "draft", status: "done", title: `Bản nháp: ${draft?.title || finalTitle}`,
    detail: `KẾT QUẢ KIỂM CHỨNG WEB:\n${checks || "(không kiểm chứng)"}${content.corrections?.length ? "\n\nĐÃ CHỈNH SO VỚI NGUỒN:\n- " + content.corrections.join("\n- ") : ""}${content.uncertain?.length ? "\n\nCHƯA CHẮC, CẦN ANH KIỂM TRA:\n- " + content.uncertain.join("\n- ") : ""}` });
  job.content = content; job.checks = checks;
  if (env.COUNCIL_ENABLED !== "0") {
    await hubEvent(env, { run: job.id, step: "council", status: "start", title: "Hội đồng đánh giá: người đọc · giám đốc DN · tăng trưởng · kiểm tra thông tin" });
    try {
      hubTag(env, "council", "Hội đồng đánh giá");
      job.content = await councilReview(env, content);
      const meta = JSON.parse((await kvGet(env, `meta:${job.id}`)) || "{}");
      await kvSet(env, `meta:${job.id}`, JSON.stringify({ ...meta, panel_score: job.content.panel?.score }));
      await hubEvent(env, { run: job.id, step: "council", status: "done", title: `Hội đồng chấm ${job.content.panel?.score}/10${job.content.panel?.edits ? " – đã tự sửa" : ""}`, detail: panelText(job.content.panel) + (job.content.panel?.edits ? "\n\nCHỈ DẪN SỬA:\n" + job.content.panel.edits : "") });
    } catch (e) { await hubEvent(env, { run: job.id, step: "council", status: "error", title: `Hội đồng lỗi: ${e.message}` }); }
  }
  await attachShare(env, job);
  if (!job.style || job.style === "auto") {
    job.style = STYLE_NAMES[content.style] ? content.style : String(((Number(recent[0]) || 0) % 6) + 1);
    job.auto_style = true;
  }
  // Agent xu hướng: xen kẽ 50/50 – bài chẵn dùng phong cách xu hướng tuần (màu, font, nhạc), bài lẻ giữ mẫu THT
  if (job.auto_style && !(await kvGet(env, `weekly:${job.id}`))) {
    const look = await trendLook(env, kvGet);
    const n = Number((await kvGet(env, "trend:n")) || 0);
    if (look && n % 2 === 0) { job.style = look.base_poster; job.content.trend_look = look; }
    if (look) await kvSet(env, "trend:n", String(n + 1));
  }
  await kvSet(env, "style:recent", JSON.stringify([job.style, ...recent.filter((x) => x !== job.style)].slice(0, 3)));
  await hubEvent(env, { run: job.id, step: "editor", status: "done", runTitle: `${srcLabel}: ${finalTitle}`,
    title: draft?.title && draft.title !== finalTitle ? `Viết lại tiêu đề: “${draft.title}” → “${finalTitle}”` : `Giữ tiêu đề: “${finalTitle}”`,
    detail: `Mẫu poster: ${job.style} – ${STYLE_NAMES[job.style]}${content.style_reason ? " (lý do: " + content.style_reason + ")" : ""}\nMẫu vừa dùng gần đây: ${recent.join(", ") || "-"}\n\nBÀI FACEBOOK SAU BIÊN TẬP:\n${content.facebook_caption || ""}` });
  hubTag(env, "render", "Dựng poster");
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
  if (job.content) job.content.facebook_caption = withFbFooter(job.content.facebook_caption);
  job.render = await renderJob(env, job);
  // Gemini soát poster bằng hình ảnh; lỗi tràn chữ / chính tả / lệch số → tự sửa và dựng lại 1 lần
  try {
    const imgs = [];
    for (const k of job.render.pages) imgs.push(new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()));
    let qa = await posterQA(env, imgs, job.content);
    const serious = (q) => (q?.issues || []).filter((i) => ["overflow", "typo", "mismatch"].includes(i.type));
    if (serious(qa).length && !job.content.qa_fixed) {
      await hubEvent(env, { run: job.id, step: "render", status: "info", title: `Gemini thấy ${serious(qa).length} lỗi trên poster – tự sửa và dựng lại`, detail: qaText(qa) });
      const off = job.content.bilingual_off, share = job.content.share, panel = job.content.panel;
      const fixed = await reviseContent(env, job.content, "Sửa các lỗi soát poster sau (giữ nguyên phần khác):\n" + serious(qa).map((i) => `- ${i.detail}${i.fix ? " → " + i.fix : ""}`).join("\n"), "fast");
      if (fixed) {
        job.content = { ...fixed, bilingual_off: off, share, panel, uncertain: job.content.uncertain, qa_fixed: true };
        job.content.facebook_caption = withFbFooter(job.content.facebook_caption);
        job.render = await renderJob(env, job);
        imgs.length = 0;
        for (const k of job.render.pages) imgs.push(new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()));
        qa = await posterQA(env, imgs, job.content);
      }
    }
    if (qa) { job.content.qa = qa; await hubEvent(env, { run: job.id, step: "render", status: serious(qa).length ? "info" : "done", title: serious(qa).length ? `Poster còn ${serious(qa).length} lỗi cần anh xem` : "Gemini soát poster: không thấy lỗi", detail: qaText(qa) }); }
  } catch (e) { console.log("posterQA", e.message); }
  await hubEvent(env, { run: job.id, step: "render", status: "done", title: `Dựng ${job.render.pages.length} trang poster mẫu ${job.style} – ${STYLE_NAMES[job.style]}${job.content?.bilingual_off ? " (chỉ tiếng Việt)" : " (song ngữ)"}` });
  job.status = "review";
  await saveJob(env, job);
  const images = [];
  for (const [i, k] of job.render.pages.entries()) images.push({ name: `trang${i + 1}.png`, bytes: new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()) });
  const c = job.content;
  const title = [c.title_line1, c.title_line2].filter(Boolean).join(" ");
  await sendAlbum(env, job.chat_id, images, `📰 ${title} · mẫu ${job.style} – ${STYLE_NAMES[job.style]}`);
  const qaN = (c.qa?.issues || []).length;
  const head = [
    `<b>📰 ${escHtml(title)}</b>${env.DRY_RUN === "1" ? " <i>(chế độ thử)</i>" : ""}`,
    [c.panel ? `⭐ Hội đồng ${c.panel.score}/10` : "", c.qa ? (qaN ? `🖼 Poster ${qaN} lỗi` : "🖼 Poster OK") : "", c.panel?.edits || c.qa_fixed ? "✏️ đã tự sửa" : ""].filter(Boolean).join(" · "),
    c.uncertain?.length ? "❓ <b>Cần anh xem:</b>\n" + c.uncertain.slice(0, 3).map((x) => `• ${escHtml(String(x).slice(0, 160))}`).join("\n") : "",
    lookupRows ? `🔎 Trang tra cứu ${lookupRows.toLocaleString("vi-VN")} dòng: ${escHtml(job.qr_url)}` : "",
  ].filter(Boolean).join("\n");
  const details = [c.corrections?.length ? "Đã chỉnh so với nguồn:\n" + c.corrections.map((x) => `• ${x}`).join("\n") : "", c.panel ? panelText(c.panel) : "", c.qa ? qaText(c.qa) : ""].filter(Boolean).join("\n\n");
  const card = `${head}\n\n<blockquote expandable>📘 Bài Facebook\n${escHtml(fbCaption(c, env).slice(0, 2000))}</blockquote>` +
    (details ? `\n<blockquote expandable>🔎 Chi tiết kiểm tra\n${escHtml(details.slice(0, 1100))}</blockquote>` : "") +
    escHtml(await armAutoPublish(env, job));
  await send(env, job.chat_id, card, { parse_mode: "HTML", ...reviewKbShort(job.id) });
  await hubEvent(env, { run: job.id, step: "review", status: "waiting", title: "Đã gửi bản xem trước vào Telegram – chờ anh duyệt" });
}

// Agent tương tác: bình luận đầu tiên (link tư vấn + câu hỏi mở) và theo dõi bình luận 7 ngày – không gọi Claude
const ENG_KV = { get: (env, k) => kvGet(env, k), set: (env, k, v) => kvSet(env, k, v), del: (env, k) => kvDel(env, k) };
async function afterFbPost(env, url, caption, title, extra = {}) {
  try {
    await firstComment(env, url, caption, extra.comment || "");
    await trackPost(env, ENG_KV, { id: String(url).replace(/\/+$/, "").split("/").pop(), title, kind: extra.kind || "post", pdf: extra.pdf || "" });
  } catch (e) { console.log("afterFbPost", e.message); }
}
const engDeps = (env) => ({ kv: ENG_KV, chat: agentChat(env), send: (chat, text, extra) => send(env, chat, text, extra), keyboard });

async function publish(env, job, targets) {
  const out = [];
  if (await kvGet(env, `weekly:${job.id}`)) targets = targets.filter((t) => t === "fb");   // tổng hợp tuần: chỉ đăng Facebook
  const dry = env.DRY_RUN === "1";
  if (targets.includes("fb")) {
    if (dry) out.push("📘 Facebook: chế độ thử, chưa đăng");
    else {
      try {
        if (job.content.share?.url) {
          const cap = withSeries(fbCaption(job.content, env), env, FB_FOOTER);
          const u = await postLink(env, cap, job.content.share.url);
          await markPublished(env, kvGet, kvSet, job.id, u, job.style);
          out.push(`📘 Facebook (chia sẻ video): ${u}`);
          await afterFbPost(env, u, cap, job.content.title_line1 || job.id);
        } else {
          const imgs = [];
          for (const k of job.render.pages) imgs.push(new Uint8Array(await (await env.FILES.get(k)).arrayBuffer()));
          const cap = withSeries(fbCaption(job.content, env), env, FB_FOOTER);
          const u = await postToPage(env, imgs, cap);
          await markPublished(env, kvGet, kvSet, job.id, u, job.style);
          out.push(`📘 Facebook: ${u}`);
          await afterFbPost(env, u, cap, [job.content.title_line1, job.content.title_line2].filter(Boolean).join(" ") || job.id);
        }
      } catch (e) { out.push(`📘 Facebook lỗi: ${e.message}`); }
    }
  }
  const shared = Boolean(job.content?.share?.url);
  if (targets.includes("ig")) {
    if (dry) out.push("📸 Instagram: chế độ thử, chưa đăng");
    else if (shared) out.push("📸 Instagram: bỏ qua (bài chia sẻ link video không đăng được lên Instagram)");
    else {
      try { out.push(`📸 Instagram: ${await postInstagram(env, job, igCaption(fbCaption(job.content, env)), kvGet, kvSet)}`); }
      catch (e) { out.push(`📸 Instagram lỗi: ${e.message}`); }
    }
  }
  if (targets.includes("threads")) {
    if (dry) out.push("🧵 Threads: chế độ thử, chưa đăng");
    else {
      try { out.push(`🧵 Threads: ${await postThreads(env, job, kvGet, kvSet)}`); }
      catch (e) { out.push(/Chưa kết nối/.test(e.message) ? `🧵 Threads: bỏ qua – ${e.message}` : `🧵 Threads lỗi: ${e.message}`); }
    }
  }
  const video = targets.filter((t) => VIDEO_KINDS.includes(t));
  let dispatch = video;
  if (video.includes("tiktok") && !dry && env.TIKTOK_FLOW !== "inbox" && (env.TIKTOK_FLOW === "page" || (await tiktokAudited(env, ttDeps(env))))) {
    dispatch = video.filter((t) => t !== "tiktok");
    await kvSet(env, `ttpage:${job.id}`, "1");
    if (!dispatch.length && (await env.FILES.head(`jobs/${job.id}/story.mp4`))) { await kvDel(env, `ttpage:${job.id}`); await sendTikTokLink(env, job); dispatch = null; }   // chỉ đăng lại TikTok, video đã có
    else if (!dispatch.length) dispatch = ["build"];
  }
  if (dispatch?.length) {
    try {
      await dispatchVideo(env, job.id, dispatch);
      out.push(`🎬 Đang dựng video có nhạc cho: ${video.join(", ")} (2–4 phút), xong em báo.`);
    } catch (e) { out.push(`🎬 Không khởi động được luồng video: ${e.message}`); }
  }
  job.status = "published";
  await saveJob(env, job);
  const postLines = out.filter((x) => /^(📘|📸|🧵)/.test(x));
  if (postLines.length) await hubEvent(env, { run: job.id, step: "publish", status: postLines.some((x) => /lỗi/i.test(x)) ? "error" : "done", title: postLines.join(" · ").slice(0, 280), detail: postLines.join("\n") });
  const vLine = out.find((x) => x.startsWith("🎬"));
  if (vLine) await hubEvent(env, { run: job.id, step: "video", status: /Không khởi động/.test(vLine) ? "error" : "start", title: vLine });
  const summary = compactPublish(out, video, dry);
  if (summary) await send(env, job.chat_id, summary, { parse_mode: "HTML", ...retryKb(job.id, out) });
  if (!dry) await kvSet(env, `audit:${job.id}`, JSON.stringify({ at: Date.now(), lines: out, video: video.length ? video : [], vres: null }));
}

const escHtml = (t) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VNAME = { story: "Story", tiktok: "TikTok", youtube: "YouTube", reels: "FB Reels", igreels: "IG Reels" };
// Gộp kết quả từng kênh thành 1 dòng: ✅ kênh (có link) · ❌ kênh lỗi (lý do ngắn)
function channelLines(lines) {
  const ok = [], bad = [], note = [];
  for (const l of lines) {
    const m = l.match(/^(\S+)\s+(.+?)( lỗi)?(?: \(chia sẻ video\))?: (.*)$/s);
    if (!m) continue;
    const name = m[2], msg = m[4], url = (msg.match(/https?:\/\/\S+/) || [""])[0];
    if (m[3]) bad.push(`❌ ${escHtml(name)}: ${escHtml(msg.replace(/\{.*\}/s, "").slice(0, 110))}`);
    else if (/bỏ qua|chế độ thử/.test(msg)) note.push(`${escHtml(name)}: ${escHtml(msg.slice(0, 80))}`);
    else ok.push(url ? `<a href="${escHtml(url)}">${escHtml(name)}</a>` : escHtml(name));
  }
  return { ok, bad, note };
}
function compactPublish(out, video, dry) {
  const { ok, bad, note } = channelLines(out.filter((x) => /^(📘|📸|🧵)/.test(x)));
  const v = out.find((x) => x.startsWith("🎬"));
  return [
    ok.length ? `✅ Đã đăng: ${ok.join(" · ")}` : "",
    ...bad, note.length ? `ℹ️ ${note.join(" · ")}` : "",
    v ? (/Không khởi động/.test(v) ? `❌ Video: ${escHtml(v.split(": ").slice(1).join(": ").slice(0, 140))}` : `🎬 Đang dựng video ${video.map((t) => VNAME[t] || t).join(", ")} (3–4 phút)…`) : "",
    dry ? "<i>(chế độ thử – chưa đăng thật)</i>" : "",
  ].filter(Boolean).join("\n");
}
// Kết quả luồng video (từ GitHub) → chú thích ngắn dưới video
function compactVideo(results) {
  const lines = results.flatMap((r) => String(r).split("\n"));
  const head = lines.find((l) => l.startsWith("🎬 Video")) || "";
  const secs = (head.match(/(\d+)s/) || [])[1], poster = /lướt poster/.test(head);
  const voice = (lines.find((l) => l.startsWith("🎙")) || "").replace(/^🎙 Giọng đọc: /, "").replace(/^Gemini .*\((.+)\)$/, "giọng $1").replace(/^Edge (.+)$/, "giọng $1");
  const { ok, bad } = channelLines(lines.filter((l) => /^(📱|🎵|▶️|🎞)/.test(l) && !/hộp thư/.test(l)));
  const inbox = lines.some((l) => l.startsWith("🎵 TikTok:") && l.includes("hộp thư"));
  const yPriv = lines.some((l) => l.startsWith("▶️ YouTube:") && /private/.test(l));
  const warn = lines.filter((l) => l.startsWith("⚠️")).map((l) => escHtml(l.slice(0, 120)));
  return [
    `🎬 Video${secs ? ` ${secs}s` : ""}${poster ? " (kiểu lướt poster)" : ""}${voice ? ` · 🎙 ${escHtml(voice)}` : ""}`,
    ok.length ? `✅ ${ok.join(" · ")}${yPriv ? " <i>(YouTube đang riêng tư)</i>" : ""}` : "",
    inbox ? "🎵 TikTok: đã vào hộp thư – mở app, dán mô tả bên dưới, bấm Đăng" : "",
    ...bad, ...warn, lines.some((l) => /Chế độ thử/.test(l)) ? "<i>(chế độ thử – chưa đăng)</i>" : "",
  ].filter(Boolean).join("\n");
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
      story_hook: c.story_hook, facebook_caption: fbCaption(c, env), tiktok_caption: c.tiktok_caption,
      youtube_title: c.youtube_title, youtube_description: c.youtube_description, youtube_tags: c.youtube_tags || [],
      hashtags: c.hashtags || [], tiktok_mode: env.TIKTOK_MODE || "inbox", tiktok_privacy: env.TIKTOK_PRIVACY || "SELF_ONLY",
      youtube_privacy: env.YOUTUBE_PRIVACY || "private",
      video_url: await mediaUrl(env, job.id, "story.mp4"),
      // Video chữ chuyển động (motion graphics) – mặc định; VIDEO_STYLE="poster" để quay lại kiểu lướt poster
      video_style: env.VIDEO_STYLE || "motion",
      music_mood: c.trend_look?.music_mood || "",   // agent xu hướng chọn tâm trạng nhạc (bài dùng phong cách xu hướng)
      voice: env.VIDEO_VOICE !== "0",   // giọng đọc nam (Gemini TTS miễn phí → Edge TTS); đặt VIDEO_VOICE=0 để tắt
      motion_content: { story_hook: c.story_hook, title_question: c.title_question, title_line1: c.title_line1, title_line2: c.title_line2, topic_short: c.topic_short,
        doc_ref: c.doc_ref, highlight: c.highlight, points: c.points, actions: c.actions, style: job.style, theme: await videoTheme(env, job),
        palette: c.trend_look ? { D: c.trend_look.highlight, L: c.trend_look.accent } : undefined,
        weekly: JSON.parse((await kvGet(env, `weekly:${job.id}`)) || "null")?.items || undefined,
        week_label: JSON.parse((await kvGet(env, `weekly:${job.id}`)) || "null")?.label || undefined },
      tht_phone: env.THT_PHONE || "0901 144 078", tht_website: env.THT_WEBSITE || "thtaudit.com.vn",
      reels_caption: fbCaption(c, env), ig_caption: igCaption(fbCaption(c, env)),
      ig_user_id: await igUserId(env, kvGet, kvSet).catch(() => ""),
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
    return Response.json({ ok: true });
  }
  if (what === "notify" && request.method === "POST") {
    const { results = [] } = await request.json();
    const job = await getJob(env, id);
    if (job) {
      await hubEvent(env, { run: job.id, step: "video", status: results.some((r) => /lỗi/i.test(r)) ? "error" : "done", title: (results.join(" · ") || "Luồng video đã chạy xong").slice(0, 280), detail: results.join("\n") });
      const secs = (results.join("\n").match(/🎬 Video[^\n]*?(\d+)s/) || [])[1];
      if (secs) await kvSet(env, `vdur:${id}`, secs);
      const vobj = await env.FILES.get(`jobs/${id}/story.mp4`);
      const capt = compactVideo(results);
      const r = vobj ? await sendVideo(env, job.chat_id, new Uint8Array(await vobj.arrayBuffer()), capt, { parse_mode: "HTML", ...retryKb(job.id, results) }) : null;
      if (!r?.ok) await send(env, job.chat_id, capt, { parse_mode: "HTML", ...retryKb(job.id, results) });
      const au = JSON.parse((await kvGet(env, `audit:${id}`)) || "null");
      if (au) { au.vres = results; await kvSet(env, `audit:${id}`, JSON.stringify(au)); }
      // TikTok (hộp thư) không nhận nội dung qua API → gửi riêng caption dạng chạm-để-copy để dán khi bấm Đăng trong app
      if (await kvGet(env, `ttpage:${id}`)) { await kvDel(env, `ttpage:${id}`); await sendTikTokLink(env, job); }
      const cap = job.content?.tiktok_caption;
      if (cap && results.some((r) => r.startsWith("🎵 TikTok:") && r.includes("hộp thư")))
        await send(env, job.chat_id, `<code>${escHtml(cap.slice(0, 2000))}</code>${job.content?.trend_look?.hot_sounds?.length ? `\n🎶 Muốn bắt trend thì thay nhạc trong app: ${escHtml(job.content.trend_look.hot_sounds.map((x) => x.title).join(" · "))}` : ""}`, { parse_mode: "HTML" });
    }
    return Response.json({ ok: true });
  }
  if (what === "tiktok-token") return Response.json({ access_token: await tiktokAccessToken(env) });
  return new Response("not found", { status: 404 });
}

// ---------------- TikTok OAuth (token kept in D1, refreshed here) ----------------
const ttDeps = (env) => ({ token: () => tiktokAccessToken(env), getJob, kvGet, kvSet, mediaUrl,
  notify: (job, text) => send(env, job.chat_id, `${text}: ${job.content?.title_line1 || job.id}`) });
// Nút mở trang "Đăng lên TikTok" (người dùng tự chọn quyền xem + đồng ý, theo quy định TikTok)
async function sendTikTokLink(env, job) {
  const u = await tiktokPostUrl(env, job.id);
  return send(env, job.chat_id, "🎵 TikTok: mở trang, chọn “Mọi người”, bấm Đăng", { reply_markup: { inline_keyboard: [[{ text: "🎵 Đăng lên TikTok", url: u }]] } });
}

export async function tiktokRoutes(url, env, request) {
  if (/^\/tiktok\/(post|api)\//.test(url.pathname)) return (await tiktokPostRoutes(request, url, env, ttDeps(env))) || new Response("not found", { status: 404 });
  const redirect = `${env.PUBLIC_BASE_URL}/tiktok/callback`;
  const authorize = async (jobId) => {
    const state = crypto.randomUUID() + (jobId ? "." + jobId : "");
    await kvSet(env, "tiktok_state", state);
    const q = new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || "").trim(), scope: env.TIKTOK_MODE === "inbox" ? "user.info.basic,video.upload" : "user.info.basic,video.publish,video.upload", response_type: "code", redirect_uri: redirect, state });
    return Response.redirect(`https://www.tiktok.com/v2/auth/authorize/?${q}`, 302);
  };
  if (url.pathname === "/tiktok/login") {
    if (url.searchParams.get("key") !== env.APP_PASSWORD) return new Response("Sai mật khẩu", { status: 403 });
    return authorize();
  }
  // Nút "Kết nối tài khoản TikTok" trên trang đăng (link có chữ ký, không cần mật khẩu) → xong quay lại trang đăng
  const cm = url.pathname.match(/^\/tiktok\/connect\/([A-Za-z0-9-]{4,40})$/);
  if (cm) {
    const ok = (await tiktokPostUrl(env, cm[1])).endsWith(`s=${url.searchParams.get("s")}`);
    if (!ok) return new Response("Link không hợp lệ", { status: 403 });
    return authorize(cm[1]);
  }
  if (url.pathname === "/tiktok/callback") {
    if (url.searchParams.get("state") !== (await kvGet(env, "tiktok_state"))) return new Response("Phiên đăng nhập không hợp lệ", { status: 400 });
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || "").trim(), client_secret: String(env.TIKTOK_CLIENT_SECRET || "").trim(), code: url.searchParams.get("code") || "", grant_type: "authorization_code", redirect_uri: redirect }) });
    const tok = await res.json();
    if (!tok.access_token) return new Response(`TikTok không cấp token: ${JSON.stringify(tok)}`, { status: 400 });
    await kvSet(env, "tiktok_token", JSON.stringify({ ...tok, obtained_at: Date.now() }));
    await kvDel(env, "tt:audited");
    const back = (url.searchParams.get("state") || "").split(".")[1];
    if (back) return Response.redirect(`${await tiktokPostUrl(env, back)}&connected=1`, 302);
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
    { command: "tuvan", description: "Hỏi 1 vấn đề → Thư tư vấn PDF + Poster" },
    { command: "chuyende", description: "Cẩm nang Giám đốc 8–10 trang (PDF + ảnh Facebook)" },
    { command: "danglai", description: "Đăng lại bài gần nhất lên kênh bị lỗi" },
    { command: "xuhuong", description: "Nghiên cứu xu hướng tuần" },
    { command: "kehoach", description: "Kế hoạch nội dung tuần" },
    { command: "baocao", description: "Báo cáo các kênh" },
    { command: "id", description: "Xem ID Telegram / ID nhóm" },
    { command: "help", description: "Hướng dẫn" },
  ] });
  return new Response(r.ok ? "Đã nối webhook Telegram. Mở bot và gửi /start." : `Lỗi: ${r.description}`, { headers: { "content-type": "text/plain; charset=utf-8" } });
}


// ---------------- AI Agent: tự tìm tin + đăng theo giờ vàng ----------------
const agentChat = (env) => env.AGENT_CHAT_ID || list(env.TG_ALLOWED_CHATS)[0] || list(env.TG_ALLOWED_IDS)[0];

async function runScout(env, chat, manual = false) {
  chat = chat || agentChat(env);
  if (!chat) return;
  let res;
  try { res = await scout(env, kvGet, kvSet); }
  catch (e) { return send(env, chat, `🤖 Agent quét tin bị lỗi: ${e.message}`); }
  if (!res.fresh.length) { if (manual) await send(env, chat, `🤖 Chưa có văn bản mới đủ "nóng" (đã xét ${res.total} tin).`); return; }
  if (!manual) return poolAdd(env, res.fresh.map((it) => ({ kind: "news", score: it.score, title: it.title, data: it })));
  for (const it of res.fresh) {
    const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "auto", pages: "auto", quality: "fast",
      note: itemSource(it) + "\n\nĐây là tin do Agent tự tìm từ trang chính thức. Soạn bản tin dựa trên nội dung trên; kiểm chứng lại số hiệu, ngày, con số.",
      created_at: now() };
    await saveJob(env, job);
    await tagJob(env, kvSet, job.id, { source: "agent" });
    await send(env, chat, `🤖 Agent tìm được tin mới · độ nóng ${it.score}/10\n📌 ${it.title}${it.doc_ref ? ` (${it.doc_ref})` : ""}\n🏛 ${it.issuer} · ${it.issued_date}\n🔥 ${it.why_hot}\n🔗 ${it.url}\n\nĐang soạn bản tin, em tự chọn mẫu phù hợp…`);
    await env.JOBS.send({ type: "generate", jobId: job.id });
  }
}

async function scheduleList(env) {
  const rows = (await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'sched:%'").all()).results || [];
  if (!rows.length) return "Chưa có bài nào hẹn giờ.";
  const items = rows.map((r) => ({ id: r.k.slice(6), ...JSON.parse(r.v) })).sort((a, b) => a.at - b.at);
  const lines = [];
  for (const it of items) { const j = await getJob(env, it.id); lines.push(`⏰ ${vnLabel(it.at)} · ${targetsLabel(it.targets)} · ${j?.content?.title_line1 || it.id}`); }
  return "Lịch đăng:\n" + lines.join("\n");
}

async function runDue(env) {
  try { await retryLetterSync(env); } catch (e) { console.log("letter sync", e.message); }
  try { await runAudit(env); } catch (e) { console.log("audit", e.message); }
  try { if (agentChat(env)) await pollComments(env, engDeps(env)); } catch (e) { console.log("engage", e.message); }
  const rows = (await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'sched:%'").all()).results || [];
  for (const r of rows) {
    const it = JSON.parse(r.v);
    if (it.at > Date.now()) continue;
    await kvDel(env, r.k);
    const job = await getJob(env, r.k.slice(6));
    if (!job || !job.content || !job.render) continue;
    await send(env, job.chat_id, `⏰ Đến giờ vàng – đang đăng: ${job.content.title_line1 || job.id}`);
    try { await publish(env, job, expandTargets(env, it.targets)); } catch (e) { await send(env, job.chat_id, `Đăng theo lịch bị lỗi: ${e.message}`); }
  }
}


// ---------------- Tăng trưởng fanpage: kế hoạch tuần + báo cáo tuần ----------------
async function nextStyle(env) {
  const style = (Number((await kvGet(env, "agent:style")) || 0) % 6) + 1;
  await kvSet(env, "agent:style", String(style));
  return String(style);
}

async function runPlan(env, chat) {
  chat = chat || agentChat(env);
  if (!chat) return;
  let ideas;
  try { ideas = await planWeek(env, kvGet); } catch (e) { return send(env, chat, `🗓 Lập kế hoạch tuần bị lỗi: ${e.message}`); }
  if (!ideas.length) return send(env, chat, "🗓 Chưa lập được kế hoạch tuần, thử lại /kehoach.");
  await kvSet(env, "plan:current", JSON.stringify(ideas));
  await poolAdd(env, ideas.map((it) => ({ kind: "idea", score: 6, title: it.headline, data: it })), true);
  const lines = ideas.map((it, i) => `${i + 1}. ${it.day} · ${PILLARS[it.pillar] || it.pillar}\n   ${it.headline}`);
  const btn = ideas.map((_, i) => [`✍️ ${i + 1}`, `ip:p:${i}`]);
  const rows = [];
  for (let i = 0; i < btn.length; i += 4) rows.push(btn.slice(i, i + 4));
  const st = await getStrategy(env, kvGet);
  await send(env, chat, `🗓 Kế hoạch nội dung 7 ngày tới\n\n${lines.join("\n")}\n\n` +
    `Mỗi sáng em tự chọn 1 bài tốt nhất trong ngày (giữa tin văn bản mới, video chính sách và các ý tưởng trên), chỉ tiêu ${st.weekly_targets.fb_posts} bài Facebook + ${st.weekly_targets.videos} video/tuần. ` +
    `Anh không cần bấm gì; muốn soạn thêm ý tưởng nào ngay thì bấm số.`, keyboard(rows));
}

async function pickIdeas(env, chat, q, arg) {
  const ideas = JSON.parse((await kvGet(env, "plan:current")) || "[]");
  const idx = arg === "all" ? ideas.map((_, i) => i) : [Number(arg)];
  const picked = idx.filter((i) => ideas[i]);
  if (!picked.length) return send(env, chat, "Kế hoạch này đã hết hạn, gõ /kehoach để lập mới.");
  const done = JSON.parse((await kvGet(env, "plan:done")) || "[]");
  for (const i of picked) {
    if (done.includes(ideas[i].headline)) continue;
    const it = ideas[i], style = "auto";
    const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style, pages: "auto", quality: "fast",
      note: ideaSource(it), created_at: now() };
    await saveJob(env, job);
    await tagJob(env, kvSet, job.id, { source: "plan", pillar: it.pillar });
    done.push(it.headline);
    await send(env, chat, `✍️ Đang soạn bài ${i + 1}: ${it.headline}\n(em tự chọn mẫu phù hợp)`);
    await env.JOBS.send({ type: "generate", jobId: job.id });
  }
  await kvSet(env, "plan:done", JSON.stringify(done.slice(-60)));
}

async function runInsights(env, chat) {
  const fromCron = !chat;
  chat = chat || agentChat(env);
  const RUN = `week-${dayKey()}`; env = { ...env, HUB_RUN: RUN, HUB_STEP: "weekly", HUB_LABEL: "Tự đánh giá tuần" };
  await hubEvent(env, { run: RUN, step: "weekly", status: "start", runTitle: `Tự đánh giá tuần ${dayKey().split("-").reverse().join("/")}`, title: "Lấy số liệu fanpage, tự đánh giá, điều chỉnh chiến lược" });
  if (!chat) return;
  try { const rep = await weeklyInsights(env, kvGet, kvSet); await hubEvent(env, { run: RUN, step: "weekly", status: "done", title: "Đã gửi báo cáo tuần và chiến lược mới", detail: rep }); await send(env, chat, rep, keyboard([[["↩️ Không áp dụng điều chỉnh", "sg:off"], ["✅ Áp dụng", "sg:on"]]])); if (fromCron) await env.JOBS.send({ type: "trends", thenPlan: true }); }
  catch (e) { await send(env, chat, `📊 Báo cáo tuần bị lỗi: ${e.message}\n(Thường do Page token hết hạn – cần cấp lại token có quyền pages_read_engagement.)`); }
}


// Agent tự nghiên cứu xu hướng (CN tối sau báo cáo tuần, rồi lập kế hoạch tuần; hoặc /xuhuong)
async function runTrends(env, chat, thenPlan = false) {
  const silent = !chat;
  chat = chat || agentChat(env);
  const RUN = `week-${dayKey()}`; env = { ...env, HUB_RUN: RUN, HUB_STEP: "trend", HUB_LABEL: "Nghiên cứu xu hướng" };
  await hubEvent(env, { run: RUN, step: "trend", status: "start", title: "Tìm chủ đề nóng, hạn chót, kiểu video đang hiệu quả" });
  try {
    const t = await researchTrends(env, kvGet, kvSet);
    const msg = trendMessage(t);
    await hubEvent(env, { run: RUN, step: "trend", status: "done", title: `Xu hướng: ${(t.hot_topics || []).map((x) => x.topic).slice(0, 3).join(" · ")}`.slice(0, 280), detail: msg });
    if (chat && (!silent || thenPlan)) await send(env, chat, msg);
  } catch (e) {
    await hubEvent(env, { run: RUN, step: "trend", status: "error", title: `Nghiên cứu xu hướng lỗi: ${e.message}` });
    if (chat && !silent) await send(env, chat, `📈 Nghiên cứu xu hướng bị lỗi: ${e.message}`);
  }
  if (thenPlan) await env.JOBS.send({ type: "plan" });
}

// Mẫu video (4 mẫu nền sáng/tối xen kẽ): theo tính chất bài, tránh trùng 2 video liền nhau
const VIDEO_THEMES = ["gold", "paper", "green", "red"];
const STYLE_THEME = { 1: "red", 2: "paper", 3: "green", 4: "gold", 5: "paper", 6: "gold" };
async function videoTheme(env, job) {
  const saved = await kvGet(env, `vtheme:${job.id}`);
  if (saved) return saved;
  if (job.content?.trend_look) return "trend";
  const recent = JSON.parse((await kvGet(env, "vtheme:recent")) || "[]");
  let th = (await kvGet(env, `weekly:${job.id}`)) ? "paper" : STYLE_THEME[job.style] || "gold";
  if (recent[0] === th) th = VIDEO_THEMES.find((x) => !recent.slice(0, 2).includes(x)) || th;
  await kvSet(env, `vtheme:${job.id}`, th);
  await kvSet(env, "vtheme:recent", JSON.stringify([th, ...recent].slice(0, 3)));
  return th;
}

// ---------------- Bản tin tổng hợp tuần (sáng Chủ nhật, thay bài thường ngày) ----------------
async function runWeeklyDigest(env, chat, RUN) {
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const rows = (await env.DB.prepare("SELECT id, content, status, created_at FROM jobs WHERE created_at >= ? AND content IS NOT NULL AND status IN ('published','scheduled') ORDER BY created_at").bind(since).all()).results || [];
  const items = [];
  for (const r of rows) {
    const meta = JSON.parse((await kvGet(env, `meta:${r.id}`)) || "{}");
    if (meta.source === "weekly") continue;
    let c; try { c = JSON.parse(r.content); } catch (_) { continue; }
    const title = [c.title_line1, c.title_line2].filter(Boolean).join(" ");
    if (!title || items.some((x) => x.title === title)) continue;
    const act = (c.actions?.items || [])[0];
    items.push({ title, line: [c.highlight?.value ? `${c.highlight.label}: ${c.highlight.value} ${c.highlight.unit || ""}`.trim() : "", act ? `Việc cần làm: ${act.title}${act.text ? " – " + act.text : ""}` : ""].filter(Boolean).join(" · "), doc: c.doc_ref || "", score: meta.panel_score || 0, published: !!meta.published });
  }
  if (items.length < 2) { await hubEvent(env, { run: RUN, step: "pick", status: "info", title: `Tuần này mới có ${items.length} tin – chưa đủ làm bản tổng hợp, chọn bài thường` }); return false; }
  const top = items.sort((a, b) => (b.published - a.published) || (b.score - a.score)).slice(0, 5);
  const d0 = new Date(Date.now() + 7 * 3600e3 - 6 * 86400e3), d1 = new Date(Date.now() + 7 * 3600e3);
  const f = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = `Tuần ${f(d0)} – ${f(d1)}/${d1.getUTCFullYear()}`;
  const note = [`BẢN TIN TỔNG HỢP TUẦN (${label}) của THT Audit – tổng hợp ${top.length} tin thuế – kế toán tiêu biểu đã đăng trong tuần:`,
    ...top.map((x, i) => `${i + 1}. ${x.title}${x.doc ? ` (${x.doc})` : ""}${x.line ? ` – ${x.line}` : ""}`), "",
    "Yêu cầu: tiêu đề dạng 'Tổng hợp tin thuế tuần' + mốc tuần; `points` = 3 tin quan trọng nhất (tên tin + điều doanh nghiệp cần nhớ); `actions` = 3 việc doanh nghiệp nên làm trong tuần tới (hạn chót gần nhất trước);",
    "`facebook_caption` NGẮN GỌN (≤ 110 từ): 1 câu mở + các tin bằng 1️⃣ 2️⃣ 3️⃣…, mỗi tin 1 dòng ≤ 15 từ + 1 câu kêu gọi liên hệ; mẫu poster 5 (infographic). Chỉ dùng thông tin trong danh sách trên, không thêm tin mới. Bài này CHỈ đăng Facebook, không làm video."].join("\n");
  const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "5", pages: "auto", quality: "strong", note, created_at: now() };
  await saveJob(env, job);
  await tagJob(env, kvSet, job.id, { source: "weekly", pillar: "hot", with_video: false, daily: true });
  await kvSet(env, `weekly:${job.id}`, JSON.stringify({ label, items: top.map(({ title, line }) => ({ title, line })) }));
  await kvSet(env, `day:${dayKey()}`, "1");
  const wk = JSON.parse((await kvGet(env, `week:${weekKey()}`)) || '{"fb":0,"video":0}');
  await kvSet(env, `week:${weekKey()}`, JSON.stringify({ fb: wk.fb + 1, video: wk.video }));
  await hubEvent(env, { run: RUN, step: "pick", status: "done", title: `Chủ nhật: làm bản tin tổng hợp tuần (${top.length} tin)`, detail: top.map((x, i) => `${i + 1}. ${x.title}`).join("\n") });
  await send(env, chat, `🗞 Bản tin tổng hợp tuần (${label}) – ${top.length} tin tiêu biểu:\n${top.map((x, i) => `${i + 1}. ${x.title}`).join("\n")}\nEm đang soạn poster + bài Facebook ngắn (bản tổng hợp tuần chỉ đăng Facebook, không làm video), xong gửi anh duyệt…`);
  await env.JOBS.send({ type: "generate", jobId: job.id });
  return true;
}

// ---------------- Tự đăng khi anh chưa duyệt (kịp giờ vàng) ----------------
// Chỉ áp dụng cho bản nháp do Agent tự làm (mặc định agent, plan, video, advice), đạt điểm hội đồng và không còn mục cần anh kiểm tra.
function autoBlockReasons(env, job) {
  const c = job.content || {}, r = [];
  const min = Number(env.AUTO_PUBLISH_MIN_SCORE || 7);
  if (c.uncertain?.length) r.push(`còn ${c.uncertain.length} mục cần anh kiểm tra`);
  const qaBad = (c.qa?.issues || []).filter((i) => ["overflow", "typo", "mismatch"].includes(i.type)).length;
  if (qaBad) r.push(`poster còn ${qaBad} lỗi hiển thị/chính tả`);
  if (env.COUNCIL_ENABLED !== "0" && (c.panel?.score ?? 0) < min) r.push(`điểm hội đồng ${c.panel?.score ?? "?"}/10 < ${min}`);
  if (env.DRY_RUN === "1") r.push("đang chế độ thử");
  return r;
}
async function armAutoPublish(env, job) {
  if (env.AUTO_PUBLISH === "0") return "";
  const meta = JSON.parse((await kvGet(env, `meta:${job.id}`)) || "{}");
  if (!list(env.AUTO_PUBLISH_SOURCES || "agent,plan,video,advice,weekly").includes(meta.source || "manual")) return "";
  const min = Number(env.AUTO_PUBLISH_MIN || 30);
  const block = autoBlockReasons(env, job);
  if (block.length) return `\n\n⏸ Chờ anh duyệt (không tự đăng: ${block.join(", ")})`;
  const token = String(Date.now());
  await kvSet(env, `ap:${job.id}`, token);
  await env.JOBS.send({ type: "autopub", jobId: job.id, token }, { delaySeconds: Math.min(min * 60, 43000) });
  return `\n\n⏱ ${min} phút không bấm → em tự đăng vào giờ vàng`;
}
async function runAutoPublish(env, jobId, token) {
  if ((await kvGet(env, `ap:${jobId}`)) !== token) return;
  await kvDel(env, `ap:${jobId}`);
  const job = await getJob(env, jobId);
  if (!job || job.status !== "review" || !job.content || !job.render) return;
  const block = autoBlockReasons(env, job);
  if (block.length) return send(env, job.chat_id, `⏸ Không tự đăng “${job.content.title_line1 || job.id}”: ${block.join(", ")}.`);
  const at = nextSlots(env, 1)[0];
  const targets = expandTargets(env, (env.AGENT_TARGETS || "all") + ((await wantsVideo(env, jobId)) ? "," + VIDEO_TARGETS(env).join(",") : "")).join(",");
  await kvSet(env, `sched:${jobId}`, JSON.stringify({ at, targets }));
  job.status = "scheduled"; await saveJob(env, job);
  const meta = JSON.parse((await kvGet(env, `meta:${jobId}`)) || "{}");
  await kvSet(env, `meta:${jobId}`, JSON.stringify({ ...meta, auto_published: true }));
  await hubEvent(env, { run: jobId, step: "review", status: "done", title: `Tự duyệt (anh chưa bấm sau ${env.AUTO_PUBLISH_MIN || 30} phút) – hẹn đăng ${vnLabel(at)}` });
  await send(env, job.chat_id, `⏰ Tự hẹn đăng “${job.content.title_line1 || jobId}” lúc ${vnLabel(at)}`,
    keyboard([[["🚫 Huỷ hẹn", `uc:${jobId}`], ["✅ Đăng ngay", `pub:${jobId}:allv`]]]));
}

// ---------------- Agent kiểm tra sau đăng ----------------
// Mỗi 15 phút: bài đã đăng 8 phút – 3 giờ → kiểm tra từng kênh còn hiển thị không, luồng video đã báo về chưa; báo 1 lần.
async function runAudit(env) {
  const rows = (await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'audit:%'").all()).results || [];
  for (const r of rows) {
    const a = JSON.parse(r.v), id = r.k.slice(6), age = Date.now() - a.at;
    if (age < 8 * 60e3) continue;
    const waitingVideo = a.video.length && !a.vres;
    if (waitingVideo && age < 30 * 60e3) continue;
    await kvDel(env, r.k);
    if (age > 3 * 3600e3) continue;
    const job = await getJob(env, id);
    if (!job) continue;
    const ok = [], bad = [], warn = [];
    const line = (p) => a.lines.find((l) => l.startsWith(p)) || "";
    const urlOf = (l) => (l.match(/https?:\/\/\S+/) || [])[0] || "";
    const g = `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v26.0"}`;
    // Facebook
    const fb = line("📘");
    if (fb) {
      if (/lỗi/i.test(fb)) bad.push("📘 Facebook: đăng lỗi");
      else {
        try {
          const pid = urlOf(fb).split("/").pop();
          const j = await (await fetch(`${g}/${pid}?fields=id,is_published,permalink_url&access_token=${encodeURIComponent(await pageToken(env))}`)).json();
          j.id && j.is_published !== false ? ok.push("📘 Facebook") : bad.push(`📘 Facebook: không thấy bài (${j.error?.message || "chưa hiển thị"})`);
        } catch (e) { warn.push(`📘 Facebook: chưa kiểm tra được (${e.message})`); }
      }
    }
    // Instagram
    const ig = line("📸");
    if (ig && !/bỏ qua|chế độ thử/.test(ig)) {
      if (/lỗi/i.test(ig)) bad.push("📸 Instagram: đăng lỗi");
      else {
        try {
          const igId = env.IG_USER_ID || (await kvGet(env, "ig:user"));
          const j = await (await fetch(`${g}/${igId}/media?fields=permalink&limit=15&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`)).json();
          const u = urlOf(ig).replace(/\/$/, "");
          (j.data || []).some((m) => (m.permalink || "").replace(/\/$/, "") === u) ? ok.push("📸 Instagram") : bad.push("📸 Instagram: không thấy bài trên trang");
        } catch (e) { warn.push(`📸 Instagram: chưa kiểm tra được (${e.message})`); }
      }
    }
    // Threads
    const th = line("🧵");
    if (th && !/bỏ qua|chế độ thử/.test(th)) {
      if (/lỗi/i.test(th)) bad.push("🧵 Threads: đăng lỗi");
      else {
        try {
          const t = await threadsToken(env, kvGet, kvSet);
          const j = await (await fetch(`https://graph.threads.net/v1.0/me/threads?fields=permalink&limit=15&access_token=${encodeURIComponent(t.access_token)}`)).json();
          const u = urlOf(th).replace(/\/$/, "");
          (j.data || []).some((m) => (m.permalink || "").replace(/\/$/, "") === u) ? ok.push("🧵 Threads") : bad.push("🧵 Threads: không thấy bài trên trang");
        } catch (e) { warn.push(`🧵 Threads: chưa kiểm tra được (${e.message})`); }
      }
    }
    // Video
    const vfail = [];
    if (a.video.length) {
      if (!a.vres) {
        const st = await videoRunStatus(env, id, a.at);
        if (st && st.status !== "completed") { warn.push(`🎬 Video: GitHub vẫn đang dựng (${st.status}) – em kiểm tra lại sau`); await kvSet(env, r.k, JSON.stringify({ ...a, at: Date.now() - 25 * 60e3 })); continue; }
        vfail.push({ targets: a.video, label: "🎬 Video (" + a.video.map((t) => TARGET_NAMES[t] || t).join(", ") + ")", detail: st?.note || (st ? `lượt dựng kết thúc: ${st.conclusion}` : "luồng dựng video không báo về sau 30 phút") });
      } else for (const l of a.vres) {
        if (!/^(📱|🎵|▶️|🎞)/.test(l)) continue;
        const name = l.split(":")[0];
        if (/lỗi/i.test(l)) { const t = (FAIL_MAP.find(([p]) => l.startsWith(p)) || [])[1]; vfail.push({ targets: t ? [t] : [], label: name, detail: l }); }
        else if (/hộp thư/.test(l)) warn.push(`${name}: đã vào hộp thư TikTok – mở app TikTok, bấm Đăng${/chưa đăng trực tiếp/.test(l) ? " (app TikTok chưa được duyệt nên chưa tự đăng thẳng được)" : ""}`);
        else if (/Chỉ mình tôi/.test(l)) warn.push(`${name}: đang để Chỉ mình tôi – mở app để chuyển công khai`);
        else if (/\(private\)/.test(l)) warn.push(`${name}: đang riêng tư (chờ Google duyệt) – vào YouTube Studio chuyển Công khai nếu cần`);
        else ok.push(name);
      }
    }
    // Agent soát lỗi: chẩn đoán + tự đăng lại kênh lỗi tạm thời (1 lần/bài)
    const failures = [
      ...bad.filter((b) => /đăng lỗi/.test(b)).map((b) => { const t = (FAIL_MAP.find(([p]) => b.startsWith(p)) || [])[1]; return { targets: t ? [t] : [], label: b.split(":")[0], detail: a.lines.find((l) => l.startsWith(b.split(":")[0])) || b }; }),
      ...vfail,
    ];
    const seen = bad.filter((b) => !/đăng lỗi/.test(b));   // "không thấy bài" – không tự đăng lại để tránh trùng
    const healed = Number((await kvGet(env, `heal:${id}`)) || 0);
    const { retry, manual } = healPlan(failures, healed >= 1);
    const retryTargets = [...new Set(retry.flatMap((f) => f.targets))].filter(Boolean);
    if (retryTargets.length && env.DRY_RUN !== "1") {
      await kvSet(env, `heal:${id}`, String(healed + 1));
      await env.JOBS.send({ type: "publish", jobId: id, targets: retryTargets });
    } else if (retry.length) manual.push(...retry.splice(0));
    const total = ok.length + failures.length + seen.length;
    const title = job.content?.title_line1 || id;
    const head = total ? `🔍 Kiểm tra sau đăng “${title}”: ${ok.length}/${total} kênh OK` : `🔍 Kiểm tra sau đăng “${title}”`;
    const problems = failures.length || seen.length;
    const msg = problems
      ? healMessage(title, ok, retry, [...manual, ...seen.map((b) => ({ label: b.split(":")[0], why: b.split(":").slice(1).join(":").trim() + " – em không tự đăng lại để tránh trùng bài, anh kiểm tra trên trang" }))], warn)
      : [head, ok.length ? "✅ " + ok.join(" · ") : "", warn.length ? "⚠️ Lưu ý:\n" + warn.map((x) => `• ${x}`).join("\n") : ""].filter(Boolean).join("\n");
    await hubEvent(env, { run: id, step: "audit", status: manual.length || seen.length ? "error" : "done", title: problems ? `Agent soát lỗi: ${retry.length} kênh tự đăng lại, ${manual.length + seen.length} kênh cần anh` : head, detail: msg });
    const needAnh = manual.length || seen.length;
    if (needAnh || retry.length || warn.length || env.AUDIT_REPORT_OK === "1") await send(env, job.chat_id, msg, needAnh ? retryKb(id, manual.map((f) => `${f.label} lỗi`)) : {});
  }
}

// ---------------- Tư vấn theo yêu cầu: Thư tư vấn PDF + Poster ----------------
async function runAdvise(env, chat, q) {
  const id = "tv" + crypto.randomUUID().slice(0, 6);
  env = { ...env, HUB_RUN: `adv-${id}`, HUB_STEP: "scout", HUB_LABEL: "Tra cứu tư vấn" };
  await hubEvent(env, { run: `adv-${id}`, step: "scout", status: "start", runTitle: `Tư vấn: ${q.slice(0, 80)}`, title: "Tra cứu văn bản trên nguồn chính thức" });
  let a;
  try { a = await researchAdvice(env, q); }
  catch (e) {
    await hubEvent(env, { run: `adv-${id}`, step: "scout", status: "error", title: `Tra cứu lỗi: ${e.message}` });
    return send(env, chat, `🔎 Tra cứu bị lỗi: ${e.message}\nAnh gõ lại /tuvan để thử lần nữa.`);
  }
  try { const g = await crossCheck(env, adviceFacts(a)); if (Array.isArray(g)) { a.uncertain = [...(a.uncertain || []), ...mismatchesToUncertain(g)]; a.gemini = g; } } catch (_) {}
  if (a.uncertain?.length && env.COUNCIL_ENABLED !== "0") {
    try {
      const checks = await verifyUncertain(env, a.uncertain, a.subject);
      const fixes = checks.filter((c) => c.status === "corrected" && c.fix).map((c) => `Sửa thông tin: ${c.fix}`);
      if (fixes.length) { try { Object.assign(a, await reviseAdvice(env, a, fixes.join("\n"))); } catch (_) {} }
      a.uncertain = checks.filter((c) => c.status === "unresolved").map((c) => c.item);
      a.verified = checks.filter((c) => c.status !== "unresolved").map((c) => `${c.status === "corrected" ? "✏️ đã sửa" : "✅ đã xác nhận"}: ${c.item} → ${c.finding}`);
    } catch (_) {}
  }
  const adv = { ...a, id, chat, ask: q, created_at: new Date().toISOString() };
  await kvSet(env, `adv:${id}`, JSON.stringify(adv));
  await hubEvent(env, { run: `adv-${id}`, step: "draft", status: "waiting", title: `Đã có nội dung: ${a.subject} – chờ anh chọn đầu ra`, detail: adviceSummary(a) });
  await send(env, chat, adviceSummary(a) + (a.verified?.length ? "\n\n🔎 Em đã tự kiểm tra:\n" + a.verified.map((x) => `• ${x}`).join("\n") : ""), advKb(id));
}

async function onAdviceButton(env, chat, uid, q, id, arg) {
  const adv = JSON.parse((await kvGet(env, `adv:${id}`)) || "null");
  if (!adv) return send(env, chat, "Nội dung tư vấn này đã hết hạn, gõ /tuvan để làm mới.");
  const clearKb = () => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (arg === "ok") {
    if (adv.approved) return send(env, chat, `Thư này đã duyệt (số ${adv.number}).`);
    await clearKb(); await send(env, chat, "✅ Đang hoàn thiện thư (cấp số) và lưu vào My THT…");
    return env.JOBS.send({ type: "advok", advId: id });
  }
  if (arg === "fix") { await kvSet(env, reviseKey(chat, uid), id); return send(env, chat, "Anh nhắn yêu cầu sửa thư (vd: “thêm ví dụ tính thuế”, “bỏ ý 3”, “nhấn mạnh hạn nộp 30/1”)."); }
  if (arg === "drop") { await clearKb(); adv.dropped = true; await kvSet(env, `adv:${id}`, JSON.stringify(adv)); return send(env, chat, "❌ Đã huỷ bản nháp thư này (không lưu vào My THT)."); }
  if (arg === "letter" || arg === "both") { await send(env, chat, "✉️ Đang làm bản nháp Thư tư vấn (khoảng 30 giây)…"); await env.JOBS.send({ type: "advletter", advId: id }); }
  if (arg === "poster" || arg === "both") {
    if (adv.poster_job) return send(env, chat, "🖼 Poster cho nội dung này đang làm/đã làm rồi.");
    const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "auto", pages: "auto", quality: "fast", note: adviceSource(adv), created_at: now() };
    await saveJob(env, job);
    await tagJob(env, kvSet, job.id, { source: "advice", pillar: "qa" });
    adv.poster_job = job.id; await kvSet(env, `adv:${id}`, JSON.stringify(adv));
    await send(env, chat, "🖼 Đang soạn poster từ nội dung tư vấn (em tự chọn mẫu), xong gửi anh duyệt như bài thường…");
    await env.JOBS.send({ type: "generate", jobId: job.id });
  }
}

// Bản nháp thư (chưa cấp số) → anh duyệt / sửa / huỷ
async function makeAdviceLetter(env, advId, instruction = "") {
  let adv = JSON.parse((await kvGet(env, `adv:${advId}`)) || "null");
  if (!adv) return;
  const RUN = `adv-${advId}`;
  try {
    if (instruction) {
      const fixed = await reviseAdvice(env, adv, instruction);
      adv = { ...adv, ...fixed, approved: false };
      await kvSet(env, `adv:${advId}`, JSON.stringify(adv));
    }
    const pdf = await htmlToPdf(env, letterHtml(env, adv, { number: "…/" + new Date(Date.now() + 7 * 3600e3).getUTCFullYear() + "/THT-TV (bản nháp)" }));
    await sendDocument(env, adv.chat, pdf, `NHAP_Thu-tu-van_${advId}.pdf`, "application/pdf",
      `📝 BẢN NHÁP Thư tư vấn${instruction ? " (đã sửa)" : ""}\nV/v: ${adv.subject}\nKính gửi: Quý Khách hàng\nDuyệt xong em cấp số thư và lưu vào My THT.`);
    await send(env, adv.chat, "Anh duyệt bản nháp thư:", letterKbd(advId));
    await hubEvent(env, { run: RUN, step: "review", status: "waiting", title: `Bản nháp thư: ${adv.subject} – chờ anh duyệt` });
  } catch (e) {
    await hubEvent(env, { run: RUN, step: "draft", status: "error", title: `Làm thư lỗi: ${e.message}` });
    await send(env, adv.chat, `✉️ Làm thư tư vấn bị lỗi: ${e.message}`, keyboard([[["🔁 Thử lại", `av:${advId}:letter`]]]));
  }
}

// Anh duyệt → cấp số, dựng bản chính thức, lưu kho + đồng bộ My THT
async function approveAdviceLetter(env, advId) {
  const adv = JSON.parse((await kvGet(env, `adv:${advId}`)) || "null");
  if (!adv || adv.approved) return;
  const RUN = `adv-${advId}`;
  try {
    adv.number = adv.number || (await nextLetterNumber(env, kvGet, kvSet));
    const pdf = await htmlToPdf(env, letterHtml(env, adv, { number: adv.number }));
    const letter = { id: advId, number: adv.number, subject: adv.subject, question: adv.ask, created_at: adv.created_at, approved_at: new Date().toISOString(),
      data: { conclusion: adv.conclusion, legal_basis: adv.legal_basis, recommendations: adv.recommendations } };
    await saveLetter(env, letter, pdf);
    const mytht = await syncLetter(env, letter, pdf);
    adv.approved = true; await kvSet(env, `adv:${advId}`, JSON.stringify(adv));
    await sendDocument(env, adv.chat, pdf, letterFileName(letter), "application/pdf",
      `✅ Thư tư vấn số ${letter.number} (đã duyệt)\nV/v: ${letter.subject}\n📁 ${mytht}\nKho thư: ${env.PUBLIC_BASE_URL}/thu/`);
    await hubEvent(env, { run: RUN, step: "publish", status: /lỗi|chưa/.test(mytht) ? "info" : "done", title: `Duyệt thư ${letter.number}: ${letter.subject}`, detail: mytht });
  } catch (e) {
    await hubEvent(env, { run: RUN, step: "publish", status: "error", title: `Duyệt thư lỗi: ${e.message}` });
    await send(env, adv.chat, `✉️ Hoàn thiện thư bị lỗi: ${e.message}`, keyboard([[["🔁 Thử lại", `av:${advId}:ok`]]]));
  }
}

// ---------------- Album nhiều ảnh = 1 bài ----------------
function addCaption(job, cap) {
  if (!cap) return;
  const u = cap.match(URL_RE); if (u) job.qr_url = u[0];
  job.note = `${job.note || ""} ${cap.replace(URL_RE, "")}`.trim();
}

async function collectAlbum(env, chat, mg) {
  const rows = (await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE ? ORDER BY k").bind(`mg:${chat}:${mg}:%`).all()).results || [];
  await env.DB.prepare("DELETE FROM kv WHERE k LIKE ? OR k = ?").bind(`mg:${chat}:${mg}:%`, `mgq:${chat}:${mg}`).run();
  if (!rows.length) return;
  let job = await openJob(env, chat);
  if (!job) job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "collecting", files: [], note: "", created_at: now() };
  for (const r of rows) {
    const f = JSON.parse(r.v);
    if (f.mime === "image/jpeg" && f.name === "anh.jpg") f.name = `anh${job.files.length + 1}.jpg`;
    addCaption(job, f.caption); delete f.caption;
    job.files.push(f);
  }
  job.media_group = mg;
  await saveJob(env, job);
  await send(env, chat, `📎 Đã nhận ${rows.length} ảnh/file trong cùng 1 lần gửi → gộp thành 1 bài (tổng ${job.files.length} file). Gửi thêm nếu cần (bài khác: /moi). Em sẽ tự chọn mẫu và soạn sau ${AUTO_GO_SEC} giây.`, goKb(job.id));
  await scheduleAutoGo(env, job);
}

// Hết thời gian chờ mà không có file mới → tự soạn với mẫu do AI chọn
async function autoGo(env, jobId, at) {
  if ((await kvGet(env, `go:${jobId}`)) !== at) return; // có file/ghi chú mới hơn, hoặc anh đã bấm
  await kvDel(env, `go:${jobId}`);
  const job = await getJob(env, jobId);
  if (!job || job.status !== "collecting") return;
  job.style = "auto"; job.pages = "auto"; job.status = "working";
  await saveJob(env, job);
  await send(env, job.chat_id, `⏳ Đang đọc ${job.files.length} file, kiểm chứng, tự chọn mẫu và soạn bản tin (1–2 phút)…`);
  await env.JOBS.send({ type: "generate", jobId });
}

// ---------------- Chia sẻ video chính sách (Facebook: link có ghi nguồn; TikTok/Story: video tóm tắt của THT) ----------------
async function attachShare(env, job) {
  const raw = await kvGet(env, `share:${job.id}`);
  if (!raw || !job.content) return;
  const sh = JSON.parse(raw);
  job.content.share = sh;
  const credit = `Nguồn video gốc: ${sh.source || sh.url}`;
  if (job.content.tiktok_caption && !job.content.tiktok_caption.includes("Nguồn video gốc")) job.content.tiktok_caption += `\n\n${credit}`;
  if (job.content.youtube_description && !job.content.youtube_description.includes(sh.url)) job.content.youtube_description += `\n\n${credit}: ${sh.url}`;
}

async function startShareJob(env, chat, it, manual = false, extra = {}) {
  const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "auto", pages: "auto", quality: extra.quality || "fast",
    qr_url: it.url, created_at: now(),
    note: manual
      ? `VIDEO CHÍNH SÁCH CẦN CHIA SẺ\nLink video: ${it.url}\nGhi chú của người gửi về nội dung video: ${it.summary || "(không có)"}\n\nDùng tìm kiếm web để xác định video này của đơn vị nào và nói về chính sách gì. Soạn poster tóm tắt nội dung chính + bài Facebook giới thiệu video, ghi rõ nguồn, không nhận video là của THT. Không xác định được nội dung thì ghi rõ trong uncertain, không bịa.`
      : videoSource(it) };
  await kvSet(env, `share:${job.id}`, JSON.stringify({ url: it.url, source: it.source || "", title: it.title || "" }));
  await saveJob(env, job);
  await tagJob(env, kvSet, job.id, { source: manual ? "manual" : "video", kind: "video", ...extra.meta });
  if (!extra.silent) await send(env, chat, manual
    ? `🎬 Đã nhận link video. Em đang tìm hiểu nội dung, soạn bài chia sẻ (ghi nguồn) và poster tóm tắt cho TikTok/Story…`
    : `🎬 Agent tìm được video mới · độ hữu ích ${it.score}/10\n📌 ${it.title}\n🏛 ${it.source}${it.published_date ? " · " + it.published_date : ""}\n💡 ${it.why_relevant}\n🔗 ${it.url}\n\nĐang soạn bài chia sẻ + poster tóm tắt…`);
  await env.JOBS.send({ type: "generate", jobId: job.id });
}

async function runVideoScout(env, chat, manual = false) {
  chat = chat || agentChat(env);
  if (!chat) return;
  let res;
  try { res = await scoutVideos(env, kvGet, kvSet); }
  catch (e) { return send(env, chat, `🎬 Tìm video bị lỗi: ${e.message}`); }
  if (!res.fresh.length) { if (manual) await send(env, chat, `🎬 Chưa có video chính sách mới đủ hữu ích (đã xét ${res.total} video). Anh thấy video hay cứ dán link vào nhóm.`); return; }
  if (!manual) return poolAdd(env, res.fresh.map((it) => ({ kind: "video", score: it.score, title: it.title, data: it })));
  for (const it of res.fresh) await startShareJob(env, chat, it);
}


// ---------------- Mỗi ngày 1 bài chất lượng nhất (bám chỉ tiêu tuần) ----------------
const VN_MS = 7 * 3600e3;
const vnNow = () => new Date(Date.now() + VN_MS);
const dayKey = () => vnNow().toISOString().slice(0, 10);
const weekKey = () => { const d = vnNow(); const off = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - off * 86400e3).toISOString().slice(0, 10); };
const VN_DAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

async function wantsVideo(env, jobId) {
  if ((await kvGet(env, `weekly:${jobId}`))) return false;   // tổng hợp tuần: chỉ Facebook
  if (env.VIDEO_ALWAYS !== "0") return true;   // mặc định: bài nào cũng làm video (GitHub Actions, không tốn API)
  const m = JSON.parse((await kvGet(env, `meta:${jobId}`)) || "{}");
  return m.with_video !== false; // bài anh tự gửi: mặc định có video; bài agent: theo chỉ tiêu video tuần
}

// Kho ứng viên: tin văn bản, video, ý tưởng kế hoạch (giữ 7 ngày)
async function poolAdd(env, items, replaceIdeas = false) {
  let pool = JSON.parse((await kvGet(env, "pool")) || "[]").filter((x) => Date.now() - x.added < 7 * 86400e3);
  if (replaceIdeas) pool = pool.filter((x) => x.kind !== "idea");
  for (const it of items) pool.push({ ...it, added: Date.now() });
  await kvSet(env, "pool", JSON.stringify(pool.slice(-40)));
}

const PICK_TOOL = {
  name: "pick_today",
  description: "Chọn 1 bài đăng tốt nhất hôm nay",
  input_schema: { type: "object", properties: {
    index: { type: "integer", description: "Số thứ tự ứng viên được chọn" },
    reason: { type: "string", description: "Lý do ngắn ≤ 90 ký tự" },
    with_video: { type: "boolean", description: "Có làm video TikTok/Shorts cho bài này không (bám chỉ tiêu video còn lại)" },
  }, required: ["index", "reason", "with_video"] },
};

async function runDaily(env) {
  const chat = agentChat(env);
  if (!chat) return;
  const RUN = `daily-${dayKey()}`;
  env = { ...env, HUB_RUN: RUN, HUB_STEP: "scout", HUB_LABEL: "Dò tin & video" };
  await hubEvent(env, { run: RUN, step: "scout", status: "start", runTitle: `Chọn bài ngày ${dayKey().split("-").reverse().join("/")}`, title: "Dò văn bản mới và video chính sách" });
  // 1) cập nhật kho ứng viên
  try { await runScout(env); } catch (e) { console.log("scout", e.message); }
  if (env.VIDEO_ENABLED !== "0") { try { await runVideoScout(env); } catch (e) { console.log("vscout", e.message); } }
  // 2) bám chỉ tiêu tuần
  if (await kvGet(env, `day:${dayKey()}`)) return hubEvent(env, { run: RUN, step: "pick", status: "done", title: "Hôm nay đã có bài, không chọn thêm" });
  if (env.WEEKLY_DIGEST !== "0" && vnNow().getUTCDay() === 0 && (await runWeeklyDigest(env, chat, RUN))) return;
  if (env.ENGAGE_QA !== "0" && vnNow().getUTCDay() === 6 && (await runSaturdayQA(env, chat, RUN))) return;
  const st = await getStrategy(env, kvGet);
  const wk = JSON.parse((await kvGet(env, `week:${weekKey()}`)) || '{"fb":0,"video":0}');
  const target = st.weekly_targets || { fb_posts: 7, videos: 4 };
  if (wk.fb >= target.fb_posts) return hubEvent(env, { run: RUN, step: "pick", status: "done", title: `Đã đủ chỉ tiêu tuần (${wk.fb}/${target.fb_posts} bài) – nghỉ đăng hôm nay` });
  const pool = JSON.parse((await kvGet(env, "pool")) || "[]").filter((x) => Date.now() - x.added < 7 * 86400e3);
  await hubEvent(env, { run: RUN, step: "scout", status: "done", title: `Kho có ${pool.length} ứng viên`, detail: pool.map((x) => `[${x.kind}] ${x.score}/10 · ${x.title}`).join("\n") });
  if (!pool.length) return hubEvent(env, { run: RUN, step: "pick", status: "done", title: "Không có ứng viên nào hôm nay" });
  const today = VN_DAYS[vnNow().getUTCDay()];
  hubTag(env, "pick", "Tổng biên tập chọn bài");
  const daysLeft = 7 - ((vnNow().getUTCDay() + 6) % 7);
  const recent = JSON.parse((await kvGet(env, "picks:recent")) || "[]");
  // 3) Tổng biên tập chọn 1 bài
  let pick = null;
  try {
    const list = pool.map((x, i) => `${i}. [${x.kind === "news" ? "Tin văn bản" : x.kind === "video" ? "Video chính sách" : "Ý tưởng kế hoạch – " + (x.data.day || "")}] điểm ${x.score}/10 · ${x.title}` +
      (x.kind === "news" ? ` · ${x.data.why_hot || ""}` : x.kind === "video" ? ` · ${x.data.source || ""} · ${x.data.why_relevant || ""}` : ` · ${x.data.angle || ""}`)).join("\n");
    const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 400,
      system: "Bạn là Tổng biên tập fanpage THT Audit. Mỗi ngày chỉ đăng 1 bài, nên chọn bài hữu ích và kịp thời nhất cho chủ doanh nghiệp và kế toán: ưu tiên văn bản mới có hạn chót/mức phạt/ưu đãi; tránh trùng chủ đề với bài vừa đăng; xen kẽ loại bài cho phong phú. Ý tưởng kế hoạch đúng ngày hôm nay được cộng điểm. Gọi pick_today đúng một lần.",
      tools: [PICK_TOOL], tool_choice: { type: "tool", name: "pick_today" },
      messages: [{ role: "user", content: `Hôm nay: ${today}. Còn ${daysLeft} ngày trong tuần.\nChỉ tiêu tuần: ${target.fb_posts} bài FB (đã soạn ${wk.fb}), ${target.videos} video (đã soạn ${wk.video}).\n` +
        `Bài gần đây (tránh trùng): ${recent.join(" | ") || "(chưa có)"}\n${env.STRATEGY_NOTES ? "Định hướng tuần: " + env.STRATEGY_NOTES + "\n" : ""}${env.TREND_NOTES ? "Xu hướng tuần: " + env.TREND_NOTES + "\n" : ""}\nỨng viên:\n${list}` }] });
    pick = msg.content.find((b) => b.type === "tool_use")?.input;
  } catch (e) { console.log("pick", e.message); }
  let idx = Number.isInteger(pick?.index) && pool[pick.index] ? pick.index : pool.reduce((b, x, i) => (x.score > pool[b].score ? i : b), 0);
  const chosen = pool[idx];
  const videoLeft = Math.max(0, (target.videos || 0) - wk.video);
  const withVideo = typeof pick?.with_video === "boolean" ? pick.with_video && videoLeft > 0 : videoLeft >= daysLeft || (videoLeft > 0 && chosen.score >= 8);
  // 4) cập nhật sổ theo dõi trước khi soạn (tránh soạn trùng nếu chạy lại)
  pool.splice(idx, 1);
  await kvSet(env, "pool", JSON.stringify(pool));
  await kvSet(env, `day:${dayKey()}`, "1");
  await kvSet(env, `week:${weekKey()}`, JSON.stringify({ fb: wk.fb + 1, video: wk.video + (withVideo ? 1 : 0) }));
  await kvSet(env, "picks:recent", JSON.stringify([chosen.title, ...recent].slice(0, 10)));
  const meta = { with_video: withVideo, daily: true };
  await hubEvent(env, { run: RUN, step: "pick", status: "done", title: `Chọn: ${chosen.title}${withVideo ? " (có video)" : ""}`,
    detail: `LÝ DO: ${pick?.reason || "điểm cao nhất"}\nChỉ tiêu tuần: ${wk.fb + 1}/${target.fb_posts} bài, ${wk.video + (withVideo ? 1 : 0)}/${target.videos} video\n\nCÁC ỨNG VIÊN ĐÃ CÂN NHẮC:\n${[chosen, ...pool].map((x, i) => `${i === 0 ? "✔" : "·"} [${x.kind}] ${x.score}/10 · ${x.title}`).join("\n")}` });
  const head = `📰 Bài hôm nay (${wk.fb + 1}/${target.fb_posts} tuần này${withVideo ? " · có video" : ""}): ${chosen.title}\n💡 ${pick?.reason || "điểm cao nhất trong ngày"}\nEm đang soạn kỹ (Opus), xong gửi anh duyệt…`;
  // 5) soạn bằng model mạnh nhất – mỗi ngày chỉ 1 bài nên ưu tiên chất lượng
  if (chosen.kind === "video") {
    if (env.DAILY_HEADS === "1") await send(env, chat, head);
    return startShareJob(env, chat, chosen.data, false, { quality: "strong", meta, silent: true });
  }
  const it = chosen.data;
  const note = chosen.kind === "news"
    ? itemSource(it) + "\n\nĐây là tin do Agent tự tìm từ trang chính thức. Soạn bản tin dựa trên nội dung trên; kiểm chứng lại số hiệu, ngày, con số."
    : ideaSource(it);
  const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "auto", pages: "auto", quality: "strong", note, created_at: now() };
  await saveJob(env, job);
  await tagJob(env, kvSet, job.id, { source: chosen.kind === "news" ? "agent" : "plan", pillar: it.pillar, ...meta });
  if (env.DAILY_HEADS === "1") await send(env, chat, head);
  await env.JOBS.send({ type: "generate", jobId: job.id });
}


// ---------------- Hỏi đáp thứ 7: trả lời câu hỏi người xem gửi qua bình luận trong tuần (thay bài thường ngày, không tốn thêm lượt soạn) ----------------
async function runSaturdayQA(env, chat, RUN) {
  const qs = await takeQuestions(env, ENG_KV, 3);
  if (!qs.length) return false;
  const st = await getStrategy(env, kvGet);
  const wk = JSON.parse((await kvGet(env, `week:${weekKey()}`)) || '{"fb":0,"video":0}');
  const target = st.weekly_targets || { fb_posts: 7, videos: 4 };
  const withVideo = (target.videos || 0) > wk.video;
  const note = ["HỎI ĐÁP THỨ 7 – THT Audit trả lời câu hỏi người xem gửi qua bình luận tuần này:", ...qs.map((x, i) => `${i + 1}. ${x.q}`), "",
    "Yêu cầu: tiêu đề dạng 'Hỏi đáp thứ 7: …' nêu câu hỏi đáng chú ý nhất; `points` = từng câu hỏi (tóm gọn) + câu trả lời ngắn có căn cứ pháp lý (số hiệu, điều khoản); không nêu tên người hỏi;",
    "`facebook_caption` mở đầu bằng 'HỎI ĐÁP THỨ 7', trả lời lần lượt từng câu, cuối bài mời mọi người gửi câu hỏi cho số tuần sau. Kiểm chứng kỹ trước khi trả lời; điểm chưa chắc ghi vào uncertain."].join("\n");
  const job = { id: crypto.randomUUID().slice(0, 8), chat_id: chat, status: "working", files: [], style: "auto", pages: "auto", quality: "strong", note, created_at: now() };
  await saveJob(env, job);
  await tagJob(env, kvSet, job.id, { source: "plan", pillar: "qa", with_video: withVideo, daily: true });
  await kvSet(env, `day:${dayKey()}`, "1");
  await kvSet(env, `week:${weekKey()}`, JSON.stringify({ fb: wk.fb + 1, video: wk.video + (withVideo ? 1 : 0) }));
  await hubEvent(env, { run: RUN, step: "pick", status: "done", title: `Thứ 7: Hỏi đáp ${qs.length} câu hỏi từ bình luận`, detail: qs.map((x, i) => `${i + 1}. ${x.q}`).join("\n") });
  await send(env, chat, `💬 Hỏi đáp thứ 7 – ${qs.length} câu hỏi từ bình luận tuần này:\n${qs.map((x, i) => `${i + 1}. ${x.q.slice(0, 150)}`).join("\n")}\nEm đang soạn câu trả lời, xong gửi anh duyệt…`);
  await env.JOBS.send({ type: "generate", jobId: job.id });
  return true;
}

// ---------------- Cẩm nang Giám đốc (/chuyende): dàn ý → bản nháp → duyệt → My THT → Facebook ----------------
const hbGet = async (env, id) => JSON.parse((await kvGet(env, `hb:${id}`)) || "null");
const hbSave = (env, r) => kvSet(env, `hb:${r.id}`, JSON.stringify(r));

async function startHandbook(env, chat, topic) {
  const id = "cd" + crypto.randomUUID().slice(0, 6);
  await hbSave(env, { id, chat, topic, theme: env.HANDBOOK_THEME || "noir", status: "outline", created_at: new Date().toISOString() });
  await hubEvent(env, { run: `hb-${id}`, step: "scout", status: "start", runTitle: `Cẩm nang: ${topic.slice(0, 80)}`, title: "Tra cứu và lập dàn ý" });
  await send(env, chat, `📘 Em đang tra cứu và lập dàn ý Cẩm nang Giám đốc:\n“${topic}”\n(khoảng 3 phút, xong em gửi dàn ý để anh duyệt trước khi viết)`);
  return env.JOBS.send({ type: "hb_outline", id });
}

async function onHandbookButton(env, chat, uid, q, id, arg) {
  const r = await hbGet(env, id);
  if (!r) return send(env, chat, "Cẩm nang này đã hết hạn, gõ /chuyende để làm mới.");
  const clearKb = () => tg(env, "editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (arg === "x") { await clearKb(); r.status = "dropped"; await hbSave(env, r); return send(env, chat, "❌ Đã huỷ Cẩm nang này."); }
  if (arg === "eo") { await kvSet(env, hbFixKey(chat, uid), `${id}:outline`); return send(env, chat, "Anh nhắn yêu cầu sửa dàn ý (vd: “thêm phần về hồ sơ chứng minh”, “bỏ phần 5”, “gộp phần 2 và 3”)."); }
  if (arg === "ed") { await kvSet(env, hbFixKey(chat, uid), `${id}:doc`); return send(env, chat, "Anh nhắn yêu cầu sửa bản nháp (vd: “thêm ví dụ ở phần 3”, “rút gọn phần 5”, “sửa con số …”)."); }
  if (arg === "go") { if (r.status !== "outline") return; await clearKb(); await send(env, chat, "✍️ Đang viết toàn văn và kiểm tra số liệu (khoảng 5–8 phút)…"); return env.JOBS.send({ type: "hb_write", id }); }
  if (arg === "th") { if (r.status === "approved") return; await clearKb(); r.theme = r.theme === "noir" ? "classic" : "noir"; await hbSave(env, r); await send(env, chat, "🎨 Đang dựng lại theo mẫu mới…"); return env.JOBS.send({ type: "hb_draft", id }); }
  if (arg === "ok") { if (r.status === "approved") return send(env, chat, `Cẩm nang này đã duyệt (số ${r.number}).`); await clearKb(); await send(env, chat, "✅ Đang cấp số, dựng bản chính thức và lưu vào My THT…"); return env.JOBS.send({ type: "hb_ok", id }); }
  if (arg === "fb") { if (r.fb) return send(env, chat, `Đã đăng Facebook rồi: ${r.fb}`); await clearKb(); await send(env, chat, "📘 Đang đăng album 10 ảnh lên Facebook…"); return env.JOBS.send({ type: "hb_fb", id }); }
}

async function runHandbookTask(env, task) {
  const r = await hbGet(env, task.id);
  if (!r || r.status === "dropped") return;
  const RUN = `hb-${r.id}`;
  env = { ...env, HUB_RUN: RUN };
  try {
    if (task.type === "hb_outline") {
      r.outline = await handbookOutline(env, r.topic, task.instruction || "", task.instruction ? r.outline : null);
      r.status = "outline"; await hbSave(env, r);
      await hubEvent(env, { run: RUN, step: "draft", status: "waiting", title: `Dàn ý: ${r.outline.title} – chờ anh duyệt` });
      return send(env, r.chat, outlineText(r.outline), hbOutlineKb(r.id));
    }
    if (task.type === "hb_write") {
      let d = await writeHandbook(env, r.topic, r.outline);
      const verified = [];
      try {
        const g = await crossCheck(env, handbookFacts(d));
        if (Array.isArray(g)) d.uncertain = [...(d.uncertain || []), ...mismatchesToUncertain(g)];
      } catch (_) {}
      if (d.uncertain?.length && env.COUNCIL_ENABLED !== "0") {
        try {
          const checks = await verifyUncertain(env, d.uncertain, d.title);
          const fixes = checks.filter((c) => c.status === "corrected" && c.fix).map((c) => `Sửa thông tin: ${c.fix}`);
          if (fixes.length) { try { d = { ...d, ...(await reviseHandbook(env, d, fixes.join("\n"))) }; } catch (_) {} }
          d.uncertain = checks.filter((c) => c.status === "unresolved").map((c) => c.item);
          checks.filter((c) => c.status !== "unresolved").forEach((c) => verified.push(`${c.status === "corrected" ? "✏️ đã sửa" : "✅ đã xác nhận"}: ${c.item}`));
        } catch (_) {}
      }
      r.doc = d; r.verified = verified; r.status = "draft"; await hbSave(env, r);
      return hbDraft(env, r);
    }
    if (task.type === "hb_revise") {
      r.doc = { ...r.doc, ...(await reviseHandbook(env, r.doc, task.instruction)) }; r.status = "draft"; await hbSave(env, r);
      return hbDraft(env, r, true);
    }
    if (task.type === "hb_draft") return hbDraft(env, r);
    if (task.type === "hb_ok") {
      if (!r.number) Object.assign(r, await nextHandbookNumber(env, kvGet, kvSet));
      const doc = finalizeDoc(env, r.doc, { number: r.number, issue: r.issue, theme: r.theme });
      const { pdf } = await renderHandbook(env, doc, `hb/${r.id}/final`);
      const letter = { id: r.id, number: r.number, subject: doc.title, question: doc.subtitle, created_at: r.created_at, approved_at: new Date().toISOString(),
        data: { kind: "chuyen_de", conclusion: (doc.key_points || []).join(" "), key_points: doc.key_points, legal_basis: (doc.legal || []).map((l) => ({ doc: l.doc, article: l.note || "" })) } };
      await saveLetter(env, letter, pdf);
      const mytht = await syncLetter(env, letter, pdf);
      r.status = "approved"; r.approved_at = letter.approved_at; await hbSave(env, r);
      await sendDocument(env, r.chat, pdf, handbookFileName(doc), "application/pdf", `✅ Cẩm nang Giám đốc số ${r.number} (đã duyệt)\n${doc.title}\n📁 ${mytht}`);
      await hubEvent(env, { run: RUN, step: "publish", status: /lỗi|chưa/.test(mytht) ? "info" : "done", title: `Duyệt Cẩm nang ${r.number}: ${doc.title}`, detail: mytht });
      return send(env, r.chat, "Bộ 10 ảnh đã sẵn sàng. Anh muốn đăng lên Facebook không? (em chỉ đăng khi anh bấm)", keyboard([[["📘 Đăng Facebook", `hb:${r.id}:fb`]]]));
    }
    if (task.type === "hb_fb") {
      const doc = finalizeDoc(env, r.doc, { number: r.number, issue: r.issue, theme: r.theme });
      const cards = [];
      for (let i = 1; i <= doc.cards.length; i++) {
        const o = await env.FILES.get(`hb/${r.id}/final/card${String(i).padStart(2, "0")}.png`);
        if (o) cards.push(new Uint8Array(await o.arrayBuffer()));
      }
      if (env.DRY_RUN === "1") return send(env, r.chat, "📘 Chế độ thử: chưa đăng Facebook.");
      const url = await postToPage(env, cards, handbookCaption(doc));
      r.fb = url; await hbSave(env, r);
      let pdf = "";
      try { const o = await env.FILES.get(`hb/${r.id}/final/doc.pdf`); if (o) { await env.FILES.put(`jobs/${r.id}/camnang.pdf`, await o.arrayBuffer(), { httpMetadata: { contentType: "application/pdf" } }); pdf = await mediaUrl(env, r.id, "camnang.pdf"); } } catch (e) { console.log("hb pdf link", e.message); }
      await afterFbPost(env, url, handbookCaption(doc), `Cẩm nang ${r.number}: ${doc.title}`, { kind: "handbook", pdf, comment: pdf ? "📘 Bình luận “CẨM NANG” để nhận bản PDF đầy đủ miễn phí." : "" });
      await hubEvent(env, { run: RUN, step: "publish", status: "done", title: `Đăng Facebook Cẩm nang ${r.number}`, detail: url });
      return send(env, r.chat, `✅ Đã đăng Facebook: ${url}`);
    }
  } catch (e) {
    await hubEvent(env, { run: RUN, step: task.type, status: "error", title: `Cẩm nang lỗi: ${e.message}` });
    const retry = { hb_outline: "eo", hb_write: "go", hb_revise: "ed", hb_draft: "th", hb_ok: "ok", hb_fb: "fb" }[task.type];
    return send(env, r.chat, `📘 Cẩm nang bị lỗi ở bước ${task.type.replace("hb_", "")}: ${e.message}`,
      task.type === "hb_write" || task.type === "hb_ok" || task.type === "hb_fb" ? keyboard([[["🔁 Thử lại", `hb:${r.id}:${retry}`]]]) : {});
  }
}

// Bản nháp: PDF + album ảnh + tóm tắt kiểm tra → nút duyệt
async function hbDraft(env, r, revised = false) {
  const y = new Date(Date.now() + 7 * 3600e3).getUTCFullYear();
  const doc = finalizeDoc(env, r.doc, { number: `CĐ-…/${y}/THT (bản nháp)`, issue: "…", theme: r.theme });
  const { pdf, cards } = await renderHandbook(env, doc, `hb/${r.id}/draft`);
  await sendDocument(env, r.chat, pdf, `NHAP_${handbookFileName({ number: r.id })}`, "application/pdf",
    `📝 BẢN NHÁP Cẩm nang Giám đốc${revised ? " (đã sửa)" : ""}\n${doc.title}`);
  await sendAlbum(env, r.chat, cards.map((b, i) => ({ name: `anh${String(i + 1).padStart(2, "0")}.png`, bytes: b })), `🖼 ${cards.length} ảnh Facebook (bản nháp)`);
  const lines = [
    `📘 ${doc.title}`,
    `${doc.chapters.length} phần · ${doc.key_points.length} ý cần nhớ · ${doc.faq?.length || 0} câu hỏi đáp · mẫu ${r.theme === "noir" ? "đen – vàng" : "trắng"}`,
    r.verified?.length ? `🔎 Em đã tự kiểm tra:\n${r.verified.slice(0, 6).map((x) => `• ${x}`).join("\n")}` : "",
    r.doc.uncertain?.length ? `❓ Cần anh xem:\n${r.doc.uncertain.slice(0, 6).map((x) => `• ${x}`).join("\n")}` : "✅ Không còn điểm nào em chưa xác nhận được.",
  ].filter(Boolean).join("\n\n");
  await hubEvent(env, { run: `hb-${r.id}`, step: "review", status: "waiting", title: `Bản nháp Cẩm nang: ${doc.title} – chờ anh duyệt` });
  return send(env, r.chat, lines, hbDraftKb(r.id, r.theme));
}
