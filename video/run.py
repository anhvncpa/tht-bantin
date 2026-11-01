"""Dựng video dọc có nhạc từ các trang poster rồi đăng Facebook Story, TikTok, YouTube Shorts.

Chạy trong GitHub Actions (xem .github/workflows/video.yml):
    python video/run.py <job_id> story,tiktok,youtube
"""
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

WORKER = os.environ["WORKER_URL"].rstrip("/")
IKEY = os.environ["INTERNAL_KEY"]
H = {"x-internal-key": IKEY}
ROOT = Path(__file__).resolve().parent.parent
MUSIC_DIR = ROOT / "music"
FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"]


def log(*a):
    print(*a, flush=True)


# ---------------- video ----------------
def esc_drawtext(s):
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")


def make_video(frames, hook, out, seconds_per_page=None):
    n = len(frames)
    per = seconds_per_page or (9 if n == 1 else 7)
    fade = 0.6
    work = Path(tempfile.mkdtemp())
    segs = []
    for i, f in enumerate(frames):
        seg = work / f"seg{i}.mp4"
        frames_n = int(per * 30)
        # slow zoom-in (Ken Burns) on each page
        vf = (f"scale=2160:3840,zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              f":d={frames_n}:s=1080x1920:fps=30,format=yuv420p")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(f), "-t", str(per), "-vf", vf,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(seg)], check=True)
        segs.append(seg)
    # crossfade pages together
    joined = work / "joined.mp4"
    if n == 1:
        shutil.copy(segs[0], joined)
    else:
        inputs, chain, last, offset = [], [], "[0:v]", 0.0
        for s in segs:
            inputs += ["-i", str(s)]
        for i in range(1, n):
            offset += per - fade
            chain.append(f"{last}[{i}:v]xfade=transition=slideleft:duration={fade}:offset={offset:.2f}[v{i}]")
            last = f"[v{i}]"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chain), "-map", last,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(joined)], check=True)
    total = per * n - fade * (n - 1)
    # hook text in the first 3.5 s
    font = next((f for f in FONT_CANDIDATES if os.path.exists(f)), None)
    vf = "null"
    if hook and font:
        words, lines = hook.split(), [hook]
        if len(hook) > 24 and len(words) > 1:  # wrap into 2 balanced lines
            best = min(range(1, len(words)), key=lambda k: abs(len(" ".join(words[:k])) - len(" ".join(words[k:]))))
            lines = [" ".join(words[:best]), " ".join(words[best:])]
        fs = min(64, int(960 / (max(len(l) for l in lines) * 0.6)))
        lh = int(fs * 1.3)
        box_h = lh * len(lines) + 60
        parts = [f"drawbox=x=0:y=140:w=iw:h={box_h}:color=0x172B3B@0.9:t=fill:enable='lt(t,3.5)'"]
        for i, line in enumerate(lines):
            parts.append(f"drawtext=fontfile={font}:text='{esc_drawtext(line)}':fontcolor=white:fontsize={fs}:"
                         f"x=(w-text_w)/2:y={170 + i * lh}:enable='lt(t,3.5)'")
        vf = ",".join(parts)
    tracks = [p for p in MUSIC_DIR.glob("*") if p.suffix.lower() in (".mp3", ".m4a", ".aac", ".wav")]
    music = random.choice(tracks) if tracks else None
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined)]
    if music:
        cmd += ["-stream_loop", "-1", "-i", str(music)]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    af = f"afade=t=in:d=0.8,afade=t=out:st={max(0, total - 1.5):.2f}:d=1.5,volume=0.8"
    cmd += ["-filter_complex", f"[0:v]{vf}[v];[1:a]{af}[a]", "-map", "[v]", "-map", "[a]", "-t", f"{total:.2f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    shutil.rmtree(work, ignore_errors=True)
    return music.name if music else None, total


# ---------------- Facebook Story ----------------
def post_fb_story(path):
    ver = os.environ.get("FB_GRAPH_VERSION", "v26.0")
    page, token = os.environ["FB_PAGE_ID"], os.environ["FB_PAGE_TOKEN"]
    base = f"https://graph.facebook.com/{ver}/{page}/video_stories"
    r = requests.post(base, data={"upload_phase": "start", "access_token": token}, timeout=60).json()
    if "video_id" not in r:
        raise RuntimeError(f"FB start: {r}")
    data = Path(path).read_bytes()
    up = requests.post(r["upload_url"], headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(len(data))},
                       data=data, timeout=300).json()
    if not up.get("success"):
        raise RuntimeError(f"FB upload: {up}")
    fin = requests.post(base, data={"upload_phase": "finish", "video_id": r["video_id"], "access_token": token}, timeout=60).json()
    if not fin.get("success", fin.get("post_id")):
        raise RuntimeError(f"FB finish: {fin}")
    return "đã đăng story"


# ---------------- TikTok ----------------
def post_tiktok(path, caption, mode, privacy):
    token = requests.post(f"{WORKER}/api/internal/tiktok-token", headers=H, timeout=60).json()["access_token"]
    th = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"}
    size = os.path.getsize(path)
    source = {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}
    if mode == "direct":
        info = requests.post("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", headers=th, timeout=60).json().get("data", {})
        opts = info.get("privacy_level_options") or ["SELF_ONLY"]
        body = {"post_info": {"title": caption[:2100], "privacy_level": privacy if privacy in opts else opts[0],
                              "disable_comment": False, "disable_duet": False, "disable_stitch": False},
                "source_info": source}
        url = "https://open.tiktokapis.com/v2/post/publish/video/init/"
    else:
        body = {"source_info": source}
        url = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
    r = requests.post(url, headers=th, json=body, timeout=60).json()
    if r.get("error", {}).get("code") not in (None, "ok"):
        raise RuntimeError(f"TikTok: {r['error']}")
    up = requests.put(r["data"]["upload_url"], data=Path(path).read_bytes(), timeout=300,
                      headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size - 1}/{size}"})
    if up.status_code not in (200, 201):
        raise RuntimeError(f"TikTok upload {up.status_code}: {up.text[:200]}")
    return "đã gửi vào hộp thư TikTok – mở app, kiểm tra nhạc/caption rồi bấm Đăng" if mode != "direct" else "đã đăng"


# ---------------- YouTube Shorts ----------------
def post_youtube(path, title, description, tags, privacy):
    tok = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
        "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}, timeout=60).json()
    if "access_token" not in tok:
        raise RuntimeError(f"YouTube token: {tok}")
    size = os.path.getsize(path)
    if "#shorts" not in title.lower():
        title = (title[:88] + " #Shorts")
    meta = {"snippet": {"title": title[:100], "description": description[:4900], "tags": tags[:15],
                        "categoryId": "27", "defaultLanguage": "vi", "defaultAudioLanguage": "vi"},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}}
    init = requests.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                         headers={"Authorization": f"Bearer {tok['access_token']}", "Content-Type": "application/json; charset=UTF-8",
                                  "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
                         data=json.dumps(meta), timeout=60)
    if init.status_code != 200:
        raise RuntimeError(f"YouTube init {init.status_code}: {init.text[:200]}")
    up = requests.put(init.headers["Location"], data=Path(path).read_bytes(), headers={"Content-Type": "video/mp4"}, timeout=600)
    if up.status_code not in (200, 201):
        raise RuntimeError(f"YouTube upload {up.status_code}: {up.text[:200]}")
    vid = up.json()["id"]
    return f"https://youtube.com/shorts/{vid} ({privacy})"


def main():
    job_id, targets = sys.argv[1], [t for t in sys.argv[2].split(",") if t]
    man = requests.get(f"{WORKER}/api/internal/job/{job_id}", headers=H, timeout=60).json()
    work = Path(tempfile.mkdtemp())
    frames = []
    for i, key in enumerate(man["stories"]):
        p = work / f"story{i + 1}.png"
        p.write_bytes(requests.get(f"{WORKER}/api/internal/file/{requests.utils.quote(key, safe='')}", headers=H, timeout=60).content)
        frames.append(p)
    out = work / "story.mp4"
    music, secs = make_video(frames, man.get("story_hook", ""), out)
    log(f"video {secs:.1f}s, music={music}")
    requests.put(f"{WORKER}/api/internal/video/{job_id}", headers=H, data=out.read_bytes(), timeout=300)

    results = [f"🎬 Video {secs:.0f}s, nhạc: {music or 'không có (thêm file vào thư mục music/)'}"]
    tags = " ".join(man.get("hashtags", []))
    if man.get("dry_run"):
        results.append("Chế độ thử: đã dựng video, chưa đăng lên nền tảng nào.")
    else:
        if "story" in targets:
            try: results.append(f"📱 FB Story: {post_fb_story(out)}")
            except Exception as e: results.append(f"📱 FB Story lỗi: {e}")
        if "tiktok" in targets:
            try: results.append(f"🎵 TikTok: {post_tiktok(out, man['tiktok_caption'] or tags, man['tiktok_mode'], man['tiktok_privacy'])}")
            except Exception as e: results.append(f"🎵 TikTok lỗi: {e}")
        if "youtube" in targets:
            try: results.append(f"▶️ YouTube: {post_youtube(out, man['youtube_title'], man['youtube_description'], man.get('youtube_tags', []), man['youtube_privacy'])}")
            except Exception as e: results.append(f"▶️ YouTube lỗi: {e}")
    requests.post(f"{WORKER}/api/internal/notify/{job_id}", headers=H, json={"results": results}, timeout=60)
    log("\n".join(results))


if __name__ == "__main__":
    main()
