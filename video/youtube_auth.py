"""Lấy YT_REFRESH_TOKEN một lần, chạy trên máy tính của anh:

    pip install requests
    python youtube_auth.py <CLIENT_ID> <CLIENT_SECRET>

Trình duyệt mở trang Google → chọn kênh YouTube của THT → Cho phép.
Script in ra refresh token để dán vào GitHub Secrets (YT_REFRESH_TOKEN).
OAuth client phải là loại "Desktop app" trong Google Cloud Console (đã bật YouTube Data API v3).
"""
import http.server
import sys
import urllib.parse
import webbrowser

import requests

CID, SECRET = sys.argv[1], sys.argv[2]
REDIRECT = "http://127.0.0.1:8765"
code_box = {}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code_box["code"] = q.get("code", [""])[0]
        self.send_response(200)
        self.send_header("content-type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Xong, quay lại cửa sổ dòng lệnh.".encode())

    def log_message(self, *a):
        pass


url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
    "client_id": CID, "redirect_uri": REDIRECT, "response_type": "code", "access_type": "offline", "prompt": "consent",
    "scope": "https://www.googleapis.com/auth/youtube.upload"})
print("Mở trình duyệt để đăng nhập Google…\n", url)
webbrowser.open(url)
http.server.HTTPServer(("127.0.0.1", 8765), H).handle_request()
tok = requests.post("https://oauth2.googleapis.com/token", data={
    "code": code_box["code"], "client_id": CID, "client_secret": SECRET, "redirect_uri": REDIRECT,
    "grant_type": "authorization_code"}).json()
print("\nYT_REFRESH_TOKEN =", tok.get("refresh_token") or tok)
