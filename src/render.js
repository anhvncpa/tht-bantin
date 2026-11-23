// Server-side poster rendering with Cloudflare Browser Rendering (REST screenshot endpoint).
import "../public/qr.js";
import "../public/templates.js";

const { STYLES, renderPage, pageCount, fontsHref } = globalThis.THTTemplates;
const A4W = 794, A4H = 1123;

export const brandOf = (env) => ({
  phone: env.THT_PHONE || "0901 144 078",
  emails: (env.THT_EMAILS || "tht@thtaudit.com.vn,danang@thtaudit.com.vn").split(",").map((s) => s.trim()),
  website: env.THT_WEBSITE || "thtaudit.com.vn",
  offices: (env.THT_OFFICES || "Trụ sở TP.HCM: 25 Hoàng Hoa Thám, P. Gia Định · (028) 3517 8796|Chi nhánh Đà Nẵng: 312 Lê Đại Hành, P. Cẩm Lệ · 0901 144 078").split("|").map((s) => s.trim()).filter(Boolean),
});

function opts(env, qrUrl) {
  const d = new Date(Date.now() + 7 * 3600e3); // Asia/Ho_Chi_Minh
  return {
    brand: brandOf(env),
    month: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`,
    date: `Ngày ${d.getUTCDate()} tháng ${d.getUTCMonth() + 1} năm ${d.getUTCFullYear()}`,
    bilingual: env.BILINGUAL !== "0",
    qr: qrUrl ? (size, color) => globalThis.THTQR.svg(qrUrl, size, color) : null,
  };
}

// The page fits itself to A4 (zoom down to 72%) once fonts are loaded, then flags body[data-ready].
const FIT_SCRIPT = `<script>(async function(){try{await document.fonts.ready}catch(e){}
var p=document.getElementById('poster');p.style.height='auto';var h=p.scrollHeight;p.style.height='${A4H}px';
if(h>${A4H}){var z=Math.max(.72,${A4H}/h);p.style.zoom=z;p.style.width=(${A4W}/z)+'px';p.style.height=(${A4H}/z)+'px';}
document.body.setAttribute('data-fit',String(h));document.body.setAttribute('data-ready','1');})();</script>`;

// Phong cách xu hướng tuần: giữ bố cục mẫu THT (nền sáng 1/2/4/5), thay màu nhấn + font tiêu đề
// Mẫu 1 dùng màu nhấn cả trên nền trắng lẫn nền navy → chỉnh độ sáng vào khoảng đọc được trên cả hai
const _lum = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const _mix = (h, t, k) => [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - k) + t * k).toString(16).padStart(2, "0")).join("");
function midTone(hex) {
  let h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  for (let i = 0; i < 20 && _lum(h) < 0.18; i++) h = _mix(h, 255, 0.12);
  for (let i = 0; i < 20 && _lum(h) > 0.29; i++) h = _mix(h, 0, 0.12);
  return "#" + h.toUpperCase();
}
const LOOK_SWAP = {
  "1": (l) => [["#FC5A1B", midTone(l.accent)], ["#FFF6F2", l.soft]],
  "2": (l) => [["#2345F5", l.accent], ["#EEF1FF", l.soft], ["#8FA2FF", l.highlight]],
  "4": (l) => [["#6B1E2E", l.accent], ["#F4ECEE", l.soft]],
  "5": (l) => [["#FFD23F", l.highlight], ["#FF5C39", l.accent]],
};
const FIRST_FONT = { "1": "Inter", "2": "IBM Plex Sans", "4": "Source Serif 4", "5": "Plus Jakarta Sans" };
export function applyLook(html, style, look) {
  if (!look || !LOOK_SWAP[style]) return html;
  for (const [from, to] of LOOK_SWAP[style](look)) if (to) html = html.split(from).join(to).split(from.toLowerCase()).join(to);
  if (look.display_font && FIRST_FONT[style]) html = html.split(`'${FIRST_FONT[style]}'`).join(`'${look.display_font}'`);
  return html;
}

// Mẫu 5 (sơ đồ có/không) cần đủ ô decision; thiếu thì dùng mẫu 2 để không ra poster trống ô
const decisionOk = (c) => { const d = c?.decision || {}; return ["q1", "yes1_title", "q2", "yes2_title", "no_title"].every((k) => String(d[k] || "").trim()); };
export function safeStyle(style, content) { return String(style) === "5" && !decisionOk(content) ? "2" : style; }

export function pageDocument(style, content, env, qrUrl, index, mode = "a4") {
  style = safeStyle(style, content);
  const look = content?.trend_look && LOOK_SWAP[style] ? content.trend_look : null;
  const inner = applyLook(renderPage(style, content, opts(env, qrUrl), index), style, look);
  const bg = STYLES[style].bg;
  const lookFont = look?.display_font ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(look.display_font).replace(/%20/g, "+")}:wght@${look.display_font === "Space Grotesk" ? "400;600;700" : "400;600;700;800"}&display=swap">` : "";
  const head = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><link rel="stylesheet" href="${fontsHref(style)}">${lookFont}`;
  if (mode === "story") {
    // 9:16 frame (540×960 CSS px, rendered at 2× = 1080×1920) with the A4 page centred
    const s = (540 * 0.94) / A4W;
    return `${head}<style>html,body{margin:0;width:540px;height:960px;background:${bg};overflow:hidden}
.f{position:absolute;left:${(540 - A4W * s) / 2}px;top:${(960 - A4H * s) / 2}px;width:${A4W}px;height:${A4H}px;transform:scale(${s});transform-origin:0 0;box-shadow:0 8px 30px rgba(0,0,0,.25)}</style></head>
<body><div class="f">${inner}</div>${FIT_SCRIPT}</body></html>`;
  }
  return `${head}<style>html,body{margin:0;background:${bg}}</style></head><body>${inner}${FIT_SCRIPT}</body></html>`;
}

export async function screenshot(env, html, width, height, format = "png") {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) throw new Error("Chưa cấu hình CF_ACCOUNT_ID / CF_API_TOKEN cho Browser Rendering");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/screenshot`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      html,
      viewport: { width, height, deviceScaleFactor: 2 },
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      waitForSelector: { selector: "body[data-ready]", timeout: 15000 },
      screenshotOptions: format === "jpeg" ? { type: "jpeg", quality: 92, fullPage: false } : { type: "png", fullPage: false },
    }),
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/")) {
    let msg = res.status;
    try { const j = await res.json(); msg = j.errors?.[0]?.message || JSON.stringify(j).slice(0, 200); } catch (_) {}
    throw new Error(`Browser Rendering lỗi: ${msg}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Render every page (A4 PNG) and a 9:16 story frame per page, store in R2. Returns R2 keys.
export async function renderJob(env, job) {
  const n = pageCount(job.content);
  const pages = [], stories = [];
  for (let i = 0; i < n; i++) {
    const a4 = await screenshot(env, pageDocument(job.style, job.content, env, job.qr_url, i, "a4"), A4W, A4H);
    const sk = `jobs/${job.id}/page${i + 1}.png`;
    await env.FILES.put(sk, a4, { httpMetadata: { contentType: "image/png" } });
    pages.push(sk);
    const st = await screenshot(env, pageDocument(job.style, job.content, env, job.qr_url, i, "story"), 540, 960);
    const tk = `jobs/${job.id}/story${i + 1}.png`;
    await env.FILES.put(tk, st, { httpMetadata: { contentType: "image/png" } });
    stories.push(tk);
  }
  return { pages, stories };
}

export const STYLE_NAMES = Object.fromEntries(Object.entries(STYLES).map(([k, s]) => [k, s.name]));
