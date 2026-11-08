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
3) kiểu video ngắn giáo dục, câu mở, định dạng đang hiệu quả trên TikTok/Reels/Shorts năm nay.
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
  ].filter(Boolean).join("\n");
}
