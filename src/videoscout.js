// Agent tìm VIDEO chính sách Thuế – Kế toán – Kiểm toán từ nguồn uy tín (Báo Chính phủ, Cục Thuế, Bộ Tài chính, VTV…)
// để THT chia sẻ lại dạng link (ghi nguồn) trên Facebook; TikTok dùng video tóm tắt do THT tự dựng từ poster.
import { claude, modelFor } from "./claude.js";

export const VIDEO_DOMAINS = [
  "baochinhphu.vn", "chinhphu.vn", "mof.gov.vn", "gdt.gov.vn", "vtv.vn", "vtv.gov.vn", "vov.vn",
  "youtube.com", "facebook.com", "vacpa.org.vn", "thoibaotaichinhvietnam.vn",
  "quochoi.vn", "tapchitaichinh.vn", "vnanet.vn",
];

const VN = 7 * 3600e3;
const ITEM = {
  type: "object",
  properties: {
    title: { type: "string", description: "Tiêu đề video, tiếng Việt" },
    url: { type: "string", description: "URL trang xem video (YouTube, Facebook, hoặc trang báo có video)" },
    source: { type: "string", description: "Đơn vị đăng video, vd 'Báo Điện tử Chính phủ', 'Cục Thuế', 'VTV1'" },
    published_date: { type: "string", description: "dd/mm/yyyy hoặc rỗng nếu không rõ" },
    topic: { type: "string", enum: ["Thuế", "Hóa đơn", "Kế toán – Kiểm toán", "Lao động – BHXH", "Doanh nghiệp", "Khác"] },
    summary: { type: "string", description: "Video nói gì: 3–5 câu, có số liệu, mốc thời gian, văn bản được nhắc tới" },
    key_points: { type: "array", items: { type: "string" }, maxItems: 5 },
    why_relevant: { type: "string", description: "Vì sao chủ DN/kế toán nên xem ngay" },
    score: { type: "integer", minimum: 1, maximum: 10 },
  },
  required: ["title", "url", "source", "topic", "summary", "why_relevant", "score"],
};
const TOOL = {
  name: "video_report",
  description: "Danh sách video chính sách mới tìm được",
  input_schema: { type: "object", properties: { items: { type: "array", items: ITEM, maxItems: 6 } }, required: ["items"] },
};
const keyOf = (it) => String(it.url || it.title).toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "").slice(0, 160);

async function findOnce(env, seen) {
  const today = new Date(Date.now() + VN).toISOString().slice(0, 10).split("-").reverse().join("/");
  const days = Number(env.VIDEO_LOOKBACK_DAYS || 7);
  const system = `Bạn là biên tập viên mạng xã hội của Công ty TNHH Kiểm toán và Tư vấn THT.
Nhiệm vụ: dùng công cụ tìm kiếm để tìm VIDEO mới (đăng trong ${days} ngày gần đây, tính đến ${today}) về chính sách Thuế, Hóa đơn, Kế toán, Kiểm toán, Lao động – BHXH có ảnh hưởng tới doanh nghiệp nhỏ và vừa, hộ kinh doanh, kế toán.
Chỉ lấy video của nguồn chính thống, uy tín: Báo Điện tử Chính phủ, Cổng TTĐT Chính phủ, Bộ Tài chính, Cục Thuế, VTV, VOV, Thời báo Tài chính, VACPA (trang web, kênh YouTube hoặc Fanpage chính thức của họ).
Chỉ báo cáo khi có URL xem video cụ thể; không bịa URL, tiêu đề, ngày. Bỏ video đã có trong danh sách "đã xét".
Tìm xong gọi video_report đúng một lần (tối đa 4 video, sắp theo score giảm dần).`;
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: Number(env.VIDEO_SEARCH_MAX || 5), allowed_domains: VIDEO_DOMAINS },
    TOOL,
  ];
  let messages = [{ role: "user", content: `Đã xét (bỏ qua): ${seen.slice(-80).join(" | ") || "(trống)"}\n\nHãy tìm video mới.` }];
  for (let turn = 0; turn < 4; turn++) {
    const msg = await claude(env, { model: modelFor(env, "cheap"), max_tokens: 5000, system, tools, messages });
    const rep = msg.content.find((b) => b.type === "tool_use" && b.name === "video_report");
    if (rep) return rep.input.items || [];
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: "Tổng hợp và gọi video_report ngay." });
    const fin = await claude(env, { model: modelFor(env, "cheap"), max_tokens: 4000, system, tools: [TOOL], tool_choice: { type: "tool", name: "video_report" }, messages });
    return fin.content.find((b) => b.type === "tool_use")?.input.items || [];
  }
  return [];
}

export async function scoutVideos(env, kvGet, kvSet) {
  const seen = JSON.parse((await kvGet(env, "video:seen")) || "[]");
  const items = await findOnce(env, seen);
  const min = Number(env.VIDEO_MIN_SCORE || 6), max = Number(env.VIDEO_MAX_PER_SCAN || 1);
  const fresh = items.filter((it) => it && /^https?:\/\//.test(it.url || "") && (it.score || 0) >= min && !seen.includes(keyOf(it)))
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, max);
  await kvSet(env, "video:seen", JSON.stringify([...seen, ...items.map(keyOf)].filter((v, i, a) => a.indexOf(v) === i).slice(-300)));
  return { fresh, total: items.length };
}

// Văn bản nguồn để soạn poster + bài chia sẻ từ 1 video
export function videoSource(it) {
  return [
    `VIDEO CHÍNH SÁCH CẦN CHIA SẺ`, `Tiêu đề: ${it.title}`, `Nguồn: ${it.source}`, it.published_date ? `Ngày đăng: ${it.published_date}` : "",
    `Link video: ${it.url}`, `Chủ đề: ${it.topic || ""}`, "", `Nội dung video: ${it.summary || ""}`,
    ...(it.key_points || []).map((p) => `• ${p}`), it.why_relevant ? `\nVì sao nên xem: ${it.why_relevant}` : "",
    "",
    "Soạn poster tóm tắt nội dung chính của video (để dựng video tóm tắt cho TikTok/Story) và bài Facebook giới thiệu video:",
    "câu mở đầu nêu ngay video nói gì, 2–3 ý chính, khuyến khích xem video gốc. Ghi rõ nguồn là đơn vị đăng video; không nhận video là của THT.",
    "Kiểm chứng lại số hiệu, ngày, con số; ý nào không chắc thì bỏ hoặc ghi vào uncertain.",
  ].filter((x) => x !== "").join("\n");
}

const VIDEO_URL = /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch|youtube\.com|youtu\.be|baochinhphu\.vn|vtv\.vn|vov\.vn|mof\.gov\.vn|gdt\.gov\.vn)\S*/i;
export const findVideoUrl = (text) => (String(text || "").match(VIDEO_URL) || [null])[0];
