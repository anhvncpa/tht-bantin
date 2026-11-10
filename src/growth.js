// Tăng trưởng fanpage THT Audit (không quảng cáo):
//  (b) Kế hoạch nội dung tuần – thứ Hai 08:00: 7 ý tưởng theo 5 trụ cột, bấm nút để soạn từng bài.
//  (c) Báo cáo tuần – Chủ nhật 20:00: người theo dõi, tương tác từng bài, rút kinh nghiệm → lưu để tuần sau soạn tốt hơn.
import { claude, modelFor } from "./claude.js";
import { AGENT_DOMAINS } from "./agent.js";
import { weeklyReview } from "./strategy.js";
import { channelStats } from "./social.js";
import { pageToken } from "./facebook.js";

export const PILLARS = {
  hot: "🔥 Tin nóng",
  qa: "⏱ Giải đáp 60 giây",
  cal: "📅 Lịch thuế / checklist",
  err: "⚠️ Sai lầm thường gặp",
  tool: "🧰 Công cụ miễn phí",
};

const VN = 7 * 3600e3;
const today = () => new Date(Date.now() + VN).toISOString().slice(0, 10).split("-").reverse().join("/");

const IDEA = {
  type: "object",
  properties: {
    pillar: { type: "string", enum: Object.keys(PILLARS) },
    day: { type: "string", description: "Ngày đăng đề xuất trong tuần, vd 'Thứ Ba'" },
    headline: { type: "string", description: "Tiêu đề dừng lướt, có con số/hạn chót/hệ quả, ≤ 14 từ" },
    angle: { type: "string", description: "Góc khai thác, ai cần đọc, vì sao đọc ngay (1–2 câu)" },
    brief: { type: "string", description: "Dàn ý 3–6 ý chính kèm con số, mốc thời gian, căn cứ pháp lý (số hiệu văn bản) – chỉ dùng quy định đã chắc chắn" },
    source_url: { type: "string", description: "URL nguồn chính thức nếu có, rỗng nếu là kiến thức nền" },
    cta_question: { type: "string", description: "Câu hỏi mở cuối bài để mời bình luận" },
  },
  required: ["pillar", "day", "headline", "angle", "brief", "cta_question"],
};
const PLAN_TOOL = {
  name: "content_plan",
  description: "Kế hoạch nội dung fanpage THT Audit cho 1 tuần",
  input_schema: { type: "object", properties: { ideas: { type: "array", items: IDEA, minItems: 5, maxItems: 10 } }, required: ["ideas"] },
};

export async function planWeek(env, kvGet) {
  const learn = (await kvGet(env, "growth:learnings")) || "(chưa có dữ liệu)";
  const recent = JSON.parse((await kvGet(env, "growth:recent")) || "[]").slice(-30);
  const mix = JSON.parse(env.STRATEGY_MIX || '{"hot":2,"qa":2,"cal":1,"err":1,"tool":1}');
  const system = `Bạn là trưởng nhóm nội dung fanpage "THT Audit" (Công ty TNHH Kiểm toán và Tư vấn THT – TP.HCM & Đà Nẵng).
Mục tiêu 6 tháng: chủ doanh nghiệp nhỏ, hộ kinh doanh, kế toán ở Việt Nam đều biết và theo dõi THT Audit nhờ nội dung hữu ích – không quảng cáo.
Lập kế hoạch 7 bài cho 7 ngày tới, bắt đầu từ ngày mai (hôm nay ${today()}), phân bổ (theo tự đánh giá tuần trước): ${mix.hot} Tin nóng, ${mix.qa} Giải đáp 60 giây, ${mix.cal} Lịch thuế/checklist, ${mix.err} Sai lầm thường gặp, ${mix.tool} Công cụ miễn phí (tra cứu/tính thuế trên audit.com.vn hoặc form.thtaudit.com.vn).${env.STRATEGY_NOTES ? "\nChỉ dẫn tuần này: " + env.STRATEGY_NOTES : ""}${env.TREND_NOTES ? "\nXu hướng tuần này (Agent tự nghiên cứu, ưu tiên khai thác):\n" + env.TREND_NOTES : ""}
- Tin nóng / Lịch thuế: dùng công cụ tìm kiếm trên trang chính thức để lấy văn bản và hạn nộp thật trong tuần/tháng này.
- Giải đáp / Sai lầm: chọn câu hỏi thật mà kế toán SME hay gặp (hóa đơn, TNCN, TNDN, BHXH, hộ kinh doanh, quyết toán); chỉ dùng quy định đang có hiệu lực, ghi số hiệu văn bản.
- Không trùng các tiêu đề đã đăng gần đây. Rải đều Thứ Hai → Chủ nhật.
- Áp dụng bài học từ số liệu tương tác tuần trước:
${learn}
Gọi content_plan đúng một lần.`;
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: Number(env.PLAN_SEARCH_MAX || 5), allowed_domains: AGENT_DOMAINS },
    PLAN_TOOL,
  ];
  let messages = [{ role: "user", content: `Tiêu đề đã đăng gần đây (tránh trùng): ${recent.join(" | ") || "(trống)"}\n\nLập kế hoạch tuần.` }];
  for (let turn = 0; turn < 4; turn++) {
    const msg = await claude(env, { model: modelFor(env, "fast"), max_tokens: 8000, system, tools, messages });
    const rep = msg.content.find((b) => b.type === "tool_use" && b.name === "content_plan");
    if (rep) return rep.input.ideas || [];
    messages = [...messages, { role: "assistant", content: msg.content }];
    if (msg.stop_reason === "pause_turn") continue;
    messages.push({ role: "user", content: "Gọi content_plan ngay với những gì đã có." });
    const fin = await claude(env, { model: modelFor(env, "fast"), max_tokens: 8000, system, tools: [PLAN_TOOL], tool_choice: { type: "tool", name: "content_plan" }, messages });
    return fin.content.find((b) => b.type === "tool_use")?.input.ideas || [];
  }
  return [];
}

// Văn bản nguồn để soạn bài từ 1 ý tưởng
export function ideaSource(it) {
  return [
    `Trụ cột: ${PILLARS[it.pillar] || it.pillar}`, `Tiêu đề đề xuất: ${it.headline}`, `Góc khai thác: ${it.angle}`,
    `Dàn ý:\n${it.brief}`, it.source_url ? `Nguồn chính thức: ${it.source_url}` : "",
    `Câu hỏi cuối bài Facebook: ${it.cta_question}`, "",
    "Đây là bài theo kế hoạch nội dung tuần. Soạn bản tin dựa trên dàn ý; kiểm chứng lại số hiệu, ngày, con số; ý nào không chắc thì bỏ.",
  ].filter(Boolean).join("\n");
}

// ---------- (c) Báo cáo tuần từ Facebook Graph API ----------
const graph = (env) => `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v26.0"}`;
async function fbGet(env, path, params) {
  const q = new URLSearchParams({ ...params, access_token: await pageToken(env) });
  const r = await fetch(`${graph(env)}/${path}?${q}`);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`Facebook: ${j.error?.message || r.status}`);
  return j;
}

export async function weeklyInsights(env, kvGet, kvSet) {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw new Error("Chưa cấu hình FB_PAGE_ID / FB_PAGE_TOKEN");
  const page = await fbGet(env, env.FB_PAGE_ID, { fields: "name,followers_count,fan_count" });
  const since = Math.floor((Date.now() - 7 * 86400e3) / 1000);
  let posts = { data: [] }, postErr = "";
  try {
    posts = await fbGet(env, `${env.FB_PAGE_ID}/posts`, {
      fields: "message,created_time,permalink_url,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares",
      since: String(since), limit: "50",
    });
  } catch (e) { postErr = e.message; }
  const rows = (posts.data || []).map((p) => {
    const re = p.reactions?.summary?.total_count || 0, co = p.comments?.summary?.total_count || 0, sh = p.shares?.count || 0;
    const hourVN = new Date(new Date(p.created_time).getTime() + VN).getUTCHours();
    return { title: String(p.message || "").split("\n")[0].slice(0, 90), url: p.permalink_url, post_id: p.id, re, co, sh, score: re + 3 * co + 5 * sh, hourVN };
  }).sort((a, b) => b.score - a.score);

  const prev = JSON.parse((await kvGet(env, "growth:stats")) || "null");
  const followers = page.followers_count ?? page.fan_count ?? 0;
  const delta = prev ? followers - prev.followers : null;
  await kvSet(env, "growth:stats", JSON.stringify({ followers, at: Date.now() }));
  const recent = JSON.parse((await kvGet(env, "growth:recent")) || "[]");
  await kvSet(env, "growth:recent", JSON.stringify([...recent, ...rows.map((r) => r.title)].slice(-60)));

  // Các kênh khác (Instagram, Threads) – so với tuần trước
  let channels = {};
  try { channels = await channelStats(env, kvGet, kvSet); } catch (_) {}
  const prevCh = JSON.parse((await kvGet(env, "growth:channels")) || "{}");
  await kvSet(env, "growth:channels", JSON.stringify(channels));
  const chLines = Object.entries({ instagram: "📸 Instagram", threads: "🧵 Threads" }).map(([k, label]) => {
    const c = channels[k] || {};
    if (c.error || c.followers == null) return `${label}: ${c.error ? "chưa đọc được (" + c.error + ")" : "chưa có số liệu"}`;
    const d = prevCh[k]?.followers != null ? c.followers - prevCh[k].followers : null;
    return `${label}: ${Number(c.followers).toLocaleString("vi-VN")} người theo dõi${d === null ? "" : ` (${d >= 0 ? "+" : ""}${d})`}${c.views_7d != null ? ` · ${c.views_7d} lượt xem/7 ngày` : ""}`;
  });

  // Tự đánh giá + tự điều chỉnh chiến lược tuần tới (Sonnet)
  let review = "";
  try { review = await weeklyReview(env, kvGet, kvSet, { rows, followers, delta, channels }); }
  catch (e) { review = `\n⚠️ Chưa tự đánh giá được: ${e.message}`; }

  const sum = rows.reduce((a, r) => ({ re: a.re + r.re, co: a.co + r.co, sh: a.sh + r.sh }), { re: 0, co: 0, sh: 0 });
  const top = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.title}\n   👍 ${r.re} · 💬 ${r.co} · ↗️ ${r.sh} · đăng ${r.hourVN}h`).join("\n");
  return [
    `📊 Báo cáo tuần – ${page.name || "THT Audit"} (${today()})`,
    `📘 Facebook: ${followers.toLocaleString("vi-VN")}${delta === null ? "" : ` (${delta >= 0 ? "+" : ""}${delta} so với tuần trước)`}`,
    `📝 ${rows.length} bài · 👍 ${sum.re} · 💬 ${sum.co} · ↗️ ${sum.sh}`,
    chLines.join("\n"),
    postErr ? "\n⚠️ Chưa đọc được số liệu từng bài: token thiếu quyền pages_read_user_content." : rows.length ? `\n🏆 Bài tốt nhất:\n${top}` : "\nTuần này chưa có bài đăng.",
    review,
  ].join("\n");
}
