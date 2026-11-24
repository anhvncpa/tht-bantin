// Agent tương tác fanpage (tăng like/theo dõi, tiết kiệm API Claude):
// 1) Chuyên mục cố định: "Thuế 60 giây" thứ 2-4-6, "Hỏi đáp thứ 7" – chỉ thêm 1 dòng vào bài, không gọi Claude.
// 2) Bình luận đầu tiên do trang viết ngay sau khi đăng: câu hỏi mở + số điện thoại/Zalo tư vấn – không gọi Claude. Không gửi form/link thu thập thông tin.
// 3) Cẩm nang Giám đốc: ai bình luận "CẨM NANG" → trang tự trả lời kèm link PDF (mẫu cố định, không gọi Claude).
// 4) Bình luận khác: soạn câu trả lời bằng model rẻ (Haiku) và TỰ ĐĂNG ngay (ENGAGE_REPLY_DELAY phút chờ, mặc định 0), báo lại Telegram.
//    Câu hỏi chuyên môn khó → mời liên hệ 0901 144 078 (điện thoại/Zalo). ENGAGE_AUTO_REPLY="0" → chỉ đăng khi anh bấm duyệt.
//    Bình luận ngắn/biểu tượng cảm xúc → dùng mẫu cảm ơn, không gọi Claude. Giới hạn ENGAGE_MAX_DRAFTS bản nháp/ngày (mặc định 12).
// 5) Câu hỏi trong bình luận (có dấu "?") được gom lại cho bài "Hỏi đáp thứ 7".
// Cần token Facebook có quyền pages_manage_engagement + pages_read_user_content. Thiếu quyền thì bỏ qua êm, không làm hỏng việc đăng bài.
import { claude, modelFor } from "./claude.js";
import { pageToken } from "./facebook.js";
import { zaloUrl } from "./contact.js";

const graph = (env) => `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v26.0"}`;
const VN = 7 * 3600e3;
const vnDay = () => new Date(Date.now() + VN).getUTCDay();   // 0 = Chủ nhật
const dayKey = () => new Date(Date.now() + VN).toISOString().slice(0, 10);

// ---------- 1) Chuyên mục cố định ----------
export function seriesLine(env) {
  if (env.ENGAGE_SERIES === "0") return null;
  const d = vnDay();
  if ([1, 3, 5].includes(d)) return { line: "⏱ Chuyên mục THUẾ 60 GIÂY – thứ 2, 4, 6 hằng tuần trên THT Audit", tag: "#Thue60Giay" };
  if (d === 6) return { line: "💬 HỎI ĐÁP THỨ 7 – để lại câu hỏi ở bình luận, THT trả lời trong số Hỏi đáp tuần sau", tag: "#HoiDapThuBay" };
  return { line: "💬 Có câu hỏi về thuế – kế toán? Để lại bình luận, THT trả lời miễn phí", tag: "" };
}
// Chèn dòng chuyên mục ngay trên phần liên hệ, thêm hashtag chuyên mục
export function withSeries(caption, env, footer) {
  const s = seriesLine(env);
  if (!s || !caption) return caption;
  let out = footer && caption.includes(footer) ? caption.replace(footer, `${s.line}\n\n${footer}`) : `${caption}\n\n${s.line}`;
  if (s.tag && !out.includes(s.tag)) {
    const lines = out.split("\n");
    if (/^\s*#\S+/.test(lines[lines.length - 1] || "")) lines[lines.length - 1] += ` ${s.tag}`;
    else lines.push("", s.tag);
    out = lines.join("\n");
  }
  return out;
}

// ---------- 2) Bình luận đầu tiên ----------
const postIdOf = (url) => String(url || "").replace(/\/+$/, "").split("/").pop();
async function fbComment(env, targetId, message) {
  const form = new URLSearchParams({ message, access_token: await pageToken(env) });
  const r = await (await fetch(`${graph(env)}/${targetId}/comments`, { method: "POST", body: form })).json();
  if (!r.id) throw new Error(r.error?.message || "không bình luận được");
  return r.id;
}
export async function firstComment(env, postUrl, caption, extra = "") {
  if (env.ENGAGE_ENABLED === "0" || env.DRY_RUN === "1") return null;
  const q = String(caption || "").split("\n").map((l) => l.trim()).filter((l) => /\?$/.test(l) && l.length < 160).pop()
    || "Doanh nghiệp của anh/chị đã áp dụng điểm này chưa? Có vướng mắc gì cứ để lại bình luận nhé.";
  const msg = [`💬 ${q}`, extra, "📞 Cần tư vấn thêm: gọi hoặc nhắn Zalo 0901 144 078", zaloUrl(env) ? `👥 Tham gia nhóm Zalo cộng đồng THT Audit để nắm thêm thông tin: ${zaloUrl(env)}` : "", "🔔 Theo dõi THT Audit để nhận tin thuế – kế toán mỗi ngày."].filter(Boolean).join("\n");
  try { return await fbComment(env, postIdOf(postUrl), msg); } catch (e) { console.log("firstComment", e.message); return null; }
}

// ---------- Theo dõi bài vừa đăng (7 ngày) ----------
export async function trackPost(env, kv, post) {
  const list = JSON.parse((await kv.get(env, "eng:posts")) || "[]").filter((p) => Date.now() - p.at < 7 * 86400e3 && p.id !== post.id);
  list.unshift({ ...post, at: Date.now() });
  await kv.set(env, "eng:posts", JSON.stringify(list.slice(0, 20)));
}

// ---------- 4) Soạn câu trả lời ----------
const TRIVIAL = (t) => { const s = String(t || "").replace(/[\p{Emoji}\s.!]+/gu, " ").trim(); return !s || s.split(/\s+/).length <= 3; };
// "ib", "inbox", "xin giá", "tư vấn"… = khách muốn được nhắn riêng → mời nhắn trang hoặc gọi/Zalo
const WANTS_IB = (t) => /^\s*(ib|inbox|check\s*ib)\b/i.test(String(t || "")) || /^\s*(chấm|\.+|xin\s*giá|báo\s*giá|giá|cần\s*tư\s*vấn|tư\s*vấn(\s*giúp)?|quan\s*tâm)[\s.!?]*$/i.test(String(t || ""));
async function draftReply(env, comment, title) {
  const who = comment.from?.name ? comment.from.name.split(" ").pop() : "anh/chị";
  if (WANTS_IB(comment.message)) return `THT đã nhận ạ. ${who} nhắn tin trực tiếp cho trang hoặc gọi/Zalo 0901 144 078, THT tư vấn ngay cho mình nhé!`;
  if (TRIVIAL(comment.message)) return `Cảm ơn ${comment.from?.name ? comment.from.name.split(" ").pop() : "anh/chị"} đã quan tâm ❤️ Theo dõi THT Audit để nhận tin thuế – kế toán mỗi ngày nhé!`;
  const msg = await claude(env, { model: modelFor(env, "cheap"), max_tokens: 300,
    system: "Bạn là admin fanpage THT Audit (Công ty Kiểm toán & Tư vấn THT), trả lời bình luận bằng tiếng Việt tự nhiên như người thật: xưng THT hoặc em, gọi anh/chị, ngắn gọn 1–3 câu, thân thiện, không văn mẫu, không hashtag. Chỉ trả lời điều chắc chắn; không khẳng định con số/văn bản nếu không chắc. Câu hỏi chuyên môn khó, phức tạp hoặc cần xem hồ sơ cụ thể: trả lời ý chung ngắn (nếu chắc) rồi mời anh/chị liên hệ 0901 144 078 qua điện thoại hoặc Zalo để được tư vấn rõ hơn. Tuyệt đối không gửi link, form hay yêu cầu khách điền/cung cấp thông tin. Chỉ trả về nội dung câu trả lời.",
    messages: [{ role: "user", content: `Bài viết: ${title}\nBình luận của ${comment.from?.name || "người xem"}: ${comment.message}` }] });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
}

// ---------- Quét bình luận mới (gọi từ cron 15 phút, tự giãn 30 phút/lần) ----------
// deps: { kv:{get,set,del}, send(chat, text, extra), keyboard(rows), chat, mediaUrl(id,file) }
export async function pollComments(env, deps) {
  if (env.ENGAGE_ENABLED === "0" || !env.FB_PAGE_ID) return;
  const { kv } = deps;
  const last = Number((await kv.get(env, "eng:last")) || 0);
  if (Date.now() - last < 28 * 60e3) return;
  await kv.set(env, "eng:last", String(Date.now()));
  const posts = JSON.parse((await kv.get(env, "eng:posts")) || "[]");
  if (!posts.length) return;
  const tok = await pageToken(env);
  const seen = new Set(JSON.parse((await kv.get(env, "eng:seen")) || "[]"));
  const qs = JSON.parse((await kv.get(env, "eng:questions")) || "[]");
  const day = dayKey();
  let used = Number((await kv.get(env, `eng:drafts:${day}`)) || 0);
  const max = Number(env.ENGAGE_MAX_DRAFTS || 12);
  for (const p of posts) {
    let j;
    try { j = await (await fetch(`${graph(env)}/${p.id}/comments?fields=id,message,from{id,name},created_time&order=reverse_chronological&limit=25&access_token=${encodeURIComponent(tok)}`)).json(); } catch (_) { continue; }
    // Lỗi ở 1 bài (bài đã xoá, thiếu quyền…) → bỏ qua bài đó, KHÔNG dừng cả lượt (trước đây dừng → không lưu "đã xem" → trả lời lặp lại)
    if (j.error) { if (!(await kv.get(env, "eng:permwarn"))) { await kv.set(env, "eng:permwarn", "1"); await deps.send(deps.chat, `⚠️ Agent tương tác chưa đọc được bình luận Facebook (${j.error.message?.slice(0, 120)}). Cần token có quyền pages_read_user_content + pages_manage_engagement.`); } continue; }
    for (const c of j.data || []) {
      if (seen.has(c.id) || !c.message || c.from?.id === env.FB_PAGE_ID) { seen.add(c.id); continue; }
      seen.add(c.id);
      await kv.set(env, "eng:seen", JSON.stringify([...seen].slice(-800)));   // lưu ngay, tránh trả lời trùng nếu lượt bị ngắt giữa chừng
      // Chốt chặn cuối: trang đã trả lời bình luận này rồi thì bỏ qua
      try {
        const rr = await (await fetch(`${graph(env)}/${c.id}/comments?fields=from{id}&limit=50&access_token=${encodeURIComponent(tok)}`)).json();
        if ((rr.data || []).some((x) => x.from?.id === env.FB_PAGE_ID)) continue;
      } catch (_) {}
      // Cẩm nang: trả lời tự động kèm link PDF
      if (p.kind === "handbook" && /c[aẩâ]m\s*nang/i.test(c.message) && p.pdf) {
        try { await fbComment(env, c.id, `THT gửi ${c.from?.name ? c.from.name.split(" ").pop() : "anh/chị"} bản PDF Cẩm nang Giám đốc ạ: ${p.pdf}\nCần trao đổi thêm cho doanh nghiệp mình, anh/chị gọi hoặc nhắn Zalo 0901 144 078 nhé.`); } catch (e) { console.log("hb reply", e.message); }
        continue;
      }
      if (/\?/.test(c.message) && c.message.length > 15) qs.unshift({ q: c.message.slice(0, 300), post: p.title, at: Date.now() });
      if (used >= max) continue;
      let text;
      try { text = await draftReply(env, c, p.title); } catch (e) { console.log("draftReply", e.message); continue; }
      used++;
      await kv.set(env, `rep:${c.id}`, JSON.stringify({ id: c.id, text, name: c.from?.name || "", msg: c.message.slice(0, 500), post: p.title }));
      const auto = env.ENGAGE_AUTO_REPLY !== "0";
      const delay = Number(env.ENGAGE_REPLY_DELAY || 0);
      if (auto && delay <= 0) {
        try { await fbComment(env, c.id, text); await kv.del(env, `rep:${c.id}`); await deps.send(deps.chat, `💬 “${p.title.slice(0, 50)}” · ${c.from?.name || "Người xem"}: ${c.message.slice(0, 200)}\n↪️ Đã tự trả lời: ${text}`); }
        catch (e) { await deps.send(deps.chat, `❌ Chưa tự trả lời được bình luận của ${c.from?.name || "người xem"}: ${e.message}`); }
        continue;
      }
      if (auto) { const pend = JSON.parse((await kv.get(env, "eng:pending")) || "[]"); pend.push({ id: c.id, due: Date.now() + delay * 60e3 }); await kv.set(env, "eng:pending", JSON.stringify(pend)); }
      await deps.send(deps.chat, `💬 Bình luận mới · “${p.title.slice(0, 60)}”\n${c.from?.name || "Người xem"}: ${c.message.slice(0, 400)}\n\n✍️ ${auto ? `Trả lời sẽ TỰ ĐĂNG sau ${delay} phút` : "Đề xuất trả lời"}:\n${text}`,
        deps.keyboard([[["✅ Đăng ngay", `rp:${c.id}:ok`], ["✏️ Sửa", `rp:${c.id}:ed`], ["❌ Không trả lời", `rp:${c.id}:x`]]]));
    }
  }
  await kv.set(env, "eng:seen", JSON.stringify([...seen].slice(-800)));
  await kv.set(env, "eng:questions", JSON.stringify(qs.filter((x) => Date.now() - x.at < 14 * 86400e3).slice(0, 20)));
  await kv.set(env, `eng:drafts:${day}`, String(used));
}

// Đăng các câu trả lời đã hết thời gian chờ (gọi mỗi lần cron 15 phút)
export async function flushReplies(env, deps) {
  if (env.ENGAGE_AUTO_REPLY === "0") return;
  const pend = JSON.parse((await deps.kv.get(env, "eng:pending")) || "[]");
  if (!pend.length) return;
  const keep = [];
  for (const it of pend) {
    if (it.due > Date.now()) { keep.push(it); continue; }
    const raw = await deps.kv.get(env, `rep:${it.id}`);
    if (!raw) continue;
    const r = JSON.parse(raw);
    try { await fbComment(env, it.id, r.text); await deps.kv.del(env, `rep:${it.id}`); await deps.send(deps.chat, `✅ Đã tự trả lời ${r.name || "bình luận"}: “${r.text.slice(0, 80)}…”`); }
    catch (e) { await deps.kv.del(env, `rep:${it.id}`); await deps.send(deps.chat, `❌ Chưa tự trả lời được ${r.name || "bình luận"}: ${e.message}`); }
  }
  await deps.kv.set(env, "eng:pending", JSON.stringify(keep));
}
const unpend = async (env, kv, id) => { const p = JSON.parse((await kv.get(env, "eng:pending")) || "[]"); await kv.set(env, "eng:pending", JSON.stringify(p.filter((x) => x.id !== id))); };

// Nút trả lời: ok = đăng ngay, ed = anh nhắn câu khác, x = không trả lời
export async function replyButton(env, deps, commentId, arg, customText) {
  if (arg !== "ed") await unpend(env, deps.kv, commentId);
  const raw = await deps.kv.get(env, `rep:${commentId}`);
  if (!raw) return deps.send(deps.chat, "Bản nháp trả lời này đã xử lý hoặc hết hạn.");
  const r = JSON.parse(raw);
  if (arg === "x") { await deps.kv.del(env, `rep:${commentId}`); return deps.send(deps.chat, "Đã bỏ qua bình luận này."); }
  const text = customText || r.text;
  try {
    await fbComment(env, commentId, text);
    await deps.kv.del(env, `rep:${commentId}`);
    return deps.send(deps.chat, `✅ Đã trả lời ${r.name || "bình luận"} trên Facebook.`);
  } catch (e) { return deps.send(deps.chat, `❌ Chưa trả lời được: ${e.message}`); }
}

// ---------- 5) Hỏi đáp thứ 7: lấy câu hỏi đã gom ----------
export async function takeQuestions(env, kv, n = 3) {
  const qs = JSON.parse((await kv.get(env, "eng:questions")) || "[]");
  if (!qs.length) return [];
  const pick = qs.slice(0, n);
  await kv.set(env, "eng:questions", JSON.stringify(qs.slice(n)));
  return pick;
}

// ---------- 6) Bộ chia sẻ sau mỗi bài (cho anh và nhân viên lan toả thủ công – Facebook không cho tự động mời like/đăng nhóm) ----------
// Mẫu cố định từ tiêu đề + đoạn mở bài, không gọi Claude. Gửi vào nhóm Telegram dạng chạm-để-copy.
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function shareKit(env, url, caption, title) {
  if (env.ENGAGE_SHAREKIT === "0" || !url) return null;
  const body = String(caption || "").split("\n").map((l) => l.trim()).filter((l) => l && !/^[#📍⏱💬🇬🇧]/u.test(l) && !/english below/i.test(l));
  const lead = body.slice(1, 3).join("\n");
  const t = title || body[0] || "Tin thuế – kế toán mới";
  const staff = `📌 ${t}\nTin hữu ích từ THT Audit – anh chị làm kế toán, chủ doanh nghiệp nên lưu lại nhé 👇\n${url}`;
  const group = `${t}\n${lead}\n\nAi cần thêm chi tiết có thể xem bài đầy đủ tại THT Audit: ${url}`;
  const zalo = `THT kính gửi Quý khách tin mới: ${t}.\nChi tiết: ${url}\nQuý khách theo dõi fanpage THT Audit để nhận tin thuế – kế toán mỗi ngày.`;
  return [
    "📣 <b>Bộ lan toả bài mới</b> – chạm vào khung để copy",
    "", "1️⃣ <b>Đăng vào 1–2 nhóm kế toán – thuế</b> (Facebook không cho phần mềm tự đăng vào nhóm):", `<code>${esc(group)}</code>`,
    "", "2️⃣ <b>Chia sẻ về trang cá nhân của anh</b> (tuỳ chọn):", `<code>${esc(staff)}</code>`,
    "", "3️⃣ <b>Gửi nhóm Zalo khách hàng</b> (tối đa 2 bài/tuần):", `<code>${esc(zalo)}</code>`,
    "", `4️⃣ Tối nay mở bài → bấm vào số lượt cảm xúc → bấm <b>Mời</b> với người chưa thích trang: ${esc(url)}`,
  ].join("\n");
}
