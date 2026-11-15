// Gemini Flash (gói miễn phí của Google AI Studio) – dùng cho các việc KIỂM TRA, không dùng để viết bài:
//   1) Kiểm tra chéo số liệu bằng Google Search (độc lập với Claude) → chỗ lệch đưa vào "cần kiểm tra" để Người kiểm tra (Claude) phân xử
//   2) Soát poster bằng hình ảnh: chữ tràn/bị che, sai chính tả, số trên poster lệch với bài viết
//   3) Thêm 1 thành viên hội đồng (góc nhìn của model khác)
// Không có GEMINI_API_KEY, hết hạn mức hoặc lỗi → bỏ qua, bot chạy như cũ (không bao giờ dừng vì Gemini).
// Chỉ gửi nội dung công khai (tin, poster, thư chung) – không gửi dữ liệu khách hàng (gói miễn phí Google được dùng dữ liệu để cải tiến).

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const geminiOn = (env) => Boolean(env.GEMINI_API_KEY) && env.GEMINI_ENABLED !== "0";

function b64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Gọi Gemini; trả text. opts: { search, json (schema), images: [Uint8Array] }
export async function gemini(env, prompt, opts = {}) {
  const model = env.GEMINI_MODEL || "gemini-flash-latest";
  const parts = [{ text: prompt }];
  for (const img of opts.images || []) parts.push({ inline_data: { mime_type: "image/png", data: b64(img) } });
  const body = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2 } };
  if (opts.search) body.tools = [{ google_search: {} }];
  else if (opts.json) { body.generationConfig.responseMimeType = "application/json"; body.generationConfig.responseSchema = opts.json; }
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 429 ? "Gemini hết hạn mức miễn phí hôm nay" : `Gemini ${res.status}: ${j.error?.message || ""}`.slice(0, 200));
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const sources = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri).filter(Boolean);
  return { text, sources };
}

// Lấy JSON từ câu trả lời (khi dùng Google Search, Gemini không bật được chế độ JSON → tự bóc)
function parseJson(text) {
  const m = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const s = m[1].slice(m[1].search(/[\[{]/));
  try { return JSON.parse(s); } catch (_) {}
  try { return JSON.parse(s.slice(0, s.lastIndexOf(s.trim().startsWith("[") ? "]" : "}") + 1)); } catch (_) { return null; }
}

// ---------------- 1) Kiểm tra chéo số liệu ----------------
// facts: chuỗi mô tả các khẳng định chính của bài/thư. Trả [{claim, status: ok|mismatch|unknown, correct, source}]
export async function crossCheck(env, facts) {
  if (!geminiOn(env)) return null;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const prompt = `Hôm nay ${today}. Bạn là người kiểm tra thông tin pháp luật thuế – kế toán – lao động Việt Nam.
Dùng Google Search (ưu tiên trang chính thức: chinhphu.vn, vanban.chinhphu.vn, mof.gov.vn, gdt.gov.vn, vbpl.vn, baohiemxahoi.gov.vn, quochoi.vn, thuvienphapluat.vn) để kiểm tra TỪNG khẳng định dưới đây: số hiệu văn bản, ngày ban hành/hiệu lực, con số (thuế suất, mức phạt, ngưỡng, hạn chót), văn bản còn hiệu lực hay đã bị thay thế.
Trả về DUY NHẤT một mảng JSON, mỗi phần tử: {"claim": "...", "status": "ok" | "mismatch" | "unknown", "correct": "thông tin đúng nếu mismatch", "source": "URL"}.
"mismatch" chỉ khi nguồn chính thức cho thấy khác rõ ràng. Không chắc thì "unknown". Tối đa 8 khẳng định quan trọng nhất.

Các khẳng định:
${facts}`;
  const { text, sources } = await gemini(env, prompt, { search: true });
  const arr = parseJson(text);
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 8).map((x) => ({ claim: String(x.claim || ""), status: x.status, correct: x.correct || "", source: x.source || sources[0] || "" }));
}

export const posterFacts = (c) => [
  `Tiêu đề: ${[c.title_line1, c.title_line2].filter(Boolean).join(" ")}`,
  c.highlight ? `Ô nổi bật: ${JSON.stringify(c.highlight)}` : "", c.doc_ref ? `Căn cứ: ${c.doc_ref}` : "",
  ...(c.points || []).map((p) => `Ý chính: ${typeof p === "string" ? p : JSON.stringify(p)}`),
  ...(c.actions || []).map((p) => `Việc cần làm: ${typeof p === "string" ? p : JSON.stringify(p)}`),
].filter(Boolean).join("\n");

export const adviceFacts = (a) => [
  `Kết luận: ${a.conclusion}`, ...(a.analysis || []).map((x) => `${x.heading}: ${x.text}`),
  ...(a.legal_basis || []).map((b) => `Căn cứ: ${b.doc} – ${b.article}`),
].join("\n");

// Lệch → câu đưa vào "cần kiểm tra" để Người kiểm tra (Claude) tra lại và phân xử
export const mismatchesToUncertain = (checks) => (checks || []).filter((x) => x.status === "mismatch")
  .map((x) => `Gemini báo lệch: “${x.claim}” – theo Gemini đúng là: ${x.correct || "?"}${x.source ? ` (${x.source})` : ""}`);

// ---------------- 2) Soát poster bằng hình ảnh ----------------
const QA_SCHEMA = {
  type: "OBJECT",
  properties: {
    ok: { type: "BOOLEAN" },
    issues: { type: "ARRAY", items: { type: "OBJECT", properties: {
      type: { type: "STRING", enum: ["overflow", "typo", "mismatch", "layout"] },
      page: { type: "INTEGER" }, detail: { type: "STRING" }, fix: { type: "STRING" },
    }, required: ["type", "detail"] } },
  },
  required: ["ok", "issues"],
};

export async function posterQA(env, images, content) {
  if (!geminiOn(env) || !images?.length) return null;
  const prompt = `Bạn soát poster A4 (song ngữ Việt – Anh) của công ty kiểm toán THT trước khi đăng mạng xã hội. Có ${images.length} trang theo thứ tự.
Tìm các lỗi THẬT SỰ nhìn thấy được:
- overflow: chữ bị tràn ra ngoài khung, bị cắt, bị che, chồng lên nhau, sát mép đến mức mất chữ;
- typo: sai chính tả tiếng Việt/tiếng Anh, thiếu dấu, lặp từ;
- mismatch: con số/ngày/số hiệu trên poster khác với bài viết dưới đây;
- layout: khoảng trống lớn bất thường, chữ quá nhỏ không đọc được.
Không bắt lỗi theo sở thích thẩm mỹ. Không có lỗi thì ok=true, issues rỗng. "fix" là cách sửa nội dung cụ thể (vd rút gọn câu nào).

Bài viết đi kèm (để so số liệu):
${String(content.facebook_caption || "").slice(0, 2500)}`;
  const { text } = await gemini(env, prompt, { images, json: QA_SCHEMA });
  const r = parseJson(text);
  return r && Array.isArray(r.issues) ? r : null;
}

export function qaText(qa) {
  if (!qa) return "";
  if (qa.ok && !qa.issues.length) return "🖼 Gemini soát poster: không thấy lỗi tràn chữ, chính tả, lệch số.";
  const name = { overflow: "Tràn/che chữ", typo: "Chính tả", mismatch: "Lệch số liệu", layout: "Bố cục" };
  return "🖼 Gemini soát poster:\n" + qa.issues.map((i) => `• ${name[i.type] || i.type}${i.page ? ` (trang ${i.page})` : ""}: ${i.detail}`).join("\n");
}

// ---------------- 3) Thành viên hội đồng thứ 4 ----------------
const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: { score: { type: "INTEGER" }, verdict: { type: "STRING" }, issues: { type: "ARRAY", items: { type: "STRING" } }, fixes: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["score", "verdict", "issues", "fixes"],
};
export async function geminiReview(env, briefJson) {
  if (!geminiOn(env)) return null;
  const prompt = `Bạn là một người đọc độc lập (chủ doanh nghiệp nhỏ ở Việt Nam) xem bản nháp bài đăng của fanpage THT Audit (công ty kiểm toán – tư vấn thuế).
Chấm 1–10 theo: hiểu ngay trong 3 giây, có ích cho việc kinh doanh, đáng tin, muốn lưu/chia sẻ. Nêu tối đa 3 vấn đề và 3 đề xuất sửa cụ thể. Không bịa quy định pháp luật.
Bản nháp: ${briefJson}`;
  const { text } = await gemini(env, prompt, { json: REVIEW_SCHEMA });
  const r = parseJson(text);
  return r && typeof r.score === "number" ? { key: "gemini", score: Math.max(1, Math.min(10, r.score)), verdict: r.verdict, issues: (r.issues || []).slice(0, 3), fixes: (r.fixes || []).slice(0, 3) } : null;
}
