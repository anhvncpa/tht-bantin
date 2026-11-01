// Read user files in the browser: Word (.docx) → text, Excel (.xlsx/.csv) → rows, PDF/images → base64.
(function () {
  // ---- tiny ZIP reader (stored + deflate) using the browser's DecompressionStream ----
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
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      entries[name] = { method, csize, local };
      p += 46 + nlen + elen + clen;
    }
    return {
      names: Object.keys(entries),
      async text(name) {
        const e = entries[name]; if (!e) return null;
        const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
        const data = u8.subarray(start, start + e.csize);
        if (e.method === 0) return new TextDecoder().decode(data);
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
      },
    };
  }

  const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  async function docxText(buf) {
    const z = await unzip(buf);
    const doc = xml(await z.text("word/document.xml"));
    const body = doc.getElementsByTagNameNS(W, "body")[0];
    const out = [];
    const paraText = (p) => [...p.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("");
    for (const node of body.children) {
      if (node.localName === "p") { const t = paraText(node).trim(); if (t) out.push(t); }
      else if (node.localName === "tbl") {
        for (const tr of node.getElementsByTagNameNS(W, "tr")) {
          const cells = [...tr.getElementsByTagNameNS(W, "tc")].map((tc) => [...tc.getElementsByTagNameNS(W, "p")].map(paraText).join(" ").trim());
          out.push(cells.join(" | "));
        }
      }
    }
    return out.join("\n");
  }

  const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function xlsxRows(buf) {
    const z = await unzip(buf);
    const shared = [];
    const ss = await z.text("xl/sharedStrings.xml");
    if (ss) for (const si of xml(ss).getElementsByTagName("si")) shared.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
    const sheetName = z.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
    if (!sheetName) throw new Error("Không thấy trang tính trong file Excel");
    const sheet = xml(await z.text(sheetName));
    const rows = [];
    for (const r of sheet.getElementsByTagName("row")) {
      const row = [];
      for (const c of r.getElementsByTagName("c")) {
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        let val = v;
        if (t === "s") val = shared[+v] ?? "";
        else if (t === "inlineStr") val = [...c.getElementsByTagName("t")].map((x) => x.textContent).join("");
        row[colIndex(c.getAttribute("r") || "A1")] = String(val).trim();
      }
      rows.push(Array.from(row, (x) => x ?? ""));
    }
    return rows;
  }

  function csvRows(text) {
    return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) { const ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === "," || ch === ";") { out.push(cur.trim()); cur = ""; } else cur += ch; }
      out.push(cur.trim()); return out;
    });
  }

  const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

  // Find the header row that contains a tax-code column; drop long address/capital columns for a light lookup page.
  function toLookupTable(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const mst = rows[i].findIndex((h) => { const n = norm(h); return n === "msdn" || n === "mst" || n.includes("ma so"); });
      if (mst >= 0) {
        const header = rows[i];
        let keep = header.map((h, j) => j).filter((j) => header[j] && !/dia.?chi|von/.test(norm(header[j]))).slice(0, 5);
        if (!keep.includes(mst)) keep = [mst, ...keep];
        const data = rows.slice(i + 1).filter((r) => r[mst]).map((r) => keep.map((j) => r[j] ?? ""));
        return { cols: keep.map((j) => header[j]), mst: keep.indexOf(mst), rows: data };
      }
    }
    return null;
  }

  const b64 = (buf) => { const u8 = new Uint8Array(buf); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

  async function imageToJpegB64(file, max = 1800) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88).split(",")[1];
  }

  // Returns {part, table?, summary}
  async function readFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
      return { part: { kind: "image", name: file.name, mediaType: "image/jpeg", data: await imageToJpegB64(file) }, summary: "ảnh" };
    }
    if (ext === "pdf") {
      if (file.size > 25e6) throw new Error(`${file.name} lớn hơn 25 MB`);
      return { part: { kind: "pdf", name: file.name, data: b64(await file.arrayBuffer()) }, summary: "PDF" };
    }
    if (ext === "docx") return { part: { kind: "text", name: file.name, data: await docxText(await file.arrayBuffer()) }, summary: "Word" };
    if (ext === "doc") throw new Error("File .doc đời cũ: anh mở bằng Word và lưu lại dạng .docx giúp em.");
    if (ext === "xlsx" || ext === "csv") {
      const rows = ext === "csv" ? csvRows(await file.text()) : await xlsxRows(await file.arrayBuffer());
      const table = toLookupTable(rows);
      const sample = rows.slice(0, 25).map((r) => r.join(" | ")).join("\n");
      return { part: { kind: "text", name: file.name, data: `Bảng ${rows.length} dòng. 25 dòng đầu:\n${sample}` }, table, summary: `Excel ${rows.length.toLocaleString("vi-VN")} dòng` };
    }
    if (ext === "txt" || ext === "md") return { part: { kind: "text", name: file.name, data: await file.text() }, summary: "văn bản" };
    throw new Error(`Chưa hỗ trợ file .${ext}. Dùng Word, Excel, PDF hoặc ảnh.`);
  }

  window.THTExtract = { readFile, docxText, xlsxRows };
})();
