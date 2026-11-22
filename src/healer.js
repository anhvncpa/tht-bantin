// Agent soát & sửa lỗi đăng bài (chạy cùng bước "Kiểm tra sau đăng", 15 phút/lần).
// 1) Đọc lỗi của từng kênh (kể cả lỗi luồng dựng video trên GitHub Actions) → chẩn đoán nguyên nhân bằng tiếng Việt dễ hiểu.
// 2) Lỗi tạm thời (mạng, máy chủ bận, hết thời gian…) → tự đăng lại đúng kênh lỗi, tối đa 1 lần/bài.
// 3) Lỗi cần anh xử lý (token hết hạn, chưa được duyệt app, hết phút GitHub, hết hạn mức YouTube…) → không thử lại vô ích, báo rõ cách sửa.

const RULES = [
  // [regex, chẩn đoán, có tự thử lại không]
  [/spending limit|payments have failed|billing/i, "GitHub hết phút chạy miễn phí hoặc lỗi thanh toán – video không dựng được. Repo bản tin đang công khai nên không bị tính phút; nếu vẫn báo lỗi này, vào GitHub → Settings → Billing kiểm tra.", false],
  [/unaudited_client|can_only_post_to_private/i, "App TikTok chưa qua kiểm duyệt nên không đăng thẳng lên tài khoản công khai được. Video đã được gửi vào hộp thư TikTok – anh mở app TikTok, bấm thông báo, rồi bấm Đăng.", false],
  [/access token|OAuthException|code["']?:\s*190|Session has expired|invalid_grant|token.*(expired|hết hạn)/i, "Mã kết nối (token) của kênh đã hết hạn hoặc bị thu hồi – cần kết nối lại tài khoản (Facebook/Instagram: cấp lại FB_PAGE_TOKEN; Threads/TikTok/YouTube: đăng nhập lại qua trang kết nối).", false],
  [/quotaExceeded|quota/i, "Hết hạn mức đăng trong ngày của YouTube – bot sẽ đăng được lại vào ngày mai (sau 14:00 giờ VN).", false],
  [/uploadLimitExceeded|spam|rate limit|too many|429/i, "Nền tảng đang giới hạn tần suất đăng – tự thử lại sau.", true],
  [/permission|scope|not authorized|\(#10\)|\(#200\)/i, "Thiếu quyền đăng (app/token chưa được cấp quyền) – cần cấp lại quyền cho app.", false],
  [/aspect ratio|duration|video.*(too long|ngắn|dài)|format/i, "Video không đúng định dạng nền tảng yêu cầu (tỉ lệ/thời lượng).", false],
  [/timeout|timed out|ETIMEDOUT|ECONNRESET|5\d\d|temporarily|try again|network/i, "Lỗi mạng / máy chủ nền tảng bận tạm thời.", true],
];
export function diagnose(text) {
  for (const [re, why, retry] of RULES) if (re.test(text || "")) return { why, retry };
  return { why: "", retry: true };   // không rõ nguyên nhân → thử lại 1 lần
}

// Hỏi GitHub xem lượt dựng video của bài này ra sao (đang chạy / lỗi gì)
export async function videoRunStatus(env, jobId, since) {
  if (!env.GH_REPO || !env.GH_TOKEN) return null;
  const h = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "tht-bantin" };
  try {
    const j = await (await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/video.yml/runs?per_page=15&created=${encodeURIComponent(">=" + new Date(since - 120e3).toISOString())}`, { headers: h })).json();
    for (const run of j.workflow_runs || []) {
      const title = `${run.display_title || ""} ${run.name || ""}`;
      const named = /^video\s+\S+/i.test(run.display_title || "");   // video.yml có run-name "video <mã bài> <kênh>"
      if (named ? title.includes(jobId) : Math.abs(new Date(run.created_at).getTime() - since) < 10 * 60e3) {
        let note = "";
        if (run.conclusion === "failure" || run.conclusion === "startup_failure") {
          try {
            const jobs = await (await fetch(run.jobs_url, { headers: h })).json();
            const jb = (jobs.jobs || [])[0];
            if (jb) {
              const an = await (await fetch(`https://api.github.com/repos/${env.GH_REPO}/check-runs/${jb.id}/annotations`, { headers: h })).json();
              note = (Array.isArray(an) ? an : []).filter((a) => a.annotation_level === "failure").map((a) => a.message).join(" | ").slice(0, 300);
              if (!note) note = (jb.steps || []).filter((s) => s.conclusion === "failure").map((s) => `bước "${s.name}" lỗi`).join(", ");
            }
          } catch (_) {}
        }
        return { status: run.status, conclusion: run.conclusion, url: run.html_url, note };
      }
    }
  } catch (_) {}
  return null;
}

// Gom kết quả kiểm tra của 1 bài → quyết định tự sửa hay báo anh
// failures: [{ target, label, detail }]
export function healPlan(failures, healedBefore) {
  const retry = [], manual = [];
  for (const f of failures) {
    const d = diagnose(f.detail);
    if (d.retry && !healedBefore) retry.push({ ...f, why: d.why });
    else manual.push({ ...f, why: [healedBefore && d.retry ? "Đã tự đăng lại 1 lần nhưng vẫn lỗi." : "", d.why].filter(Boolean).join(" ") });
  }
  return { retry, manual };
}

export function healMessage(title, ok, retry, manual, warn) {
  return [
    `🛠 Agent soát lỗi – “${title}”`,
    ok.length ? `✅ ${ok.join(" · ")}` : "",
    retry.length ? `🔁 Đã tự đăng lại: ${retry.map((f) => f.label).join(", ")}${retry.some((f) => f.why) ? "\n" + retry.filter((f) => f.why).map((f) => `• ${f.label}: ${f.why}`).join("\n") : ""}` : "",
    manual.length ? `❗ Cần anh xử lý:\n${manual.map((f) => `• ${f.label}: ${f.why || f.detail}`).join("\n")}` : "",
    warn.length ? `⚠️ ${warn.join("\n⚠️ ")}` : "",
  ].filter(Boolean).join("\n");
}
