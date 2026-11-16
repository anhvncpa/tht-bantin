// Thin Telegram Bot API helpers.
export async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) console.error("telegram", method, data.description);
  return data;
}

export async function tgForm(env, method, form) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) console.error("telegram", method, data.description);
  return data;
}

export const send = (env, chat_id, text, extra = {}) =>
  tg(env, "sendMessage", { chat_id, text: text.slice(0, 4000), disable_web_page_preview: true, ...extra });

export const keyboard = (rows) => ({ reply_markup: { inline_keyboard: rows.map((r) => r.map(([text, data]) => ({ text, callback_data: data }))) } });

export async function download(env, file_id) {
  const f = await tg(env, "getFile", { file_id });
  if (!f.ok) throw new Error("Không tải được file từ Telegram (giới hạn 20 MB)");
  const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`);
  return await res.arrayBuffer();
}

// Send 1–10 images as an album (photos) – bytes from R2
export async function sendAlbum(env, chat_id, images, caption) {
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  const media = images.map((img, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 && caption ? { caption: caption.slice(0, 1000) } : {}) }));
  images.forEach((img, i) => form.append(`p${i}`, new Blob([img.bytes], { type: "image/png" }), img.name));
  if (images.length === 1) {
    form.append("photo", form.get("p0")); form.delete("p0");
    if (caption) form.append("caption", caption.slice(0, 1000));
    return tgForm(env, "sendPhoto", form);
  }
  form.append("media", JSON.stringify(media));
  return tgForm(env, "sendMediaGroup", form);
}

export async function sendDocument(env, chat_id, bytes, name, mime, caption) {
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  form.append("document", new Blob([bytes], { type: mime }), name);
  if (caption) form.append("caption", caption.slice(0, 1000));
  return tgForm(env, "sendDocument", form);
}

export async function sendVideo(env, chat_id, bytes, caption, extra = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, typeof v === "string" ? v : JSON.stringify(v));
  form.append("chat_id", String(chat_id));
  form.append("video", new Blob([bytes], { type: "video/mp4" }), "story.mp4");
  form.append("supports_streaming", "true");
  if (caption) form.append("caption", caption.slice(0, 1000));
  return tgForm(env, "sendVideo", form);
}
