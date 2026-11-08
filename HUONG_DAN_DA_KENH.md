# Đăng đa kênh: Facebook · Instagram · Threads · TikTok · YouTube

## Nút trên Telegram

- **✅ Đăng 5 kênh (+video)** đăng lên tất cả kênh cùng lúc:
  - Facebook: bài viết và Story.
  - Instagram: ảnh hoặc carousel.
  - Threads: bài chữ kèm ảnh poster.
  - Video: TikTok, YouTube Shorts, FB Reels, IG Reels.
- Hàng nút lẻ dùng khi chỉ muốn đăng một kênh.
- **⏰ Hẹn giờ** đăng toàn bộ các kênh vào giờ vàng.

Danh sách kênh được cấu hình trong `wrangler.toml` qua hai biến `POST_TARGETS` và `VIDEO_TARGETS`. Muốn bỏ kênh nào thì xoá tên kênh đó khỏi biến tương ứng.

## Lệnh mới

`/xuhuong`: Agent tìm chủ đề thuế – kế toán đang nóng, hạn chót trong 14 ngày tới và kiểu câu mở video nên thử. Agent cũng tự chạy việc này **mỗi tối Chủ nhật**, ngay sau báo cáo tuần và trước khi lập kế hoạch tuần mới. Kết quả được dùng cho ba việc:

- lập kế hoạch tuần;
- chọn bài mỗi sáng;
- viết câu mở cho video.

Báo cáo tuần (`/baocao`) có thêm số người theo dõi Instagram và Threads, kèm mức tăng so với tuần trước.

## Cài đặt một lần

### 1. Instagram

1. Trong app Instagram, vào **Cài đặt → Loại tài khoản → Chuyển sang tài khoản chuyên nghiệp (Doanh nghiệp)**.
2. Trong Meta Business Suite, vào **Cài đặt → Tài khoản đã liên kết → Instagram** và nối tài khoản đó với fanpage THT Audit.
3. Cấp lại Page token như lần trước, nhưng tick thêm 2 quyền: `instagram_basic` và `instagram_content_publish`.
4. Dán token mới vào **cả hai chỗ**:
   - Cloudflare: Secret `FB_PAGE_TOKEN`.
   - GitHub: repo → Settings → Secrets → Actions → `FB_PAGE_TOKEN` (luồng video dùng token này để đăng Reels).

### 2. Threads

1. Vào developers.facebook.com, mở ứng dụng hiện có rồi chọn **Thêm trường hợp sử dụng → Truy cập Threads API**.
2. Bật 3 quyền: `threads_basic`, `threads_content_publish`, `threads_manage_insights`.
3. Vào **Cài đặt Threads**:
   - Ô *Redirect Callback URL* điền: `https://tht-bantin.thtdn.workers.dev/threads/callback`
   - Ở mục **Người thử nghiệm Threads**, thêm tài khoản Threads của THT Audit.
4. Mở app Threads trên điện thoại, vào **Cài đặt → Tài khoản → Quyền trang web → Lời mời** và bấm **Chấp nhận**.
5. Thêm 2 Secret trên Cloudflare: `THREADS_APP_ID` và `THREADS_APP_SECRET`. Lấy 2 giá trị này ở *Cài đặt Threads*. Lưu ý đây là ID riêng của Threads, khác ID ứng dụng Meta.
6. Mở `https://tht-bantin.thtdn.workers.dev/threads/login?key=MẬT_KHẨU_ỨNG_DỤNG` và bấm Cho phép.

Token Threads dùng được 60 ngày. Bot tự làm mới token mỗi tuần.

### 3. YouTube và TikTok

Hai kênh này dùng cách nối cũ:

- YouTube: các secret `YT_*` trên GitHub.
- TikTok: Direct Post, đăng nhập tại `/tiktok/login`.

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| "Fanpage chưa nối tài khoản Instagram chuyên nghiệp" | Chưa làm bước 1.1 hoặc 1.2 | Làm lại bước 1.1 và 1.2 |
| Instagram báo thiếu quyền | Page token chưa có 2 quyền Instagram | Cấp lại token theo bước 1.3, nhớ cập nhật cả GitHub |
| "Threads: bỏ qua – Chưa kết nối" | Chưa đăng nhập Threads | Làm bước 2.6 |
| IG Reels lỗi xử lý video | Instagram từ chối video | Thử lại bằng nút 🎞 IG Reels |
