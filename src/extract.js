// Server-side reading of Telegram files (no DOM in Workers): .docx → text, .xlsx/.csv → rows, PDF/images → base64.
const td = new TextDecoder();

async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("File không đúng định dạng Office (.docx/.xlsx)");
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    entries[td.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, local };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(entries),
    async text(name) {
      const e = entries[name]; if (!e) return null;
      const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return td.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(stream).text();
    },
  };
}

const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const runs = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unxml(m[1])).join("");

export async function docxText(buf) {
  const z = await unzip(buf);
  const xml = await z.text("word/document.xml");
  const body = xml.slice(xml.indexOf("<w:body"));
  const out = [];
  // walk top-level paragraphs and tables in order
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  for (const m of body.matchAll(re)) {
    const block = m[0];
    if (block.startsWith("<w:tbl>")) {
      for (const tr of block.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g))
        out.push([...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((tc) => runs(tc[0]).trim()).join(" | "));
    } else {
      const t = runs(block).trim();
      if (t) out.push(t);
    }
  }
  return out.join("\n");
}

const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export async function xlsxRows(buf, maxRows = 60000) {
  const z = await unzip(buf);
  const shared = [];
  const ss = await z.text("xl/sharedStrings.xml");
  if (ss) for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push([...si[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => unxml(m[1])).join(""));
  const sheetName = z.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!sheetName) throw new Error("Không thấy trang tính trong file Excel");
  const xml = await z.text(sheetName);
  const rows = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] || "";
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || "A1";
      const t = (attrs.match(/t="(\w+)"/) || [])[1];
      const v = (inner.match(/<v>([^<]*)<\/v>/) || [])[1] ?? "";
      let val = unxml(v);
      if (t === "s") val = shared[+v] ?? "";
      else if (t === "inlineStr") val = [...inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => unxml(m[1])).join("");
      row[colIndex(ref)] = String(val).trim();
    }
    rows.push(Array.from(row, (x) => x ?? ""));
    if (rows.length >= maxRows) break;
  }
  return rows;
}

export function csvRows(text) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === "," || ch === ";") { out.push(cur.trim()); cur = ""; } else cur += ch; }
    out.push(cur.trim()); return out;
  });
}

const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

export function toLookupTable(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const mst = rows[i].findIndex((h) => { const n = norm(h); return n === "msdn" || n === "mst" || n.includes("ma so"); });
    if (mst >= 0) {
      const header = rows[i];
      let keep = header.map((_, j) => j).filter((j) => header[j] && !/dia.?chi|von/.test(norm(header[j]))).slice(0, 5);
      if (!keep.includes(mst)) keep = [mst, ...keep];
      const data = rows.slice(i + 1).filter((r) => r[mst]).map((r) => keep.map((j) => r[j] ?? ""));
      return { cols: keep.map((j) => header[j]), mst: keep.indexOf(mst), rows: data };
    }
  }
  return null;
}

export function b64(buf) {
  const u8 = new Uint8Array(buf); let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

// Returns {part, table?, summary}
export async function readBuffer(name, mime, buf) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if ((mime || "").startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext))
    return { part: { kind: "image", name, mediaType: mime && mime.startsWith("image/") ? mime : "image/jpeg", data: b64(buf) }, summary: "ảnh" };
  if (ext === "pdf" || mime === "application/pdf") return { part: { kind: "pdf", name, data: b64(buf) }, summary: "PDF" };
  if (ext === "docx") return { part: { kind: "text", name, data: await docxText(buf) }, summary: "Word" };
  if (ext === "xlsx" || ext === "csv") {
    const rows = ext === "csv" ? csvRows(td.decode(buf)) : await xlsxRows(buf);
    const sample = rows.slice(0, 25).map((r) => r.join(" | ")).join("\n");
    return { part: { kind: "text", name, data: `Bảng ${rows.length} dòng. 25 dòng đầu:\n${sample}` }, table: toLookupTable(rows), summary: `Excel ${rows.length} dòng` };
  }
  if (ext === "txt" || ext === "md") return { part: { kind: "text", name, data: td.decode(buf) }, summary: "văn bản" };
  if (ext === "doc") throw new Error("File .doc đời cũ: mở bằng Word, lưu lại dạng .docx rồi gửi lại.");
  throw new Error(`Chưa hỗ trợ file .${ext}. Gửi Word, Excel, PDF hoặc ảnh.`);
}
