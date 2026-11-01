// Bản tin THT – front-end logic
(function () {
  const $ = (id) => document.getElementById(id);
  const { STYLES, fontsHref, renderPage, pageCount } = window.THTTemplates;
  const A4W = 794, A4H = 1123, MIN_ZOOM = 0.88;
  const BRAND = { phone: "0901 144 078", emails: ["tht@thtaudit.com.vn", "danang@thtaudit.com.vn"], website: "thtaudit.com.vn" };

  const state = { key: "", files: [], style: "1", content: null, checks: "", table: null, config: null, zoom: 1, fromApi: false };

  // ---------- storage (per-browser convenience only) ----------
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (_) {} },
  };

  // ---------- API ----------
  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { "x-app-key": state.key, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401) { store.del("tht-key"); showLogin("Mật khẩu không đúng hoặc đã đổi. Đăng nhập lại."); throw new Error("Chưa đăng nhập"); }
    if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
    return data;
  }

  const busy = (text) => { $("busyText").textContent = text; $("busy").hidden = false; };
  const idle = () => { $("busy").hidden = true; };
  const show = (el, text, kind) => { el.textContent = text; el.className = `msg ${kind}`; el.hidden = !text; };

  // ---------- login ----------
  function showLogin(err) {
    $("app").hidden = true; $("login").hidden = false; $("modePill").hidden = true;
    if (err) show($("loginErr"), err, "err");
    $("pw").focus();
  }

  async function enter() {
    try {
      state.config = await api("/api/config");
      $("login").hidden = true; $("app").hidden = false;
      const pill = $("modePill");
      pill.hidden = false;
      if (state.config.dryRun) { pill.textContent = "CHẾ ĐỘ THỬ"; pill.className = "pill"; }
      else { pill.textContent = state.config.facebookReady ? "ĐĂNG THẬT" : "CHƯA NỐI FACEBOOK"; pill.className = "pill live"; }
      if (!$("qrUrl").value) $("qrUrl").value = state.config.defaultQr || "";
      loadHistory();
    } catch (e) {
      if (e.message !== "Chưa đăng nhập") showLogin(e.message);
    }
  }

  $("loginForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    state.key = $("pw").value;
    store.set("tht-key", state.key);
    enter();
  });

  // ---------- style picker ----------
  const SWATCH = { "1": ["#172B3B", "#FC5A1B", "#FFFFFF"], "2": ["#FFFFFF", "#2345F5", "#0E1116"], "3": ["#0F2E2C", "#9BE7C4", "#F2C14E"], "4": ["#FBFBFA", "#6B1E2E", "#D9D2D3"], "5": ["#FFD23F", "#1E1E24", "#FF5C39"] };
  function renderStyles() {
    $("styles").innerHTML = Object.entries(STYLES).map(([k, s]) =>
      `<button type="button" class="sw" data-style="${k}" aria-pressed="${k === state.style}"><span class="chip">${SWATCH[k].map((c) => `<span style="background:${c}"></span>`).join("")}</span><span class="lb">${k}. ${s.name}</span></button>`).join("");
  }
  $("styles").addEventListener("click", (ev) => {
    const b = ev.target.closest(".sw"); if (!b) return;
    state.style = b.dataset.style; store.set("tht-style", state.style); renderStyles();
    if (state.content) renderPoster();
  });

  // ---------- files ----------
  function renderFiles() {
    $("files").innerHTML = state.files.map((f, i) =>
      `<div class="file"><span class="n">${f.file.name.replace(/</g, "&lt;")}</span><span class="t">${f.error ? "⚠ " + f.error.replace(/</g, "&lt;") : f.res ? f.res.summary : "đang đọc…"}</span><button class="x" type="button" aria-label="Bỏ file" data-rm="${i}">×</button></div>`).join("");
    const ready = state.files.some((f) => f.res);
    $("goBtn").disabled = !ready;
    state.table = (state.files.find((f) => f.res?.table) || {}).res?.table || null;
    $("lookupBox").hidden = !state.table;
    if (state.table) {
      $("lookupInfo").textContent = `Phát hiện danh sách ${state.table.rows.length.toLocaleString("vi-VN")} dòng có cột mã số thuế. Có thể tạo trang tra cứu cho khách quét QR.`;
      if (!$("slug").value) $("slug").value = "tra-cuu-" + new Date().toISOString().slice(2, 10).replace(/-/g, "");
    }
  }
  async function addFiles(list) {
    for (const file of list) {
      const entry = { file, res: null, error: "" };
      state.files.push(entry); renderFiles();
      try { entry.res = await window.THTExtract.readFile(file); } catch (e) { entry.error = e.message; }
      renderFiles();
    }
  }
  $("files").addEventListener("click", (ev) => { const i = ev.target.dataset.rm; if (i !== undefined) { state.files.splice(+i, 1); renderFiles(); } });
  const drop = $("drop");
  drop.addEventListener("click", () => $("fileInput").click());
  drop.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); $("fileInput").click(); } });
  drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (ev) => { ev.preventDefault(); drop.classList.remove("over"); addFiles([...ev.dataTransfer.files]); });
  $("fileInput").addEventListener("change", (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; });
  $("camBtn").addEventListener("click", () => $("camInput").click());
  $("camInput").addEventListener("change", (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; });

  // ---------- generate ----------
  $("goBtn").addEventListener("click", async () => {
    show($("goErr"), "", "err");
    const parts = state.files.filter((f) => f.res).map((f) => f.res.part);
    try {
      if (state.table && $("makeLookup").checked) {
        busy("Đang tạo trang tra cứu…");
        const r = await api("/api/lookup", { slug: $("slug").value.trim().toLowerCase(), title: "Tra cứu danh sách doanh nghiệp",
          subtitle: $("note").value.trim() || "Danh sách kèm văn bản", ...state.table });
        $("qrUrl").value = r.url;
      }
      busy($("verify").checked ? "Claude đang đọc văn bản và tra web kiểm chứng (1–2 phút)…" : "Claude đang soạn nội dung…");
      const r = await api("/api/generate", { parts, note: $("note").value.trim(), verify: $("verify").checked, pages: $("pages").value, quality: $("quality").checked ? "strong" : "fast" });
      state.content = r.content; state.checks = r.checks || ""; state.fromApi = true;
      await renderPoster({ autoShorten: true });
      selectTab("poster");
    } catch (e) {
      show($("goErr"), e.message, "err");
    } finally { idle(); }
  });

  $("demoBtn").addEventListener("click", async () => {
    state.content = await (await fetch("/sample.json")).json();
    state.checks = "Đây là nội dung mẫu để xem giao diện, chưa qua kiểm chứng.";
    state.fromApi = false;
    renderPoster();
  });

  // ---------- render poster ----------
  const loadedFonts = new Set();
  function ensureFont(style) {
    const href = fontsHref(style);
    if (loadedFonts.has(href)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); loadedFonts.add(href);
  }

  function posterHtml(content, style, index = 0) {
    const qrUrl = $("qrUrl").value.trim();
    const today = new Date();
    return renderPage(style, content, {
      brand: BRAND,
      month: `${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`,
      date: `Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`,
      qr: qrUrl ? (size, color) => window.THTQR.svg(qrUrl, size, color) : null,
    }, index);
  }

  async function renderPoster({ autoShorten = false } = {}) {
    ensureFont(state.style);
    const sc = $("scaler");
    const n = pageCount(state.content);
    let html = "";
    try { for (let i = 0; i < n; i++) html += `<div class="pg" style="width:${A4W}px;height:${A4H}px;margin-bottom:24px;overflow:hidden">${posterHtml(state.content, state.style, i)}</div>`; }
    catch (e) { show($("actMsg"), e.message, "err"); $("actions").hidden = false; return; }
    sc.innerHTML = html; sc.hidden = false; $("emptyState").hidden = true;
    try { await document.fonts.ready; } catch (_) {}
    let worst = 0;
    for (const el of sc.querySelectorAll("#poster")) {
      el.style.height = "auto";
      const natural = el.scrollHeight;
      el.style.height = A4H + "px";
      worst = Math.max(worst, natural);
      if (natural > A4H) { const z = Math.max(MIN_ZOOM, A4H / natural); el.style.zoom = z; el.style.width = (A4W / z) + "px"; el.style.height = (A4H / z) + "px"; }
    }
    const natural = worst;
    let note = `${n} trang · vừa khổ A4.`;
    if (natural > A4H) note = natural * MIN_ZOOM > A4H ? "Có trang dài hơn khổ A4, nên rút gọn." : `${n} trang · đã thu nhỏ nhẹ cho vừa A4.`;
    const tooLong = natural * MIN_ZOOM > A4H;
    if (tooLong && autoShorten && state.fromApi) {
      busy("Nội dung dài, đang nhờ Claude rút gọn…");
      try {
        const pct = Math.round((natural / A4H - 1) * 100) + 8;
        const r = await api("/api/revise", { content: state.content, instruction: `Poster đang tràn khổ A4 khoảng ${pct}%. Rút gọn chữ ở points.detail, audience.items.text, issuer_sentence, recommendation khoảng ${pct}%, giữ thông tin pháp lý quan trọng.` });
        state.content = r.content; idle(); return renderPoster();
      } catch (e) { idle(); }
    }
    fitStage();
    $("fitNote").textContent = note;
    $("caption").value = state.content.facebook_caption || "";
    renderChecks();
    $("actions").hidden = false;
    show($("actMsg"), "", "ok");
  }

  function fitStage() {
    const stage = $("tab-poster"), sc = $("scaler");
    if (sc.hidden) return;
    const w = Math.min(stage.clientWidth - 32, 700);
    const s = w / A4W;
    sc.style.transform = `scale(${s})`;
    sc.style.width = A4W + "px";
    stage.style.height = (sc.scrollHeight * s + 32) + "px";
  }
  window.addEventListener("resize", fitStage);

  function renderChecks() {
    const c = state.content || {}, esc = (s) => String(s).replace(/</g, "&lt;");
    let h = "";
    if (c.corrections?.length) h += `<div class="msg warn"><b>Điểm đã chỉnh so với nguồn</b><ul>${c.corrections.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    if (c.uncertain?.length) h += `<div class="msg warn"><b>Cần anh kiểm tra lại</b><ul>${c.uncertain.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    if (state.checks) h += `<div><b>Ghi chú kiểm chứng của Claude</b><pre class="cap">${esc(state.checks)}</pre></div>`;
    $("checks").innerHTML = h || `<span class="note">Không có điểm cần lưu ý.</span>`;
  }

  // ---------- tabs ----------
  function selectTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    ["poster", "caption", "checks"].forEach((n) => { $("tab-" + n).hidden = n !== name; });
    if (name === "poster") fitStage();
  }
  document.querySelector(".tabs").addEventListener("click", (ev) => { const t = ev.target.closest(".tab"); if (t) selectTab(t.dataset.tab); });
  $("caption").addEventListener("input", () => { if (state.content) state.content.facebook_caption = $("caption").value; });
  $("qrUrl").addEventListener("change", () => { if (state.content) renderPoster(); });

  // ---------- revise ----------
  $("reviseBtn").addEventListener("click", async () => {
    const ins = $("reviseText").value.trim();
    if (!ins) return show($("actMsg"), "Nhập yêu cầu sửa trước đã.", "warn");
    busy("Claude đang sửa nội dung…");
    try { const r = await api("/api/revise", { content: state.content, instruction: ins }); state.content = r.content; state.fromApi = true; $("reviseText").value = ""; await renderPoster({ autoShorten: true }); }
    catch (e) { show($("actMsg"), e.message, "err"); }
    finally { idle(); }
  });

  // ---------- export ----------
  async function posterPngs() {
    const out = [];
    for (const el of $("scaler").querySelectorAll("#poster")) out.push(await window.THTExport.toPng(el, { fontHref: fontsHref(state.style), background: STYLES[state.style].bg }));
    return out;
  }
  $("pngBtn").addEventListener("click", async () => {
    busy("Đang xuất ảnh…");
    try {
      const urls = await posterPngs();
      urls.forEach((url, i) => { const a = document.createElement("a"); a.href = url; a.download = `THT_${(state.content.topic_short || "ban-tin").replace(/\W+/g, "_")}_mau${state.style}_trang${i + 1}.png`; a.click(); });
    } catch (e) { show($("actMsg"), e.message, "err"); }
    finally { idle(); }
  });
  $("printBtn").addEventListener("click", () => {
    $("printArea").innerHTML = $("scaler").innerHTML;
    window.print();
  });

  // ---------- publish ----------
  $("pubBtn").addEventListener("click", () => {
    if (!$("caption").value.trim()) return show($("actMsg"), "Bài Facebook đang trống.", "warn");
    $("cfBody").textContent = state.config?.dryRun
      ? "Đang ở CHẾ ĐỘ THỬ: ứng dụng lưu ảnh và lịch sử nhưng không đăng lên Facebook."
      : "Poster và nội dung bài đăng sẽ được đăng công khai lên Facebook Page THT.";
    $("confirmDlg").hidden = false; $("cfYes").focus();
  });
  $("cfNo").addEventListener("click", () => { $("confirmDlg").hidden = true; });
  $("cfYes").addEventListener("click", async () => {
    $("confirmDlg").hidden = true;
    busy("Đang đăng lên Facebook…");
    try {
      const images = await posterPngs();
      const c = state.content;
      const r = await api("/api/publish", { images, caption: $("caption").value, title: `${c.title_line1} ${c.title_line2}`, style: state.style });
      if (r.status === "dry_run") show($("actMsg"), "Chế độ thử: đã lưu bài, chưa đăng lên Facebook.", "ok");
      else { $("actMsg").innerHTML = `Đã đăng lên Facebook. <a href="${r.link}" target="_blank" rel="noopener">Xem bài</a>`; $("actMsg").className = "msg ok"; $("actMsg").hidden = false; }
      loadHistory();
    } catch (e) { show($("actMsg"), e.message, "err"); }
    finally { idle(); }
  });

  async function loadHistory() {
    try {
      const { items } = await api("/api/history");
      $("history").innerHTML = items.length ? items.map((it) =>
        `<li class="hist"><span>${new Date(it.created_at).toLocaleString("vi-VN")} · ${String(it.title || "").replace(/</g, "&lt;")}</span>${it.fb_link ? `<a href="${it.fb_link}" target="_blank" rel="noopener">Xem</a>` : `<span class="note">${it.status === "dry_run" ? "thử" : it.status}</span>`}</li>`).join("")
        : `<li class="note">Chưa có bài nào.</li>`;
    } catch (_) {}
  }

  // ---------- start ----------
  state.style = store.get("tht-style") || "1";
  renderStyles();
  state.key = store.get("tht-key");
  if (state.key) enter(); else showLogin();
})();
