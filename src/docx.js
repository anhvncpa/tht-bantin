// Minimal .docx builder (no dependencies): WordprocessingML + a stored (uncompressed) ZIP.
// Builds the bulletin as 1 Vietnamese document or a 2-column bilingual table (foreign | Vietnamese).

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

// ---------------- WordprocessingML helpers ----------------
const LANG = {
  vi: { lang: "vi-VN", east: "zh-CN", font: "SimSun" },
  en: { lang: "en-US", east: "zh-CN", font: "SimSun" },
  zh_hans: { lang: "zh-CN", east: "zh-CN", font: "SimSun" },
  zh_hant: { lang: "zh-TW", east: "zh-TW", font: "PMingLiU" },
};

const NAVY = "1F3864", GREY = "595959";

function run(text, o = {}) {
  const pr = [
    o.b ? "<w:b/><w:bCs/>" : "",
    o.i ? "<w:i/><w:iCs/>" : "",
    o.color ? `<w:color w:val="${o.color}"/>` : "",
    o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : "",
    o.lang ? `<w:lang w:val="${LANG[o.lang].lang}" w:eastAsia="${LANG[o.lang].east}"/>` : "",
  ].join("");
  const parts = String(text ?? "").split("\n");
  const body = parts.map((t, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${esc(t)}</w:t>`).join("");
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}${body}</w:r>`;
}

function para(runs, o = {}) {
  const pr = [
    o.keep ? "<w:keepNext/>" : "",
    o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${NAVY}"/></w:pBdr>` : "",
    o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "",
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}"/>`,
    o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.hanging || 0}"/>` : "",
    `<w:jc w:val="${o.align || "both"}"/>`,
  ].join("");
  return `<w:p><w:pPr>${pr}</w:pPr>${Array.isArray(runs) ? runs.join("") : runs}</w:p>`;
}

// Paragraph text: lines starting with "•" / "-" become hanging-indent bullets.
function textPara(text, lang, o = {}) {
  const t = String(text ?? "").trim();
  const bullet = /^[•\-–]\s*/.test(t);
  const align = lang.startsWith("zh") ? "left" : "both";
  return para(run(bullet ? "•\t" + t.replace(/^[•\-–]\s*/, "") : t, { lang, ...o.run }), bullet ? { indent: 360, hanging: 360, align, ...o } : { align, ...o });
}

const cell = (inner, w, shade) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ""}</w:tcPr>${inner}</w:tc>`;

function table(rows, widths) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const b = (s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(b).join("")}</w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

// ---------------- labels ----------------
const LABELS = {
  vi: { bulletin: "BẢN TIN THUẾ – LUẬT", ref: "Văn bản", date: "Ngày phát hành", contact: "Liên hệ tư vấn", disclaimer: "Bản tin mang tính thông tin, không thay thế ý kiến tư vấn cho từng trường hợp cụ thể." },
  en: { bulletin: "TAX & LEGAL BULLETIN", ref: "Reference", date: "Issued", contact: "Contact us", disclaimer: "This bulletin is for general information only and does not constitute advice for any specific case." },
  zh_hans: { bulletin: "税务法律快讯", ref: "文件", date: "发布日期", contact: "咨询联系", disclaimer: "本快讯仅供参考，不构成针对具体个案的咨询意见。" },
  zh_hant: { bulletin: "稅務法律快訊", ref: "文件", date: "發布日期", contact: "諮詢聯繫", disclaimer: "本快訊僅供參考，不構成針對具體個案的諮詢意見。" },
};

export const VARIANTS = [
  { key: "VI", langs: ["vi"], label: "Tiếng Việt" },
  { key: "EN-VI", langs: ["en", "vi"], label: "Song ngữ Anh – Việt" },
  { key: "ZHS-VI", langs: ["zh_hans", "vi"], label: "Song ngữ Trung (giản thể) – Việt" },
  { key: "ZHT-VI", langs: ["zh_hant", "vi"], label: "Song ngữ Trung (phồn thể) – Việt" },
];

// article: {title, summary, sections:[{heading, paragraphs:[]}], closing} – every text is {vi,en,zh_hans,zh_hant}
// meta: {brand:{phone,emails,website,address}, docRef, date}
export function buildDocx(article, langs, meta) {
  const [L1, L2] = langs; // L2 = "vi" for bilingual
  const bi = Boolean(L2);
  const W = 9638, half = W / 2;
  const brand = meta.brand;
  const body = [];

  // Company header
  body.push(para(run("CÔNG TY TNHH KIỂM TOÁN VÀ TƯ VẤN THT", { b: true, color: NAVY, sz: 26, lang: "vi" }), { align: "center", after: 0 }));
  body.push(para(run("THT Auditing & Consulting Co., Ltd.", { i: true, color: GREY, sz: 20, lang: "en" }), { align: "center", after: 0 }));
  if (brand.address) body.push(para(run(brand.address, { color: GREY, sz: 18, lang: "vi" }), { align: "center", after: 0 }));
  body.push(para(run(`ĐT: ${brand.phone}  ·  Email: ${brand.emails.join(" · ")}  ·  ${brand.website}`, { color: GREY, sz: 18, lang: "vi" }), { align: "center", after: 200, border: true }));

  // Bulletin label + title
  const label = bi ? `${LABELS[L1].bulletin}  |  ${LABELS.vi.bulletin}` : LABELS.vi.bulletin;
  body.push(para(run(label, { b: true, color: GREY, sz: 20 }), { align: "center", before: 120, after: 60 }));
  for (const l of langs) body.push(para(run(article.title[l], { b: true, color: NAVY, sz: 30, lang: l }), { align: "center", after: 60 }));
  const refLine = (l) => `${LABELS[l].ref}: ${meta.docRef || "—"}   ·   ${LABELS[l].date}: ${meta.date}`;
  body.push(para(run(bi ? `${refLine(L1)}\n${refLine("vi")}` : refLine("vi"), { i: true, color: GREY, sz: 20 }), { align: "center", after: 240 }));

  if (!bi) {
    body.push(textPara(article.summary.vi, "vi", { run: { i: true } }));
    for (const s of article.sections) {
      body.push(para(run(s.heading.vi, { b: true, color: NAVY, sz: 24, lang: "vi" }), { before: 200, after: 80, keep: true }));
      for (const p of s.paragraphs) body.push(textPara(p.vi, "vi"));
    }
    body.push(para(run(article.closing.vi, { lang: "vi" }), { before: 200, shade: "EEF2F8" }));
  } else {
    const row = (l, r, o = {}) => `<w:tr>${o.keep ? "<w:trPr><w:cantSplit/></w:trPr>" : ""}${cell(l, half, o.shade)}${cell(r, half, o.shade)}</w:tr>`;
    const rows = [];
    const hd = (l) => para(run(l === "vi" ? "Tiếng Việt" : { en: "English", zh_hans: "中文（简体）", zh_hant: "中文（繁體）" }[l], { b: true, color: "FFFFFF", sz: 20, lang: l }), { align: "center", after: 0 });
    rows.push(`<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(hd(L1), half, NAVY)}${cell(hd("vi"), half, NAVY)}</w:tr>`);
    rows.push(row(textPara(article.summary[L1], L1, { run: { i: true } }), textPara(article.summary.vi, "vi", { run: { i: true } })));
    for (const s of article.sections) {
      const h = (l) => para(run(s.heading[l], { b: true, color: NAVY, lang: l }), { after: 40 });
      rows.push(row(h(L1), h("vi"), { shade: "EEF2F8", keep: true }));
      for (const p of s.paragraphs) rows.push(row(textPara(p[L1], L1), textPara(p.vi, "vi")));
    }
    rows.push(row(textPara(article.closing[L1], L1), textPara(article.closing.vi, "vi"), { shade: "EEF2F8" }));
    body.push(table(rows, [half, half]));
  }

  // Contact + disclaimer
  const contact = (l) => `${LABELS[l].contact}: ${brand.phone} · ${brand.emails.join(" · ")} · ${brand.website}`;
  body.push(para(run(bi ? `${contact(L1)}\n${contact("vi")}` : contact("vi"), { b: true, color: NAVY, sz: 20 }), { before: 240, after: 60, align: "left" }));
  body.push(para(run(bi ? `${LABELS[L1].disclaimer}\n${LABELS.vi.disclaimer}` : LABELS.vi.disclaimer, { i: true, color: GREY, sz: 18 }), { after: 0, align: "left" }));

  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const xmlHead = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const document = `${xmlHead}<w:document ${NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;

  const main = LANG[bi ? L1 : "vi"];
  const styles = `${xmlHead}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="${main.font}"/>` +
    `<w:sz w:val="${bi ? 22 : 24}"/><w:szCs w:val="${bi ? 22 : 24}"/><w:lang w:val="vi-VN" w:eastAsia="${main.east}"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const footer = `${xmlHead}<w:ftr ${NS}>` +
    para([run(`THT · ${brand.website} · ${brand.phone}    —    `, { color: GREY, sz: 16 }),
      `<w:r><w:rPr><w:color w:val="${GREY}"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>`,
      `<w:r><w:rPr><w:color w:val="${GREY}"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>`,
      `<w:r><w:rPr><w:color w:val="${GREY}"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`], { align: "center", after: 0 }) +
    `</w:ftr>`;

  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return zip([
    { name: "[Content_Types].xml", data: `${xmlHead}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
    { name: "_rels/.rels", data: `${xmlHead}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/_rels/document.xml.rels", data: `${xmlHead}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdS" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdF" Type="${R}/footer" Target="footer1.xml"/></Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: styles },
    { name: "word/footer1.xml", data: footer },
  ]);
}
