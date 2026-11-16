"""Giọng đọc nam cho video chữ chuyển động – miễn phí.

Thứ tự: Gemini TTS (gói miễn phí, dùng GEMINI_API_KEY trong GitHub Secrets) → Microsoft Edge TTS (giọng Nam Minh)
→ không có giọng (video vẫn ra như cũ). Tất cả các đoạn của 1 video luôn dùng CÙNG một giọng.

    python video/voice.py "Câu thử giọng" out.wav
"""
import base64
import json
import os
import re
import subprocess
import time
from pathlib import Path

GEMINI_MODELS = [m for m in [os.environ.get("GEMINI_TTS_MODEL"), "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts",
                             "gemini-3.1-flash-tts-preview"] if m]
GEMINI_VOICE = os.environ.get("GEMINI_TTS_VOICE", "Charon")          # nam, giọng "Informative"
EDGE_VOICE = os.environ.get("EDGE_TTS_VOICE", "vi-VN-NamMinhNeural")
EDGE_RATE = os.environ.get("EDGE_TTS_RATE", "+6%")
STYLE = os.environ.get("VOICE_STYLE", "Giọng nam đọc bản tin thuế cho doanh nghiệp: rõ ràng, tự tin, chuyên nghiệp, "
                       "ấm, nhịp hơi nhanh như phát thanh viên, nhấn vào con số và mốc thời gian")
BASE = "https://generativelanguage.googleapis.com/v1beta"


def log(*a):
    print("[voice]", *a, flush=True)


# ---------------- chuẩn hoá chữ để máy đọc đúng ----------------
ABBR = {
    "THT": "Tê Hát Tê", "TNDN": "thu nhập doanh nghiệp", "TNCN": "thu nhập cá nhân", "GTGT": "giá trị gia tăng",
    "BHXH": "bảo hiểm xã hội", "BHYT": "bảo hiểm y tế", "BHTN": "bảo hiểm thất nghiệp", "HĐLĐ": "hợp đồng lao động",
    "HKD": "hộ kinh doanh", "DN": "doanh nghiệp", "TTĐB": "tiêu thụ đặc biệt", "BCTC": "báo cáo tài chính",
    "HĐĐT": "hoá đơn điện tử", "NNT": "người nộp thuế", "CQT": "cơ quan thuế", "MST": "mã số thuế",
    "NĐ-CP": "Nghị định", "TT-BTC": "Thông tư Bộ Tài chính", "QĐ-BTC": "Quyết định Bộ Tài chính", "QH15": "Quốc hội khoá 15",
    "CSHHL": "chủ sở hữu hưởng lợi", "ĐKKD": "đăng ký kinh doanh", "CV": "Công văn", "NĐ": "Nghị định", "TT": "Thông tư",
    "QĐ": "Quyết định", "HĐ": "hợp đồng", "KTV": "kiểm toán viên", "TSCĐ": "tài sản cố định", "VNĐ": "đồng", "VND": "đồng", "USD": "đô la Mỹ",
}


def speakable(s):
    s = str(s or "")
    s = re.sub(r"\b(\d+)/(\d{4})/([A-ZĐ0-9\-]+)", lambda m: f"số {int(m[1])} năm {m[2]}", s)   # 80/2021/TT-BTC
    s = re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", lambda m: f"ngày {int(m[1])} tháng {int(m[2])} năm {m[3]}", s)
    s = re.sub(r"\b(0?[1-9]|1[0-2])/(\d{4})\b", lambda m: f"tháng {int(m[1])} năm {m[2]}", s)
    s = re.sub(r"(\d)\s*[–\-]\s*(\d)", r"\1 đến \2", s)
    s = re.sub(r"\b(\d{3,})/(\d{4})\b", r"số \1 năm \2", s)                 # NĐ 288/2026
    s = s.replace("≥", " từ ").replace("≤", " không quá ").replace(">", " trên ").replace("<", " dưới ")
    s = re.sub(r"[()\[\]]", ", ", s)
    s = re.sub(r"\b([A-ZÀ-Ỹ]{2,}(?:\s+[A-ZÀ-Ỹ]{2,})+)\b", lambda m: m[0].lower().capitalize()
               if not all(w in ABBR for w in m[0].split()) else m[0], s)       # "MỨC PHẠT" → "Mức phạt"
    s = re.sub(r"(\d),(\d)", r"\1 phẩy \2", s)
    s = s.replace("%", " phần trăm").replace("&", " và ").replace("→", ", ").replace("•", ", ")
    for k in sorted(ABBR, key=len, reverse=True):
        s = re.sub(rf"(?<![\wÀ-ỹ]){re.escape(k)}(?![\wÀ-ỹ])", ABBR[k], s)
    s = re.sub(r"[\"“”«»*#_]", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    return re.sub(r",(\s*,)+", ",", s).strip()


def script_for(data):
    """Lời đọc cho từng cảnh, đúng thứ tự cảnh trong motion.html: hook, title, hl?, pt…, ac?, end."""
    seg = []
    hook = data.get("hook") or data.get("title1") or ""
    seg.append(("hook", hook))
    seg.append(("title", f"{data.get('title1', '')} {data.get('title2') or data.get('topic') or ''}"))
    hl = data.get("hl")
    if hl and hl.get("value"):
        seg.append(("hl", f"{hl.get('label', '')}: {hl.get('value', '')} {hl.get('unit', '')}. {hl.get('note', '')}"))
    for p in data.get("points") or []:
        seg.append(("pt", f"{p.get('title', '')}. {p.get('text', '')}"))
    acts = data.get("actions") or []
    if acts:
        label = (data.get("actions_label") or "Việc cần làm ngay").capitalize()
        seg.append(("ac", f"{label}: " + "; ".join(a.get("title", "") for a in acts if a.get("title")) + "."))
    seg.append(("end", f"{data.get('cta') or 'Theo dõi THT Audit để không bỏ lỡ chính sách mới'}. Hotline {data.get('phone', '0901 144 078')}."))
    out = []
    for k, t in seg:
        t = re.sub(r"\s*,\s*([.,;:!?])", r"\1", speakable(t)).strip(" ,")
        t = re.sub(r"([.!?]\s+)([a-zà-ỹ])", lambda m: m[1] + m[2].upper(), t)
        out.append((k, t if t[-1:] in ".!?" else t + "."))
    return out


# ---------------- Gemini TTS ----------------
def _find_audio(obj):
    """Tìm dữ liệu âm thanh base64 trong câu trả lời (API Interactions hoặc generateContent)."""
    if isinstance(obj, dict):
        if obj.get("type") == "audio" and obj.get("data"):
            return obj["data"], obj.get("mime_type") or "audio/wav"
        inl = obj.get("inlineData") or obj.get("inline_data")
        if isinstance(inl, dict) and inl.get("data"):
            return inl["data"], inl.get("mimeType") or inl.get("mime_type") or "audio/l16"
        for v in obj.values():
            r = _find_audio(v)
            if r:
                return r
    elif isinstance(obj, list):
        for v in reversed(obj):
            r = _find_audio(v)
            if r:
                return r
    return None


def _pcm_to_wav(pcm, out, rate=24000):
    import wave
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


class Quota(Exception):
    pass


def gemini_tts(text, out, model, key):
    import requests
    body = {"model": model, "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
            "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
            "response_format": {"type": "audio"}, "generation_config": {"speech_config": [{"voice": GEMINI_VOICE}]}}
    r = requests.post(f"{BASE}/interactions", headers={"x-goog-api-key": key, "content-type": "application/json"},
                      data=json.dumps(body), timeout=120)
    if r.status_code in (400, 404):      # API cũ: generateContent
        body = {"contents": [{"parts": [{"text": f"{STYLE}. Đọc đoạn sau bằng tiếng Việt: {text}"}]}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                                     "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_VOICE}}}}}
        r = requests.post(f"{BASE}/models/{model}:generateContent", headers={"x-goog-api-key": key, "content-type": "application/json"},
                          data=json.dumps(body), timeout=120)
    if r.status_code == 429:
        raise Quota(r.text[:200])
    if not r.ok:
        raise RuntimeError(f"Gemini TTS {model} {r.status_code}: {r.text[:200]}")
    found = _find_audio(r.json())
    if not found:
        raise RuntimeError(f"Gemini TTS {model}: không có âm thanh trong kết quả")
    raw = base64.b64decode(found[0])
    if raw[:4] == b"RIFF":
        Path(out).write_bytes(raw)
    else:
        rate = int((re.search(r"rate=(\d+)", found[1]) or [0, 24000])[1])
        _pcm_to_wav(raw, out, rate)


def _gemini_all(texts, folder, key):
    last = None
    for model in GEMINI_MODELS:
        files = []
        try:
            for i, t in enumerate(texts):
                f = folder / f"v{i:02d}.wav"
                for attempt in range(3):          # gói miễn phí giới hạn số lượt/phút → chờ rồi thử lại
                    try:
                        gemini_tts(t, f, model, key); break
                    except Quota as e:
                        if attempt == 2:
                            raise
                        log(f"{model} hết lượt/phút, chờ 25s"); time.sleep(25)
                files.append(f)
            return files, f"Gemini {model} ({GEMINI_VOICE})"
        except Exception as e:  # thử model khác
            last = e
            log(f"{model} lỗi: {str(e)[:160]}")
    raise RuntimeError(f"Gemini TTS không dùng được: {str(last)[:160]}")


# ---------------- Microsoft Edge TTS ----------------
def _ensure_edge():
    """Gọi edge-tts qua chính python đang chạy (không phụ thuộc PATH); thiếu thì tự cài."""
    import importlib.util
    import sys
    if importlib.util.find_spec("edge_tts") is None:
        log("chưa có edge-tts → tự cài")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "edge-tts"], check=True, capture_output=True, timeout=180)
    return [sys.executable, "-m", "edge_tts"]


def _edge_all(texts, folder):
    files = []
    cmd = _ensure_edge()
    for i, t in enumerate(texts):
        f = folder / f"e{i:02d}.mp3"
        subprocess.run([*cmd, "--voice", EDGE_VOICE, f"--rate={EDGE_RATE}", "--text", t, "--write-media", str(f)],
                       capture_output=True, timeout=90, check=False)
        if not f.exists() or f.stat().st_size < 1000:
            raise RuntimeError("edge-tts không tạo được âm thanh")
        files.append(f)
    return files, f"Edge {EDGE_VOICE.split('-')[-1].replace('Neural', '')}"


def duration(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def synthesize(segments, folder):
    """segments: [(kind, text)] → ([{kind, text, file, dur}], tên giọng). Lỗi hết → ([], lý do)."""
    folder = Path(folder); folder.mkdir(parents=True, exist_ok=True)
    texts = [t for _, t in segments]
    errors = []
    engines = os.environ.get("VOICE_ENGINES", "gemini,edge").split(",")
    for eng in engines:
        try:
            if eng == "gemini":
                key = os.environ.get("GEMINI_API_KEY")
                if not key:
                    errors.append("chưa có GEMINI_API_KEY trong GitHub Secrets"); continue
                files, name = _gemini_all(texts, folder, key)
            elif eng == "edge":
                files, name = _edge_all(texts, folder)
            else:
                continue
            return [{"kind": k, "text": t, "file": f, "dur": duration(f)} for (k, t), f in zip(segments, files)], name
        except Exception as e:
            errors.append(f"{eng}: {str(e)[:140]}")
            log(errors[-1])
    return [], "; ".join(errors) or "đã tắt giọng đọc"


if __name__ == "__main__":
    import sys
    segs, name = synthesize([("x", speakable(sys.argv[1]))], Path(sys.argv[2]).parent / "voice_test")
    if segs:
        Path(sys.argv[2]).write_bytes(Path(segs[0]["file"]).read_bytes())
    print(name, segs[0]["dur"] if segs else "")
