// Public lookup page (search by tax code / name) served at /tc/<slug>
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function lookupPage({ title, subtitle, total, slug, brand }) {
  const totalVi = Number(total).toLocaleString("vi-VN");
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} – Tra cứu THT</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
:root{--bg:#F4F7FA;--surface:#FFFFFF;--ink:#172B3B;--muted:#4A5B6E;--line:#D5DEE8;--navy:#172B3B;--accent:#FC5A1B;--hit:#FFE3D6;--ok:#1E7A4F;--ok-bg:#E3F4EA;--warn:#B23A0B;--warn-bg:#FFEDE5}
@media (prefers-color-scheme:dark){:root{--bg:#0E1620;--surface:#16212D;--ink:#E6EDF4;--muted:#A5B4C4;--line:#2A3A4C;--navy:#0A1C2B;--hit:#5A2A12;--ok:#7FD3A6;--ok-bg:#163527;--warn:#FFB08A;--warn-bg:#3A1F14;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:860px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header{background:var(--navy);color:#fff}header .wrap{padding-block:24px 28px;display:flex;flex-direction:column;gap:12px}
.brand{display:flex;align-items:center;gap:10px}.mark{width:40px;height:40px;border-radius:7px;background:#E3A72F;color:#172B3B;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
.brand b{font-size:12px;letter-spacing:1.2px;display:block}.brand span{font-size:11px;color:#C3D1E0}
h1{margin:0;font-size:clamp(22px,4.5vw,30px);line-height:1.2;font-weight:800;text-wrap:balance}
.sub{margin:0;color:#C3D1E0;font-size:13.5px}
label{font-size:12px;font-weight:600;letter-spacing:.6px;color:#C3D1E0;text-transform:uppercase}
#q{width:100%;box-sizing:border-box;font:inherit;font-size:17px;padding:13px 14px;border-radius:9px;border:2px solid transparent;background:var(--surface);color:var(--ink)}
#q:focus{outline:none;border-color:var(--accent)}
main .wrap{padding-block:20px 40px;display:flex;flex-direction:column;gap:12px}
.status{border-radius:10px;padding:14px 16px;font-size:14px;background:var(--surface);border:1px solid var(--line)}
.status.found{background:var(--warn-bg);border-color:transparent}.status.found strong{color:var(--warn)}
.status.clear{background:var(--ok-bg);border-color:transparent}.status.clear strong{color:var(--ok)}
.item{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.nm{font-weight:700;overflow-wrap:anywhere}.meta{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.note{font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
</style></head><body>
<header><div class="wrap">
<div class="brand"><div class="mark">THT</div><div><b>KIỂM TOÁN &amp; TƯ VẤN THT</b><span>THT Auditing &amp; Consulting</span></div></div>
<h1>${esc(title)}</h1>
<p class="sub">${esc(subtitle)} · ${totalVi} dòng</p>
<form id="f" autocomplete="off"><label for="q">Nhập mã số thuế hoặc tên doanh nghiệp</label>
<input id="q" type="search" placeholder="VD: 0312345678 hoặc Công ty TNHH ABC"></form>
</div></header>
<main><div class="wrap">
<div class="status" id="status" role="status">Đang tải danh sách…</div>
<div id="list" style="display:flex;flex-direction:column;gap:8px"></div>
<div class="note">Cần hỗ trợ, liên hệ THT: <b>${esc(brand.phone)}</b> · ${brand.emails.map(esc).join(" · ")} · ${esc(brand.website)}</div>
</div></main>
<script>
(function(){
var D,N=[],q=document.getElementById('q'),st=document.getElementById('status'),list=document.getElementById('list');
function norm(s){return String(s).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d').toLowerCase();}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function render(){
 var raw=q.value.trim(),t=norm(raw),dg=raw.replace(/[\\s.\\-]/g,''),isM=/^\\d{6,}$/.test(dg),res=[];
 if(t){for(var i=0;i<D.rows.length;i++){var r=D.rows[i];if(isM?String(r[D.mst]).indexOf(dg)===0:N[i].indexOf(t)>=0)res.push(r);if(res.length>200)break;}}
 var h='';res.slice(0,50).forEach(function(r){var o=r.filter(function(_,j){return j!==D.mst;});
  h+='<div class="item"><div class="nm">'+esc(o[0]||'')+'</div><div class="meta"><span>'+esc(D.cols[D.mst])+': <b>'+esc(r[D.mst])+'</b></span>'+
  o.slice(1).map(function(v){return '<span>'+esc(v)+'</span>';}).join('')+'</div></div>';});
 list.innerHTML=h;
 if(!t){st.className='status';st.textContent='Nhập mã số thuế để kiểm tra chính xác nhất.';}
 else if(res.length){st.className='status found';st.innerHTML='<strong>Tìm thấy '+res.length+(res.length>200?'+':'')+' kết quả</strong> khớp với “'+esc(raw)+'”.';}
 else{st.className='status clear';st.innerHTML='<strong>Không tìm thấy</strong> “'+esc(raw)+'” trong danh sách.';}
}
var tm;q.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(render,150);});
document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();render();});
fetch('/tc/${slug}/data.json').then(function(r){return r.json();}).then(function(d){D=d;N=d.rows.map(function(r){return norm(r.join(' '));});render();})
.catch(function(){st.textContent='Chưa tải được danh sách. Tải lại trang giúp em.';});
})();
</script></body></html>`;
}
