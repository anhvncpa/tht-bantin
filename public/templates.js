// The 5 THT poster styles as plain functions: (content, opts) → HTML string of a 794px-wide poster root.
(function () {
  const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cap = (s) => { s = String(s || "").trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const lowerFirst = (s) => { s = String(s || ""); const w = s.split(" ")[0]; return w.length > 1 && w === w.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1); };
  const stripQ = (s) => String(s || "").replace(/[\s?]+$/, "");
  const items = (x) => (x && Array.isArray(x.items) ? x.items : []);
  const legal = (c) => (c.legal_basis || []).map((l) => e(l.ref)).join(" · ");
  const root = (bg, font, color, extra = "") =>
    `<div id="poster" style="width:794px;height:1123px;box-sizing:border-box;overflow:hidden;background:${bg};font-family:${font};color:${color};display:flex;flex-direction:column;${extra}">`;

  const STYLES = {};

  // ---------------- 1. Navy & cam THT ----------------
  STYLES["1"] = {
    name: "Navy & cam THT", bg: "#FFFFFF", qrColor: "#172B3B",
    fonts: "Inter:wght@300;400;500;600;700;800",
    render(c, o) {
      const aud = items(c.audience).map((it) => it.emphasis
        ? `<div style="border:1.5px solid #FC5A1B;border-radius:12px;padding:11px 15px;display:flex;flex-direction:column;gap:5px;background:#FFF6F2"><div style="display:inline-flex;align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.6px;color:#FFFFFF;background:#FC5A1B;padding:4px 10px;border-radius:20px">${e(it.label)}</div>`
        : `<div style="border:1px solid #E6EAEE;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:5px"><div style="display:inline-flex;align-self:flex-start;font-size:11px;font-weight:700;letter-spacing:.6px;color:#172B3B;background:#F1F4F6;padding:4px 10px;border-radius:20px">${e(it.label)}</div>`)
        .map((head, i) => { const it = items(c.audience)[i]; return `${head}<div style="font-size:13px;line-height:1.55;color:#3B4C5A">${e(it.text)}</div><div style="font-size:12.5px;line-height:1.5;color:#172B3B;font-weight:600">${e(it.note)}</div></div>`; }).join("");
      const pts = items(c.points).map((it, i) => `<div style="background:#FFFFFF;border:1px solid #E6EAEE;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 14px rgba(23,43,59,.06)"><div style="display:flex;align-items:center;gap:10px"><div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:#FFEDE5;color:#FC5A1B;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center">${i + 1}</div><div style="font-size:13.5px;font-weight:700;line-height:1.3">${e(it.title)}</div></div><div style="font-size:12px;line-height:1.5;color:#3B4C5A">${e(it.text)}</div><div style="font-size:11.5px;line-height:1.5;color:#576671;border-top:1px dashed #E0D6D0;padding-top:7px">${e(it.detail)}</div></div>`).join("");
      const acts = items(c.actions).map((it) => `<div style="display:flex;gap:10px;align-items:flex-start"><div style="flex-shrink:0;font-size:26px;font-weight:800;line-height:1;color:#FC5A1B">→</div><div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:13px;font-weight:700">${e(it.title)}</div><div style="font-size:12px;line-height:1.5;color:#3B4C5A">${e(it.text)}</div></div></div>`).join("");
      const sec = (n, title, hint, body) => `<section style="display:flex;flex-direction:column;gap:11px"><div style="display:flex;align-items:baseline;gap:12px"><span style="font-size:12px;font-weight:700;color:#FC5A1B;letter-spacing:1px">${n}</span><span style="font-size:19px;font-weight:700;letter-spacing:-.2px">${e(title)}</span>${hint ? `<span style="font-size:12.5px;color:#576671">${e(hint)}</span>` : ""}</div>${body}</section>`;
      return `${root("#FFFFFF", "'Inter','Segoe UI',Arial,sans-serif", "#172B3B")}
<header style="background:#172B3B;padding:20px 48px 22px;display:flex;flex-direction:column;gap:12px">
<div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;align-items:center;gap:12px"><div style="width:46px;height:46px;border-radius:8px;background:#E3A72F;color:#172B3B;font-weight:800;font-size:16px;letter-spacing:.5px;display:flex;align-items:center;justify-content:center">THT</div><div style="display:flex;flex-direction:column;gap:2px"><div style="color:#FFFFFF;font-weight:700;font-size:13px;letter-spacing:1.2px">KIỂM TOÁN &amp; TƯ VẤN THT</div><div style="color:#B9C8D8;font-size:11px;letter-spacing:.4px">THT Auditing &amp; Consulting</div></div></div><div style="color:#C9D3DB;font-size:11px;letter-spacing:1.4px">REGULATORY ALERT · ${o.month}</div></div>
<div style="height:1px;background:#2C4356"></div>
<div style="display:flex;gap:26px;align-items:stretch"><div style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:0"><div style="display:inline-flex;align-self:flex-start;background:#FC5A1B;color:#FFFFFF;font-weight:800;font-size:11.5px;letter-spacing:1.6px;padding:6px 12px;border-radius:4px">THÔNG BÁO QUAN TRỌNG</div><h1 style="margin:0;color:#FFFFFF;font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-.6px">${e(c.title_line1)}<br>${e(c.title_line2)}</h1><div style="color:#FC5A1B;font-size:14px;font-weight:600">${e(c.subtitle_en)}</div><p style="margin:0;color:#D3DEEA;font-size:13px;line-height:1.55"><b style="color:#FFFFFF">${e(c.doc_ref)}</b> · ${e(c.issuer_sentence)}</p></div>
<div style="flex-shrink:0;width:186px;background:#FFFFFF;border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:center;gap:6px"><div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#576671">${e(c.highlight?.label)}</div><div style="font-size:38px;font-weight:800;line-height:1;color:#FC5A1B;letter-spacing:-1px">${e(c.highlight?.value)}</div><div style="font-size:15px;font-weight:700">${e(c.highlight?.unit)}</div><div style="font-size:11.5px;line-height:1.45;color:#576671">${e(c.highlight?.note)}</div></div></div>
</header>
<main style="padding:20px 48px 0;display:flex;flex-direction:column;gap:17px;flex-grow:1">
${sec("01", c.audience?.title, "", `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">${aud}</div>`)}
${sec("02", c.points?.title, c.points?.hint, `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">${pts}</div>`)}
${sec("03", c.actions?.title, "", `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">${acts}</div>`)}
</main>
<footer style="margin-top:16px;background:#172B3B;padding:18px 48px 16px;display:flex;flex-direction:column;gap:12px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:24px"><div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:#FC5A1B">THT ĐỒNG HÀNH CÙNG DOANH NGHIỆP</div><div style="font-size:20px;font-weight:700;color:#FFFFFF">Liên hệ tư vấn</div><div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:#C9D3DB"><span>☎ <b style="color:#FFFFFF;font-weight:600">${e(o.brand.phone)}</b></span>${o.brand.emails.map((m) => `<span>✉ <b style="color:#FFFFFF;font-weight:600">${e(m)}</b></span>`).join("")}<span>⌂ <b style="color:#FFFFFF;font-weight:600">${e(o.brand.website)}</b></span></div></div>
${o.qr ? `<div style="flex-shrink:0;display:flex;align-items:center;gap:12px;background:#FFFFFF;border-radius:12px;padding:8px 14px 8px 8px">${o.qr(96, "#172B3B")}<div style="display:flex;flex-direction:column;gap:3px;max-width:130px"><div style="font-size:12px;font-weight:800;color:#FC5A1B;letter-spacing:.4px">QUÉT MÃ QR</div><div style="font-size:11px;line-height:1.4">${e(c.qr_caption)}</div></div></div>` : ""}</div>
<div style="height:1px;background:#2C4356"></div><div style="font-size:10px;line-height:1.5;color:#93A3B1">Căn cứ: ${legal(c)}.${c.footnote ? " " + e(c.footnote) : ""}</div>
</footer></div>`;
    },
  };

  // ---------------- 2. Swiss trắng & xanh lam ----------------
  STYLES["2"] = {
    name: "Swiss trắng & xanh lam", bg: "#FFFFFF", qrColor: "#0E1116",
    fonts: "IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700",
    render(c, o) {
      const mono = "font-family:'IBM Plex Mono',monospace";
      const hv = String(c.highlight?.value || "");
      const facts = (c.facts || []).map((f, i, a) => `<div style="padding:12px 14px 12px ${i ? 14 : 0}px;display:flex;flex-direction:column;gap:3px;${i < a.length - 1 ? "border-right:1px solid #D4D8E0" : ""}"><span style="${mono};font-size:10.5px;color:#5A6273">${e(f.label)}</span><span style="font-size:18px;font-weight:700;${i ? "" : "color:#2345F5"}">${e(f.value)}</span><span style="font-size:11.5px;color:#3A4150">${e(f.note)}</span></div>`).join("");
      const sec = (label, body, pad = "20px 0 18px", border = true) => `<section style="display:grid;grid-template-columns:150px minmax(0,1fr);gap:20px;padding:${pad};${border ? "border-bottom:1px solid #D4D8E0" : ""}"><div style="${mono};font-size:11px;font-weight:600;letter-spacing:.4px;line-height:1.5">${label}</div>${body}</section>`;
      const aud = items(c.audience).map((it) => `<div style="display:flex;flex-direction:column;gap:5px"><div style="font-size:14px;font-weight:700;${it.emphasis ? "color:#2345F5" : ""}">${e(cap(it.label))}</div><div style="font-size:12.5px;line-height:1.55;color:#3A4150">${e(it.text)} <b style="color:#0E1116">${e(it.note)}</b></div></div>`).join("");
      const pts = items(c.points).map((it, i, a) => `<div style="display:grid;grid-template-columns:46px minmax(0,1fr);gap:10px;padding:${i === 0 ? "0 0 10px" : i === a.length - 1 ? "10px 0 0" : "10px 0"};${i ? "border-top:1px solid #ECEEF2" : ""}"><div style="font-size:30px;font-weight:700;line-height:1;color:#2345F5">0${i + 1}</div><div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:14px;font-weight:700">${e(it.title)}</div><div style="font-size:12.5px;line-height:1.5;color:#3A4150">${e(it.text)} ${e(it.detail)}</div></div></div>`).join("");
      const acts = items(c.actions).map((it) => `<div style="display:flex;flex-direction:column;gap:4px;border-top:3px solid #2345F5;padding-top:8px"><div style="font-size:13.5px;font-weight:700">${e(it.title)}</div><div style="font-size:12px;line-height:1.5;color:#3A4150">${e(it.text)}</div></div>`).join("");
      return `${root("#FFFFFF", "'IBM Plex Sans','Segoe UI',Arial,sans-serif", "#0E1116", "padding:34px 48px 0")}
<div style="display:flex;justify-content:space-between;align-items:baseline;${mono};font-size:11px;letter-spacing:.6px;border-bottom:2px solid #0E1116;padding-bottom:10px"><span style="font-weight:600">KIỂM TOÁN &amp; TƯ VẤN THT</span><span>BẢN TIN PHÁP LÝ — ${o.month}</span></div>
<div style="display:flex;gap:24px;padding:26px 0 22px;align-items:stretch"><div style="flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:14px;min-width:0"><div style="${mono};font-size:11.5px;color:#2345F5;font-weight:600;letter-spacing:.6px">${e(String(c.doc_ref || "").toUpperCase())}</div><h1 style="margin:0;font-size:39px;line-height:1.06;font-weight:700;letter-spacing:-1.4px">${e(c.title_line1)}<br>${e(c.title_line2)}</h1><div style="font-size:14px;line-height:1.55;color:#3A4150;max-width:430px">${e(c.issuer_sentence)}</div></div>
<div style="flex-shrink:0;width:230px;background:#2345F5;color:#FFFFFF;padding:22px;display:flex;flex-direction:column;justify-content:space-between;gap:12px"><div style="${mono};font-size:11px;letter-spacing:.6px;color:#C9D2FF">${e(c.highlight?.label)}</div><div style="font-size:${hv.length <= 4 ? 64 : 46}px;font-weight:700;line-height:.95;letter-spacing:-2px;white-space:nowrap">${e(hv)}</div><div style="font-size:17px;font-weight:600">${e(c.highlight?.unit)}</div><div style="font-size:12.5px;line-height:1.45;color:#E6EAFF">${e(c.highlight?.note)}</div></div></div>
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid #0E1116;border-bottom:1px solid #0E1116">${facts}</div>
${sec(`A —<br>${e(String(c.audience?.title || "").toUpperCase())}`, `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px">${aud}</div>`)}
${sec(`B —<br>${e(String(c.points?.title || "").toUpperCase())}<br><span style="font-weight:400;color:#5A6273">${e(c.points?.hint)}</span>`, `<div style="display:flex;flex-direction:column">${pts}</div>`)}
${sec("C —<br>VIỆC CẦN LÀM", `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px">${acts}</div>`, "20px 0 22px", false)}
<div style="flex-grow:1"></div>
<footer style="margin:0 -48px;background:#0E1116;color:#FFFFFF;padding:20px 48px;display:flex;justify-content:space-between;align-items:center;gap:24px"><div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div style="${mono};font-size:11px;letter-spacing:.6px;color:#8FA2FF">LIÊN HỆ TƯ VẤN</div><div style="font-size:26px;font-weight:700;letter-spacing:-.5px">${e(o.brand.phone)}</div><div style="${mono};font-size:11.5px;line-height:1.6;color:#C8CCD6">${o.brand.emails.map(e).join("<br>")} · ${e(o.brand.website)}</div></div>
${o.qr ? `<div style="flex-shrink:0;display:flex;align-items:center;gap:14px"><div style="${mono};font-size:11px;line-height:1.5;text-align:right;color:#C8CCD6;max-width:170px"><span style="color:#FFFFFF;font-weight:600">QUÉT MÃ QR</span><br>${e(c.qr_caption)}</div><div style="background:#FFFFFF;padding:6px">${o.qr(92, "#0E1116")}</div></div>` : ""}</footer></div>`;
    },
  };

  // ---------------- 3. Xanh ngọc tối & vàng ----------------
  STYLES["3"] = {
    name: "Xanh ngọc tối & vàng", bg: "#0F2E2C", qrColor: "#0F2E2C",
    fonts: "Montserrat:wght@600;700;800;900&family=Lexend:wght@300;400;500;600",
    render(c, o) {
      const mont = "font-family:'Montserrat',sans-serif";
      const pts = items(c.points).map((it, i, a) => `<div style="display:flex;gap:14px"><div style="display:flex;flex-direction:column;align-items:center"><div style="width:28px;height:28px;border-radius:50%;background:#9BE7C4;color:#0F2E2C;font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center">${i + 1}</div>${i < a.length - 1 ? `<div style="width:2px;flex-grow:1;background:#2E5C57;margin-top:4px"></div>` : ""}</div><div style="display:flex;flex-direction:column;gap:4px;${i < a.length - 1 ? "padding-bottom:6px" : ""}"><div style="font-size:13.5px;font-weight:600;color:#FFFFFF">${e(it.title)}</div><div style="font-size:12px;line-height:1.55;font-weight:300;color:#C3D9D2">${e(it.text)} ${e(it.detail)}</div></div></div>`).join("");
      const aud = items(c.audience).map((it) => `<div style="border:1px solid ${it.emphasis ? "#F2C14E" : "#2E5C57"};border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;${it.emphasis ? "background:rgba(242,193,78,.08)" : ""}"><div style="font-size:11px;font-weight:600;letter-spacing:1px;color:${it.emphasis ? "#F2C14E" : "#9BE7C4"}">${e(it.label)}</div><div style="font-size:12.5px;line-height:1.5;font-weight:300">${e(it.text)} <b style="font-weight:600;color:#FFFFFF">${e(it.note)}</b></div></div>`).join("");
      const acts = items(c.actions).map((it, i) => `<div style="background:#163D3A;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px"><div style="${mont};font-size:22px;font-weight:900;color:#9BE7C4;line-height:1">0${i + 1}</div><div style="font-size:13px;font-weight:600;color:#FFFFFF">${e(it.title)}</div><div style="font-size:11.5px;line-height:1.5;font-weight:300;color:#C3D9D2">${e(it.text)}</div></div>`).join("");
      return `${root("#0F2E2C", "'Lexend','Segoe UI',Arial,sans-serif", "#E8F3EF", "padding:38px 48px 0;gap:28px")}
<div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:50%;border:2px solid #9BE7C4;color:#9BE7C4;${mont};font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center">THT</div><div style="font-size:12px;font-weight:500;letter-spacing:1.4px">KIỂM TOÁN &amp; TƯ VẤN THT</div></div><div style="font-size:11px;letter-spacing:1.4px;color:#8FB3AA">CẬP NHẬT ${o.month}</div></div>
<div style="display:flex;gap:22px;align-items:center"><div style="flex:1;display:flex;flex-direction:column;gap:12px;min-width:0"><div style="display:inline-flex;align-self:flex-start;font-size:11px;font-weight:600;letter-spacing:1.2px;color:#0F2E2C;background:#9BE7C4;padding:5px 12px;border-radius:20px">${e(String(c.doc_ref || "").toUpperCase())}</div><h1 style="margin:0;${mont};font-size:38px;line-height:1.12;font-weight:900;letter-spacing:-.5px;color:#FFFFFF">${e(c.title_line1)}<br><span style="color:#9BE7C4">${e(c.title_line2)}</span></h1><div style="font-size:13.5px;line-height:1.6;font-weight:300;color:#C3D9D2;max-width:440px">${e(c.issuer_sentence)}</div></div>
<div style="flex-shrink:0;width:176px;height:176px;border-radius:50%;border:2px dashed #9BE7C4;display:flex;align-items:center;justify-content:center"><div style="width:150px;height:150px;border-radius:50%;background:#F2C14E;color:#0F2E2C;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;padding:0 12px"><div style="font-size:10px;font-weight:600;letter-spacing:1.2px">${e(c.highlight?.label)}</div><div style="${mont};font-size:34px;font-weight:900;line-height:1;letter-spacing:-1px">${e(c.highlight?.value)}</div><div style="font-size:11px;font-weight:600;line-height:1.3">${e(c.highlight?.unit)}</div></div></div></div>
<div style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:20px"><div style="background:#163D3A;border-radius:18px;padding:20px 22px;display:flex;flex-direction:column;gap:14px"><div style="${mont};font-size:17px;font-weight:800;color:#FFFFFF">${e(c.points?.title)}</div>${pts}</div>
<div style="display:flex;flex-direction:column;gap:14px"><div style="${mont};font-size:17px;font-weight:800;color:#FFFFFF;padding-top:20px">${e(c.audience?.title)}</div>${aud}<div style="font-size:11.5px;line-height:1.5;font-weight:300;color:#8FB3AA">${e(c.highlight?.note)}</div></div></div>
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">${acts}</div>
<div style="flex-grow:1"></div><div style="font-size:10.5px;line-height:1.5;font-weight:300;color:#8FB3AA;margin-top:-14px">Căn cứ: ${legal(c)}.${c.footnote ? " " + e(c.footnote) : ""}</div>
<footer style="margin:0 -48px;background:#9BE7C4;color:#0F2E2C;padding:20px 48px;display:flex;justify-content:space-between;align-items:center;gap:24px"><div style="display:flex;flex-direction:column;gap:6px;min-width:0"><div style="font-size:11px;font-weight:600;letter-spacing:1.4px">LIÊN HỆ TƯ VẤN</div><div style="${mont};font-size:28px;font-weight:900;letter-spacing:-.5px">${e(o.brand.phone)}</div><div style="font-size:12px;line-height:1.55">${o.brand.emails.map(e).join(" · ")}<br>${e(o.brand.website)}</div></div>
${o.qr ? `<div style="flex-shrink:0;display:flex;align-items:center;gap:14px"><div style="font-size:11.5px;line-height:1.45;text-align:right;max-width:160px"><b style="font-weight:600">Quét mã QR</b><br>${e(c.qr_caption)}</div><div style="background:#FFFFFF;padding:6px;border-radius:10px">${o.qr(92, "#0F2E2C")}</div></div>` : ""}</footer></div>`;
    },
  };

  // ---------------- 4. Legal Brief đỏ rượu ----------------
  STYLES["4"] = {
    name: "Legal Brief đỏ rượu", bg: "#FBFBFA", qrColor: "#6B1E2E",
    fonts: "Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Source+Sans+3:wght@400;500;600;700",
    render(c, o) {
      const serif = "font-family:'Source Serif 4',Georgia,serif";
      const h2 = (t) => `<h2 style="margin:0;${serif};font-size:18px;font-weight:700">${t}</h2>`;
      return `${root("#FBFBFA", "'Source Sans 3','Segoe UI',Arial,sans-serif", "#1F1C1D", "padding:40px 52px 0")}
<div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:3px double #6B1E2E"><div style="display:flex;flex-direction:column;gap:2px"><div style="${serif};font-size:26px;font-weight:700;color:#6B1E2E">Tax &amp; Legal Alert</div><div style="font-size:11px;letter-spacing:1.6px;color:#6E6668">KIỂM TOÁN &amp; TƯ VẤN THT</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:11px;color:#6E6668"><span>Số ${o.month} · Doanh nghiệp</span><span>${o.date}</span></div></div>
<div style="padding:24px 0 20px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid #D9D2D3"><div style="font-size:11.5px;font-weight:600;letter-spacing:1.4px;color:#6B1E2E">${e(String(c.doc_ref || "").toUpperCase())} · ${e(String(c.subtitle_en || "").toUpperCase())}</div><h1 style="margin:0;${serif};font-size:34px;line-height:1.18;font-weight:600;letter-spacing:-.3px">${e(c.title_line1)} ${e(lowerFirst(c.title_line2))}</h1><p style="margin:0;${serif};font-size:15px;line-height:1.6;font-style:italic;color:#4A4345">${e(c.issuer_sentence)}</p></div>
<div style="display:grid;grid-template-columns:196px minmax(0,1fr);gap:28px;padding-top:20px">
<aside style="display:flex;flex-direction:column;gap:16px"><div style="background:#6B1E2E;color:#FFFFFF;padding:16px;display:flex;flex-direction:column;gap:4px"><div style="font-size:10.5px;font-weight:600;letter-spacing:1.4px;color:#E9C9CF">${e(c.highlight?.label)}</div><div style="${serif};font-size:26px;font-weight:700;line-height:1.1">${e(c.highlight?.value)} ${e(c.highlight?.unit)}</div><div style="font-size:12px;line-height:1.45;color:#F3E3E6">${e(c.highlight?.note)}</div></div>
<div style="display:flex;flex-direction:column;gap:10px;font-size:12px;line-height:1.45"><div style="font-size:10.5px;font-weight:700;letter-spacing:1.4px;color:#6B1E2E;border-bottom:1px solid #D9D2D3;padding-bottom:5px">CĂN CỨ PHÁP LÝ</div>${(c.legal_basis || []).map((l) => `<div><b>${e(l.ref)}</b><br><span style="color:#6E6668">${e(l.desc)}</span></div>`).join("")}</div>
${o.qr ? `<div style="border:1px solid #D9D2D3;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;background:#FFFFFF">${o.qr(120, "#6B1E2E")}<div style="font-size:11.5px;line-height:1.4;text-align:center;color:#4A4345"><b style="color:#6B1E2E">Quét mã QR</b><br>${e(c.qr_caption)}</div></div>` : ""}</aside>
<article style="display:flex;flex-direction:column;gap:16px;min-width:0">
<div style="display:flex;flex-direction:column;gap:6px">${h2("1. " + e(stripQ(c.audience?.title)))}<p style="margin:0;font-size:13px;line-height:1.6;color:#3A3436">${items(c.audience).map((it) => `<b>${e(cap(it.label))}:</b> ${e(it.text)} ${e(it.note)}`).join(" ")}</p></div>
<div style="display:flex;flex-direction:column;gap:6px">${h2("2. " + e(stripQ(c.points?.title)))}<p style="margin:0;font-size:13px;line-height:1.6;color:#3A3436">${e(c.points?.hint)}:</p><div style="display:flex;flex-direction:column;gap:7px;padding-left:14px;border-left:2px solid #6B1E2E">${items(c.points).map((it, i) => `<div style="font-size:13px;line-height:1.55;color:#3A3436"><b style="color:#6B1E2E">(${"abc"[i]})</b> <b>${e(it.title)}.</b> ${e(it.text)} ${e(it.detail)}</div>`).join("")}</div></div>
<div style="display:flex;flex-direction:column;gap:6px">${h2("3. Khuyến nghị của THT")}<p style="margin:0;font-size:13px;line-height:1.6;color:#3A3436">${e(c.recommendation)}</p></div>
</article></div>
<div style="flex-grow:1"></div>
<footer style="border-top:3px double #6B1E2E;padding:14px 0 26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px"><div style="display:flex;flex-direction:column;gap:3px"><div style="${serif};font-size:15px;font-weight:700;color:#6B1E2E">Liên hệ tư vấn</div><div style="font-size:12.5px;color:#3A3436"><b>${e(o.brand.phone)}</b> · ${o.brand.emails.map(e).join(" · ")} · ${e(o.brand.website)}</div></div><div style="font-size:10px;line-height:1.4;color:#8A8183;text-align:right;max-width:190px">Tài liệu mang tính tham khảo, không thay thế ý kiến tư vấn cho từng trường hợp cụ thể.</div></footer></div>`;
    },
  };

  // ---------------- 5. Infographic vàng & đen ----------------
  STYLES["5"] = {
    name: "Infographic vàng & đen", bg: "#F4F4F1", qrColor: "#1E1E24",
    fonts: "Plus+Jakarta+Sans:wght@400;500;600;700;800",
    render(c, o) {
      const d = c.decision || {};
      const arrow = (dir, label) => `<div style="text-align:center;font-size:11px;font-weight:800;line-height:1.1">${label}<br><span style="font-size:22px">${dir}</span></div>`;
      const row = "display:grid;grid-template-columns:minmax(0,1fr) 60px minmax(0,1fr);align-items:center";
      const q = (t) => `<div style="background:#1E1E24;color:#FFFFFF;border-radius:12px;padding:14px 16px;font-size:14.5px;font-weight:700;line-height:1.35">${e(t)}</div>`;
      const tops = ["#1E1E24", "#FFD23F", "#9A9AA3"];
      return `${root("#F4F4F1", "'Plus Jakarta Sans','Segoe UI',Arial,sans-serif", "#1E1E24")}
<section style="background:#FFD23F;padding:30px 48px;display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:800;letter-spacing:1.4px">KIỂM TOÁN &amp; TƯ VẤN THT</div><div style="font-size:11px;font-weight:600;letter-spacing:1px;background:#1E1E24;color:#FFD23F;padding:5px 10px;border-radius:4px">${e(String(c.doc_ref || "").toUpperCase())}</div></div><h1 style="margin:0;font-size:42px;line-height:1.08;font-weight:800;letter-spacing:-1.4px;max-width:640px">${e(c.title_question)}</h1><div style="font-size:14px;line-height:1.5;font-weight:500;max-width:600px">Kiểm tra nhanh theo sơ đồ dưới đây. ${e(c.topic_short)}: ${e(c.subtitle_en)}.</div></section>
<section style="padding:26px 48px 0;display:flex;flex-direction:column;gap:10px">
<div style="${row}">${q(d.q1)}${arrow("→", "CÓ")}<div style="background:#FFFFFF;border:2px solid #1E1E24;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:2px"><div style="font-size:13.5px;font-weight:700">${e(d.yes1_title)}</div><div style="font-size:12px;color:#55555E">${e(d.yes1_text)}</div></div></div>
<div style="${row}">${arrow("↓", "KHÔNG")}</div>
<div style="${row}">${q(d.q2)}${arrow("→", "CÓ")}<div style="background:#FF5C39;color:#FFFFFF;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:2px"><div style="font-size:13.5px;font-weight:800">${e(d.yes2_title)}</div><div style="font-size:12px;color:#FFE9E3">${e(d.yes2_text)}</div></div></div>
<div style="${row}">${arrow("↓", "KHÔNG")}</div>
<div style="${row}"><div style="background:#FFFFFF;border:2px dashed #9A9AA3;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:2px"><div style="font-size:13.5px;font-weight:700">${e(d.no_title)}</div><div style="font-size:12px;color:#55555E">${e(d.no_text)}</div></div></div></section>
<section style="padding:24px 48px 0;display:flex;flex-direction:column;gap:12px"><div style="font-size:19px;font-weight:800;letter-spacing:-.3px">${e(c.points?.title)} <span style="font-size:13px;font-weight:500;color:#55555E">${e(c.points?.hint)}</span></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">${items(c.points).map((it, i) => `<div style="background:#FFFFFF;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;border-top:6px solid ${tops[i]}"><div style="font-size:28px;font-weight:800;line-height:1;letter-spacing:-1px">${e(it.badge)}</div><div style="font-size:13px;font-weight:700">${e(it.title)}</div><div style="font-size:11.5px;line-height:1.5;color:#55555E">${e(it.detail)}</div></div>`).join("")}</div></section>
<section style="padding:18px 48px 0"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#1E1E24;color:#FFFFFF;border-radius:12px">${(c.facts || []).map((f, i, a) => `<div style="padding:14px 16px;display:flex;flex-direction:column;gap:2px;${i < a.length - 1 ? "border-right:1px solid #3A3A44" : ""}"><span style="font-size:10.5px;font-weight:700;letter-spacing:1px;color:#FFD23F">${e(f.label)}</span><span style="font-size:18px;font-weight:800">${e(f.value)}</span><span style="font-size:11px;color:#B8B8C2">${e(f.note)}</span></div>`).join("")}</div></section>
<div style="flex-grow:1"></div>
<footer style="background:#FFFFFF;border-top:6px solid #FFD23F;padding:18px 48px 20px;display:flex;justify-content:space-between;align-items:center;gap:24px"><div style="display:flex;flex-direction:column;gap:5px;min-width:0"><div style="font-size:11px;font-weight:800;letter-spacing:1.4px;color:#55555E">LIÊN HỆ TƯ VẤN</div><div style="font-size:28px;font-weight:800;letter-spacing:-.8px">${e(o.brand.phone)}</div><div style="font-size:12px;line-height:1.55;color:#3A3A44">${o.brand.emails.map(e).join(" · ")} · ${e(o.brand.website)}</div></div>
${o.qr ? `<div style="flex-shrink:0;display:flex;align-items:center;gap:12px"><div style="font-size:12px;line-height:1.4;text-align:right;max-width:150px"><b style="font-weight:800">Quét mã QR</b><br>${e(c.qr_caption)}</div><div style="border:2px solid #1E1E24;border-radius:10px;padding:4px;background:#FFFFFF">${o.qr(88, "#1E1E24")}</div></div>` : ""}</footer></div>`;
    },
  };

  // ---------------- Continuation pages (trang 2, 3) in each style's palette ----------------
  const TOKENS = {
    "1": { bg: "#FFFFFF", ink: "#172B3B", muted: "#3B4C5A", accent: "#FC5A1B", soft: "#FFF6F2", head: "#172B3B", headInk: "#FFFFFF", headMuted: "#C9D3DB", card: "#FFFFFF", line: "#E6EAEE", font: "'Inter','Segoe UI',Arial,sans-serif", display: "'Inter','Segoe UI',Arial,sans-serif", foot: "#172B3B", footInk: "#C9D3DB", footStrong: "#FFFFFF", qr: "#172B3B" },
    "2": { bg: "#FFFFFF", ink: "#0E1116", muted: "#3A4150", accent: "#2345F5", soft: "#EEF1FF", head: "#FFFFFF", headInk: "#0E1116", headMuted: "#5A6273", card: "#FFFFFF", line: "#D4D8E0", font: "'IBM Plex Sans','Segoe UI',Arial,sans-serif", display: "'IBM Plex Sans','Segoe UI',Arial,sans-serif", foot: "#0E1116", footInk: "#C8CCD6", footStrong: "#FFFFFF", qr: "#0E1116", rule: true },
    "3": { bg: "#0F2E2C", ink: "#E8F3EF", muted: "#C3D9D2", accent: "#9BE7C4", soft: "#163D3A", head: "#0F2E2C", headInk: "#FFFFFF", headMuted: "#8FB3AA", card: "#163D3A", line: "#2E5C57", font: "'Lexend','Segoe UI',Arial,sans-serif", display: "'Montserrat',sans-serif", foot: "#9BE7C4", footInk: "#0F2E2C", footStrong: "#0F2E2C", qr: "#0F2E2C" },
    "4": { bg: "#FBFBFA", ink: "#1F1C1D", muted: "#3A3436", accent: "#6B1E2E", soft: "#F4ECEE", head: "#FBFBFA", headInk: "#1F1C1D", headMuted: "#6E6668", card: "#FFFFFF", line: "#D9D2D3", font: "'Source Sans 3','Segoe UI',Arial,sans-serif", display: "'Source Serif 4',Georgia,serif", foot: "#FBFBFA", footInk: "#3A3436", footStrong: "#6B1E2E", qr: "#6B1E2E", rule: true },
    "5": { bg: "#F4F4F1", ink: "#1E1E24", muted: "#55555E", accent: "#1E1E24", soft: "#FFD23F", head: "#FFD23F", headInk: "#1E1E24", headMuted: "#3A3A44", card: "#FFFFFF", line: "#E2E2DC", font: "'Plus Jakarta Sans','Segoe UI',Arial,sans-serif", display: "'Plus Jakarta Sans','Segoe UI',Arial,sans-serif", foot: "#FFFFFF", footInk: "#3A3A44", footStrong: "#1E1E24", qr: "#1E1E24" },
  };

  function renderExtra(style, page, index, total, c, o) {
    const t = TOKENS[style];
    const ruleHead = t.rule ? `border-bottom:${style === "4" ? "3px double " + t.accent : "2px solid " + t.ink};` : "";
    const secs = (page.sections || []).map((s, i) => `<section style="background:${t.card};border:1px solid ${t.line};border-radius:${style === "4" || style === "2" ? 0 : 12}px;padding:16px 18px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:10px"><div style="flex-shrink:0;width:30px;height:30px;border-radius:${style === "2" ? 0 : 50}%;background:${style === "5" ? "#FFD23F" : t.accent};color:${style === "3" || style === "5" ? "#0F2E2C" : "#FFFFFF"};font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center">${i + 1}</div><div style="font-family:${t.display};font-size:17px;font-weight:700;color:${style === "3" ? "#FFFFFF" : t.ink}">${e(s.heading)}</div></div>
<div style="display:grid;grid-template-columns:${(s.items || []).length > 3 ? "repeat(2,minmax(0,1fr))" : "minmax(0,1fr)"};gap:8px 20px">${(s.items || []).map((it) => `<div style="display:flex;gap:9px;font-size:13px;line-height:1.55;color:${t.muted}"><span style="color:${style === "5" ? "#FF5C39" : t.accent};font-weight:800">•</span><span>${e(it)}</span></div>`).join("")}</div></section>`).join("");
    const last = index === total - 1;
    return `${root(t.bg, t.font, t.ink)}
<header style="background:${t.head};padding:22px 48px 20px;display:flex;flex-direction:column;gap:12px;${ruleHead}">
<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:1.3px"><span style="font-weight:700;color:${t.headInk}">KIỂM TOÁN &amp; TƯ VẤN THT</span><span style="color:${t.headMuted}">${e(String(c.doc_ref || "").toUpperCase())} · TRANG ${index + 1}/${total}</span></div>
<h1 style="margin:0;font-family:${t.display};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.4px;color:${t.headInk}">${e(page.title)}</h1>
${page.subtitle ? `<div style="font-size:13.5px;font-weight:600;color:${style === "1" ? "#FC5A1B" : t.headMuted}">${e(page.subtitle)}</div>` : ""}
</header>
<main style="padding:22px 48px 0;display:flex;flex-direction:column;gap:16px;flex-grow:1">${secs}</main>
<footer style="margin-top:16px;background:${t.foot};padding:16px 48px;display:flex;justify-content:space-between;align-items:center;gap:20px;${t.foot === t.bg || t.foot === "#FFFFFF" ? `border-top:${style === "5" ? "6px solid #FFD23F" : "3px double " + t.accent}` : ""}">
<div style="display:flex;flex-direction:column;gap:5px;min-width:0"><div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:${style === "1" ? "#FC5A1B" : t.footStrong}">LIÊN HỆ TƯ VẤN</div><div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:${t.footInk}"><span>☎ <b style="color:${t.footStrong}">${e(o.brand.phone)}</b></span>${o.brand.emails.map((m) => `<span>✉ <b style="color:${t.footStrong}">${e(m)}</b></span>`).join("")}<span>⌂ <b style="color:${t.footStrong}">${e(o.brand.website)}</b></span></div></div>
${last && o.qr ? `<div style="flex-shrink:0;background:#FFFFFF;border-radius:10px;padding:5px">${o.qr(84, t.qr)}</div>` : `<div style="flex-shrink:0;font-size:12px;font-weight:700;color:${t.footStrong}">${index + 1}/${total}</div>`}
</footer></div>`;
  }

  const pageCount = (c) => 1 + Math.min(2, (c.extra_pages || []).length);
  function renderPage(style, c, o, index) {
    if (index === 0) return STYLES[style].render(c, o);
    return renderExtra(style, c.extra_pages[index - 1], index, pageCount(c), c, o);
  }

  const fontsHref = (style) => `https://fonts.googleapis.com/css2?family=${STYLES[style].fonts}&display=swap`;
  globalThis.THTTemplates = { STYLES, TOKENS, fontsHref, renderPage, pageCount };
})();
