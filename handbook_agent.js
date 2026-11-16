// Cẩm nang Giám đốc (/chuyende): tra cứu → dàn ý (anh duyệt) → viết 8–10 trang → kiểm tra → PDF + 10 ảnh 4:5 → anh duyệt
// → cấp số CĐ-xxx/yyyy/THT, lưu kho chung với Thư tư vấn (đồng bộ My THT, kind = "chuyen_de") → nút đăng Facebook.
// Chỉ chạy khi anh gọi, không thuộc luồng tự động, không tự đăng.
import { claude, modelFor } from "./claude.js";
import { AGENT_DOMAINS } from "./agent.js";
import { handbookHtml, handbookCards, handbookFooter } from "./handbook.js";
import { htmlToPdf, LETTER_FOOTER } from "./advice.js";
import { screenshot } from "./render.js";

const VN = 7 * 3600e3;
const vnNow = () => new Date(Date.now() + VN);
const today = () => vnNow().toISOString().slice(0, 10).split("-").reverse().join("/");
const SEARCH = (env, n) => ({ type: "web_search_20250305", name: "web_search", max_uses: n, allowed_domains: [...AGENT_DOMAINS, "thuvienphapluat.vn", "luatvietnam.vn"] });

// ---------------- 1. Dàn ý ----------------
const OUTLINE_TOOL = {
  name: "handbook_outline",
  description: "Dàn ý Cẩm nang Giám đốc (tài liệu đào tạo 8–10 trang A4)",
  input_schema: { type: "object", properties: {
    title: { type: "string", description: "Tên chuyên đề, ≤ 16 từ" },
    subtitle: { type: "string", description: "1 câu nói tài liệu giúp Giám đốc điều gì, ≤ 30 từ" },
    tag: { type: "string", description: "Nhãn lĩnh vực viết HOA, ≤ 3 từ, vd 'THUẾ TNDN', 'BẢO HIỂM XÃ HỘI', 'LAO ĐỘNG'" },
    chapters: { type: "array", minItems: 4, maxItems: 6, items: { type: "object", properties: {
      heading: { type: "string", description: "≤ 12 từ" }, points: { type: "array", items: { type: "string" }, maxItems: 5, description: "Ý sẽ trình bày, mỗi ý ≤ 20 từ" } }, required: ["heading", "points"] } },
    sources: { type: "array", items: { type: "string" }, maxItems: 10, description: "Văn bản pháp luật chính sẽ dùng (số hiệu, ngày)" },
    uncertain: { type: "array", items: { type: "string" }, maxItems: 4, description: "Điểm chưa chắc, cần anh lưu ý" },
  }, required: ["title", "subtitle", "tag", "chapters", "sources"] },
};

async function agentLoop(env, { system, tools, tool, messages, quality = "strong", max_tokens = 16000 }) {
  for (let turn = 0; turn < 5; turn++) {
    const msg = await claude(env, { model: modelFor(env, quality), max_tokens, system, tools, messages });
    const rep = msg.content.find((b) => b.type === "tool_use" && b.name === tool.name)?.input;
    if (rep) return rep;
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: `Gọi công cụ ${tool.name} ngay với những gì đã tra được.` });
    const fin = await claude(env, { model: modelFor(env, quality), max_tokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name }, messages });
    const r2 = fin.content.find((b) => b.type === "tool_use")?.input;
    if (r2) return r2;
  }
  throw new Error("Không tổng hợp được nội dung");
}

const ROLE = (d) => `Bạn là chuyên gia thuế – kế toán – BHXH – lao động của Công ty TNHH Kiểm toán và Tư vấn THT. Hôm nay ${d}.
Bạn soạn "CẨM NANG GIÁM ĐỐC": tài liệu đào tạo 8–10 trang A4 giúp Giám đốc/chủ doanh nghiệp Việt Nam hiểu một vấn đề quan trọng và biết phải làm gì.
- Chỉ dùng quy định ĐANG CÓ HIỆU LỰC; kiểm tra văn bản đã bị thay thế/sửa đổi chưa (đặc biệt thay đổi 2025–2026). Ghi đúng số hiệu, ngày, điều/khoản.
- Không bịa số hiệu, không bịa con số. Điểm nào không chắc thì đưa vào 'uncertain', không viết như sự thật.
- Ngôn ngữ của người quản lý: câu ngắn, rõ, ít thuật ngữ; giải thích "vì sao quan trọng", "rủi ro gì", "làm gì"; dùng ví dụ bằng số cụ thể.`;

export async function handbookOutline(env, topic, instruction = "", prev = null) {
  const system = `${ROLE(today())}
Bước này: tra cứu nhanh (tối đa ${env.HANDBOOK_SEARCH_MAX || 8} lượt web_search) rồi lập DÀN Ý 4–6 phần cho chuyên đề. Gọi công cụ handbook_outline đúng một lần.`;
  const content = prev
    ? `Chuyên đề: ${topic}\nDàn ý hiện tại:\n${JSON.stringify(prev)}\n\nAnh yêu cầu sửa dàn ý: ${instruction}`
    : `Chuyên đề: ${topic}${instruction ? `\nYêu cầu thêm: ${instruction}` : ""}`;
  return agentLoop(env, { system, tools: [SEARCH(env, Number(env.HANDBOOK_SEARCH_MAX || 8)), OUTLINE_TOOL], tool: OUTLINE_TOOL, messages: [{ role: "user", content }] });
}

export function outlineText(o) {
  return [`📘 DÀN Ý CẨM NANG GIÁM ĐỐC`, `${o.title}`, `${o.subtitle}`, "",
    ...o.chapters.map((c, i) => `${i + 1}. ${c.heading}\n${(c.points || []).map((p) => `   • ${p}`).join("\n")}`), "",
    `Căn cứ chính: ${(o.sources || []).join("; ")}`,
    o.uncertain?.length ? `\n❓ Cần anh lưu ý:\n${o.uncertain.map((x) => `• ${x}`).join("\n")}` : ""].filter((x) => x !== "").join("\n");
}

// ---------------- 2. Viết toàn văn ----------------
const ITEM = { type: "object", properties: { title: { type: "string", description: "≤ 10 từ" }, text: { type: "string", description: "30–90 từ" } }, required: ["title", "text"] };
const DOC_TOOL = {
  name: "handbook",
  description: "Toàn văn Cẩm nang Giám đốc 8–10 trang A4",
  input_schema: { type: "object", properties: {
    title: { type: "string" }, subtitle: { type: "string" }, tag: { type: "string" },
    audience: { type: "string", description: "vd 'Dành cho Giám đốc, chủ doanh nghiệp, kế toán trưởng'" },
    as_of: { type: "string", description: "'Cập nhật theo …' liệt kê văn bản chính" },
    key_points: { type: "array", minItems: 5, maxItems: 7, items: { type: "string" }, description: "Ý cốt lõi, mỗi ý 20–40 từ, có con số/thời hạn nếu có" },
    key_points_short: { type: "array", minItems: 5, maxItems: 7, items: { type: "string" }, description: "Cùng các ý trên rút gọn ≤ 14 từ (cho ảnh Facebook)" },
    chapters: { type: "array", minItems: 4, maxItems: 6, items: { type: "object", properties: {
      heading: { type: "string" }, intro: { type: "string", description: "≤ 80 từ" },
      table: { type: "object", description: "Bảng tóm tắt (nếu hợp): 2–3 cột, ≤ 6 dòng, ô ngắn", properties: { cols: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } }, required: ["cols", "rows"] },
      items: { type: "array", maxItems: 6, items: ITEM },
      example: { type: "object", description: "Ví dụ tính bằng số (nên có ở 2–3 phần)", properties: { title: { type: "string" }, lines: { type: "array", items: { type: "string" }, maxItems: 5 }, result: { type: "string" } }, required: ["lines"] },
      card_bullets: { type: "array", maxItems: 4, items: { type: "string" }, description: "Tóm tắt phần này cho ảnh Facebook, mỗi ý ≤ 16 từ" },
    }, required: ["heading", "items", "card_bullets"] } },
    risks: { type: "array", minItems: 3, maxItems: 5, items: ITEM },
    checklist: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" }, description: "Việc Giám đốc nên giao cho bộ phận kế toán/nhân sự" },
    checklist_short: { type: "array", maxItems: 6, items: { type: "string" }, description: "Rút gọn ≤ 14 từ" },
    faq: { type: "array", minItems: 4, maxItems: 6, items: { type: "object", properties: { q: { type: "string" }, a: { type: "string" } }, required: ["q", "a"] } },
    legal: { type: "array", minItems: 2, maxItems: 10, items: { type: "object", properties: { doc: { type: "string" }, note: { type: "string" } }, required: ["doc"] } },
    uncertain: { type: "array", maxItems: 6, items: { type: "string" }, description: "Điểm chưa chắc (nội bộ, không in)" },
  }, required: ["title", "subtitle", "tag", "audience", "as_of", "key_points", "key_points_short", "chapters", "risks", "checklist", "faq", "legal"] },
};

export async function writeHandbook(env, topic, outline) {
  const system = `${ROLE(today())}
Bước này: viết TOÀN VĂN theo dàn ý đã được duyệt (giữ đúng thứ tự các phần). Có thể tra thêm tối đa ${env.HANDBOOK_SEARCH_MAX2 || 6} lượt web_search để kiểm chứng con số.
Độ dài toàn văn khoảng 2.800–4.000 từ (8–10 trang A4). Mỗi phần: đoạn mở ngắn, 3–6 mục có tiêu đề, bảng tóm tắt khi có so sánh/mức/thời hạn, ví dụ bằng số ở 2–3 phần.
Gọi công cụ handbook đúng một lần.`;
  return agentLoop(env, { system, tools: [SEARCH(env, Number(env.HANDBOOK_SEARCH_MAX2 || 6)), DOC_TOOL], tool: DOC_TOOL,
    messages: [{ role: "user", content: `Chuyên đề: ${topic}\nDàn ý đã duyệt:\n${JSON.stringify(outline)}` }], max_tokens: 24000 });
}

export async function reviseHandbook(env, doc, instruction) {
  const { number, issue, date, series, theme, cards, ...content } = doc;
  const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 24000,
    system: "Bạn biên tập Cẩm nang Giám đốc của THT. Sửa theo yêu cầu, giữ nguyên phần không bị yêu cầu sửa, giữ đúng căn cứ pháp lý (không bịa số hiệu). Gọi công cụ handbook với TOÀN BỘ nội dung sau khi sửa.",
    tools: [DOC_TOOL], tool_choice: { type: "tool", name: "handbook" },
    messages: [{ role: "user", content: `Nội dung hiện tại:\n${JSON.stringify(content)}\n\nYêu cầu sửa: ${instruction}` }] });
  const r = msg.content.find((b) => b.type === "tool_use")?.input;
  if (!r) throw new Error("Không sửa được nội dung");
  return r;
}

export const handbookFacts = (d) => [
  ...(d.key_points || []).map((k) => `Ý chính: ${k}`),
  ...(d.chapters || []).flatMap((c) => [...(c.table ? [`Bảng ${c.heading}: ${c.table.rows.map((r) => r.join(" | ")).join("; ")}`] : []), ...(c.example ? [`Ví dụ: ${c.example.lines.join(" ")}`] : [])]),
  ...(d.legal || []).map((l) => `Căn cứ: ${l.doc}${l.note ? " – " + l.note : ""}`),
].join("\n").slice(0, 6000);

// ---------------- 3. Bộ ảnh tự chọn (tối đa 10) ----------------
export function autoCards(d) {
  const ch = (d.chapters || []).map((c, i) => c.table && c.table.cols.length
    ? { kind: "table", chapter: i, title: c.heading, cols: c.table.cols.length > 3 ? [0, c.table.cols.length - 1] : undefined }
    : { kind: "bullets", eyebrow: `PHẦN ${i + 1}`, title: c.heading, bullets: (c.card_bullets || c.items.map((x) => x.title)).slice(0, 4) });
  const exIdx = (d.chapters || []).findIndex((c) => c.example?.lines?.length);
  const tail = [...(d.risks?.length ? [{ kind: "risks", title: "Rủi ro khi làm sai" }] : []), { kind: "checklist", title: "Việc Giám đốc nên giao ngay", items: d.checklist_short?.length ? d.checklist_short : d.checklist, limit: 6 }, { kind: "end" }];
  const room = 10 - 2 - tail.length - (exIdx >= 0 ? 1 : 0);
  const body = [];
  ch.slice(0, room).forEach((c, i) => { body.push(c); if (i === exIdx) body.push({ kind: "example", chapter: exIdx }); });
  if (exIdx >= room && exIdx >= 0) body.push({ kind: "example", chapter: exIdx });
  return [{ kind: "cover" }, { kind: "keys", title: `${Math.min((d.key_points_short || d.key_points || []).length, 7)} điều Giám đốc cần nhớ` }, ...body, ...tail];
}

// ---------------- 4. Dựng PDF + ảnh ----------------
export function finalizeDoc(env, d, meta) {
  return {
    ...d, series: "CẨM NANG GIÁM ĐỐC", number: meta.number, issue: meta.issue, date: meta.date || today(), theme: meta.theme || env.HANDBOOK_THEME || "noir",
    disclaimer: d.disclaimer || "Tài liệu tổng hợp quy định có hiệu lực tại ngày phát hành, nhằm mục đích tham khảo và đào tạo. Việc áp dụng cho từng doanh nghiệp cần căn cứ hồ sơ cụ thể; vui lòng liên hệ THT để được tư vấn chi tiết.",
    cards: autoCards(d),
  };
}

export async function renderHandbook(env, doc, prefix) {
  const pdf = await htmlToPdf(env, handbookHtml(doc), {
    format: "a4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<div></div>",
    footerTemplate: handbookFooter(doc.theme, LETTER_FOOTER), margin: { top: "16mm", right: "18mm", bottom: "30mm", left: "18mm" },
  });
  await env.FILES.put(`${prefix}/doc.pdf`, pdf, { httpMetadata: { contentType: "application/pdf" } });
  const cards = [];
  for (const [i, html] of handbookCards(doc).entries()) {
    const png = await screenshot(env, html, 1080, 1350, "png");
    await env.FILES.put(`${prefix}/card${String(i + 1).padStart(2, "0")}.png`, png, { httpMetadata: { contentType: "image/png" } });
    cards.push(png);
  }
  return { pdf, cards };
}

export async function nextHandbookNumber(env, kvGet, kvSet) {
  const y = vnNow().getUTCFullYear();
  const n = Number((await kvGet(env, `hb:seq:${y}`)) || 0) + 1;
  await kvSet(env, `hb:seq:${y}`, String(n));
  return { number: `CĐ-${String(n).padStart(3, "0")}/${y}/THT`, issue: String(n).padStart(2, "0") };
}

export const handbookFileName = (d) => `THT_Cam-nang-Giam-doc_${String(d.number || "nhap").replace(/\//g, "-")}.pdf`;

export function handbookCaption(d) {
  const tags = ["#THTAudit", "#CamNangGiamDoc", `#${String(d.tag || "").replace(/\s+/g, "")}`].filter((t) => t.length > 1).join(" ");
  return `📘 CẨM NANG GIÁM ĐỐC · SỐ ${d.issue}\n${d.title}\n\n${d.subtitle}\n\n✅ Giám đốc cần nhớ:\n${(d.key_points_short || d.key_points || []).map((k) => `• ${k}`).join("\n")}\n\n📩 Cần bản PDF đầy đủ hoặc tư vấn cho doanh nghiệp của bạn? Nhắn tin cho THT hoặc gửi câu hỏi tại form.thtaudit.com.vn\n\n${tags}`;
}
