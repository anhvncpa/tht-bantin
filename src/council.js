// HỘI ĐỒNG ĐÁNH GIÁ – các agent "bàn bạc" trước khi bản nháp tới tay anh:
//   👤 Người đọc (kế toán / chủ hộ kinh doanh bận rộn)   – có dễ xem, dễ hiểu, có ích cho việc kinh doanh không
//   🏢 Giám đốc doanh nghiệp khách hàng                  – có giá trị, có tin THT, có muốn theo dõi / liên hệ không
//   📈 Chuyên gia tăng trưởng mạng xã hội                – câu mở, hình thức, bắt trend, khả năng lan toả
//   🔎 Người kiểm tra thông tin                          – tự tra cứu các mục "cần anh kiểm tra" để xác nhận / sửa
//   🧑‍⚖️ Tổng biên tập                                     – tổng hợp ý kiến, quyết định sửa gì, chấm điểm cuối
// Mỗi tuần: hội đồng chiến lược (người đọc + giám đốc + tăng trưởng) phản biện đề xuất chiến lược trước khi áp dụng.
import { claude, modelFor, reviseContent } from "./claude.js";
import { AGENT_DOMAINS } from "./agent.js";
import { crossCheck, posterFacts, mismatchesToUncertain, geminiReview } from "./gemini.js";

export const PERSONAS = {
  reader: { icon: "👤", name: "Người đọc", brief: "Bạn là kế toán viên / chủ hộ kinh doanh ở Việt Nam, rất bận, lướt Facebook/TikTok trên điện thoại. Bạn chỉ dừng lại nếu thấy liên quan tới mình trong 3 giây. Đánh giá: có hiểu ngay không, có từ khó/thuật ngữ chưa giải thích không, có biết phải làm gì không, có muốn lưu/chia sẻ không." },
  director: { icon: "🏢", name: "Giám đốc DN khách hàng", brief: "Bạn là giám đốc một doanh nghiệp vừa và nhỏ đang (hoặc có thể) dùng dịch vụ của THT. Bạn cần thông tin giúp ra quyết định kinh doanh: rủi ro, chi phí, hạn chót, cơ hội. Đánh giá: bài có giá trị cho doanh nghiệp không, có chuyên nghiệp và đáng tin không, có làm bạn muốn theo dõi THT hoặc liên hệ tư vấn không (mà không thấy bị quảng cáo)." },
  growth: { icon: "📈", name: "Chuyên gia tăng trưởng", brief: "Bạn là chuyên gia tăng trưởng mạng xã hội cho kênh giáo dục không lộ mặt (Facebook, TikTok, Instagram, YouTube Shorts, Threads). Đánh giá: tiêu đề và câu mở 3 giây (story_hook) có đủ mạnh không, có bắt xu hướng không, hình thức/mẫu poster có hợp chủ đề không, khả năng được lưu và chia sẻ." },
};

// Nhãn hiển thị (gồm cả thành viên Gemini – không tham gia hội đồng chiến lược)
const LABEL = { ...PERSONAS, gemini: { icon: "🔷", name: "Người đọc độc lập (Gemini)" } };

const REVIEW_TOOL = {
  name: "review",
  description: "Đánh giá bản nháp bài đăng",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 1, maximum: 10, description: "Điểm tổng thể theo góc nhìn của bạn" },
      verdict: { type: "string", description: "Nhận xét 1–2 câu" },
      issues: { type: "array", items: { type: "string" }, maxItems: 4, description: "Vấn đề cụ thể (chỉ nêu điều thật sự cần sửa)" },
      fixes: { type: "array", items: { type: "string" }, maxItems: 4, description: "Đề xuất sửa cụ thể, có thể áp dụng ngay (vd 'đổi tiêu đề thành …', 'giải thích CSHHL là …')" },
    },
    required: ["score", "verdict", "issues", "fixes"],
  },
};

const brief = (c) => JSON.stringify({
  tieu_de: [c.title_line1, c.title_line2].filter(Boolean).join(" "), cau_mo_video: c.story_hook, o_noi_bat: c.highlight,
  doi_tuong: c.audience, y_chinh: c.points, viec_can_lam: c.actions, khuyen_nghi: c.recommendation, can_cu: c.doc_ref,
  mau_poster: c.style, bai_facebook: c.facebook_caption, caption_tiktok: c.tiktok_caption, tieu_de_youtube: c.youtube_title,
});

async function personaReview(env, key, content, extra = "") {
  const p = PERSONAS[key];
  const msg = await claude(env, { model: modelFor(env, env.COUNCIL_QUALITY || "fast"), max_tokens: 3000,
    system: `${p.brief}\nĐây là bản nháp bài đăng của fanpage THT Audit (Công ty TNHH Kiểm toán và Tư vấn THT). Nhận xét thẳng thắn, cụ thể, ngắn gọn. Không bịa quy định pháp luật. Gọi công cụ review đúng một lần.${extra}`,
    tools: [REVIEW_TOOL], tool_choice: { type: "tool", name: "review" },
    messages: [{ role: "user", content: brief(content) }] });
  const r = msg.content.find((b) => b.type === "tool_use")?.input;
  return r ? { key, ...r } : null;
}

// 🔎 Người kiểm tra: tự tra cứu các mục "cần anh kiểm tra"
const VERIFY_TOOL = {
  name: "verify_result",
  description: "Kết quả kiểm tra từng mục chưa chắc chắn",
  input_schema: {
    type: "object",
    properties: {
      items: { type: "array", items: { type: "object", properties: {
        item: { type: "string" },
        status: { type: "string", enum: ["confirmed", "corrected", "unresolved"], description: "confirmed = nguồn chính thức xác nhận đúng; corrected = sai, đã có thông tin đúng; unresolved = không tìm được nguồn chắc chắn" },
        finding: { type: "string", description: "Điều tìm được, kèm số hiệu/điều khoản" },
        fix: { type: "string", description: "Nếu corrected: nội dung đúng cần sửa vào bài" },
        source: { type: "string", description: "URL nguồn" },
      }, required: ["item", "status", "finding"] } },
    },
    required: ["items"],
  },
};

export async function verifyUncertain(env, items, context = "") {
  if (!items?.length) return [];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: Number(env.VERIFY_SEARCH_MAX || 4), allowed_domains: [...AGENT_DOMAINS, "thuvienphapluat.vn", "luatvietnam.vn"] }, VERIFY_TOOL];
  const system = "Bạn là người kiểm tra thông tin của THT Audit. Với từng mục 'chưa chắc chắn', dùng web_search trên nguồn chính thức để xác nhận hoặc sửa. Chỉ đánh 'confirmed'/'corrected' khi có nguồn rõ ràng; còn lại 'unresolved'. Gọi verify_result đúng một lần.";
  let messages = [{ role: "user", content: `${context ? "Bối cảnh bài: " + context + "\n" : ""}Các mục cần kiểm tra:\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}` }];
  for (let t = 0; t < 3; t++) {
    const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 8000, system, tools, messages });
    const r = msg.content.find((b) => b.type === "tool_use" && b.name === "verify_result")?.input;
    if (r) return r.items || [];
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: "Gọi verify_result ngay với những gì đã tra được." });
  }
  return items.map((item) => ({ item, status: "unresolved", finding: "Chưa tra cứu được" }));
}

// 🧑‍⚖️ Tổng biên tập tổng hợp ý kiến
const SYNTH_TOOL = {
  name: "council_decision",
  description: "Quyết định của Tổng biên tập sau khi nghe hội đồng",
  input_schema: {
    type: "object",
    properties: {
      final_score: { type: "integer", minimum: 1, maximum: 10, description: "Điểm chất lượng bài SAU khi áp dụng các sửa đổi dưới đây" },
      summary: { type: "string", description: "Tóm tắt hội đồng đã thống nhất gì, 2–3 câu" },
      edits: { type: "string", description: "Chỉ dẫn sửa bài gộp lại (rỗng nếu không cần sửa). Chỉ chọn các đề xuất làm bài tốt hơn rõ rệt, không mâu thuẫn nhau, không thêm thông tin chưa kiểm chứng." },
    },
    required: ["final_score", "summary", "edits"],
  },
};

export async function councilReview(env, content, opts = {}) {
  const t0 = Date.now();
  // Gemini kiểm tra chéo bằng Google Search → chỗ lệch thêm vào danh sách để Người kiểm tra (Claude) phân xử
  const verifyChain = (async () => {
    let gchecks = null;
    try { gchecks = await crossCheck(env, posterFacts(content)); } catch (e) { gchecks = { error: e.message }; }
    const extra = Array.isArray(gchecks) ? mismatchesToUncertain(gchecks) : [];
    const items = [...(content.uncertain || []), ...extra];
    const checks = await verifyUncertain(env, items, [content.title_line1, content.title_line2, content.doc_ref].filter(Boolean).join(" · ")).catch(() => []);
    return { checks, gchecks };
  })();
  const [reviews, gem, { checks, gchecks }] = await Promise.all([
    Promise.all(Object.keys(PERSONAS).map((k) => personaReview(env, k, content).catch(() => null))),
    geminiReview(env, brief(content)).catch(() => null),
    verifyChain,
  ]);
  if (gem) reviews.push(gem);
  const rv = reviews.filter(Boolean);
  const corrected = checks.filter((c) => c.status === "corrected" && c.fix);
  const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 3000,
    system: "Bạn là Tổng biên tập fanpage THT Audit. Đọc ý kiến các thành viên hội đồng và kết quả kiểm tra thông tin, cân nhắc ý kiến trái chiều, chọn phương án tốt nhất cho người đọc và uy tín THT. Thông tin đã được người kiểm tra sửa (corrected) BẮT BUỘC đưa vào chỉ dẫn sửa. Gọi council_decision đúng một lần.",
    tools: [SYNTH_TOOL], tool_choice: { type: "tool", name: "council_decision" },
    messages: [{ role: "user", content: JSON.stringify({ ban_nhap: JSON.parse(brief(content)), y_kien_hoi_dong: rv, kiem_tra_thong_tin: checks }) }] });
  const d = msg.content.find((b) => b.type === "tool_use")?.input || { final_score: Math.round(rv.reduce((a, r) => a + r.score, 0) / (rv.length || 1)), summary: "", edits: "" };
  let next = content;
  if ((d.edits || "").trim() || corrected.length) {
    const instr = [d.edits, ...corrected.map((c) => `Sửa thông tin: ${c.fix}`)].filter(Boolean).join("\n");
    try { const rc = await reviseContent(env, content, instr, "fast"); if (rc) next = rc; } catch (_) {}
  }
  // "cần anh kiểm tra" chỉ còn những mục người kiểm tra chưa xác nhận được
  const unresolved = checks.length ? checks.filter((c) => c.status === "unresolved").map((c) => c.item) : (content.uncertain || []);
  next = { ...next, uncertain: unresolved, bilingual_off: content.bilingual_off, share: content.share, style: next.style || content.style };
  next.panel = {
    score: d.final_score, summary: d.summary, edits: d.edits || "",
    reviews: rv.map((r) => ({ key: r.key, score: r.score, verdict: r.verdict, issues: r.issues })),
    checks: checks.map((c) => ({ item: c.item, status: c.status, finding: c.finding })),
    gemini: Array.isArray(gchecks) ? { ok: gchecks.filter((x) => x.status === "ok").length, mismatch: gchecks.filter((x) => x.status === "mismatch").length, unknown: gchecks.filter((x) => x.status === "unknown").length }
      : gchecks?.error ? { error: gchecks.error } : null,
    ms: Date.now() - t0,
  };
  return next;
}

export function panelText(p) {
  if (!p) return "";
  const st = { confirmed: "✅ đã xác nhận", corrected: "✏️ đã sửa", unresolved: "❓ chưa xác nhận" };
  return [
    `🧑‍⚖️ Hội đồng đánh giá: ${p.score}/10${p.summary ? " – " + p.summary : ""}`,
    ...p.reviews.map((r) => `${LABEL[r.key]?.icon || "•"} ${LABEL[r.key]?.name || r.key}: ${r.score}/10 – ${r.verdict}`),
    p.gemini ? (p.gemini.error ? `🔷 Gemini kiểm tra chéo: bỏ qua (${p.gemini.error})` : `🔷 Gemini kiểm tra chéo (Google Search): ${p.gemini.ok} khớp · ${p.gemini.mismatch} lệch · ${p.gemini.unknown} chưa rõ`) : "",
    p.checks.length ? "🔎 Kiểm tra thông tin:\n" + p.checks.map((c) => `• ${st[c.status] || c.status}: ${c.item}${c.status !== "unresolved" ? ` → ${c.finding}` : ""}`).join("\n") : "",
    p.edits ? "✍️ Đã tự sửa theo hội đồng." : "",
  ].filter(Boolean).join("\n");
}

// ---------------- Hội đồng chiến lược hằng tuần ----------------
const STRAT_REVIEW = {
  name: "strategy_review",
  description: "Phản biện đề xuất chiến lược tuần tới",
  input_schema: { type: "object", properties: {
    agree: { type: "boolean" }, comments: { type: "array", items: { type: "string" }, maxItems: 4 },
    format_ideas: { type: "array", items: { type: "string" }, maxItems: 3, description: "Ý tưởng hình thức thể hiện / cách dựng poster–video để bắt xu hướng, thu hút người xem" },
  }, required: ["agree", "comments", "format_ideas"] },
};

export async function strategyCouncil(env, data, proposal) {
  const reviews = await Promise.all(Object.entries(PERSONAS).map(async ([k, p]) => {
    try {
      const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 2000,
        system: `${p.brief}\nĐây là đề xuất chiến lược nội dung tuần tới của fanpage THT Audit, kèm số liệu tuần qua. Phản biện ngắn gọn từ góc nhìn của bạn. Gọi strategy_review đúng một lần.`,
        tools: [STRAT_REVIEW], tool_choice: { type: "tool", name: "strategy_review" },
        messages: [{ role: "user", content: JSON.stringify({ so_lieu: data, de_xuat: proposal }) }] });
      const r = msg.content.find((b) => b.type === "tool_use")?.input;
      return r ? { key: k, ...r } : null;
    } catch (_) { return null; }
  }));
  return reviews.filter(Boolean);
}
