// Minimal .docx builder (no dependencies): WordprocessingML + a stored (uncompressed) ZIP.
// Thư tư vấn dựng trên letterhead v4.1: bản tiếng Việt, hoặc bảng song ngữ 2 cột (Việt | ngoại ngữ).

import { LH_PARTS, LH_DOC_HEAD, LH_SECT } from "./letterhead.js";

const enc = new TextEncoder();
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------- ZIP (store) ----------------
let CRC;
function crc32(b) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

// ---------------- Thư tư vấn theo letterhead v4.1 ----------------

const RED = "E1262B", INK = "222A35", GREY = "595959", SOFT = "F2F4F7";
const EAST = { vi: "Arial", en: "Arial", zh_hans: "Microsoft YaHei", zh_hant: "Microsoft JhengHei" };
const LANGTAG = { vi: "vi-VN", en: "en-US", zh_hans: "zh-CN", zh_hant: "zh-TW" };

function run(text, o = {}) {
  const l = o.lang || "vi";
  const pr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="${EAST[l]}"/>` +
    (o.b ? "<w:b/><w:bCs/>" : "") + (o.i ? "<w:i/><w:iCs/>" : "") +
    `<w:color w:val="${o.color || "000000"}"/><w:sz w:val="${o.sz || 21}"/><w:szCs w:val="${o.sz || 21}"/>` +
    `<w:lang w:val="${LANGTAG[l]}" w:eastAsia="${LANGTAG[l].startsWith("zh") ? LANGTAG[l] : "zh-CN"}"/></w:rPr>`;
  if (o.tab) return `<w:r>${pr}<w:tab/></w:r>`;
  const body = String(text ?? "").split("\n").map((t, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${esc(t)}</w:t>`).join("");
  return `<w:r>${pr}${body}</w:r>`;
}

function para(runs, o = {}) {
  const pr = (o.keep ? "<w:keepNext/>" : "") +
    (o.tabs ? `<w:tabs>${o.tabs}</w:tabs>` : "") +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 100}" w:line="288" w:lineRule="auto"/>` +
    `<w:ind w:left="${o.left || 0}" w:right="${o.right || 0}" w:hanging="${o.hanging || 0}" w:firstLine="0"/>` +
    `<w:jc w:val="${o.align || "both"}"/>`;
  return `<w:p><w:pPr>${pr}</w:pPr>${Array.isArray(runs) ? runs.join("") : runs}</w:p>`;
}

// Đoạn thường hoặc gạch đầu dòng (chấm đỏ như mẫu)
function textPara(text, lang, o = {}) {
  const t = String(text ?? "").trim();
  const align = o.align || (lang.startsWith("zh") ? "left" : "both");
  if (/^[•\-–]\s*/.test(t)) {
    return para([run("•", { b: true, color: RED, lang }), run("", { tab: true, lang }), run(t.replace(/^[•\-–]\s*/, ""), { lang, ...o.run })],
      { tabs: '<w:tab w:val="left" w:pos="360"/>', left: 360, hanging: 360, after: 70, align });
  }
  return para(run(t, { lang, ...o.run }), { align, after: 100, ...o.p });
}
const heading = (t, lang) => para(run(t, { b: true, color: INK, lang }), { keep: true, before: 140, after: 60, align: "left" });

const cell = (inner, w, shade) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ""}</w:tcPr>${inner}</w:tc>`;
function table(rows, widths) {
  const b = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D0D5DD"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(b).join("")}</w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="10" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

// ---------------- nhãn cố định 4 ngôn ngữ ----------------
const L = {
  vi: { title: "THƯ TƯ VẤN", re: "V/v", to: "Kính gửi: Quý Khách hàng",
    greet: "Công ty TNHH Kiểm toán và Tư vấn THT trân trọng gửi lời chào và cảm ơn sự tin tưởng của Quý Khách hàng trong thời gian qua.",
    wish: "Kính chúc Quý Khách hàng sức khỏe và kinh doanh thịnh vượng.", regards: "Trân trọng!",
    disclaimer: "Thư tư vấn mang tính tham khảo chung, không thay thế ý kiến tư vấn cho từng trường hợp cụ thể.", col: "Tiếng Việt" },
  en: { title: "ADVISORY LETTER", re: "Re", to: "To: Our Valued Clients",
    greet: "THT Auditing and Consulting Company Limited sends you our warm regards and thanks you for your continued trust.",
    wish: "We wish you good health and continued business success.", regards: "Sincerely,",
    disclaimer: "This advisory letter is for general reference only and does not replace advice for any specific case.", col: "English" },
  zh_hans: { title: "咨询函", re: "事由", to: "致：尊敬的客户",
    greet: "THT审计与咨询有限责任公司谨向贵公司致以诚挚的问候，感谢贵公司一直以来的信任与支持。",
    wish: "顺祝商祺，业务兴隆！", regards: "此致敬礼！",
    disclaimer: "本咨询函仅供一般参考，不能替代针对具体情况的专业意见。", col: "中文（简体）" },
  zh_hant: { title: "諮詢函", re: "事由", to: "致：尊敬的客戶",
    greet: "THT審計與諮詢有限責任公司謹向貴公司致以誠摯的問候，感謝貴公司一直以來的信任與支持。",
    wish: "順頌商祺，業務興隆！", regards: "此致敬禮！",
    disclaimer: "本諮詢函僅供一般參考，不能取代針對具體情況的專業意見。", col: "中文（繁體）" },
};

export const VARIANTS = [
  { key: "VI", langs: ["vi"], label: "Tiếng Việt" },
  { key: "VI-EN", langs: ["vi", "en"], label: "Song ngữ Việt – Anh" },
  { key: "VI-ZHT", langs: ["vi", "zh_hant"], label: "Song ngữ Việt – Trung phồn thể" },
  { key: "VI-ZHS", langs: ["vi", "zh_hans"], label: "Song ngữ Việt – Trung giản thể" },
];

const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// article: {title, summary, sections:[{heading, paragraphs:[]}], closing} – mỗi chuỗi là {vi,en,zh_hans,zh_hant}
// meta: {place, date:{d,m,y}, docRef}
export function buildDocx(article, langs, meta) {
  const bi = langs.length > 1;
  const [A, B] = langs; // A = "vi" (cột trái), B = ngoại ngữ (cột phải)
  const W = 9637, half = Math.floor(W / 2);
  const { d, m, y } = meta.date;
  const body = [];

  // Số / nơi, ngày
  body.push(para([run(`Số: ……/${y}/THT-TV`, { sz: 20 }), run("", { tab: true }), run(`${meta.place || "TP. Hồ Chí Minh"}, ngày ${d} tháng ${m} năm ${y}`, { i: true, sz: 20 })],
    { tabs: '<w:tab w:val="right" w:pos="9637"/>', after: 280, align: "left" }));

  // Tiêu đề + V/v
  body.push(para(run(bi ? `${L[A].title} | ${L[B].title}` : L.vi.title, { b: true, color: INK, sz: 30, lang: B || "vi" }), { after: 60, align: "center" }));
  for (const l of langs) body.push(para(run(`${L[l].re}: ${article.title[l]}`, { b: true, sz: 22, lang: l }), { left: 600, right: 600, after: l === langs[langs.length - 1] ? 280 : 40, align: "center" }));

  if (!bi) {
    body.push(para(run(L.vi.to, { b: true }), { after: 180, align: "left" }));
    body.push(textPara(L.vi.greet, "vi"));
    body.push(textPara(article.summary.vi, "vi"));
    for (const s of article.sections) {
      body.push(heading(s.heading.vi, "vi"));
      for (const p of s.paragraphs) body.push(textPara(p.vi, "vi"));
    }
    body.push(textPara(article.closing.vi, "vi", { p: { before: 140 } }));
    body.push(textPara(L.vi.wish, "vi"));
  } else {
    const row = (f, o = {}) => `<w:tr>${o.keep ? "<w:trPr><w:cantSplit/></w:trPr>" : ""}${cell(f(A), half, o.shade)}${cell(f(B), W - half, o.shade)}</w:tr>`;
    const rows = [];
    rows.push(`<w:tr><w:trPr><w:tblHeader/></w:trPr>${[A, B].map((l, i) => cell(para(run(L[l].col, { b: true, color: "FFFFFF", sz: 19, lang: l }), { after: 0, align: "center" }), i ? W - half : half, INK)).join("")}</w:tr>`);
    rows.push(row((l) => para(run(L[l].to, { b: true, lang: l }), { after: 60, align: "left" })));
    rows.push(row((l) => textPara(L[l].greet, l, { align: "left" })));
    rows.push(row((l) => textPara(article.summary[l], l, { align: "left" })));
    for (const s of article.sections) {
      rows.push(row((l) => para(run(s.heading[l], { b: true, color: INK, lang: l }), { after: 40, align: "left" }), { shade: SOFT, keep: true }));
      for (const p of s.paragraphs) rows.push(row((l) => textPara(p[l], l, { align: "left" })));
    }
    rows.push(row((l) => textPara(article.closing[l], l, { align: "left" })));
    rows.push(row((l) => textPara(L[l].wish, l, { align: "left" })));
    body.push(table(rows, [half, W - half]));
  }

  // Trân trọng + chữ ký (pháp nhân Việt Nam, giữ tiếng Việt)
  body.push(para(run(bi ? `${L[A].regards}  /  ${L[B].regards}` : L.vi.regards, { b: true, lang: B || "vi" }), { keep: true, before: bi ? 200 : 100, after: 200, align: "left" }));
  body.push(para(run("TM. CÔNG TY TNHH KIỂM TOÁN VÀ TƯ VẤN THT", { b: true, sz: 20 }), { keep: true, left: 4300, after: 0, align: "center" }));
  body.push(para(run("GIÁM ĐỐC", { b: true, sz: 20 }), { keep: true, left: 4300, after: 1300, align: "center" }));
  body.push(para(run("…………………………", { sz: 20 }), { keep: true, left: 4300, after: 0, align: "center" }));
  body.push(para(run(bi ? `${L[A].disclaimer}\n${L[B].disclaimer}` : L.vi.disclaimer, { i: true, color: GREY, sz: 16, lang: B || "vi" }), { before: 400, after: 0, align: "left" }));

  const document = `${LH_DOC_HEAD}${body.join("")}${LH_SECT}</w:body></w:document>`;
  const files = [];
  for (const [name, v] of Object.entries(LH_PARTS)) files.push({ name, data: v.t !== undefined ? v.t : b64bytes(v.b) });
  files.splice(1, 0, { name: "word/document.xml", data: document });
  return zip(files);
}
