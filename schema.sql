-- Lịch sử bài đăng từ web app
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, title TEXT, style TEXT, caption TEXT,
  fb_link TEXT, image_key TEXT, status TEXT
);
CREATE INDEX IF NOT EXISTS posts_created ON posts (created_at DESC);

-- Bài đang xử lý từ Telegram
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, status TEXT NOT NULL, style TEXT, pages TEXT, quality TEXT,
  note TEXT, qr_url TEXT, files TEXT, content TEXT, checks TEXT, render TEXT, media_group TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_chat ON jobs (chat_id, status, created_at DESC);

-- Trạng thái nhỏ (token TikTok, bài đang sửa…)
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
