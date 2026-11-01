# Bản tin THT: Telegram, web app và đăng đa nền tảng

Một hệ thống trên Cloudflare, điều khiển bằng **Telegram** (hoặc web app), đăng lên **Facebook (bài viết + Story có nhạc), TikTok, YouTube Shorts**.

## Dùng trên Telegram

1. **Thả file** vào bot: Word, Excel, PDF hoặc ảnh chụp. Gửi nhiều file một lần cũng được.
   - Chú thích kèm file là ghi chú cho bot.
   - Nếu chú thích có đường link, mã QR trên poster sẽ trỏ tới link đó.
2. **Chọn mẫu** 1–5, rồi **chọn số trang**: Tự động (ưu tiên 1 trang), 1, 2 hoặc 3 trang.
3. Sau 1–2 phút, bot gửi về:
   - album poster (1–3 trang);
   - các điểm đã chỉnh so với nguồn và các điểm cần anh kiểm tra;
   - bài Facebook chuẩn SEO;
   - tiêu đề YouTube, câu mở đầu cho video, từ khoá.
   - Nếu có file Excel chứa cột mã số thuế, bot tự tạo trang tra cứu `…/tc/<tên>` và cho mã QR trỏ vào đó.
4. **Duyệt** bằng các nút:
   - ✅ Đăng tất cả · 📘 FB bài viết · 📱 FB Story (nhạc) · 🎵 TikTok · ▶️ YouTube Shorts
   - ✏️ Sửa (nhắn yêu cầu bằng lời) · 🎨 Đổi mẫu · 🧠 Soạn kỹ (Sonnet) · ❌ Huỷ
5. **FB bài viết** đăng ngay, dạng album nhiều ảnh nếu poster có 2–3 trang.
6. **Story, TikTok, YouTube:** hệ thống dựng video dọc 1080×1920, dài 9–20 giây.
   - Trong video: các trang poster lần lượt hiện ra với hiệu ứng zoom và chuyển trang, 3,5 giây đầu có câu mở đầu, kèm nhạc nền.
   - Bot gửi video về Telegram cho anh xem, đăng lên các nơi đã chọn, rồi báo kết quả.

Bot **không bao giờ tự đăng** khi anh chưa bấm duyệt.

Lệnh: `/moi` bắt đầu bài mới · `/id` xem ID Telegram · `/help` hướng dẫn.

## Chi phí

| Thành phần | Chi phí |
|---|---|
| Cloudflare **Workers Paid** (bắt buộc cho bot Telegram) | 5 USD/tháng. Gói này đã gồm Queues, D1, R2 và 10 giờ Browser Rendering mỗi tháng (mỗi poster chỉ mất vài giây) |
| GitHub Actions (dựng video) | Miễn phí 2.000 phút/tháng với repo private (mỗi video 2–3 phút) |
| Claude API: **Haiku 5.5** (mặc định, rẻ nhất) | 0,10 USD/1 triệu token vào, 0,50 USD/1 triệu token ra. Khoảng **0,01–0,05 USD mỗi bài**, phần lớn là phí tra web (0,01 USD/lượt, tối đa 3 lượt) |
| Claude API: **Sonnet 5.5** (khi bấm "Soạn kỹ") | 2 USD/1 triệu token vào, 10 USD/1 triệu token ra. Khoảng 0,1 USD mỗi bài |
| Facebook, TikTok, YouTube API | Miễn phí |

Vì sao bot Telegram cần gói Workers Paid: gói miễn phí chỉ cho mỗi lần chạy 10 ms CPU, không đủ để đọc file Excel lớn hay xử lý PDF trên máy chủ. Web app dùng được gói miễn phí, vì phần đọc file chạy trên trình duyệt.

Đã áp dụng sẵn để tiết kiệm:
- Mặc định dùng Haiku 5.5.
- **Prompt caching** cho phần hướng dẫn và khung nội dung cố định: lần gọi sau chỉ tính 10% giá phần này.
- Giới hạn tối đa 3 lượt tra web mỗi bài; Excel lớn chỉ gửi 25 dòng mẫu.
- Muốn rẻ hơn nữa: đặt `WEB_VERIFY = "0"` để tắt tra web, chi phí còn khoảng 0,005 USD/bài nhưng không còn bước kiểm chứng.
- **Batch API** giảm thêm 50% nhưng có thể phải chờ tới 24 giờ, nên không dùng cho luồng duyệt bài trên Telegram.

## Cài đặt

### 1. GitHub

1. Tạo repo **private** `anhvncpa/tht-bantin` và đưa toàn bộ thư mục này lên.
2. Bỏ vài bài nhạc miễn phí bản quyền vào thư mục `music/` (xem `music/README.md`).
3. Tạo **Fine-grained token**: chỉ cho repo này, quyền **Actions: Read and write**. Token này dùng cho biến `GH_TOKEN` ở bước 3.
4. Repo → Settings → Secrets and variables → Actions, thêm các secret:

| Secret | Giá trị |
|---|---|
| `WORKER_URL` | Link Worker, vd `https://tht-bantin.xxx.workers.dev` |
| `INTERNAL_KEY` | Một chuỗi ngẫu nhiên dài, giống hệt biến cùng tên trong Cloudflare |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | Giống bên Cloudflare (bước 4) |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | Lấy ở bước 6 |

### 2. Cloudflare

1. Nâng lên gói **Workers Paid** (Workers & Pages → Plans).
2. Tạo các kho:
   - **R2**: bucket `tht-bantin-files`.
   - **D1**: database `tht-bantin`. Vào tab Console, dán nội dung `schema.sql` rồi Execute. Chép Database ID vào `wrangler.toml`.
   - **Queues**: queue `tht-jobs`.
3. Workers & Pages → Create → **Import a repository** → chọn repo → Deploy.
4. Trong `wrangler.toml`, sửa:
   - `PUBLIC_BASE_URL` thành link Worker;
   - `TG_ALLOWED_IDS` thành ID Telegram của anh (gõ `/id` với bot để biết).
5. Tạo **API token** (My Profile → API Tokens → Custom token) với quyền **Browser Rendering – Edit**.

### 3. Biến bí mật trên Cloudflare

Worker → Settings → Variables and Secrets. Chọn loại **Secret** cho tất cả:

| Biến | Giá trị |
|---|---|
| `ANTHROPIC_API_KEY` | API key lấy từ console.anthropic.com. Bật Web search trong mục cài đặt của tổ chức nếu dùng kiểm chứng |
| `APP_PASSWORD` | Mật khẩu web app, cũng dùng cho các link cài đặt |
| `TELEGRAM_BOT_TOKEN` | Tạo bot qua @BotFather |
| `TG_WEBHOOK_SECRET` | Chuỗi ngẫu nhiên (chỉ chữ, số, gạch dưới) |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Account ID và token Browser Rendering ở bước 2 |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | Xem bước 4 |
| `GH_TOKEN` | Token GitHub ở bước 1 |
| `INTERNAL_KEY` | Giống bên GitHub |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Xem bước 5 |

Sau khi khai báo xong, mở trình duyệt vào `https://<link-worker>/tg/setup?key=<APP_PASSWORD>`, thấy "Đã nối webhook Telegram" là xong. Mở bot và gửi `/start`.

### 4. Facebook Page (bài viết và Story)

1. Vào developers.facebook.com, tạo App loại Business. Để chế độ Development là đủ, vì anh là admin của cả app lẫn Page.
2. Mở Graph API Explorer, xin 3 quyền `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
3. Extend sang token dài hạn, rồi gọi `GET /me/accounts`. Lấy `id` và `access_token` của Page THT.

Lưu ý về nhạc trên Story: API của Facebook không cho gắn nhạc từ thư viện của Facebook. Vì vậy hệ thống ghép sẵn nhạc vào video rồi đăng dạng **video story** (tối đa 60 giây).

### 5. TikTok

1. Vào developers.tiktok.com, tạo app, thêm **Login Kit** và **Content Posting API**.
   - Quyền (scopes): `user.info.basic`, `video.upload`, `video.publish`.
   - Redirect URI: `https://<link-worker>/tiktok/callback`.
2. Mở `https://<link-worker>/tiktok/login?key=<APP_PASSWORD>`, đăng nhập tài khoản TikTok của THT và bấm Cho phép.
3. Chọn chế độ đăng bằng biến `TIKTOK_MODE`:
   - `inbox` (mặc định, dùng được ngay): video vào hộp thư TikTok. Anh mở app, có thể đổi sang nhạc trong thư viện TikTok, sửa caption rồi bấm Đăng.
   - `direct`: đăng thẳng. Khi app **chưa qua audit**, TikTok chỉ cho đăng chế độ riêng tư (`SELF_ONLY`). Sau khi qua audit, đổi `TIKTOK_PRIVACY = "PUBLIC_TO_EVERYONE"`.

### 6. YouTube Shorts

1. Vào Google Cloud Console, tạo project và bật **YouTube Data API v3**.
2. Tạo OAuth client loại **Desktop app**, lấy Client ID và Client Secret.
3. Trên máy tính của anh, chạy `python video/youtube_auth.py <CLIENT_ID> <CLIENT_SECRET>`, chọn kênh YouTube của THT. Script in ra `YT_REFRESH_TOKEN`; dán vào GitHub Secrets.
4. Lưu ý quyền riêng tư:
   - Project chưa qua kiểm duyệt của Google thì video **chỉ đăng được ở chế độ riêng tư** (đặt sẵn `YOUTUBE_PRIVACY = "private"`). Anh vào YouTube Studio để công khai từng video.
   - Muốn tự công khai, nộp YouTube API audit (khoảng 2–4 tuần) rồi đổi `YOUTUBE_PRIVACY = "public"`.

### 7. Chạy thử rồi bật đăng thật

1. Để `DRY_RUN = "1"` và chạy thử vài bài. Bot làm đủ các bước, dựng cả video và gửi về Telegram, nhưng không đăng lên nền tảng nào.
2. Khi đã ổn, đổi `DRY_RUN = "0"` rồi commit. Cloudflare tự triển khai lại.

## Web app

Vẫn dùng được song song tại `https://<link-worker>/`, đăng nhập bằng `APP_PASSWORD`. Web app có tạo poster 1–3 trang, sửa, tải PNG và đăng Facebook. Các phần Story, TikTok, YouTube đi qua bot Telegram.

## Cấu trúc mã

| File | Nội dung |
|---|---|
| `src/worker.js` | Định tuyến: web app, webhook Telegram, hàng đợi, trang tra cứu |
| `src/bot.js` | Luồng Telegram, các API nội bộ cho GitHub Actions, đăng nhập TikTok |
| `src/claude.js` | Gọi Claude (Haiku mặc định, prompt caching, kiểm chứng web) |
| `src/schema.js` | Khung nội dung: 1–3 trang, các trường SEO, hướng dẫn biên tập |
| `src/render.js` | Dựng PNG A4 và khung story 9:16 bằng Browser Rendering |
| `src/extract.js` | Đọc Word/Excel/PDF/ảnh trên máy chủ |
| `src/facebook.js` | Đăng bài một ảnh hoặc nhiều ảnh lên Page |
| `public/templates.js` | 5 mẫu poster và trang 2, 3 (dùng chung cho web và bot) |
| `video/run.py` | Dựng video bằng ffmpeg, đăng FB Story, TikTok, YouTube |
| `.github/workflows/video.yml` | Luồng GitHub Actions |
| `music/` | Nhạc nền miễn phí bản quyền |

## Giới hạn

- File gửi qua Telegram tối đa 20 MB. File `.doc` cũ cần lưu lại thành `.docx`.
- Nội dung pháp lý do AI soạn, nên **luôn đọc mục "Đã chỉnh so với nguồn" và "Cần anh kiểm tra"** trước khi duyệt.
