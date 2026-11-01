// Render the poster element to a PNG (data URL) without libraries: SVG foreignObject + embedded web fonts.
(function () {
  const fontCache = {};

  async function embeddedFontCss(href) {
    if (fontCache[href]) return fontCache[href];
    try {
      let css = await (await fetch(href, { signal: AbortSignal.timeout(8000) })).text();
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      // Keep only latin + vietnamese subsets to limit size
      for (const u of urls) {
        try {
          const blob = await (await fetch(u, { signal: AbortSignal.timeout(8000) })).blob();
          const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
          css = css.split(u).join(data);
        } catch (_) { /* skip a face that fails */ }
      }
      fontCache[href] = css;
      return css;
    } catch (_) {
      return "";
    }
  }

  async function toPng(el, { width = 794, height = 1123, scale = 2, fontHref, background = "#FFFFFF" } = {}) {
    const fontCss = fontHref ? await embeddedFontCss(fontHref) : "";
    const html = new XMLSerializer().serializeToString(el);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;width:${width}px;height:${height}px">
<style>${fontCss}*{box-sizing:border-box}</style>${html}</div></foreignObject></svg>`;
    const img = new Image();
    img.decoding = "sync";
    // A data: URL (not blob:) keeps the canvas untainted in Chromium and Safari.
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    try {
      await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error("Không dựng được ảnh poster")); img.src = url; });
      await new Promise((r) => setTimeout(r, 120)); // let embedded fonts settle (Safari)
      const canvas = document.createElement("canvas");
      canvas.width = width * scale; canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    } finally {
      img.src = "";
    }
  }

  window.THTExport = { toPng };
})();
