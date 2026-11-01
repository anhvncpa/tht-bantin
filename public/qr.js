// Minimal QR encoder (byte mode, ECC level M, versions 1–6, URLs up to ~106 bytes). No dependencies.
(function () {
  const ECC = [0, 10, 16, 26, 18, 24, 16], BLK = [0, 1, 1, 1, 2, 2, 4];
  const gm = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
  function rsdiv(d) { const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1;
    for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = gm(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = gm(root, 2); } return r; }
  function rsrem(data, dv) { const r = new Array(dv.length).fill(0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); dv.forEach((c, i) => { r[i] ^= gm(c, f); }); } return r; }
  const raw = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; } return r; };
  function apos(v) { if (v === 1) return []; const na = Math.floor(v / 7) + 2, size = v * 4 + 17;
    const step = Math.floor((v * 8 + na * 3 + 5) / (na * 4 - 4)) * 2; const res = []; let p = size - 7;
    for (let i = 0; i < na - 1; i++) { res.unshift(p); p -= step; } return [6, ...res]; }

  function encode(text) {
    const data = new TextEncoder().encode(text); let v, cap;
    for (v = 1; v <= 6; v++) { cap = (Math.floor(raw(v) / 8) - ECC[v] * BLK[v]) * 8; if (12 + data.length * 8 <= cap) break; }
    if (v > 6) throw new Error("Đường link quá dài cho mã QR (tối đa ~100 ký tự)");
    const size = v * 4 + 17, bits = [];
    const app = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >>> i) & 1); };
    app(4, 4); app(data.length, 8); data.forEach((b) => app(b, 8));
    app(0, Math.min(4, cap - bits.length)); app(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) app(pad, 8);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    const nb = BLK[v], ec = ECC[v], rw = Math.floor(raw(v) / 8), ns = nb - rw % nb, sl = Math.floor(rw / nb), dv = rsdiv(ec);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) { let d = cw.slice(k, k + sl - ec + (i < ns ? 0 : 1)); k += d.length; const e = rsrem(d, dv); if (i < ns) d = [...d, 0]; blocks.push([...d, ...e]); }
    const allc = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== sl - ec || j >= ns) allc.push(b[i]); });
    const M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
    const sf = (x, y, val) => { M[y][x] = val; F[y][x] = true; };
    for (let i = 0; i < size; i++) { sf(6, i, i % 2 === 0); sf(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); sf(x, y, d !== 2 && d !== 4); } }
    const ap = apos(v), n = ap.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sf(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    function fmt(m) { let r = m; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((m << 10) | r) ^ 0x5412, g = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i < 6; i++) sf(8, i, g(i)); sf(8, 7, g(6)); sf(8, 8, g(7)); sf(7, 8, g(8));
      for (let i = 9; i < 15; i++) sf(14 - i, 8, g(i)); for (let i = 0; i < 8; i++) sf(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) sf(8, size - 15 + i, g(i)); sf(8, size - 8, true); }
    fmt(0);
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && i < allc.length * 8) { M[y][x] = ((allc[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
    const MS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => (((x + y) % 2) + (x * y) % 3) % 2 === 0];
    const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MS[m](x, y)) M[y][x] = !M[y][x]; };
    function pen() { let p = 0; const T = M[0].map((_, c) => M.map((r) => r[c]));
      for (const rows of [M, T]) for (const row of rows) { let run = 1; for (let k2 = 1; k2 <= size; k2++) { if (k2 < size && row[k2] === row[k2 - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
      const dk = M.reduce((s, r) => s + r.filter(Boolean).length, 0); p += Math.floor(Math.abs(dk * 20 - size * size * 10) / (size * size)) * 10; return p; }
    let best = null;
    for (let m = 0; m < 8; m++) { apply(m); fmt(m); const pv = pen(); if (!best || pv < best[0]) best = [pv, m]; apply(m); }
    apply(best[1]); fmt(best[1]);
    return M;
  }

  function svg(text, size, color) {
    const M = encode(text), n = M.length + 4;
    let d = ""; M.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x + 2} ${y + 2}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" width="${size}" height="${size}" role="img" aria-label="Mã QR" style="display:block"><rect width="${n}" height="${n}" fill="#FFFFFF"></rect><path fill="${color}" d="${d}"></path></svg>`;
  }

  globalThis.THTQR = { encode, svg };
})();
