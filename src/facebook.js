// Facebook Page publishing: single photo or multi-photo (album-style) feed post.
const graph = (env) => `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v26.0"}`;

// Nếu FB_PAGE_TOKEN lỡ là token người dùng → tự đổi sang token của trang (token người dùng không đăng được lên trang)
let cached = null;
export async function pageToken(env) {
  if (cached && cached.src === env.FB_PAGE_TOKEN) return cached.tok;
  let tok = env.FB_PAGE_TOKEN;
  try {
    const r = await (await fetch(`${graph(env)}/${env.FB_PAGE_ID}?fields=access_token&access_token=${encodeURIComponent(env.FB_PAGE_TOKEN)}`)).json();
    if (r.access_token) tok = r.access_token;
  } catch (_) {}
  cached = { src: env.FB_PAGE_TOKEN, tok };
  return tok;
}

async function uploadPhoto(env, bytes, published, caption) {
  const form = new FormData();
  form.append("source", new Blob([bytes], { type: "image/png" }), "poster.png");
  form.append("published", published ? "true" : "false");
  if (caption) form.append("message", caption);
  form.append("access_token", await pageToken(env));
  const res = await fetch(`${graph(env)}/${env.FB_PAGE_ID}/photos`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Facebook từ chối ảnh: ${data.error?.message || res.status}`);
  return data;
}

// images: [Uint8Array] (1–3 pages). Returns post URL.
export async function postToPage(env, images, caption) {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw new Error("Chưa cấu hình FB_PAGE_ID / FB_PAGE_TOKEN");
  if (images.length === 1) {
    const d = await uploadPhoto(env, images[0], true, caption);
    return `https://www.facebook.com/${d.post_id || d.id}`;
  }
  const ids = [];
  for (const img of images) ids.push((await uploadPhoto(env, img, false)).id);
  const form = new URLSearchParams({ message: caption, access_token: await pageToken(env) });
  ids.forEach((id, i) => form.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const res = await fetch(`${graph(env)}/${env.FB_PAGE_ID}/feed`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Facebook từ chối bài viết: ${data.error?.message || res.status}`);
  return `https://www.facebook.com/${data.id}`;
}

// Bài chia sẻ link (video của nguồn khác): Facebook tự hiện khung xem trước video gốc, ghi rõ nguồn trong nội dung.
export async function postLink(env, message, link) {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw new Error("Chưa cấu hình FB_PAGE_ID / FB_PAGE_TOKEN");
  const form = new URLSearchParams({ message, link, access_token: await pageToken(env) });
  const res = await fetch(`${graph(env)}/${env.FB_PAGE_ID}/feed`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Facebook từ chối bài chia sẻ: ${data.error?.message || res.status}`);
  return `https://www.facebook.com/${data.id}`;
}
