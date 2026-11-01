// Claude calls shared by the web app and the Telegram bot.
// Cheapest setup: Haiku 5.5 by default + prompt caching on the fixed system prompt and tool schema.
import { POSTER_SCHEMA, SYSTEM_PROMPT } from "./schema.js";

const TOOL = { name: "poster_content", description: "Nội dung poster + bài đăng mạng xã hội", input_schema: POSTER_SCHEMA, cache_control: { type: "ephemeral" } };
const SYSTEM = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

export const modelFor = (env, quality) =>
  quality === "strong" ? env.CLAUDE_MODEL_STRONG || "claude-sonnet-5-5" : env.CLAUDE_MODEL || "claude-haiku-5-5";

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
    model: modelFor(env, "fast"), max_tokens: 1500,
    system: "Bạn là chuyên viên pháp chế Thuế – Doanh nghiệp tại Việt Nam. Kiểm chứng ngắn gọn bằng tìm kiếm web.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: Number(env.WEB_SEARCH_MAX || 3) }],
    messages: [{ role: "user", content: sourceBlocks(parts,
      (note ? `Ghi chú của người gửi: ${note}\n\n` : "") +
      "Kiểm chứng số hiệu văn bản, ngày ban hành/hiệu lực, mức phạt, thời hạn trong tài liệu. " +
      "Trả lời gạch đầu dòng ngắn: điểm nào khớp, điểm nào sai/khác (kèm URL nguồn), điểm nào không tìm thấy.") }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function generateContent(env, { parts, note = "", verify = true, quality = "fast", pages = "auto" }) {
  const checks = verify ? await factCheck(env, parts, note) : "";
  let extra = PAGES_RULE[pages] || "";
  if (note) extra += `\nGhi chú/yêu cầu của người gửi: ${note}\n`;
  if (checks) extra += `\n<ghi_chu_kiem_chung>\n${checks}\n</ghi_chu_kiem_chung>\n`;
  const msg = await claude(env, {
    model: modelFor(env, quality), max_tokens: 8000, system: SYSTEM, tools: [TOOL],
    tool_choice: { type: "tool", name: "poster_content" },
    messages: [{ role: "user", content: sourceBlocks(parts, extra) }],
  });
  const content = toolInput(msg);
  if (pages === "1") content.extra_pages = [];
  content.extra_pages = (content.extra_pages || []).slice(0, 2);
  return { content, checks, usage: msg.usage };
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
