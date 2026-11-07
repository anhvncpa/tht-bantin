# THT Agent Hub – hướng dẫn nối thêm AI Agent

Trang xem: **https://tht-bantin.thtdn.workers.dev/hub/** (đăng nhập bằng mật khẩu ứng dụng `APP_PASSWORD`).

Bot Bản tin đã tự gửi nhật ký. Agent khác (Zalo bot, bot kế toán, agent XDCB…) chỉ cần gọi 2 API dưới đây.

## Khoá bảo mật

Trên Cloudflare (Workers & Pages → tht-bantin → Settings → Variables and Secrets) thêm **Secret** `HUB_KEY`
(một chuỗi dài ngẫu nhiên). Nếu chưa có `HUB_KEY`, Hub tạm dùng `INTERNAL_KEY`.
Mọi agent gửi khoá này trong header `x-hub-key`. Không đưa khoá vào nhóm chat hay file chia sẻ.

## 1. Đăng ký agent (1 lần, hoặc mỗi lần khởi động)

`POST /hub/api/agent`

```json
{ "id": "zalo", "name": "Zalo Bot nhắc khách", "icon": "💬", "color": "#1C7ED6",
  "description": "Gửi tin nhắc chứng từ, thanh toán vào nhóm Zalo khách hàng",
  "steps": [ {"id":"list","label":"Lấy danh sách"}, {"id":"send","label":"Gửi tin"}, {"id":"report","label":"Báo cáo"} ] }
```

## 2. Gửi sự kiện (mỗi bước)

`POST /hub/api/event`

| Trường | Ý nghĩa |
|---|---|
| `agent` | id agent đã đăng ký |
| `run` | mã 1 lượt việc (vd `zalo-2026-11-07`, `kt-q3-0401838127`) – các sự kiện cùng `run` gom thành 1 dòng thời gian |
| `runTitle` | tên lượt việc hiển thị (gửi ở sự kiện đầu) |
| `step` | id bước (trùng `steps` lúc đăng ký) → sáng lên trên sơ đồ luồng |
| `status` | `start` (đang chạy) · `done` (xong) · `waiting` (chờ người duyệt) · `error` (lỗi) · `info` · `ai` |
| `title` | 1 câu ngắn: vừa làm gì / quyết định gì |
| `detail` | (tuỳ chọn) chi tiết AI đã nghĩ, dữ liệu, lỗi – tối đa ~12.000 ký tự |
| `cost` | (tuỳ chọn) chi phí AI USD của bước này |

## Mẫu code

**Google Apps Script (Zalo bot):**

```js
function hub(path, body) {
  const key = PropertiesService.getScriptProperties().getProperty('HUB_KEY');
  UrlFetchApp.fetch('https://tht-bantin.thtdn.workers.dev/hub/api/' + path, {
    method: 'post', contentType: 'application/json', headers: { 'x-hub-key': key },
    payload: JSON.stringify(body), muteHttpExceptions: true });
}
// hub('event', { agent: 'zalo', run: 'zalo-' + today, runTitle: 'Nhắc chứng từ tháng 10', step: 'send', status: 'start', title: 'Đang gửi 18 nhóm' });
```

**Python (bot kế toán):**

```python
import os, requests
def hub(path, **body):
    try:
        requests.post(f"https://tht-bantin.thtdn.workers.dev/hub/api/{path}", json=body,
                      headers={"x-hub-key": os.environ["HUB_KEY"]}, timeout=5)
    except Exception:
        pass  # Hub lỗi không được làm dừng bot
# hub("event", agent="ketoan", run="kt-q3-0401838127", runTitle="Q3/2026 · Cty 0401838127",
#     step="book", status="done", title="Định khoản xong 142 hoá đơn", detail="3 hoá đơn cần kiểm tra lại: ...")
```

Nguyên tắc: gửi nhật ký **không được làm hỏng agent** – luôn bọc try/except, timeout ngắn.
Hub giữ dữ liệu 90 ngày.
