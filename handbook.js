// "Cẩm nang Giám đốc" – tài liệu chuyên đề 5–10 trang A4 (PDF) + bộ ảnh rời 4:5 (1080×1350) cho Facebook.
// Chỉ làm khi anh gọi /chuyende (không thuộc luồng tự động). Dữ liệu vào là một object "doc" (xem samples/cam-nang/*.json).

const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SYM = (fill) => `<svg viewBox="0 0 561 498" class="sym" aria-label="THT">${fill
  ? `<path fill="${fill}" fill-rule="evenodd" d="M0 0H561V498H0Z M73 54V444H488V54Z"/><rect fill="${fill}" x="72" y="222" width="417" height="54"/><rect fill="${fill}" x="244" y="53" width="73" height="170"/><rect fill="${fill}" x="244" y="275" width="73" height="170"/>`
  : `<path fill="#F7A933" fill-rule="evenodd" d="M0 0H561V498H0Z M73 54V444H488V54Z"/><rect fill="#F7A933" x="72" y="222" width="417" height="54"/><rect fill="#009A57" x="244" y="53" width="73" height="170"/><rect fill="#E0242B" x="244" y="275" width="73" height="170"/><polygon fill="#009A57" points="0,0 561,0 488,54 73,54"/><polygon fill="#E0242B" points="0,498 561,498 488,444 73,444"/>`}</svg>`;
const BAR = (w = "14mm", h = "1.4mm") => `<div class="bar" style="width:${w};height:${h}"><i style="background:#F7A933"></i><i style="background:#009A57"></i><i style="background:#E0242B"></i></div>`;
const table = (t, cols) => {
  const idx = cols || t.cols.map((_, i) => i);
  return `<table><thead><tr>${idx.map((i) => `<th>${esc(t.cols[i])}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${idx.map((i) => `<td>${esc(r[i])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
};

// ---------------- 1. PDF A4 ----------------
export function handbookHtml(doc) {
  const ch = (doc.chapters || []).map((c, i) => `
  <section class="ch">
    <div class="chno">PHẦN ${i + 1}</div><h2>${esc(c.heading)}</h2>
    ${c.intro ? `<p class="lead">${esc(c.intro)}</p>` : ""}
    ${c.table ? table(c.table) : ""}
    ${(c.items || []).map((x) => `<div class="it"><div class="ih">${esc(x.title)}</div><p>${esc(x.text)}</p></div>`).join("")}
    ${c.example ? `<div class="ex"><div class="exh">${esc(c.example.title || "Ví dụ")}</div>${c.example.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${c.example.result ? `<p class="res">${esc(c.example.result)}</p>` : ""}</div>` : ""}
  </section>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 18mm 30mm 18mm}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
body{font-family:${FONT};font-size:10.5pt;line-height:1.5;color:#23272D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{display:flex}.bar i{flex:1;display:block}
.sym{display:block;height:auto}
p{margin:0 0 2mm;text-align:justify}
/* bìa */
.cover{height:247mm;display:flex;flex-direction:column;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.cover .wm{position:absolute;right:-38mm;bottom:-30mm;width:150mm;opacity:.05}.cover .wm .sym{width:150mm}
.cover .top{display:flex;justify-content:space-between;align-items:flex-start}
.cover .brand{display:flex;align-items:center;gap:3.5mm}.cover .brand .sym{width:15mm}
.cover .brand .t{font-size:24pt;letter-spacing:.16em;line-height:1}.cover .brand .s{font-size:6pt;letter-spacing:.14em;border-top:.6pt solid #23272D;margin-top:1.4mm;padding-top:1mm}
.cover .num{text-align:right;font-size:9pt;color:#5B626B;line-height:1.6}
.cover .mid{margin-top:52mm}
.eyebrow{font-size:9pt;font-weight:700;letter-spacing:.2em;color:#5B626B;text-transform:uppercase}
.cover h1{font-size:30pt;line-height:1.18;margin:5mm 0 6mm;letter-spacing:-.01em;max-width:160mm}
.cover .sub{font-size:13pt;color:#5B626B;max-width:150mm;text-align:left}
.cover .tag{display:inline-block;margin-top:8mm;font-size:8.5pt;font-weight:700;letter-spacing:.14em;border-top:2pt solid #E0242B;padding-top:1.6mm}
.cover .foot{margin-top:auto;font-size:9pt;color:#5B626B;border-top:.6pt solid #E3E1DC;padding-top:3mm;line-height:1.6}
/* trang tóm tắt */
.keys{page-break-after:always;break-after:page}
.keys h2{font-size:18pt;margin:3mm 0 1mm}.keys .sm{color:#5B626B;margin-bottom:5mm}
.key{display:flex;gap:4mm;padding:3.2mm 0;border-bottom:.6pt solid #E3E1DC;break-inside:avoid}
.key .n{font-size:18pt;font-weight:700;color:#8A5200;min-width:9mm;line-height:1.1}
.key p{margin:0;font-size:11pt}
/* chương */
.ch{margin:0 0 6mm}
.chno{font-size:8.5pt;font-weight:700;letter-spacing:.2em;color:#8A5200;margin-top:2mm}
h2{font-size:15pt;line-height:1.25;margin:1mm 0 3mm;padding-bottom:2mm;border-bottom:1pt solid #23272D;break-after:avoid;page-break-after:avoid}
.lead{color:#23272D}
.it{margin:0 0 2.6mm;break-inside:avoid;page-break-inside:avoid}
.ih{font-weight:700;margin-bottom:.6mm}
.it p{margin:0}
table{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:9.6pt;break-inside:avoid;page-break-inside:avoid}
th{text-align:left;font-size:8pt;letter-spacing:.08em;text-transform:uppercase;color:#5B626B;border-bottom:1pt solid #23272D;padding:1.6mm 2mm}
td{border-bottom:.6pt solid #E3E1DC;padding:2mm;vertical-align:top}
td:first-child{font-weight:700}
.ex{background:#F6F5F2;border-top:2pt solid #F7A933;padding:3mm 4mm;margin:3mm 0 2mm;break-inside:avoid;page-break-inside:avoid}
.exh{font-size:8.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-bottom:1.4mm}
.ex p{margin:0 0 1.2mm}.ex .res{font-weight:700;margin:2mm 0 0}
/* rủi ro, checklist, hỏi đáp */
.blk{break-inside:avoid;page-break-inside:avoid;margin-bottom:6mm}
.risk{display:flex;gap:4mm;padding:2.4mm 0;border-bottom:.6pt solid #E3E1DC;break-inside:avoid}
.risk b{min-width:58mm}.risk span{flex:1}
.risk .dot{width:2.2mm;height:2.2mm;border-radius:50%;background:#E0242B;margin-top:1.6mm;flex:none}
.ck{display:flex;gap:3mm;padding:1.8mm 0;break-inside:avoid}
.ck .box{width:3.6mm;height:3.6mm;border:.8pt solid #23272D;flex:none;margin-top:.8mm}
.qa{margin:0 0 3mm;break-inside:avoid}.qa .q{font-weight:700}.qa .a{margin:.6mm 0 0}
.legal li{margin:0 0 1.2mm}.legal{padding-left:5mm;margin:0}
.disc{color:#5B626B;font-style:italic;font-size:9.4pt;margin-top:5mm;text-align:left}
.end{margin-top:8mm;border-top:1pt solid #23272D;padding-top:4mm;display:flex;gap:6mm;align-items:center;break-inside:avoid}
.end .sym{width:16mm}.end b{font-size:11pt}
</style></head><body>
<div class="cover">
  <div class="wm">${SYM("#23272D")}</div>
  <div class="top">
    <div class="brand">${SYM()}<div><div class="t">THT</div><div class="s">AUDITING &amp; CONSULTING</div></div></div>
    <div class="num">Số: ${esc(doc.number)}<br>Ngày phát hành: ${esc(doc.date)}</div>
  </div>
  <div class="mid">
    ${BAR("18mm", "1.6mm")}
    <div class="eyebrow" style="margin-top:4mm">${esc(doc.series)} · SỐ ${esc(doc.issue)}</div>
    <h1>${esc(doc.title)}</h1>
    <div class="sub">${esc(doc.subtitle)}</div>
    <div class="tag">${esc(doc.tag)}</div>
  </div>
  <div class="foot">${esc(doc.audience)}<br>${esc(doc.as_of)}</div>
</div>
<div class="keys">
  ${BAR()}<h2>Giám đốc cần nhớ</h2><div class="sm">Đọc 1 phút để nắm các ý chính của chuyên đề.</div>
  ${(doc.key_points || []).map((k, i) => `<div class="key"><div class="n">${String(i + 1).padStart(2, "0")}</div><p>${esc(k)}</p></div>`).join("")}
</div>
${ch}
${doc.risks?.length ? `<div class="blk"><div class="chno">RỦI RO</div><h2>Rủi ro khi áp dụng sai</h2>${doc.risks.map((r) => `<div class="risk"><div class="dot"></div><b>${esc(r.title)}</b><span>${esc(r.text)}</span></div>`).join("")}</div>` : ""}
${doc.checklist?.length ? `<div class="blk"><div class="chno">HÀNH ĐỘNG</div><h2>Việc Giám đốc nên giao cho bộ phận kế toán</h2>${doc.checklist.map((c) => `<div class="ck"><div class="box"></div><div>${esc(c)}</div></div>`).join("")}</div>` : ""}
${doc.faq?.length ? `<div class="ch"><div class="chno">HỎI ĐÁP</div><h2>Câu hỏi thường gặp</h2>${doc.faq.map((f) => `<div class="qa"><div class="q">Hỏi: ${esc(f.q)}</div><p class="a">Đáp: ${esc(f.a)}</p></div>`).join("")}</div>` : ""}
${doc.legal?.length ? `<div class="blk"><div class="chno">CĂN CỨ</div><h2>Căn cứ pháp lý</h2><ul class="legal">${doc.legal.map((l) => `<li><b>${esc(l.doc)}</b>${l.note ? ` – ${esc(l.note)}` : ""}.</li>`).join("")}</ul>
<p class="disc">${esc(doc.disclaimer)}</p>
<div class="end">${SYM()}<div><b>CÔNG TY TNHH KIỂM TOÁN VÀ TƯ VẤN THT</b><br>Tư vấn thuế, kế toán, lao động cho doanh nghiệp · Hotline 0901 144 078 · thtaudit.com.vn<br>Gửi câu hỏi cho THT: form.thtaudit.com.vn</div></div></div>` : ""}
<script>(async function(){try{await document.fonts.ready}catch(e){}document.body.setAttribute('data-ready','1');})();</script>
</body></html>`.replace("</style>", (doc.theme === "noir" ? NOIR_PDF : "") + "</style>");
}

// Mẫu "đen – vàng – trắng" (doc.theme = "noir"): bìa và trang tóm tắt nền đen, nhấn vàng; trang nội dung nền trắng để in rõ
const K = "#111111", G = "#F7A933", GT = "#9A6B00";
const NOIR_PDF = `
.bar i{background:${G}!important}
.cover{background:${K};color:#fff;padding:14mm 14mm 10mm}
.cover .wm path,.cover .wm rect{fill:#fff}.cover .wm{opacity:.06}
.cover .brand .s{border-color:#fff}.cover .num,.cover .sub,.cover .foot{color:#BDBDBD}.cover .foot{border-color:#333}
.cover .eyebrow{color:${G}}.cover .tag{border-color:${G};color:${G}}
.cover h1 b,.gold{color:${G}}
.keys{background:${K};color:#fff;padding:12mm 12mm 6mm;min-height:247mm}
.keys h2{color:#fff;border-bottom:2pt solid ${G}}.keys .sm{color:#BDBDBD}
.key{border-color:#2E2E2E}.key .n{color:${G}}
.chno{color:${GT}}
h2{border-bottom:2pt solid ${K}}
th{background:${K};color:${G};border-bottom:0}
.ex{background:${K};color:#fff;border-top:2pt solid ${G}}.ex .exh,.ex .res{color:${G}}
.risk .dot{background:${G}}.ck .box{border-color:${K}}
.end{background:${K};color:#fff;padding:5mm 6mm;border-top:0}
`;
export const handbookFooter = (theme, base) => theme === "noir" ? base.replace(/#009A57|#E0242B/g, G) : base;

// ---------------- 2. Bộ ảnh 4:5 cho Facebook ----------------
const CARD_CSS = `*{box-sizing:border-box}html,body{margin:0}
body{width:1080px;height:1350px;font-family:${FONT};color:#23272D;background:#fff;position:relative;overflow:hidden}
.bar{display:flex}.bar i{flex:1;display:block}.sym{display:block}
.pad{position:absolute;inset:0;padding:96px 88px 0}
.hd{display:flex;justify-content:space-between;align-items:center;font-size:24px;letter-spacing:.18em;font-weight:700;color:#5B626B}
.hd .l{display:flex;align-items:center;gap:16px}.hd .sym{width:52px}
h1{font-size:64px;line-height:1.16;letter-spacing:-.015em;margin:28px 0 0}
h2{font-size:54px;line-height:1.18;letter-spacing:-.01em;margin:26px 0 36px}
.eb{font-size:24px;font-weight:700;letter-spacing:.2em;color:#8A5200;margin-top:56px}
.ft{position:absolute;left:88px;right:88px;bottom:64px;display:flex;justify-content:space-between;align-items:center;font-size:24px;color:#5B626B;border-top:2px solid #E3E1DC;padding-top:24px}
.ft b{color:#23272D}
.li{display:flex;gap:26px;padding:24px 0;border-bottom:2px solid #E3E1DC;font-size:33px;line-height:1.38}
.li .n{font-weight:700;color:#8A5200;min-width:56px;font-size:36px}
table{width:100%;border-collapse:collapse;font-size:30px;line-height:1.35}
th{text-align:left;font-size:22px;letter-spacing:.1em;text-transform:uppercase;color:#5B626B;border-bottom:3px solid #23272D;padding:14px 12px}
td{border-bottom:2px solid #E3E1DC;padding:20px 12px;vertical-align:top}td:first-child{font-weight:700;width:38%}
.note{font-size:28px;color:#5B626B;margin-top:30px;line-height:1.4}
.ex{background:#F6F5F2;border-top:6px solid #F7A933;padding:34px 40px;font-size:32px;line-height:1.42}
.ex p{margin:0 0 16px}.ex .r{font-weight:700;margin-top:24px}
.wm{position:absolute;right:-220px;top:-200px;width:620px;opacity:.04}`;
const NOIR_LIGHT = `.bar i{background:${G}!important}.eb{color:${GT}}.hd{color:${K}}
.li .n{background:${G};color:${K};border-radius:8px;text-align:center;min-width:64px;height:58px;line-height:58px;font-size:30px!important;flex:none}
th{background:${K};color:${G};border-bottom:0}h2{color:${K}}.rd{background:${G}!important}.ft b{color:${K}}`;
const NOIR_DARK = `body{background:${K};color:#fff}.bar i{background:${G}!important}.eb{color:${G}}.hd,.ft{color:#BDBDBD}.ft{border-color:#2E2E2E}.ft b{color:#fff}
.li{border-color:#2E2E2E}.li .n{color:${G}}.li span{color:#BDBDBD!important}
td{border-color:#2E2E2E}th{color:${G};border-color:${G}}.note{color:#BDBDBD}
.ex{background:#1C1C1C;color:#fff;border-top-color:${G}}.ex .r{color:${G}}.rd{background:${G}!important}.sub{color:#BDBDBD!important}`;
const cardShell = (doc, i, n, inner, dark = false) => {
  const noir = doc.theme === "noir";
  const css = noir ? (dark ? NOIR_DARK : NOIR_LIGHT) : (dark ? "body{background:#23272D;color:#fff}.hd,.ft{color:#C9CDD2}.ft{border-color:#3A3F46}.ft b{color:#fff}" : "");
  const logo = noir ? SYM(dark ? G : K) : SYM(dark ? "#fff" : null);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${CARD_CSS}
${css}</style></head><body>
<div class="pad">
<div class="hd"><div class="l">${logo}<span>${esc(doc.series)}</span></div><span>${esc(doc.tag)}</span></div>
${inner}
</div>
<div class="ft"><span><b>THT Audit</b> · thtaudit.com.vn</span><span>${i}/${n}</span></div>
<script>(function(){var pad=document.querySelector('.pad'),lim=document.querySelector('.ft').offsetTop-28,k=1,last=pad.lastElementChild;
for(var t=0;t<14&&last&&last.getBoundingClientRect().bottom>lim;t++){k*=0.94;document.querySelectorAll('.li,.ex,table,.note').forEach(function(e){e.style.fontSize=(parseFloat(getComputedStyle(e).fontSize)*0.94)+'px'});document.querySelectorAll('.li').forEach(function(e){e.style.paddingTop=e.style.paddingBottom=(parseFloat(getComputedStyle(e).paddingTop)*0.9)+'px'})}
document.body.setAttribute('data-ready','1')})();</script>
</body></html>`;
};

export function handbookCards(doc) {
  const cards = doc.cards || [];
  const n = cards.length;
  const D = (kind) => doc.theme === "noir" && ["keys", "example", "risks"].includes(kind);
  return cards.map((c, k) => {
    const i = k + 1;
    if (c.kind === "cover") return cardShell(doc, i, n, `<div style="margin-top:210px">${BAR("120px", "10px")}</div>
      <div class="eb">SỐ ${esc(doc.issue)} · ${esc(doc.date)}</div>
      <h1 style="font-size:72px">${esc(doc.title)}</h1>
      <div class="sub" style="font-size:34px;line-height:1.42;color:#5B626B;margin-top:34px">${esc(doc.subtitle)}</div>
      <div style="font-size:28px;margin-top:64px;font-weight:700">Lướt sang để xem →</div>`, doc.theme === "noir");
    if (c.kind === "keys") return cardShell(doc, i, n, `<div class="eb">TÓM TẮT</div><h2>${esc(c.title)}</h2>
      ${(doc.key_points_short || doc.key_points || []).slice(0, 7).map((t, j) => `<div class="li" style="font-size:30px;padding:18px 0"><div class="n" style="font-size:30px">${String(j + 1).padStart(2, "0")}</div><div>${esc(t)}</div></div>`).join("")}`, D("keys"));
    if (c.kind === "table") {
      const ch = doc.chapters[c.chapter];
      return cardShell(doc, i, n, `<div class="eb">PHẦN ${c.chapter + 1}</div><h2>${esc(c.title || ch.heading)}</h2>${table(ch.table, c.cols)}${c.note ? `<div class="note">${esc(c.note)}</div>` : ""}`);
    }
    if (c.kind === "bullets") return cardShell(doc, i, n, `<div class="eb">${esc(c.eyebrow || "CHUYÊN ĐỀ")}</div><h2>${esc(c.title)}</h2>
      ${c.bullets.map((t, j) => `<div class="li"><div class="n">${String(j + 1).padStart(2, "0")}</div><div>${esc(t)}</div></div>`).join("")}`);
    if (c.kind === "example") {
      const ex = doc.chapters[c.chapter].example;
      return cardShell(doc, i, n, `<div class="eb">VÍ DỤ TÍNH THUẾ</div><h2>${esc(doc.chapters[c.chapter].heading)}</h2>
        <div class="ex">${ex.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${ex.result ? `<p class="r">${esc(ex.result)}</p>` : ""}</div>`, D("example"));
    }
    if (c.kind === "risks") return cardShell(doc, i, n, `<div class="eb">RỦI RO</div><h2>${esc(c.title)}</h2>
      ${(doc.risks || []).map((r) => `<div class="li"><div class="rd" style="width:18px;height:18px;border-radius:50%;background:#E0242B;margin-top:14px;flex:none"></div><div><b>${esc(r.title)}</b><br><span style="color:#5B626B">${esc(r.text)}</span></div></div>`).join("")}`, D("risks"));
    if (c.kind === "checklist") return cardShell(doc, i, n, `<div class="eb">HÀNH ĐỘNG</div><h2>${esc(c.title)}</h2>
      ${(c.items || doc.checklist || []).slice(0, c.limit || 6).map((t) => `<div class="li"><div style="width:34px;height:34px;border:3px solid #23272D;flex:none;margin-top:4px"></div><div>${esc(t)}</div></div>`).join("")}`);
    if (c.kind === "end") return cardShell(doc, i, n, `<div style="margin-top:220px">${BAR("120px", "10px")}</div>
      <h1 style="color:#fff">Cần áp dụng cho doanh nghiệp của bạn?</h1>
      <div style="font-size:34px;line-height:1.45;color:#C9CDD2;margin-top:36px">THT hỗ trợ rà soát điều kiện ưu đãi thuế và tư vấn phương án có lợi nhất cho doanh nghiệp.</div>
      <div style="margin-top:70px;font-size:36px;line-height:1.7"><b>Hotline:</b> 0901 144 078<br><b>Website:</b> thtaudit.com.vn<br><b>Gửi câu hỏi:</b> form.thtaudit.com.vn</div>
      <div style="margin-top:60px;font-size:24px;color:#C9CDD2">Tài liệu đầy đủ: ${esc(doc.number)} · ${esc(doc.as_of)}</div>`, true);
    return "";
  }).filter(Boolean);
}
