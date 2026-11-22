"""Dựng video chữ chuyển động (motion graphics) 1080×1920 từ nội dung bản tin, bằng trang video/motion.html.

Mỗi khung hình: gọi window.seek(t) rồi chụp JPEG, đẩy thẳng vào ffmpeg (không lưu PNG từng khung).
    python video/motion.py data.json out.mp4 [nhạc.mp3]
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FPS = 30


VOICE_LEAD = 0.45   # giọng bắt đầu sau khi cảnh hiện 0,45 s (chờ hiệu ứng quét nền)


def render_motion(data, out, music=None, fps=FPS, voice=None):
    """voice: None = theo biến VOICE (mặc định bật). Kết quả giọng ghi vào data['voice_name'] / data['voice_error']."""
    from playwright.sync_api import sync_playwright

    out = Path(out)
    segs = []
    if voice if voice is not None else os.environ.get("VOICE", "1") != "0":
        try:
            from voice import script_for, synthesize
            segs, name = synthesize(script_for(data), out.with_name(out.stem + "_voice"))
            if segs:
                data["vdur"] = [x["dur"] for x in segs]; data["voice_name"] = name
            else:
                data["voice_error"] = name
        except Exception as e:  # giọng đọc lỗi không được làm hỏng video
            data["voice_error"] = f"{type(e).__name__}: {str(e)[:140]}"
    tmp = out.with_name(out.stem + ".tmp.mp4")
    silent = out.with_name(out.stem + ".silent.mp4")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        page.goto((HERE / "motion.html").as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        total = float(page.evaluate("d => setup(d)", data))
        frames = int(round(total * fps))
        enc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(fps), str(tmp)],
            stdin=subprocess.PIPE)
        for i in range(frames):
            page.evaluate("t => seek(t)", i / fps)
            enc.stdin.write(page.screenshot(type="jpeg", quality=90))
        enc.stdin.close()
        if enc.wait() != 0:
            raise RuntimeError("ffmpeg dựng hình lỗi")
        cues = page.evaluate("cues()")
        scenes = page.evaluate("scenes()")
        browser.close()
    voices = [(sc["start"] + VOICE_LEAD, sg["file"]) for sc, sg in zip(scenes, segs)] if len(scenes) == len(segs) else []
    if segs and not voices:
        data["voice_error"] = "số cảnh không khớp lời đọc"; data.pop("voice_name", None)
    tmp.rename(silent)
    mix_audio(silent, tmp, total, music, cues, voices)
    tmp.replace(out)
    silent.unlink(missing_ok=True)
    return total


# ---------------- âm thanh: nhạc nền sôi động + hiệu ứng theo nhịp cảnh ----------------
# Hiệu ứng tự tổng hợp bằng ffmpeg (không cần file, không vướng bản quyền)
SFX = {
    "whoosh": "anoisesrc=d=0.55:c=pink:a=0.55,highpass=f=500,lowpass=f=5200,afade=t=in:d=0.28,afade=t=out:st=0.28:d=0.27",
    "swish": "anoisesrc=d=0.3:c=pink:a=0.3,highpass=f=1600,lowpass=f=7000,afade=t=in:d=0.12,afade=t=out:st=0.12:d=0.18",
    "pop": "aevalsrc='0.65*sin(2*PI*t*(500+3200*t))*exp(-28*t)':d=0.2",
    "tick": "aevalsrc='0.45*sin(2*PI*2000*t)*exp(-80*t)+0.25*sin(2*PI*3100*t)*exp(-90*t)':d=0.09",
    "impact": "aevalsrc='0.9*sin(2*PI*55*t)*exp(-5*t)+0.35*sin(2*PI*110*t)*exp(-9*t)':d=0.9",
}
SFX_VOL = {"whoosh": 0.9, "swish": 0.6, "pop": 0.7, "tick": 0.6, "impact": 1.0}
SFX_VOL_VOICE = 0.6   # có giọng đọc → hiệu ứng nhỏ lại để không lấn lời
ENERGETIC = ("kich-tinh", "hien-dai", "soi-dong", "upbeat")


def pick_music(music_dir, rng=None, mood=""):
    """mood (agent xu hướng chọn): du-duong / hien-dai / hoi-hop / kich-tinh / upbeat → lấy bài cùng tâm trạng.
    Không có mood: ưu tiên nhạc sôi động: music/upbeat/ → kich-tinh-*, hien-dai-* → bài bất kỳ."""
    import random
    rng = rng or random
    music_dir = Path(music_dir)
    ext = (".mp3", ".m4a", ".aac", ".wav")
    if mood:
        cand = [p for p in music_dir.glob("*") if p.suffix.lower() in ext and p.name.startswith(mood)]
        if (music_dir / mood).is_dir():
            cand += [p for p in (music_dir / mood).glob("*") if p.suffix.lower() in ext]
        if cand:
            return rng.choice(cand)
    up = [p for p in (music_dir / "upbeat").glob("*") if p.suffix.lower() in ext] if (music_dir / "upbeat").exists() else []
    allt = [p for p in music_dir.glob("*") if p.suffix.lower() in ext]
    hot = [p for p in allt if p.name.startswith(ENERGETIC)]
    pool = up or hot or allt
    return rng.choice(pool) if pool else None


def mix_audio(video, out, total, music, cues, voices=None):
    inputs, chains, labels = ["-i", str(video)], [], []
    idx = 1
    vlabels = []
    for k, (t, f) in enumerate(voices or []):
        ms = int(t * 1000)
        inputs += ["-i", str(f)]
        chains.append(f"[{idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=70,"
                      f"acompressor=threshold=0.1:ratio=3:attack=5:release=120,volume=1.6,adelay={ms}|{ms}[v{k}]")
        vlabels.append(f"[v{k}]"); idx += 1
    if vlabels:
        chains.append(f"{''.join(vlabels)}amix=inputs={len(vlabels)}:duration=longest:normalize=0,apad=whole_dur={total:.2f},asplit=2[vo][vsc]")
    if music and Path(music).exists():
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        chains.append(f"[{idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:{total:.2f},"
                      f"acompressor=threshold=0.25:ratio=3:attack=10:release=200,bass=g=3,volume={0.45 if vlabels else 0.7},"
                      f"afade=t=in:d=0.5,afade=t=out:st={max(0, total - 1.6):.2f}:d=1.6[m0]")
        if vlabels:   # nhạc tự nhỏ xuống khi có giọng đọc
            chains.append("[m0][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450:makeup=1[m]")
        else:
            chains.append("[m0]anull[m]")
        labels.append("[m]"); idx += 1
    elif vlabels:
        chains.append("[vsc]anullsink")
    if vlabels:
        labels.append("[vo]")
    for k, c in enumerate(cues or []):
        src = SFX.get(c.get("k"))
        if not src or c["t"] >= total - 0.1:
            continue
        ms = int(c["t"] * 1000)
        inputs += ["-f", "lavfi", "-i", src]
        chains.append(f"[{idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={SFX_VOL.get(c['k'], 0.7) * (SFX_VOL_VOICE if voices else 1):.2f},adelay={ms}|{ms}[s{k}]")
        labels.append(f"[s{k}]"); idx += 1
    if not labels:
        inputs += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        chains.append(f"[{idx}:a]anull[m]"); labels.append("[m]")
    chains.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,alimiter=limit=0.95,atrim=0:{total:.2f}[a]")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chains),
           "-map", "0:v", "-map", "[a]", "-t", f"{total:.2f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)


THEMES = ["gold", "paper", "green", "red"]
STYLE_THEME = {"1": "red", "2": "paper", "3": "green", "4": "gold", "5": "paper", "6": "gold"}


def from_content(c, phone="0901 144 078", website="thtaudit.com.vn"):
    """Ánh xạ nội dung poster → kịch bản video (không tốn thêm API)."""
    def items(block, n=3):
        arr = (block or {}).get("items", []) if isinstance(block, dict) else (block or [])
        out = []
        for x in arr[:n]:
            if isinstance(x, str):
                out.append({"title": x, "text": ""})
            else:
                out.append({"title": x.get("title") or x.get("label") or "", "text": x.get("text") or ""})
        return [x for x in out if x["title"]]
    weekly = c.get("weekly") or []
    if weekly:
        return {
            "theme": c.get("theme") or "paper", "eyebrow": c.get("eyebrow") or "BẢN TIN TUẦN",
            "hook": c.get("story_hook") or f"{len(weekly)} tin thuế – kế toán quan trọng tuần này",
            "title1": c.get("title_line1", "Tổng hợp tin tuần"), "title2": c.get("title_line2", ""), "topic": "Tin thuế tuần",
            "doc_ref": c.get("week_label", ""), "hl": None,
            "points": [{"title": w.get("title", ""), "text": w.get("line", "")} for w in weekly[:5] if w.get("title")], "points_label": "TIN",
            "actions": items(c.get("actions")), "actions_label": "VIỆC CẦN LÀM TUẦN TỚI",
            "cta": "Theo dõi THT Audit – mỗi tuần 1 bản tổng hợp", "phone": phone, "website": website,
        }
    return {
        "theme": c.get("theme") or STYLE_THEME.get(str(c.get("style", "")), "gold"),
        "palette": c.get("palette") or None,
        "hook": c.get("story_hook") or c.get("title_question") or "",
        "title1": c.get("title_line1", ""), "title2": c.get("title_line2", ""), "topic": c.get("topic_short", ""),
        "doc_ref": c.get("doc_ref", ""), "hl": c.get("highlight") or None,
        "points": items(c.get("points")), "points_label": "NỘI DUNG",
        "actions": items(c.get("actions")),
        "phone": phone, "website": website,
    }


if __name__ == "__main__":
    d = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if "title_line1" in d:
        d = from_content(d)
    secs = render_motion(d, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print(f"ok {secs:.1f}s giọng: {d.get('voice_name') or d.get('voice_error')}")
