// Agent tự nắm bắt xu hướng (mỗi tuần, trước khi lập kế hoạch; hoặc lệnh /xuhuong):
// chủ đề thuế – kế toán mọi người đang quan tâm, hạn chót sắp tới, kiểu câu mở/định dạng video đang hiệu quả.
// Kết quả lưu kv "growth:trends" → đưa vào kế hoạch tuần, chọn bài hằng ngày và kịch bản video.
import { claude, modelFor } from "./claude.js";

const VN = 7 * 3600e3;
const today = () => new Date(Date.now() + VN).toISOString().slice(0, 10).split("-").reverse().join("/");

const TOOL = {
  name: "trend_report",
  description: "Báo cáo xu hướng tuần cho kênh THT Audit",
  input_schema: {
    type: "object",
    properties: {
      hot_topics: { type: "array", maxItems: 6, description: "Chủ đề thuế/kế toán/kiểm toán đang được quan tâm ở Việt Nam tuần này",
        items: { type: "object", properties: { topic: { type: "string" }, why: { type: "string", description: "Vì sao đang nóng: văn bản mới, hạn chót, sự kiện – kèm nguồn" }, angle: { type: "string", description: "Góc làm video 30–60 giây cho THT" } }, required: ["topic", "why", "angle"] } },
      deadlines: { type: "array", items: { type: "string" }, maxItems: 6, description: "Hạn nộp/hạn chót trong 14 ngày tới (ngày – việc)" },
      hooks: { type: "array", items: { type: "string" }, maxItems: 5, description: "Mẫu câu mở 3 giây đầu nên thử tuần này" },
      formats: { type: "array", items: { type: "string" }, maxItems: 4, description: "Định dạng/kiểu video ngắn đang hiệu quả với kênh giáo dục không lộ mặt" },
      avoid: { type: "array", items: { type: "string" }, maxItems: 3, description: "Điều nên tránh (thay đổi thuật toán, chủ đề đã bão hoà)" },
      summary: { type: "string", description: "Chỉ dẫn ≤ 300 ký tự cho người viết tuần này" },
      look: { type: "object", description: "Phong cách hình ảnh & âm nhạc xu hướng tuần này (áp dụng cho khoảng 50% bài, phần còn lại giữ mẫu THT)",
        properties: {
          name: { type: "string", description: "Tên phong cách ngắn, vd 'Pastel tối giản', 'Neon công nghệ', 'Tết đỏ vàng'" },
          reason: { type: "string", description: "Vì sao chọn (xu hướng thiết kế/mùa/sự kiện đang thịnh), ≤ 200 ký tự" },
          base_poster: { type: "string", enum: ["1", "2", "4", "5"], description: "Bố cục poster nền sáng làm khung: 1 Navy-cam, 2 Swiss, 4 Legal Brief, 5 Infographic" },
          accent: { type: "string", description: "Màu nhấn chính (hex #RRGGBB), đậm, đọc rõ trên nền trắng" },
          soft: { type: "string", description: "Màu nền nhạt cùng tông (hex), rất sáng" },
          highlight: { type: "string", description: "Màu nổi bật sáng (hex) để làm nền chữ đen / chữ trên nền tối" },
          display_font: { type: "string", enum: ["Be Vietnam Pro", "Montserrat", "Lexend", "Plus Jakarta Sans", "Inter", "Playfair Display", "Space Grotesk", "Nunito"], description: "Font tiêu đề hợp xu hướng (đều hỗ trợ tiếng Việt)" },
          music_mood: { type: "string", enum: ["du-duong", "hien-dai", "hoi-hop", "kich-tinh", "upbeat"], description: "Tâm trạng nhạc nền: du-duong (nhẹ nhàng), hien-dai (hiện đại), hoi-hop, kich-tinh, upbeat (sôi động)" },
          hot_sounds: { type: "array", maxItems: 3, description: "Âm thanh/bài nhạc đang hot trên TikTok/Reels VN hợp kênh giáo dục (để anh tự gắn khi đăng trong app)", items: { type: "object", properties: { title: { type: "string" }, note: { type: "string", description: "Hợp kiểu video nào / nguồn" } }, required: ["title"] } },
        }, required: ["name", "base_poster", "accent", "soft", "highlight", "display_font", "music_mood"] },
    },
    required: ["hot_topics", "deadlines", "hooks", "formats", "summary"],
  },
};

export async function researchTrends(env, kvGet, kvSet) {
  const learn = (await kvGet(env, "growth:learnings")) || "";
  const system = `Bạn là chuyên viên nghiên cứu xu hướng cho kênh "THT Audit – Thuế 60 giây" (Facebook, TikTok, Instagram, YouTube Shorts, Threads), kênh tin kế toán – thuế – kiểm toán không lộ mặt cho chủ doanh nghiệp nhỏ, hộ kinh doanh, kế toán ở Việt Nam. Hôm nay ${today()}.
Dùng web_search (tối đa ${env.TREND_SEARCH_MAX || 5} lượt) để tìm:
1) văn bản thuế/kế toán/BHXH mới hoặc sắp có hiệu lực, chủ đề báo chí và cộng đồng kế toán đang bàn nhiều trong 7 ngày qua;
2) hạn nộp/hạn chót trong 14 ngày tới;
3) kiểu video ngắn giáo dục, câu mở, định dạng đang hiệu quả trên TikTok/Reels/Shorts năm nay;
4) xu hướng thiết kế (bảng màu, kiểu chữ) và âm thanh/nhạc đang thịnh trên TikTok/Instagram Việt Nam tuần này, hợp mùa/sự kiện (Tết, cuối năm, mùa quyết toán…) → điền "look": bảng màu chuyên nghiệp, không loè loẹt, hợp công ty kiểm toán; khác mẫu tuần trước.
Chỉ ghi điều có nguồn; không bịa số liệu. Kinh nghiệm từ số liệu kênh: ${learn || "(chưa có)"}
Gọi trend_report đúng một lần.`;
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: Number(env.TREND_SEARCH_MAX || 5) }, TOOL];
  let messages = [{ role: "user", content: "Nghiên cứu xu hướng tuần này." }];
  let rep = null;
  for (let turn = 0; turn < 4 && !rep; turn++) {
    const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 8000, system, tools, messages });
    rep = msg.content.find((b) => b.type === "tool_use" && b.name === "trend_report")?.input;
    if (rep) break;
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: "Gọi trend_report ngay với những gì đã có." });
    const fin = await claude(env, { model: modelFor(env, "fast"), max_tokens: 6000, system, tools: [TOOL], tool_choice: { type: "tool", name: "trend_report" }, messages });
    rep = fin.content.find((b) => b.type === "tool_use")?.input;
  }
  if (!rep) throw new Error("Không tổng hợp được xu hướng");
  await kvSet(env, "growth:trends", JSON.stringify({ ...rep, at: Date.now() }));
  return rep;
}

// Phong cách xu hướng tuần (dùng cho ~50% bài): màu, font, bố cục poster, tâm trạng nhạc
export async function trendLook(env, kvGet) {
  const t = JSON.parse((await kvGet(env, "growth:trends")) || "null");
  if (!t?.look || Date.now() - t.at > 10 * 86400e3) return null;
  return fixLook(t.look);
}
// Bảo đảm chữ đọc rõ: màu nhấn đủ đậm trên nền trắng, màu nền nhạt đủ sáng, màu nổi bật đủ sáng cho chữ đen
const hex = (h) => (/^#?[0-9a-f]{6}$/i.test(h || "") ? h.replace("#", "") : null);
const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const mix = (h, t, k) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - k) + t * k).toString(16).padStart(2, "0")).join("");
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export function fixLook(l) {
  let a = hex(l.accent) || "172B3B", s = hex(l.soft) || "F4F4F1", h = hex(l.highlight) || "FFD23F";
  for (let i = 0; i < 12 && contrast(a, "FFFFFF") < 4.6; i++) a = mix(a, 0, 0.15).slice(1);
  for (let i = 0; i < 12 && lum(s) < 0.85; i++) s = mix(s, 255, 0.25).slice(1);
  for (let i = 0; i < 12 && contrast(h, "1E1E24") < 7; i++) h = mix(h, 255, 0.2).slice(1);
  return { ...l, accent: "#" + a.toUpperCase(), soft: "#" + s.toUpperCase(), highlight: "#" + h.toUpperCase(), base_poster: ["1", "2", "4", "5"].includes(l.base_poster) ? l.base_poster : "1" };
}

// Đoạn ngắn đưa vào prompt (kế hoạch tuần, chọn bài, kịch bản)
export async function trendNotes(env, kvGet) {
  const t = JSON.parse((await kvGet(env, "growth:trends")) || "null");
  if (!t || Date.now() - t.at > 10 * 86400e3) return "";
  return [
    t.summary,
    t.hot_topics?.length ? "Chủ đề nóng: " + t.hot_topics.map((x) => x.topic).join("; ") : "",
    t.deadlines?.length ? "Hạn chót sắp tới: " + t.deadlines.join("; ") : "",
    t.hooks?.length ? "Câu mở nên thử: " + t.hooks.slice(0, 3).join(" | ") : "",
  ].filter(Boolean).join("\n");
}

export function trendMessage(t) {
  return [
    `📈 Xu hướng tuần (${today()})`,
    t.summary,
    t.hot_topics?.length ? "\n🔥 Chủ đề đang nóng:\n" + t.hot_topics.map((x, i) => `${i + 1}. ${x.topic}\n   ${x.why}\n   🎬 ${x.angle}`).join("\n") : "",
    t.deadlines?.length ? "\n📅 Hạn chót 14 ngày tới:\n" + t.deadlines.map((x) => `• ${x}`).join("\n") : "",
    t.hooks?.length ? "\n🪝 Câu mở sẽ thử:\n" + t.hooks.map((x) => `• ${x}`).join("\n") : "",
    t.formats?.length ? "\n🎞 Định dạng:\n" + t.formats.map((x) => `• ${x}`).join("\n") : "",
    t.avoid?.length ? "\n🚫 Tránh:\n" + t.avoid.map((x) => `• ${x}`).join("\n") : "",
    t.look ? `\n🎨 Phong cách xu hướng tuần (dùng cho khoảng 50% bài): ${t.look.name}${t.look.reason ? " – " + t.look.reason : ""}\n   Màu ${t.look.accent} · ${t.look.highlight} · font ${t.look.display_font} · nhạc ${t.look.music_mood}` : "",
    t.look?.hot_sounds?.length ? "\n🎶 Nhạc đang hot (anh tự gắn trong app TikTok khi muốn):\n" + t.look.hot_sounds.map((x) => `• ${x.title}${x.note ? " – " + x.note : ""}`).join("\n") : "",
  ].filter(Boolean).join("\n");
}
