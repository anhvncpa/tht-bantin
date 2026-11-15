// Tự đánh giá hằng tuần → tự điều chỉnh chiến lược (giờ đăng, cơ cấu nội dung, mẫu, ngưỡng chọn tin) cho tuần sau.
// Dữ liệu: tương tác từng bài trên Facebook + tỉ lệ anh duyệt/huỷ bản nháp theo từng nguồn (agent, kế hoạch, video, anh gửi).
import { claude, modelFor } from "./claude.js";
import { trendNotes } from "./trends.js";
import { strategyCouncil, PERSONAS } from "./council.js";

const VN = 7 * 3600e3;
export const DEFAULT_STRATEGY = {
  pillar_mix: { hot: 2, qa: 2, cal: 1, err: 1, tool: 1 },
  best_slots: ["07:30", "11:45", "20:00"],
  agent_min_score: 6, agent_max_per_scan: 2, video_per_day: 1,
  weekly_targets: { fb_posts: 7, videos: 5 },
  content_notes: "", format_notes: "", preferred_styles: [],
};

// Ghi nguồn gốc mỗi bản nháp để cuối tuần đo tỉ lệ duyệt
export const tagJob = (env, kvSet, jobId, meta) => kvSet(env, `meta:${jobId}`, JSON.stringify({ ...meta, at: Date.now() }));
export async function markPublished(env, kvGet, kvSet, jobId, postUrl, style) {
  const meta = JSON.parse((await kvGet(env, `meta:${jobId}`)) || "{}");
  const postId = String(postUrl || "").split("/").pop();
  const hour = new Date(Date.now() + VN).getUTCHours();
  await kvSet(env, `meta:${jobId}`, JSON.stringify({ ...meta, style, published: true, post_id: postId, hour }));
  if (postId) await kvSet(env, `post:${postId}`, jobId);
}

export async function getStrategy(env, kvGet) {
  if ((await kvGet(env, "growth:strategy_off")) === "1") return { ...DEFAULT_STRATEGY, off: true };
  const s = JSON.parse((await kvGet(env, "growth:strategy")) || "null");
  return s ? { ...DEFAULT_STRATEGY, ...s } : DEFAULT_STRATEGY;
}

// env đã áp chiến lược (không sửa env gốc): giờ vàng, ngưỡng điểm, số tin mỗi lần quét, ghi chú cho người viết
export async function withStrategy(env, kvGet) {
  const s = await getStrategy(env, kvGet);
  let trends = "";
  try { trends = await trendNotes(env, kvGet); } catch (_) {}
  if (trends) env = { ...env, TREND_NOTES: trends };
  if (s.off || s === DEFAULT_STRATEGY) return env;
  const slots = (s.best_slots || []).filter((x) => /^\d{2}:\d{2}$/.test(x));
  return {
    ...env,
    AGENT_SLOTS: slots.length ? slots.join(",") : env.AGENT_SLOTS,
    AGENT_MIN_SCORE: String(s.agent_min_score ?? env.AGENT_MIN_SCORE ?? 6),
    AGENT_MAX_PER_SCAN: String(s.agent_max_per_scan ?? env.AGENT_MAX_PER_SCAN ?? 2),
    VIDEO_ENABLED: s.video_per_day === 0 ? "0" : env.VIDEO_ENABLED,
    STRATEGY_NOTES: [s.content_notes, s.format_notes ? `Hình thức/cách dựng: ${s.format_notes}` : "", s.preferred_styles?.length ? `Mẫu poster đang được tương tác tốt: ${s.preferred_styles.join(", ")}` : ""].filter(Boolean).join(". "),
    STRATEGY_MIX: JSON.stringify(s.pillar_mix || DEFAULT_STRATEGY.pillar_mix),
  };
}

const TOOL = {
  name: "weekly_strategy",
  description: "Tự đánh giá tuần qua và chiến lược tuần tới cho fanpage THT Audit",
  input_schema: {
    type: "object",
    properties: {
      evaluation: { type: "string", description: "Đánh giá tuần qua 3–5 câu: đạt/không đạt mục tiêu, vì sao. Chỉ dựa trên số liệu được cung cấp." },
      what_worked: { type: "array", items: { type: "string" }, maxItems: 3 },
      what_to_change: { type: "array", items: { type: "string" }, maxItems: 3 },
      pillar_mix: { type: "object", description: "Số bài kế hoạch tuần tới theo trụ cột, tổng = 7",
        properties: { hot: { type: "integer" }, qa: { type: "integer" }, cal: { type: "integer" }, err: { type: "integer" }, tool: { type: "integer" } },
        required: ["hot", "qa", "cal", "err", "tool"] },
      best_slots: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3, description: "3 khung giờ đăng tốt nhất (giờ VN, HH:MM)" },
      preferred_styles: { type: "array", items: { type: "string", enum: ["1", "2", "3", "4", "5", "6"] }, maxItems: 3 },
      agent_min_score: { type: "integer", minimum: 5, maximum: 9, description: "Tăng nếu anh huỷ nhiều bản nháp của agent; giảm nếu thiếu bài" },
      agent_max_per_scan: { type: "integer", minimum: 1, maximum: 2 },
      video_per_day: { type: "integer", minimum: 0, maximum: 1 },
      weekly_targets: { type: "object", properties: { fb_posts: { type: "integer" }, videos: { type: "integer" } }, required: ["fb_posts", "videos"] },
      content_notes: { type: "string", description: "Chỉ dẫn ngắn cho người viết tuần tới (≤ 300 ký tự): dạng tiêu đề, chủ đề, độ dài nên ưu tiên" },
      format_notes: { type: "string", description: "Hình thức thể hiện tuần tới (≤ 250 ký tự): kiểu câu mở video, cách dựng poster/video, định dạng đang bắt xu hướng" },
    },
    required: ["evaluation", "what_worked", "what_to_change", "pillar_mix", "best_slots", "preferred_styles", "agent_min_score", "agent_max_per_scan", "video_per_day", "weekly_targets", "content_notes", "format_notes"],
  },
};

// rows: bài FB tuần qua [{title, re, co, sh, score, hourVN, post_id}] ; followers/delta
export async function weeklyReview(env, kvGet, kvSet, { rows, followers, delta, channels = {} }) {
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const jobs = (await env.DB.prepare("SELECT id, status, style FROM jobs WHERE created_at >= ?").bind(since).all()).results || [];
  const bySource = {};
  for (const j of jobs) {
    const m = JSON.parse((await kvGet(env, `meta:${j.id}`)) || "{}");
    const src = m.source || "manual";
    const b = (bySource[src] ||= { drafts: 0, published: 0, cancelled: 0, auto: 0, panel: [] });
    if (j.status === "collecting") continue;
    b.drafts++; if (m.auto_published) b.auto++; if (m.panel_score) b.panel.push(m.panel_score); if (m.published || j.status === "published") b.published++; if (j.status === "cancelled") b.cancelled++;
  }
  const enriched = [];
  for (const r of rows) {
    const jobId = r.post_id ? await kvGet(env, `post:${r.post_id}`) : null;
    const m = jobId ? JSON.parse((await kvGet(env, `meta:${jobId}`)) || "{}") : {};
    enriched.push({ ...r, source: m.source || "khác", pillar: m.pillar || "", style: m.style || "" });
  }
  const prev = await getStrategy(env, kvGet);
  const data = {
    muc_tieu_6_thang: "Ai cũng biết fanpage THT Audit – tăng người theo dõi và tương tác tự nhiên, không quảng cáo",
    nguoi_theo_doi: followers, tang_so_voi_tuan_truoc: delta,
    kenh_khac: channels,
    chi_tieu_tuan_qua: prev.weekly_targets,
    bai_fb_tuan_qua: enriched.map((r) => ({ tieu_de: r.title, diem: r.score, cam_xuc: r.re, binh_luan: r.co, chia_se: r.sh, gio: r.hourVN, nguon: r.source, tru_cot: r.pillar, mau: r.style })),
    ban_nhap_theo_nguon: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { ...v, panel: undefined, diem_hoi_dong_tb: v.panel.length ? +(v.panel.reduce((a, x) => a + x, 0) / v.panel.length).toFixed(1) : null }])),
    xu_huong_tuan: env.TREND_NOTES || "",
    chien_luoc_dang_ap_dung: prev,
  };
  const msg = await claude(env, {
    model: modelFor(env, "fast"), max_tokens: 2500,
    system: "Bạn là trưởng nhóm tăng trưởng fanpage THT Audit. Điểm tương tác = cảm xúc + 3×bình luận + 5×chia sẻ. " +
      "Tự đánh giá tuần qua một cách thẳng thắn, rồi điều chỉnh chiến lược tuần tới dựa trên số liệu: khung giờ, trụ cột, mẫu poster nào hiệu quả; " +
      "nguồn bản nháp nào bị huỷ nhiều (thì nâng ngưỡng điểm/giảm số lượng), nguồn nào thiếu bài. Ít dữ liệu thì thay đổi nhỏ, giữ phần lớn chiến lược cũ. Không bịa số liệu. Gọi weekly_strategy đúng một lần.",
    tools: [TOOL], tool_choice: { type: "tool", name: "weekly_strategy" },
    messages: [{ role: "user", content: JSON.stringify(data) }],
  });
  let st = msg.content.find((b) => b.type === "tool_use")?.input;
  if (!st) return "";
  // Hội đồng chiến lược phản biện → Trưởng nhóm tăng trưởng chốt bản cuối
  let councilLines = "";
  if (env.COUNCIL_ENABLED !== "0") {
    try {
      const fb = await strategyCouncil(env, data, st);
      if (fb.length) {
        councilLines = fb.map((r) => `${PERSONAS[r.key].icon} ${PERSONAS[r.key].name} ${r.agree ? "đồng ý" : "góp ý"}: ${[...r.comments, ...r.format_ideas].slice(0, 3).join("; ")}`).join("\n");
        const fin = await claude(env, { model: modelFor(env, "fast"), max_tokens: 2500,
          system: "Bạn là trưởng nhóm tăng trưởng fanpage THT Audit. Đã có đề xuất chiến lược và ý kiến phản biện của hội đồng (người đọc, giám đốc DN khách hàng, chuyên gia tăng trưởng). Cân nhắc và chốt bản chiến lược cuối – tiếp thu góp ý hợp lý, bác bỏ góp ý không có căn cứ số liệu. Gọi weekly_strategy đúng một lần.",
          tools: [TOOL], tool_choice: { type: "tool", name: "weekly_strategy" },
          messages: [{ role: "user", content: JSON.stringify({ so_lieu: data, de_xuat: st, y_kien_hoi_dong: fb }) }] });
        st = fin.content.find((b) => b.type === "tool_use")?.input || st;
      }
    } catch (_) {}
  }
  const { evaluation, what_worked, what_to_change, ...strategy } = st;
  await kvSet(env, "growth:strategy", JSON.stringify(strategy));
  await kvSet(env, "growth:learnings", [...(what_worked || []).map((x) => `+ ${x}`), ...(what_to_change || []).map((x) => `→ ${x}`), strategy.content_notes].filter(Boolean).join("\n"));
  const mix = strategy.pillar_mix;
  const draftLine = Object.entries(bySource).map(([k, v]) => `${{ agent: "agent", plan: "kế hoạch", video: "video", manual: "anh gửi" }[k] || k} ${v.published}/${v.drafts} duyệt`).join(" · ");
  return [
    `\n🧠 Em tự đánh giá tuần qua:\n${evaluation}`,
    councilLines ? `🗣 Hội đồng bàn bạc:\n${councilLines}` : "",
    draftLine ? `📝 Bản nháp: ${draftLine}` : "",
    what_worked?.length ? `✅ Hiệu quả:\n${what_worked.map((x) => `• ${x}`).join("\n")}` : "",
    what_to_change?.length ? `🔧 Cần đổi:\n${what_to_change.map((x) => `• ${x}`).join("\n")}` : "",
    `📈 Em tự điều chỉnh cho tuần tới:\n• Giờ vàng: ${strategy.best_slots.join(", ")}\n• Kế hoạch 7 bài: ${mix.hot} tin nóng, ${mix.qa} giải đáp, ${mix.cal} lịch thuế, ${mix.err} sai lầm thường gặp, ${mix.tool} công cụ\n` +
      `• Agent: chỉ soạn tin từ ${strategy.agent_min_score}/10, tối đa ${strategy.agent_max_per_scan} tin/lần quét · video ${strategy.video_per_day ? "1/ngày" : "tạm dừng"}\n` +
      `• Chỉ tiêu: ${strategy.weekly_targets.fb_posts} bài Facebook, ${strategy.weekly_targets.videos} video${strategy.preferred_styles?.length ? `\n• Ưu tiên mẫu: ${strategy.preferred_styles.join(", ")}` : ""}${strategy.format_notes ? `\n• Hình thức: ${strategy.format_notes}` : ""}`,
  ].filter(Boolean).join("\n\n");
}
