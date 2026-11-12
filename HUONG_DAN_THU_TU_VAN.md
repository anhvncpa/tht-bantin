# Thư tư vấn chung (/tuvan) → duyệt → tự đồng bộ sang My THT

## Luồng trên Telegram

1. Gõ `/tuvan` kèm vấn đề, ví dụ: `/tuvan Hộ kinh doanh bỏ thuế khoán từ 2026 cần chuẩn bị gì?`
2. Agent tra cứu trên các trang chính thức trong 2–4 phút, rồi gửi bản tóm tắt gồm kết luận, căn cứ pháp lý và những điểm cần anh kiểm tra. Anh chọn đầu ra:
   - **✉️ Thư tư vấn PDF**
   - **🖼 Poster**: đi theo luồng bản tin như cũ.
   - **📦 Cả hai**
3. Thư tư vấn được gửi về dạng **BẢN NHÁP PDF**. Đây là thư chung, ghi "Kính gửi: Quý Khách hàng", dài 1 trang A4, in trên letterhead THT, chưa có số thư. Anh chọn một trong các nút:
   - **✅ Duyệt – lưu vào My THT**: Agent cấp số thư (`001/2026/THT-TV`), dựng bản chính thức, lưu vào Kho Thư tư vấn và **tự đồng bộ sang My THT**.
   - **✏️ Sửa thư**: anh nhắn yêu cầu sửa, Agent gửi lại bản nháp mới.
   - **🖼 Làm thêm poster**
   - **❌ Huỷ**: thư không được lưu ở đâu cả.

Chỉ thư **đã duyệt** mới vào kho và sang My THT. Nếu My THT tạm lỗi, cứ 15 phút bot tự gửi lại cho tới khi thành công.

Kho Thư tư vấn (xem, tải PDF, chép nội dung email): `https://tht-bantin.thtdn.workers.dev/thu/`. Đăng nhập bằng mật khẩu ứng dụng.

---

## Dữ liệu cho My THT (giao cho phiên Claude Code của My THT)

Mục tiêu: My THT có tab **"Thư tư vấn"** chứa các thư đã duyệt. Trong tab này, người dùng gửi email cho khách hàng **theo danh sách khách hàng và danh sách email đã có trong My THT**, kèm file PDF.

### Cách 1 – Bot đẩy sang (khuyến nghị)

My THT viết route nhận thư như sau:

```
POST /api/tvl_letter_put
Header: x-tht-key: <TVL_KEY>        (Secret của My THT; bên bot đặt cùng giá trị vào Secret MYTHT_KEY)
Body JSON:
{
  "id": "tv1a2b3c",                              // khoá duy nhất; gửi lại cùng id thì ghi đè (upsert)
  "number": "001/2026/THT-TV",
  "subject": "Hộ kinh doanh chuyển sang kê khai từ 2026",
  "question": "…",                               // vấn đề được nêu ở đầu thư
  "conclusion": "…",
  "legal_basis": [{ "doc": "Nghị định …", "article": "Điều …" }],
  "recommendations": ["…"],
  "created_at": "2026-11-12T08:00:00Z",
  "approved_at": "2026-11-12T08:20:00Z",
  "email": { "subject": "[THT] Thư tư vấn số 001/2026/THT-TV – V/v: …", "body": "Kính gửi Quý Khách hàng, …" },
  "file": { "name": "THT_Thu-tu-van_001-2026-THT-TV.pdf", "type": "application/pdf", "base64": "…" }
}
Trả về: { "ok": true }          // lỗi thì trả { "ok": false, "error": "…" }, bot sẽ tự gửi lại
```

Sau khi My THT làm xong route, ở worker **tht-bantin** anh đặt:

- Biến `MYTHT_URL`: địa chỉ My THT.
- Secret `MYTHT_KEY`.

Thư đã duyệt trước đó mà chưa đồng bộ sẽ được bot tự gửi bù.

### Cách 2 – My THT tự kéo về

Dùng khi My THT không mở route nhận:

```
GET  https://tht-bantin.thtdn.workers.dev/hub/api/letters?since=<approved_at lần trước>
     Header x-hub-key: <HUB_KEY>
     → { "letters": [ { id, number, subject, question, conclusion, legal_basis, approved_at, pdf_url, file_name, email:{subject, body}, synced } ] }
GET  <pdf_url>                         (cùng header) → file PDF
POST https://tht-bantin.thtdn.workers.dev/hub/api/letters/<id>/synced   (cùng header) → đánh dấu đã lấy về
```

My THT chạy cron, ví dụ 15 phút một lần, để kéo thư mới.

### Việc My THT cần làm (prompt gợi ý)

> Thêm phân hệ "Thư tư vấn" (tiền tố action `tvl_*`, theo kiến trúc routes/services/repositories và THT Brand Style).
>
> 1. Route `POST /api/tvl_letter_put`: xác thực header `x-tht-key` bằng so sánh hằng thời gian với Secret `TVL_KEY`. Route này không dùng phiên đăng nhập. Upsert theo `id`. Lưu PDF lên SharePoint tại `HoSo/ThuTuVan/<năm>/<file.name>` qua Graph. Ghi bảng D1 `tvl_letters(id PK, number, subject, question, conclusion, legal_basis_json, recommendations_json, email_subject, email_body, file_name, file_url, approved_at, created_at, updated_at)`.
> 2. Bảng `tvl_sends(id PK, letter_id, client_id, email, sent_by, sent_at, status, error)` để ghi lịch sử gửi.
> 3. Tab "Thư tư vấn":
>    - Danh sách thư mới nhất trước, có ô tìm kiếm.
>    - Xem PDF.
>    - Nút **Gửi email**: chọn khách hàng theo danh sách KH (lọc theo nhóm, người phụ trách, đánh dấu tất cả), lấy email từ hồ sơ KH.
>    - Sửa được tiêu đề và nội dung email (mặc định lấy `email_subject`, `email_body`).
>    - Gửi qua Graph `sendMail` từ hộp thư người dùng (hoặc hộp chung tht@/danang@), đính kèm PDF. Mỗi khách một email riêng, không CC lộ danh sách. Ghi `tvl_sends`. Thư đã gửi cho khách nào thì hiện dấu đã gửi để tránh gửi trùng.
> 4. Quyền: Giám đốc và Quản trị được gửi. Nhân viên chỉ xem.
