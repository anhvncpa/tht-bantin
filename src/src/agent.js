// AI Agent bản tin: tự tìm văn bản Thuế – Kế toán – Lao động mới trên các trang chính thức,
// soạn sẵn poster + bài đăng, gửi vào nhóm Telegram để duyệt; đăng theo "giờ vàng" đã hẹn.
import { claude, modelFor } from "./claude.js";

// Trang chính thức được phép tìm (Cục Thuế, Bộ Tài chính, VACPA, Chính phủ, Bộ Nội vụ – lao động, BHXH)
export const AGENT_DOMAINS = [
  "gdt.gov.vn", "mof.gov.vn", "vacpa.org.vn", "chinhphu.vn", "vanban.chinhphu.vn", "congbao.chinhphu.vn",
  "vbpl.vn", "moha.gov.vn", "molisa.gov.vn", "baohiemxahoi.gov.vn",
];

// Giờ vàng đăng bài (giờ Việt Nam): sáng đi làm, trưa nghỉ, tối rảnh
export const slotsOf = (env) => (env.AGENT_SLOTS || "07:30,11:45,20:00").split(",").map((s) => s.trim()).filter(Boolean);

const VN = 7 * 3600e3;
const pad = (n) => String(n).padStart(2, "0");
export function vnLabel(ms) {
  const d = new Date(ms + VN), t = new Date(Date.now() + VN);
  const day = d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10) ? "Hôm nay"
    : d.toISOString().slice(0, 10) === new Date(Date.now() + VN + 86400e3).toISOString().slice(0, 10) ? "Mai" : `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
  return `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
// Các khung giờ vàng sắp tới (bỏ khung còn < 10 phút)
export function nextSlots(env, count = 3) {
  const out = [], now = Date.now();
  for (let dayOff = 0; dayOff < 4 && out.length < count; dayOff++) {
    const base = new Date(now + VN + dayOff * 86400e3);
    const y = base.getUTCFullYear(), m = base.getUTCMonth(), d = base.getUTCDate();
    for (const s of slotsOf(env)) {
      const [hh, mm] = s.split(":").map(Number);
      const at = Date.UTC(y, m, d, hh, mm) - VN;
      if (at > now + 10 * 60e3 && out.length < count) out.push(at);
    }
  }
  return out;
}

const ITEM = {
  type: "object",
  properties: {
    title: { type: "string", description: "Tên văn bản/tin, tiếng Việt" },
    doc_ref: { type: "string", description: "Số hiệu văn bản (vd 70/2025/NĐ-CP, 3164/CT-CS). Rỗng nếu là tin hướng dẫn không có số hiệu" },
    issuer: { type: "string" },
    issued_date: { type: "string", description: "dd/mm/yyyy" },
    effective_date: { type: "string", description: "dd/mm/yyyy hoặc rỗng" },
    url: { type: "string", description: "URL trang chính thức nơi tìm thấy" },
    topic: { type: "string", enum: ["Thuế", "Hóa đơn", "Kế toán – Kiểm toán", "Lao động – Tiền lương", "BHXH", "Doanh nghiệp", "Khác"] },
    summary: { type: "string", description: "Tóm tắt 4–6 câu: nội dung chính, con số, mốc thời gian, đối tượng áp dụng" },
    key_points: { type: "array", items: { type: "string" }, maxItems: 6 },
    who_affected: { type: "string" },
    why_hot: { type: "string", description: "Vì sao doanh nghiệp quan tâm ngay (phạt, hạn chót, thay đổi lớn)" },
    score: { type: "integer", minimum: 1, maximum: 10, description: "Mức nóng/hữu ích cho chủ DN & kế toán SME" },
  },
  required: ["title", "issuer", "issued_date", "url", "topic", "summary", "who_affected", "why_hot", "score"],
};
const REPORT_TOOL = {
  name: "scout_report",
  description: "Danh sách văn bản/tin mới tìm được",
  input_schema: { type: "object", properties: { items: { type: "array", items: ITEM, maxItems: 8 } }, required: ["items"] },
};

const keyOf = (it) => String(it.doc_ref || it.url || it.title).toLowerCase().replace(/\s+/g, "").slice(0, 120);

async function scoutOnce(env, seen) {
  const today = new Date(Date.now() + VN).toISOString().slice(0, 10).split("-").reverse().join("/");
  const days = Number(env.AGENT_LOOKBACK_DAYS || 7);
  const system = `Bạn là chuyên viên pháp chế – biên tập bản tin Thuế, Kế toán, Lao động của Công ty TNHH Kiểm toán và Tư vấn THT.
Nhiệm vụ: dùng công cụ tìm kiếm web để tìm các văn bản pháp luật / công văn / hướng dẫn MỚI (ban hành hoặc công bố trong ${days} ngày gần đây, tính đến hôm nay ${today}) về Thuế, Hóa đơn, Kế toán – Kiểm toán, Lao động – Tiền lương – BHXH, có ảnh hưởng thực tế tới doanh nghiệp nhỏ và vừa, hộ kinh doanh, kế toán.
Chỉ dùng thông tin từ các trang chính thức (Cục Thuế, Bộ Tài chính, VACPA, Cổng TTĐT Chính phủ, Công báo, CSDL văn bản pháp luật, Bộ Nội vụ, BHXH Việt Nam).
Ưu tiên: hạn chót sắp tới, mức phạt, thay đổi thuế suất/mức giảm trừ/lương tối thiểu, hóa đơn điện tử, quyết toán, đăng ký – kê khai mới.
Không bịa số hiệu, ngày tháng; mục nào không chắc thì bỏ qua. Bỏ các văn bản đã có trong danh sách "đã đăng".
Tìm xong, gọi công cụ scout_report đúng một lần với tối đa 6 mục, sắp xếp theo score giảm dần.`;
  const user = `Danh sách đã đăng/đã xét (bỏ qua): ${seen.slice(-120).join(" | ") || "(trống)"}\n\nHãy tìm tin mới và báo cáo.`;
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: Number(env.AGENT_SEARCH_MAX || 6), allowed_domains: AGENT_DOMAINS },
    REPORT_TOOL,
  ];
  let messages = [{ role: "user", content: user }];
  for (let turn = 0; turn < 4; turn++) {
    const msg = await claude(env, { model: modelFor(env, env.AGENT_QUALITY || "cheap"), max_tokens: 6000, system, tools, messages });
    const rep = msg.content.find((b) => b.type === "tool_use" && b.name === "scout_report");
    if (rep) return rep.input.items || [];
    if (msg.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: msg.content }]; continue; }
    // Hết lượt mà chưa gọi báo cáo → ép tổng hợp từ những gì đã tìm
    messages = [...messages, { role: "assistant", content: msg.content }, { role: "user", content: "Tổng hợp kết quả đã tìm và gọi scout_report ngay." }];
    const fin = await claude(env, { model: modelFor(env, "cheap"), max_tokens: 4000, system, tools: [REPORT_TOOL], tool_choice: { type: "tool", name: "scout_report" }, messages });
    const r2 = fin.content.find((b) => b.type === "tool_use");
    return r2 ? r2.input.items || [] : [];
  }
  return [];
}

// Trả về các tin mới (đã lọc trùng + điểm tối thiểu), đồng thời cập nhật danh sách đã xét
export async function scout(env, kvGet, kvSet) {
  const seen = JSON.parse((await kvGet(env, "agent:seen")) || "[]");
  const items = await scoutOnce(env, seen);
  const min = Number(env.AGENT_MIN_SCORE || 6), max = Number(env.AGENT_MAX_PER_SCAN || 2);
  const fresh = items.filter((it) => it && it.url && (it.score || 0) >= min && !seen.includes(keyOf(it)))
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, max);
  const next = [...seen, ...items.map(keyOf)].filter((v, i, a) => a.indexOf(v) === i).slice(-300);
  await kvSet(env, "agent:seen", JSON.stringify(next));
  return { fresh, total: items.length };
}

// Văn bản nguồn để soạn poster từ tin agent tìm được
export function itemSource(it) {
  return [
    `Tên: ${it.title}`, it.doc_ref ? `Số hiệu: ${it.doc_ref}` : "", `Cơ quan: ${it.issuer}`,
    `Ngày ban hành/công bố: ${it.issued_date}`, it.effective_date ? `Hiệu lực: ${it.effective_date}` : "",
    `Nguồn chính thức: ${it.url}`, `Chủ đề: ${it.topic}`, "", `Tóm tắt: ${it.summary}`,
    ...(it.key_points || []).map((p) => `• ${p}`), "", `Đối tượng: ${it.who_affected}`, `Điểm nóng: ${it.why_hot}`,
  ].filter((x) => x !== "").join("\n");
}
