// Thư tư vấn cho mỗi bản tin: chỉ text, hoặc Word VI · VI–EN · VI–ZH phồn thể · VI–ZH giản thể (chọn bằng nút).
// Claude soạn bài 1 lần, trả về từng đoạn đủ 4 ngôn ngữ (để bảng song ngữ khớp từng dòng), rồi dựng .docx.
import { claude, modelFor, sourceBlocks } from "./claude.js";
import { readBuffer } from "./extract.js";
import { download, send, tgForm } from "./telegram.js";
import { brandOf } from "./render.js";
import { buildDocx, VARIANTS } from "./docx.js";

const L4 = {
  type: "object",
  properties: {
    vi: { type: "string", description: "Tiếng Việt" },
    en: { type: "string", description: "English" },
    zh_hans: { type: "string", description: "简体中文" },
    zh_hant: { type: "string", description: "繁體中文（台灣用語）" },
  },
  required: ["vi", "en", "zh_hans", "zh_hant"],
};

const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    title: { ...L4, description: "Tiêu đề bản tin, ≤ 90 ký tự tiếng Việt" },
    summary: { ...L4, description: "Đoạn tóm tắt 2–4 câu: văn bản nào, ai bị ảnh hưởng, việc cần làm, thời hạn" },
    sections: {
      type: "array", minItems: 3, maxItems: 7,
      description: "Các mục nội dung theo thứ tự: bối cảnh/văn bản; nội dung chính; đối tượng áp dụng; doanh nghiệp cần làm gì; thời hạn – chế tài (nếu có); mục cuối luôn là 'Căn cứ pháp lý'",
      items: {
        type: "object",
        properties: {
          heading: L4,
          paragraphs: { type: "array", minItems: 1, maxItems: 8, items: { ...L4, description: "1 đoạn hoặc 1 gạch đầu dòng (bắt đầu bằng '• ')" } },
        },
        required: ["heading", "paragraphs"],
      },
    },
    closing: { ...L4, description: "Khuyến nghị của THT + lời mời liên hệ, 2–3 câu" },
    message_vi: { type: "string", description: "Tin nhắn Telegram tiếng Việt ngắn gọn (≤ 400 ký tự, không hashtag, không emoji dồn dập): bản tin về gì, điểm chính, hạn nếu có. Dùng để gửi kèm thư tư vấn." },
  },
  required: ["title", "summary", "sections", "closing", "message_vi"],
};

const SYSTEM = `Bạn là biên tập viên kiêm biên dịch viên pháp lý của Công ty TNHH Kiểm toán và Tư vấn THT (thtaudit.com.vn).
Nhiệm vụ: từ văn bản nguồn và nội dung poster đã duyệt, viết THƯ TƯ VẤN (bản tin Thuế – Luật) dạng văn bản Word gửi khách hàng doanh nghiệp, đồng thời dịch từng đoạn sang tiếng Anh, tiếng Trung giản thể và tiếng Trung phồn thể. Gọi công cụ \`bulletin_article\` đúng một lần.

Nguyên tắc:
- Nội dung bám sát poster đã duyệt (số liệu, số hiệu, ngày tháng, mức phạt phải khớp), có thể diễn giải đầy đủ hơn poster. Không bịa thông tin; chỗ chưa chắc ghi "[cần bổ sung]".
- Văn phong trang trọng, xưng "Quý khách", "THT".
- Mỗi đoạn là một đơn vị dịch: 4 ngôn ngữ cùng một ý, cùng thứ tự, để đặt cạnh nhau trong bảng song ngữ.
- Tiếng Anh: thuật ngữ thuế/kế toán chuẩn (CIT, PIT, VAT, e-invoice, tax authority...).
- Trung giản thể: dùng thuật ngữ đại lục (企业所得税, 增值税, 电子发票, 税务机关...).
- Trung phồn thể: chữ phồn thể và cách dùng từ Đài Loan (營利事業所得稅/企業所得稅, 營業稅/加值稅 khi phù hợp, 電子發票, 稅務機關...), không chỉ chuyển mã chữ.
- Tên văn bản pháp luật Việt Nam: lần đầu xuất hiện trong bản dịch ghi tên dịch kèm số hiệu gốc, ví dụ "Decree No. 70/2025/ND-CP", "第70/2025/ND-CP号议定". Giữ nguyên số hiệu, ngày dạng dd/mm/yyyy, số tiền kèm "VND"/"越南盾".
- Không đưa số điện thoại/email vào các đoạn (mẫu Word tự chèn).`;

async function writeArticle(env, job) {
  const parts = [];
  for (const f of job.files || []) {
    try { parts.push((await readBuffer(f.name, f.mime, await download(env, f.file_id))).part); } catch (e) { console.error("word: source", e.message); }
  }
  const extra = "Nội dung poster đã duyệt (JSON):\n" + JSON.stringify({ ...job.content, facebook_caption: undefined, tiktok_caption: undefined, youtube_description: undefined, youtube_tags: undefined, hashtags: undefined }) +
    (job.note ? `\n\nGhi chú của người gửi: ${job.note}` : "") +
    "\n\nViết bản tin Word 4 ngôn ngữ theo hướng dẫn.";
  const msg = await claude(env, {
    model: modelFor(env, job.quality), max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [{ name: "bulletin_article", description: "Bản tin Word 4 ngôn ngữ", input_schema: ARTICLE_SCHEMA, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: "bulletin_article" },
    messages: [{ role: "user", content: sourceBlocks(parts, extra) }],
  });
  const b = msg.content.find((x) => x.type === "tool_use");
  if (!b) throw new Error("Claude không trả về bản tin Word");
  if (msg.stop_reason === "max_tokens") throw new Error("Bản tin quá dài, Claude bị cắt giữa chừng. Bấm 📄 Word 4 bản để thử lại.");
  return b.input;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Các lựa chọn "Thư tư vấn" (nút trên Telegram)
export const LETTER_KINDS = {
  text: "📝 Chỉ text",
  VI: "Word VI",
  "VI-EN": "Word VI–EN",
  "VI-ZHT": "Word VI–ZH phồn thể",
  "VI-ZHS": "Word VI–ZH giản thể",
  all: "📦 Tất cả",
};

async function hashOf(obj) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(JSON.stringify(obj)));
  return [...new Uint8Array(d)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Soạn bài 1 lần cho mỗi phiên bản nội dung poster, lưu R2 để các lần bấm sau dùng lại (không tốn thêm phí Claude).
async function getArticle(env, job) {
  const key = `jobs/${job.id}/article-${await hashOf(job.content)}.json`;
  const cached = await env.FILES.get(key);
  if (cached) return JSON.parse(await cached.text());
  const article = await writeArticle(env, job);
  await env.FILES.put(key, JSON.stringify(article), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return article;
}

function articleText(a) {
  const out = [a.title.vi.toUpperCase(), "", a.summary.vi];
  for (const s of a.sections) out.push("", s.heading.vi.toUpperCase(), ...s.paragraphs.map((p) => p.vi));
  out.push("", a.closing.vi);
  return out.join("\n");
}

async function sendLong(env, chat, text) {
  for (let i = 0; i < text.length; i += 3900) await send(env, chat, text.slice(i, i + 3900));
}

export async function sendLetter(env, job, kind = "all") {
  if (!job.content) throw new Error("Chưa có nội dung poster");
  const article = await getArticle(env, job);
  await send(env, job.chat_id, article.message_vi || job.content.issuer_sentence || "Thư tư vấn THT");
  if (kind === "text" || kind === "all") await sendLong(env, job.chat_id, articleText(article));
  if (kind === "text") return;

  const d = new Date(Date.now() + 7 * 3600e3);
  const meta = {
    brand: brandOf(env),
    docRef: job.content.doc_ref || "",
    date: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`,
  };
  const slug = (job.content.slug || job.content.topic_short || job.id).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || job.id;
  const variants = VARIANTS.filter((v) => kind === "all" || v.key === kind);
  if (!variants.length) throw new Error(`Không có loại thư ${kind}`);

  const docs = [];
  for (const v of variants) {
    const bytes = buildDocx(article, v.langs, meta);
    const name = `ThuTuVan-THT_${slug}_${v.key}.docx`;
    await env.FILES.put(`jobs/${job.id}/${name}`, bytes, { httpMetadata: { contentType: DOCX_MIME } });
    docs.push({ name, bytes, label: v.label });
  }
  const form = new FormData();
  form.append("chat_id", String(job.chat_id));
  if (docs.length === 1) {
    form.append("document", new Blob([docs[0].bytes], { type: DOCX_MIME }), docs[0].name);
    form.append("caption", "📄 " + docs[0].label);
    const r = await tgForm(env, "sendDocument", form);
    if (!r.ok) throw new Error(`Telegram không nhận file Word: ${r.description}`);
    return;
  }
  const media = docs.map((x, i) => { form.append(`d${i}`, new Blob([x.bytes], { type: DOCX_MIME }), x.name); return { type: "document", media: `attach://d${i}` }; });
  media[media.length - 1].caption = "📄 " + docs.map((x) => x.label).join(" · ");
  form.append("media", JSON.stringify(media));
  const r = await tgForm(env, "sendMediaGroup", form);
  if (!r.ok) throw new Error(`Telegram không nhận file Word: ${r.description}`);
}
