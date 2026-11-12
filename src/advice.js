// Tư vấn theo yêu cầu: anh nêu vấn đề (/tuvan …) → Agent tra cứu nguồn chính thức → anh chọn:
//   ✉️ Thư tư vấn CHUNG gửi mọi khách hàng ("Kính gửi: Quý Khách hàng"), PDF tối đa 2 trang A4 (ưu tiên 1 trang), letterhead THT
//      → bản nháp → anh duyệt → cấp số, lưu kho Thư tư vấn, tự đồng bộ sang My THT (gửi email theo danh sách KH ở đó)
//   🖼 Poster – đi tiếp luồng bản tin như cũ (duyệt rồi đăng các kênh)
import { claude, modelFor } from "./claude.js";
import { AGENT_DOMAINS } from "./agent.js";
import { viewer, same } from "./hub.js";

const VN = 7 * 3600e3;
const vnNow = () => new Date(Date.now() + VN);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------- 1. Tra cứu + soạn nội dung ----------------
const ADVICE_TOOL = {
  name: "advice",
  description: "Nội dung thư tư vấn gửi khách hàng (ưu tiên 1 trang, tối đa 2 trang A4)",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "V/v ngắn gọn, ≤ 14 từ, vd 'Thuế GTGT đối với hoạt động cho thuê nhà của cá nhân'" },
      question: { type: "string", description: "Nêu vấn đề nhiều doanh nghiệp đang quan tâm, 1–2 câu, văn phong trang trọng (thư gửi chung mọi khách hàng)" },
      conclusion: { type: "string", description: "Kết luận trả lời thẳng câu hỏi, ≤ 60 từ, có con số/thời hạn nếu có" },
      analysis: { type: "array", maxItems: 5, description: "Phân tích, mỗi ý ngắn gọn (thường ≤ 80 từ), dẫn đúng điều/khoản",
        items: { type: "object", properties: { heading: { type: "string", description: "≤ 8 từ" }, text: { type: "string" } }, required: ["heading", "text"] } },
      legal_basis: { type: "array", minItems: 1, maxItems: 8, description: "Căn cứ pháp lý đang có hiệu lực",
        items: { type: "object", properties: {
          doc: { type: "string", description: "Tên đầy đủ: loại văn bản + số hiệu + ngày ban hành + cơ quan, vd 'Nghị định 70/2025/NĐ-CP ngày 20/3/2025 của Chính phủ'" },
          article: { type: "string", description: "Điều/khoản/điểm áp dụng, vd 'Điều 4, khoản 2'" },
          url: { type: "string", description: "Link nguồn đã đọc, rỗng nếu không có" } }, required: ["doc", "article"] } },
      recommendations: { type: "array", maxItems: 5, items: { type: "string" }, description: "Việc Quý khách nên làm, mỗi ý ≤ 30 từ" },
      caveat: { type: "string", description: "Giới hạn/điều kiện của ý kiến tư vấn, ≤ 40 từ" },
      uncertain: { type: "array", items: { type: "string" }, maxItems: 4, description: "Điểm em CHƯA chắc hoặc cần anh kiểm tra lại (chỉ báo nội bộ, không in vào thư)" },
    },
    required: ["subject", "question", "conclusion", "analysis", "legal_basis", "recommendations", "caveat"],
  },
};

export async function researchAdvice(env, question) {
  const today = vnNow().toISOString().slice(0, 10).split("-").reverse().join("/");
  const system = `Bạn là chuyên gia tư vấn thuế – kế toán – kiểm toán của Công ty TNHH Kiểm toán và Tư vấn THT. Hôm nay ${today}.
Nhiệm vụ: viết một THƯ TƯ VẤN CHUNG gửi qua email tới tất cả khách hàng của THT (kính gửi "Quý Khách hàng", không nêu tên doanh nghiệp cụ thể), ngắn gọn – ưu tiên 1 trang, tối đa 2 trang A4 – về vấn đề dưới đây.
- Dùng web_search (tối đa ${env.ADVICE_SEARCH_MAX || 8} lượt) để tìm văn bản pháp luật ĐANG CÓ HIỆU LỰC trên trang chính thức. Có thể đọc thuvienphapluat.vn / luatvietnam.vn để tra văn bản hợp nhất, nhưng phải ghi số hiệu văn bản gốc.
- Kiểm tra văn bản đã bị thay thế/sửa đổi chưa (đặc biệt quy định thay đổi từ 2025–2026). Ưu tiên văn bản mới nhất.
- Mỗi kết luận phải có căn cứ: số hiệu, ngày, điều/khoản. Không bịa số hiệu, không bịa con số. Điểm nào không chắc thì đưa vào 'uncertain', không đưa vào thư.
- Văn phong: trang trọng, xưng "THT" – gọi "Quý Khách hàng", câu ngắn, dễ hiểu với chủ doanh nghiệp; nội dung áp dụng chung, nếu khác nhau theo loại hình (DN, hộ kinh doanh, cá nhân) thì nêu rõ từng trường hợp.
- Ưu tiên ngắn gọn: thường 350–450 từ (1 trang); chỉ khi vấn đề phức tạp mới viết dài hơn, tối đa khoảng 800 từ (2 trang).
Gọi công cụ advice đúng một lần.`;
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: Number(env.ADVICE_SEARCH_MAX || 8), allowed_domains: [...AGENT_DOMAINS, "thuvienphapluat.vn", "luatvietnam.vn"] },
    ADVICE_TOOL,
  ];
  let messages = [{ role: "user", content: `Vấn đề cần tư vấn: ${question}` }];
  for (let turn = 0; turn < 4; turn++) {
    const msg = await claude(env, { model: modelFor(env, env.ADVICE_QUALITY || "strong"), max_tokens: 16000, system, tools, messages });
    const rep = msg.content.find((b) => b.type === "tool_use" && b.name === "advice")?.input;
    if (rep) return rep;
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: "Gọi công cụ advice ngay với những gì đã tra được." });
    const fin = await claude(env, { model: modelFor(env, env.ADVICE_QUALITY || "strong"), max_tokens: 12000, system, tools: [ADVICE_TOOL], tool_choice: { type: "tool", name: "advice" }, messages });
    const r2 = fin.content.find((b) => b.type === "tool_use")?.input;
    if (r2) return r2;
  }
  throw new Error("Không tổng hợp được nội dung tư vấn");
}

// Sửa nội dung thư theo yêu cầu của anh (không tra cứu lại, giữ căn cứ đã có trừ khi anh yêu cầu)
export async function reviseAdvice(env, adv, instruction) {
  const { id, chat, ask, created_at, number, approved, poster_job, dropped, ...content } = adv;
  const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 12000,
    system: "Bạn biên tập thư tư vấn chung của Công ty TNHH Kiểm toán và Tư vấn THT gửi Quý Khách hàng. Sửa nội dung theo yêu cầu, giữ đúng căn cứ pháp lý (không bịa số hiệu), giữ ngắn gọn (ưu tiên 1 trang, tối đa 2 trang A4 – khoảng 800 từ). Gọi công cụ advice với toàn bộ nội dung sau khi sửa.",
    tools: [ADVICE_TOOL], tool_choice: { type: "tool", name: "advice" },
    messages: [{ role: "user", content: `Nội dung hiện tại:\n${JSON.stringify(content)}\n\nYêu cầu sửa: ${instruction}` }] });
  const r = msg.content.find((b) => b.type === "tool_use")?.input;
  if (!r) throw new Error("Không sửa được nội dung thư");
  return r;
}

// Văn bản nguồn để soạn poster từ cùng nội dung tư vấn
export function adviceSource(a) {
  return [
    `Chủ đề: ${a.subject}`, `Vấn đề: ${a.question}`, `Kết luận: ${a.conclusion}`,
    ...(a.analysis || []).map((x) => `- ${x.heading}: ${x.text}`),
    "Căn cứ pháp lý:", ...(a.legal_basis || []).map((b) => `- ${b.doc}, ${b.article}${b.url ? " – " + b.url : ""}`),
    "Khuyến nghị:", ...(a.recommendations || []).map((x) => `- ${x}`), "",
    "Đây là nội dung tư vấn THT vừa tra cứu theo yêu cầu. Soạn bản tin poster dựa trên nội dung trên; giữ đúng số hiệu, điều khoản; ý nào không chắc thì bỏ.",
  ].join("\n");
}

// Tóm tắt gửi Telegram để anh chọn đầu ra
export function adviceSummary(a) {
  return [
    `📋 Tư vấn: ${a.subject}`, "", `✅ ${a.conclusion}`, "",
    "📚 Căn cứ:", ...(a.legal_basis || []).map((b) => `• ${b.doc} – ${b.article}`),
    a.uncertain?.length ? "\n❓ Anh kiểm tra lại:\n" + a.uncertain.map((x) => `• ${x}`).join("\n") : "",
    "\nChọn đầu ra:",
  ].filter((x) => x !== "").join("\n");
}

// ---------------- 2. Thư tư vấn PDF (letterhead THT 2026) ----------------
const LOGO = `<svg viewBox="0 0 561 498" class="sym" aria-label="THT"><path fill="#F7A933" fill-rule="evenodd" d="M0 0H561V498H0Z M73 54V444H488V54Z"/><rect fill="#F7A933" x="72" y="222" width="417" height="54"/><rect fill="#009A57" x="244" y="53" width="73" height="170"/><rect fill="#E0242B" x="244" y="275" width="73" height="170"/><polygon fill="#009A57" points="0,0 561,0 488,54 73,54"/><polygon fill="#E0242B" points="0,498 561,498 488,444 73,444"/></svg>`;

const FONT = "Arial, 'Liberation Sans', Helvetica, sans-serif";

// Thư: chữ Arial 11pt, canh đều, không thu nhỏ chữ; dài thì sang trang 2 (tối đa 2 trang).
// Letterhead ở đầu trang 1; chân trang (2 văn phòng + số trang) lặp ở mọi trang qua footerTemplate của PDF.
export function letterHtml(env, a, meta) {
  const d = vnNow();
  const place = env.LETTER_PLACE || "Đà Nẵng";
  const title = env.LETTER_SIGNER_TITLE || "GIÁM ĐỐC";
  const name = env.LETTER_SIGNER_NAME || "";
  const analysis = (a.analysis || []).map((x, i) => `<p><b>${i + 1}. ${esc(x.heading)}.</b> ${esc(x.text)}</p>`).join("");
  const basis = (a.legal_basis || []).map((b) => `<li>${esc(b.doc)}${b.article ? ` – ${esc(b.article)}` : ""}.</li>`).join("");
  const recs = (a.recommendations || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>
@page{size:A4;margin:14mm 20mm 30mm 20mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:${FONT};font-size:11pt;line-height:1.5;color:#23272D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;justify-content:space-between;align-items:flex-start}
.brand{display:flex;align-items:center;gap:4mm}
.sym{height:17mm;width:auto;display:block}
.wm{display:flex;flex-direction:column}
.wm .t{font-size:30pt;font-weight:400;letter-spacing:.16em;line-height:1;margin-right:-.16em}
.wm .rule{height:.6pt;background:#23272D;margin:1.6mm 0 1.2mm}
.wm .s{font-size:6.6pt;letter-spacing:.14em}
.co{text-align:right;font-size:8.6pt;line-height:1.55}
.co b{font-size:9.2pt}
.co i{color:#5B626B}.co span{color:#5B626B}
.hr{height:.8pt;background:#23272D;margin:7mm 0 5mm}
.meta{display:flex;justify-content:space-between;color:#5B626B}
.vv{color:#5B626B;margin-top:1mm}
.to{margin:5mm 0 3mm}
.body{text-align:justify;hyphens:none}
.body p{margin:0 0 2.6mm}
.body h3{font-size:11pt;font-weight:700;margin:3.6mm 0 1.4mm;page-break-after:avoid;break-after:avoid}
.body ul{margin:0 0 2.4mm;padding-left:6mm}.body li{margin:0 0 1mm}
.concl{border-top:1.6pt solid #F7A933;padding-top:1.8mm;margin:1mm 0 3mm}
.cav{color:#5B626B;font-style:italic;font-size:10pt}
.sign{display:flex;justify-content:flex-end;margin-top:3mm;break-inside:avoid;page-break-inside:avoid}
.sign .r{text-align:center;min-width:75mm}
.sign .r .n{margin-top:20mm;font-weight:700}
</style></head><body>
  <div class="hd">
    <div class="brand">${LOGO}<div class="wm"><div class="t">THT</div><div class="rule"></div><div class="s">AUDITING &amp; CONSULTING</div></div></div>
    <div class="co"><b>CÔNG TY TNHH KIỂM TOÁN VÀ TƯ VẤN THT</b><br><i>THT Auditing &amp; Consulting Co., Ltd</i><br><span>thtaudit.com.vn</span></div>
  </div>
  <div class="hr"></div>
  <div class="meta"><div>Số: ${esc(meta.number)}</div><div>${esc(place)}, ngày ${d.getUTCDate()} tháng ${d.getUTCMonth() + 1} năm ${d.getUTCFullYear()}</div></div>
  <div class="vv">V/v: ${esc(a.subject)}</div>
  <div class="to"><b>Kính gửi:</b> Quý Khách hàng</div>
  <div class="body">
    <p>Công ty TNHH Kiểm toán và Tư vấn THT trân trọng cảm ơn Quý Khách hàng đã tin tưởng đồng hành. ${esc(a.question)} THT xin gửi Quý Khách hàng một số lưu ý như sau:</p>
    <div class="concl"><b>Kết luận:</b> ${esc(a.conclusion)}</div>
    ${analysis}
    <h3>Căn cứ pháp lý</h3><ul>${basis}</ul>
    ${recs ? `<h3>Khuyến nghị</h3><ul>${recs}</ul>` : ""}
    ${a.caveat ? `<p class="cav">${esc(a.caveat)} Ý kiến căn cứ quy định có hiệu lực tại ngày lập thư.</p>` : ""}
    <p>Nếu cần trao đổi thêm cho trường hợp cụ thể của doanh nghiệp mình, Quý Khách hàng vui lòng liên hệ THT. Trân trọng.</p>
    <div class="sign"><div class="r"><b>CÔNG TY TNHH KIỂM TOÁN VÀ TƯ VẤN THT</b><br>${esc(title)}<div class="n">${esc(name)}</div></div></div>
  </div>
<script>(async function(){try{await document.fonts.ready}catch(e){}document.body.setAttribute('data-ready','1');})();</script>
</body></html>`;
}

// Chân trang lặp ở mọi trang (Chromium footerTemplate: chỉ dùng style nội dòng)
export const LETTER_FOOTER = `<div style="width:100%;padding:0 20mm;font-family:${FONT};font-size:7.4pt;line-height:1.5;color:#5B626B;-webkit-print-color-adjust:exact;print-color-adjust:exact">
<div style="display:flex;align-items:center;gap:3mm"><div style="display:flex;width:12mm;height:1.2mm"><div style="flex:1;background:#F7A933"></div><div style="flex:1;background:#009A57"></div><div style="flex:1;background:#E0242B"></div></div><div style="flex:1;height:.4pt;background:#E3E1DC"></div><div style="color:#5B626B">Trang <span class="pageNumber"></span>/<span class="totalPages"></span></div></div>
<div style="display:flex;gap:10mm;margin-top:2.4mm">
<div style="flex:1"><span style="display:inline-block;width:1mm;height:2.6mm;background:#009A57;margin-right:1.6mm;vertical-align:-0.3mm"></span><b style="color:#23272D;letter-spacing:.06em">TRỤ SỞ CHÍNH</b> <i>/ Head Office</i><br>25 Hoàng Hoa Thám, Phường Gia Định, TP. Hồ Chí Minh<br>T: +84 28 3517 8796 · E: tht@thtaudit.com.vn</div>
<div style="flex:1"><span style="display:inline-block;width:1mm;height:2.6mm;background:#E0242B;margin-right:1.6mm;vertical-align:-0.3mm"></span><b style="color:#23272D;letter-spacing:.06em">CHI NHÁNH ĐÀ NẴNG</b> <i>/ Da Nang Branch</i><br>312 Lê Đại Hành, Phường Cẩm Lệ, TP. Đà Nẵng<br>T: +84 901 144 078 · E: danang@thtaudit.com.vn</div>
</div></div>`;
export const LETTER_PDF_OPTIONS = {
  format: "a4", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: LETTER_FOOTER,
  margin: { top: "14mm", right: "20mm", bottom: "30mm", left: "20mm" },
};

export async function htmlToPdf(env, html) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) throw new Error("Chưa cấu hình CF_ACCOUNT_ID / CF_API_TOKEN cho Browser Rendering");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      html,
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      waitForSelector: { selector: "body[data-ready]", timeout: 15000 },
      pdfOptions: LETTER_PDF_OPTIONS,
    }),
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.includes("pdf")) {
    let msg = res.status;
    try { const j = await res.json(); msg = j.errors?.[0]?.message || JSON.stringify(j).slice(0, 200); } catch (_) {}
    throw new Error(`Không tạo được PDF: ${msg}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------- 3. Kho Thư tư vấn (D1 + R2) và đồng bộ sang My THT ----------------
async function ensure(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY, number TEXT, subject TEXT, recipient TEXT, question TEXT,
    pdf_key TEXT, data TEXT, mytht TEXT, created_at TEXT, approved_at TEXT, synced INTEGER DEFAULT 0)`).run();
  for (const col of ["approved_at TEXT", "synced INTEGER DEFAULT 0"]) {
    try { await env.DB.prepare(`ALTER TABLE letters ADD COLUMN ${col}`).run(); } catch (_) {} // đã có cột
  }
}

export async function nextLetterNumber(env, kvGet, kvSet) {
  const y = vnNow().getUTCFullYear();
  const n = Number((await kvGet(env, `letter:seq:${y}`)) || 0) + 1;
  await kvSet(env, `letter:seq:${y}`, String(n));
  return `${String(n).padStart(3, "0")}/${y}/THT-TV`;
}

// Chỉ thư ĐÃ DUYỆT mới được lưu vào kho
export async function saveLetter(env, letter, pdf) {
  await ensure(env);
  const key = `letters/${letter.id}.pdf`;
  await env.FILES.put(key, pdf, { httpMetadata: { contentType: "application/pdf" } });
  await env.DB.prepare(`INSERT INTO letters (id, number, subject, recipient, question, pdf_key, data, mytht, created_at, approved_at, synced) VALUES (?1,?2,?3,'',?4,?5,?6,'',?7,?8,0)
    ON CONFLICT(id) DO UPDATE SET number=?2, subject=?3, question=?4, pdf_key=?5, data=?6, approved_at=?8, synced=0`)
    .bind(letter.id, letter.number, letter.subject, letter.question || "", key, JSON.stringify(letter.data || {}), letter.created_at, letter.approved_at).run();
  return key;
}

export const letterFileName = (l) => `THT_Thu-tu-van_${l.number.replace(/\//g, "-")}.pdf`;

const b64 = (bytes) => { let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };

// Đẩy 1 thư đã duyệt sang My THT: POST {MYTHT_URL}/api/tvl_letter_put, header x-tht-key = MYTHT_KEY
async function pushToMyTHT(env, letter, pdf) {
  // Worker gọi Worker cùng tài khoản qua *.workers.dev bị Cloudflare chặn (lỗi 530/1042) → dùng Service Binding "MYTHT" nếu có
  const url = `${(env.MYTHT_URL || "https://mytht.internal").replace(/\/$/, "")}/api/tvl_letter_put`;
  const call = env.MYTHT && typeof env.MYTHT.fetch === "function" ? (u, o) => env.MYTHT.fetch(new Request(u, o)) : fetch;
  const res = await call(url, {
    method: "POST", headers: { "content-type": "application/json", "x-tht-key": env.MYTHT_KEY },
    body: JSON.stringify({
      id: letter.id, number: letter.number, subject: letter.subject, question: letter.question || "",
      created_at: letter.created_at, approved_at: letter.approved_at,
      conclusion: letter.data?.conclusion || "", legal_basis: letter.data?.legal_basis || [], recommendations: letter.data?.recommendations || [],
      email: emailTemplate(letter),
      file: { name: letterFileName(letter), type: "application/pdf", base64: b64(pdf) },
    }),
  });
  const raw = await res.text();
  let j = {}; try { j = JSON.parse(raw); } catch (_) {}
  if (!res.ok || j.ok === false) {
    const code = (raw.match(/error code:?\s*(\d{4})/i) || [])[1];
    const hint = code === "1042" || res.status === 530 ? " – Cloudflare chặn worker gọi worker qua workers.dev, cần Service Binding MYTHT"
      : res.status === 404 ? " – My THT chưa có route /api/tvl_letter_put" : res.status === 401 || res.status === 403 ? " – sai khoá MYTHT_KEY / TVL_KEY" : "";
    throw new Error(`${j.error || `HTTP ${res.status}`}${code ? ` (mã ${code})` : ""}${hint}`);
  }
}

// Tiêu đề + lời gửi email mẫu (My THT dùng khi gửi theo danh sách khách hàng)
export function emailTemplate(l) {
  const vv = l.subject.charAt(0).toLowerCase() + l.subject.slice(1);
  return {
    subject: `[THT] Thư tư vấn số ${l.number} – V/v: ${l.subject}`,
    body: `Kính gửi Quý Khách hàng,\n\nCông ty TNHH Kiểm toán và Tư vấn THT trân trọng gửi Quý Khách hàng Thư tư vấn số ${l.number} về việc ${vv} (đính kèm).\n\nNếu cần trao đổi thêm cho trường hợp cụ thể của doanh nghiệp mình, Quý Khách hàng vui lòng phản hồi email này hoặc liên hệ THT.\n\nTrân trọng,\nCông ty TNHH Kiểm toán và Tư vấn THT\nthtaudit.com.vn`,
  };
}

// Đồng bộ ngay sau khi duyệt; lỗi thì cron 15 phút tự gửi lại (retryLetterSync)
export async function syncLetter(env, letter, pdf) {
  if ((!env.MYTHT_URL && !env.MYTHT) || !env.MYTHT_KEY) return "đã lưu kho Thư tư vấn – My THT sẽ tự lấy về khi bật đồng bộ (chưa đặt MYTHT_URL/MYTHT_KEY)";
  try {
    await pushToMyTHT(env, letter, pdf);
    await env.DB.prepare("UPDATE letters SET synced = 1, mytht = ? WHERE id = ?").bind(`đã lưu vào My THT ${new Date().toISOString()}`, letter.id).run();
    return "đã lưu vào My THT";
  } catch (e) {
    await env.DB.prepare("UPDATE letters SET mytht = ? WHERE id = ?").bind(`lỗi: ${e.message}`.slice(0, 300), letter.id).run();
    return `chưa lưu được vào My THT (${e.message}) – em sẽ tự thử lại mỗi 15 phút`;
  }
}

export async function retryLetterSync(env) {
  if ((!env.MYTHT_URL && !env.MYTHT) || !env.MYTHT_KEY) return;
  await ensure(env);
  const rows = (await env.DB.prepare("SELECT * FROM letters WHERE approved_at IS NOT NULL AND (synced IS NULL OR synced = 0) ORDER BY approved_at LIMIT 5").all()).results || [];
  for (const r of rows) {
    const obj = await env.FILES.get(r.pdf_key);
    if (!obj) continue;
    const pdf = new Uint8Array(await obj.arrayBuffer());
    await syncLetter(env, { ...r, data: JSON.parse(r.data || "{}") }, pdf);
  }
}

// API kho thư (chỉ thư đã duyệt):
//   GET /hub/api/letters?q=&since=ISO  → { letters:[{id, number, subject, question, approved_at, pdf_url, email:{subject, body}, ...}] }
//   GET /hub/api/letters/<id>.pdf      → file PDF
//   POST /hub/api/letters/<id>/synced  → My THT báo đã lấy về (khi dùng cách kéo)
// Người xem: mật khẩu ứng dụng hoặc phiên Hub; máy chủ My THT: x-hub-key = HUB_KEY
export async function letterRoutes(request, env, url) {
  const key = request.headers.get("x-hub-key");
  const ok = (key && same(key, env.HUB_KEY || env.INTERNAL_KEY)) || (await viewer(request, env));
  if (!ok) return new Response(JSON.stringify({ error: "Cần đăng nhập" }), { status: 401, headers: { "content-type": "application/json" } });
  await ensure(env);
  const J = (d) => new Response(JSON.stringify(d), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  const m = url.pathname.match(/^\/hub\/api\/letters\/([A-Za-z0-9-]+)\.pdf$/);
  if (m) {
    const r = await env.DB.prepare("SELECT * FROM letters WHERE id = ?").bind(m[1]).first();
    const obj = r && (await env.FILES.get(r.pdf_key));
    if (!obj) return new Response("not found", { status: 404 });
    return new Response(obj.body, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${letterFileName(r)}"` } });
  }
  const s = url.pathname.match(/^\/hub\/api\/letters\/([A-Za-z0-9-]+)\/synced$/);
  if (s && request.method === "POST") {
    await env.DB.prepare("UPDATE letters SET synced = 1, mytht = ? WHERE id = ?").bind(`đã lưu vào My THT ${new Date().toISOString()}`, s[1]).run();
    return J({ ok: true });
  }
  const q = (url.searchParams.get("q") || "").trim(), since = url.searchParams.get("since") || "";
  let sql = "SELECT id, number, subject, question, data, mytht, synced, created_at, approved_at FROM letters WHERE approved_at IS NOT NULL";
  const args = [];
  if (q) { sql += " AND (subject LIKE ? OR question LIKE ? OR number LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (since) { sql += " AND approved_at > ?"; args.push(since); }
  sql += " ORDER BY approved_at DESC LIMIT 200";
  const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  const base = env.PUBLIC_BASE_URL || url.origin;
  return J({ letters: rows.map(({ data, ...r }) => {
    const d = JSON.parse(data || "{}");
    return { ...r, synced: !!r.synced, conclusion: d.conclusion || "", legal_basis: d.legal_basis || [], pdf_url: `${base}/hub/api/letters/${r.id}.pdf`, file_name: letterFileName(r), email: emailTemplate(r) };
  }) });
}
