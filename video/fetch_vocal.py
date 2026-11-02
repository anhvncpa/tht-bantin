"""Lấy nhạc CÓ LỜI (giấy phép Creative Commons Attribution – CC BY) từ ccMixter vào music/vocal/.

- Chạy tự động ngày 1 hằng tháng (.github/workflows/fetch-vocal.yml), hoặc chạy tay trong tab Actions.
- Mỗi lần: xoá bài tháng trước, lấy N bài mới (mặc định 10), ưu tiên bài được đánh giá cao, không lặp lại bài đã dùng.
- Mỗi bài cắt còn 50 giây, 128 kbps cho repo nhẹ (video chỉ dài 9–30 giây).
- CC BY cho phép dùng thương mại nhưng BẮT BUỘC ghi công: thông tin ghi công lưu ở music/vocal/credits.json,
  video/run.py tự chèn dòng ghi công lên video, vào mô tả YouTube và caption TikTok.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "music" / "vocal"
CREDITS = DIR / "credits.json"
USED = DIR / "used_ids.txt"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
API = ("https://ccmixter.org/api/query?f=json&tags=female_vocals,male_vocals&type=any"
       "&lic=by&sort=rank&ord=desc&limit=400")
# Bỏ bài không hợp với hình ảnh công ty kiểm toán
BAD = re.compile(r"(sexy|explicit|nsfw|profan|drug|horror|death|metal|industrial|noise|scream|gore|occult)", re.I)
UA = {"User-Agent": "Mozilla/5.0 (THT ban tin - monthly music fetch)"}


def get(url):
    # Dùng curl: máy chủ ccMixter trả header rất dài, thư viện urllib của Python từ chối.
    return subprocess.run(["curl", "-fsSL", "--retry", "3", "--max-time", "300", "-A", UA["User-Agent"], url],
                          check=True, capture_output=True).stdout


def slug(s):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s[:40] or "bai"


def seconds(ps):
    try:
        parts = [int(x) for x in str(ps).split(":")]
        return parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0] * 3600 + parts[1] * 60 + parts[2]
    except Exception:
        return 0


def main_mix(item):
    """File bản phối hoàn chỉnh (bỏ file tách giọng/sample)."""
    for f in item.get("files") or []:
        info = f.get("file_format_info") or {}
        kind = (f.get("file_extra") or {}).get("type")
        if info.get("mime_type") == "audio/mpeg" and kind not in ("pella", "samples") and f.get("download_url"):
            return f
    return None


def main():
    DIR.mkdir(parents=True, exist_ok=True)
    used = set(USED.read_text().split()) if USED.exists() else set()
    items = json.loads(get(API))
    picked = []
    for it in items:
        uid = str(it.get("upload_id"))
        ex = it.get("upload_extra") or {}
        tags = f"{ex.get('usertags', '')},{it.get('upload_name', '')}"
        if uid in used or ex.get("nsfw") or BAD.search(tags):
            continue
        if "/licenses/by/" not in (it.get("license_url") or ""):
            continue  # chỉ nhận đúng CC BY (dùng thương mại được)
        f = main_mix(it)
        if f and 60 <= seconds((f.get("file_format_info") or {}).get("ps")) <= 600:
            picked.append((it, f))
        if len(picked) >= N:
            break
    if not picked:
        print("Không tìm được bài mới – giữ nguyên nhạc hiện có.")
        return

    for p in DIR.glob("*.mp3"):
        p.unlink()
    credits, ok = {}, 0
    tmp = DIR / "_tai_ve.tmp"
    for it, f in picked:
        uid = str(it["upload_id"])
        name = f"{slug(it.get('upload_name', ''))}-{uid}.mp3"
        dur = seconds((f.get("file_format_info") or {}).get("ps"))
        start = 30 if dur >= 120 else 0  # bỏ đoạn dạo đầu để có lời sớm
        try:
            tmp.write_bytes(get(f["download_url"]))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-t", "50", "-i", str(tmp),
                            "-af", "afade=t=in:d=1", "-ac", "2", "-ar", "44100", "-b:a", "128k", str(DIR / name)],
                           check=True)
        except Exception as e:
            print(f"Bỏ qua {name}: {e}")
            continue
        title = it.get("upload_name", "").replace('"', "").strip()
        artist = (it.get("user_real_name") or it.get("user_name") or "").strip()
        feat = ((it.get("upload_extra") or {}).get("featuring") or "").strip()
        ver = re.search(r"/by/([\d.]+)", it.get("license_url") or "")
        lic = f"CC BY {ver.group(1)}" if ver else "CC BY"
        who = artist + (f" ft. {feat}" if feat else "")
        credits[name] = {
            "short": f"{title} – {who}",
            "full": f"“{title}” – {who}, {lic} ({it.get('file_page_url', 'ccmixter.org')})",
            "license_url": it.get("license_url"),
            "source": it.get("file_page_url"),
        }
        used.add(uid)
        ok += 1
        print(f"OK {name} | {credits[name]['full']}")
    tmp.unlink(missing_ok=True)
    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding="utf-8")
    USED.write_text("\n".join(sorted(used, key=int)) + "\n")
    print(f"Đã lấy {ok} bài.")


if __name__ == "__main__":
    main()
