// Claude calls shared by the web app and the Telegram bot.
// Cheapest setup: Haiku 5.5 by default + prompt caching on the fixed system prompt and tool schema.
import { POSTER_SCHEMA, SYSTEM_PROMPT } from "./schema.js";

const TOOL = { name: "poster_content", description: "Nội dung poster + bài đăng mạng xã hội", input_schema: POSTER_SCHEMA, cache_control: { type: "ephemeral" } };
const SYSTEM = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

// cheap: Haiku (kiểm chứng, dò tin) · fast: Sonnet (soạn bài) · strong: Opus (Soạn kỹ)
export const modelFor = (env, quality) =>
  quality === "strong" ? env.CLAUDE_MODEL_STRONG || "claude-opus-5-5"
  : quality === "cheap" ? env.CLAUDE_MODEL_CHEAP || "claude-haiku-5-5"
  : env.CLAUDE_MODEL || "claude-sonnet-5-5";

export async function claude(env, body) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Chưa cấu hình ANTHROPIC_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude báo lỗi: ${data.error?.message || res.status}`);
  return data;
}

// parts: [{kind:"pdf"|"image"|"text", name, mediaType, data}]
export function sourceBlocks(parts, extra) {
  const blocks = [];
  let text = "";
  for (const p of parts || []) {
    if (p.kind === "pdf") blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } });
    else if (p.kind === "image") blocks.push({ type: "image", source: { type: "base64", media_type: p.mediaType || "image/jpeg", data: p.data } });
    else if (p.kind === "text") text += `<tai_lieu ten="${String(p.name || "").replace(/"/g, "")}">\n${p.data}\n</tai_lieu>\n`;
  }
  blocks.push({ type: "text", text: (text + (extra || "")).trim() || "Soạn poster từ tài liệu đính kèm." });
  return blocks;
}

const toolInput = (msg) => {
  const b = msg.content.find((x) => x.type === "tool_use");
  if (!b) throw new Error("Claude không trả về nội dung poster");
  return b.input;
};

const PAGES_RULE = {
  auto: "",
  "1": "\nYêu cầu: poster đúng 1 trang, để `extra_pages` rỗng.\n",
  "2": "\nYêu cầu: bộ poster đúng 2 trang (1 trang bổ sung trong `extra_pages`).\n",
  "3": "\nYêu cầu: bộ poster đúng 3 trang (2 trang bổ sung trong `extra_pages`).\n",
};

export async function factCheck(env, parts, note) {
  const msg = await claude(env, {
    model: modelFor(env, "cheap"), max_tokens: 1500,
    system: "Bạn là chuyên viên pháp chế Thuế – Doanh nghiệp tại Việt Nam. Kiểm chứng ngắn gọn bằng tìm kiếm web.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Number(env.WEB_SEARCH_MAX || 3) }],
    messages: [{ role: "user", content: sourceBlocks(parts,
      (note ? `Ghi chú của người gửi: ${note}\n\n` : "") +
      "Kiểm chứng số hiệu văn bản, ngày ban hành/hiệu lực, mức phạt, thời hạn trong tài liệu. " +
      "Trả lời gạch đầu dòng ngắn: điểm nào khớp, điểm nào sai/khác (kèm URL nguồn), điểm nào không tìm thấy.") }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function generateContent(env, { parts, note = "", verify = true, quality = "fast", pages = "auto", recentStyles = [] }) {
  const checks = verify ? await factCheck(env, parts, note) : "";
  let extra = PAGES_RULE[pages] || "";
  if (note) extra += `\nGhi chú/yêu cầu của người gửi: ${note}\n`;
  if (env.STRATEGY_NOTES) extra += `\nĐịnh hướng nội dung tuần này (từ tự đánh giá): ${env.STRATEGY_NOTES}\n`;
  if (recentStyles.length) extra += `\nMẫu poster vừa dùng gần đây (mới nhất trước): ${recentStyles.join(", ")}.\n`;
  if (checks) extra += `\n<ghi_chu_kiem_chung>\n${checks}\n</ghi_chu_kiem_chung>\n`;
  const msg = await claude(env, {
    model: modelFor(env, quality), max_tokens: 8000, system: SYSTEM, tools: [TOOL],
    tool_choice: { type: "tool", name: "poster_content" },
    messages: [{ role: "user", content: sourceBlocks(parts, extra) }],
  });
  let content = toolInput(msg);
  let usage = msg.usage;
  if (env.EDITOR_PASS !== "0") {
    try { const ed = await editorPass(env, content, checks, quality); content = ed.content; usage = { draft: usage, editor: ed.usage }; }
    catch (e) { console.log("editorPass lỗi, giữ bản nháp:", e.message); }
  }
  if (pages === "1") content.extra_pages = [];
  content.extra_pages = (content.extra_pages || []).slice(0, 2);
  return { content, checks, usage };
}

export async function reviseContent(env, content, instruction, quality = "fast") {
  const msg = await claude(env, {
    model: modelFor(env, quality), max_tokens: 8000, system: SYSTEM, tools: [TOOL],
    tool_choice: { type: "tool", name: "poster_content" },
    messages: [{ role: "user", content:
      "Nội dung poster hiện tại (JSON):\n" + JSON.stringify(content) +
      `\n\nSửa theo yêu cầu sau, giữ nguyên phần không được nhắc tới:\n${instruction}` }],
  });
  return toolInput(msg);
}

// Vòng 2 "Tổng biên tập": chấm bản nháp theo checklist rồi viết lại cho rõ, cuốn hút hơn.
const EDITOR_RULES = `Bạn là TỔNG BIÊN TẬP fanpage THT Audit. Mục tiêu fanpage: chủ doanh nghiệp, kế toán dừng lướt, đọc hết, lưu lại và chia sẻ – tăng tương tác tự nhiên, không quảng cáo.
Nhận bản nháp poster (JSON). Tự chấm theo checklist, rồi VIẾT LẠI toàn bộ và gọi poster_content đúng một lần:
1. Dừng lướt: tiêu đề có con số/hạn chót/hệ quả rõ, ≤ 12 từ mỗi dòng; nghĩ 3 phương án theo các công thức tiêu đề rồi chọn phương án mạnh nhất.
2. Hiểu trong 3 giây: mỗi ý một câu, bỏ chữ thừa, không văn hành chính, không lặp ý giữa các ô.
3. Con số nổi bật: số tiền, %, ngày được đưa lên đầu câu hoặc ô nổi bật; ghi đúng như nguồn.
4. Làm được ngay: phần việc cần làm bắt đầu bằng động từ, cụ thể ai – làm gì – trước ngày nào.
5. Đúng: TUYỆT ĐỐI không thêm số liệu, số hiệu, ngày tháng không có trong bản nháp hoặc ghi chú kiểm chứng; nếu ghi chú kiểm chứng báo sai thì sửa theo nguồn.
6. Bài Facebook: câu đầu là móc câu (câu hỏi hoặc con số), 350–650 ký tự, kết bằng 1 câu hỏi mở mời bình luận (vd "Doanh nghiệp anh/chị đã chuẩn bị chưa?"), không chèn liên hệ/QR/lời mời hỗ trợ.
7. Song ngữ: cập nhật trường "en" khớp với bản tiếng Việt sau khi sửa (cùng số ý, cùng thứ tự), tiếng Anh ngắn gọn, chuyên nghiệp.
Giữ nguyên cấu trúc trường, số trang (extra_pages) và các trường không cần sửa.`;

export async function editorPass(env, draft, checks = "", quality = "fast") {
  const msg = await claude(env, {
    model: modelFor(env, quality), max_tokens: 8000,
    system: [...SYSTEM, { type: "text", text: EDITOR_RULES }],
    tools: [TOOL], tool_choice: { type: "tool", name: "poster_content" },
    messages: [{ role: "user", content:
      "Bản nháp (JSON):\n" + JSON.stringify(draft) +
      (checks ? `\n\n<ghi_chu_kiem_chung>\n${checks}\n</ghi_chu_kiem_chung>` : "") +
      "\n\nHãy biên tập lại theo checklist." }],
  });
  const content = toolInput(msg);
  content.extra_pages = content.extra_pages || draft.extra_pages || [];
  return { content, usage: msg.usage };
}
