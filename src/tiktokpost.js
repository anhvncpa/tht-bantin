// Trang "Đăng lên TikTok" theo đúng Content Sharing Guidelines của TikTok (điều kiện để app được duyệt Direct Post):
//  - hiện tên tài khoản (creator_nickname), lấy creator_info mới mỗi lần mở trang
//  - xem trước video, sửa được tiêu đề/hashtag
//  - chọn quyền xem từ privacy_level_options, KHÔNG có giá trị mặc định
//  - Bình luận / Duet / Stitch tắt sẵn, mờ đi nếu tài khoản đã tắt
//  - công bố nội dung thương mại (Thương hiệu của bạn / Nội dung có thương hiệu), nội dung có thương hiệu không được để riêng tư
//  - câu đồng ý Music Usage Confirmation (+ Branded Content Policy) ngay trên nút Đăng
//  - chỉ gửi video lên TikTok sau khi người dùng bấm Đăng; báo trạng thái xử lý
// Link có chữ ký: /tiktok/post/<jobId>?s=<hmac>

const API = "https://open.tiktokapis.com/v2";
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sig(env, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.INTERNAL_KEY || env.APP_PASSWORD || "tht"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg))).slice(0, 32);
}
export async function tiktokPostUrl(env, jobId) {
  return `${env.PUBLIC_BASE_URL}/tiktok/post/${jobId}?s=${await sig(env, `tt/${jobId}`)}`;
}

async function tt(token, path, body) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (j.error && j.error.code && j.error.code !== "ok") throw new Error(`${j.error.code}: ${j.error.message || ""}`.slice(0, 200));
  return j.data || {};
}
export const creatorInfo = (token) => tt(token, "/post/publish/creator_info/query/");

// App đã qua kiểm duyệt khi tài khoản được chọn "Mọi người" (cache 6 giờ)
export async function tiktokAudited(env, deps) {
  const c = await deps.kvGet(env, "tt:audited");
  if (c) { const [v, at] = c.split("|"); if (Date.now() - Number(at) < 6 * 3600e3) return v === "1"; }
  let ok = false;
  try { ok = (await creatorInfo(await deps.token())).privacy_level_options?.includes("PUBLIC_TO_EVERYONE") || false; } catch (_) {}
  await deps.kvSet(env, "tt:audited", `${ok ? 1 : 0}|${Date.now()}`);
  return ok;
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });

// deps: { token: () => Promise<string>, getJob(env,id), kvGet, kvSet, mediaUrl(env,id,file), notify(job, text) }
export async function tiktokPostRoutes(request, url, env, deps) {
  const m = url.pathname.match(/^\/tiktok\/(post|api\/creator|api\/publish|api\/status)\/([A-Za-z0-9-]{4,40})$/);
  if (!m) return null;
  const [, kind, id] = m;
  if (url.searchParams.get("s") !== (await sig(env, `tt/${id}`))) return new Response("Link không hợp lệ hoặc đã hết hạn", { status: 403 });
  const job = await deps.getJob(env, id);
  if (!job || !job.content) return new Response("Không tìm thấy bài", { status: 404 });
  const vobj = await env.FILES.head(`jobs/${id}/story.mp4`);

  if (kind === "post") {
    const video = vobj ? await deps.mediaUrl(env, id, "story.mp4") : "";
    const dur = Number((await deps.kvGet(env, `vdur:${id}`)) || 0);
    return new Response(page({ id, s: url.searchParams.get("s"), title: job.content.tiktok_caption || "", video, dur, heading: job.content.title_line1 || "" }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  try {
    const token = await deps.token();
    if (kind === "api/creator") return json(await creatorInfo(token));
    if (kind === "api/publish" && request.method === "POST") {
      if (!vobj) return json({ error: "Video chưa dựng xong" }, 400);
      const b = await request.json();
      const info = await creatorInfo(token);                 // kiểm tra lại ngay trước khi đăng
      if (!info.privacy_level_options?.includes(b.privacy_level)) return json({ error: "Quyền xem không hợp lệ" }, 400);
      if (b.brand_content_toggle && b.privacy_level === "SELF_ONLY") return json({ error: "Nội dung có thương hiệu không thể để chế độ riêng tư" }, 400);
      if (!b.consent) return json({ error: "Cần đồng ý trước khi đăng" }, 400);
      const obj = await env.FILES.get(`jobs/${id}/story.mp4`);
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const init = await tt(token, "/post/publish/video/init/", {
        post_info: {
          title: String(b.title || "").slice(0, 2200), privacy_level: b.privacy_level,
          disable_comment: !b.allow_comment || !!info.comment_disabled, disable_duet: !b.allow_duet || !!info.duet_disabled, disable_stitch: !b.allow_stitch || !!info.stitch_disabled,
          video_cover_timestamp_ms: 1000, brand_content_toggle: !!b.brand_content_toggle, brand_organic_toggle: !!b.brand_organic_toggle,
        },
        source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
      });
      const up = await fetch(init.upload_url, { method: "PUT", headers: { "content-type": "video/mp4", "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}` }, body: bytes });
      if (!up.ok) return json({ error: `Tải video lên TikTok lỗi ${up.status}` }, 502);
      await deps.kvSet(env, `ttpub:${id}`, init.publish_id);
      return json({ publish_id: init.publish_id });
    }
    if (kind === "api/status") {
      const pid = (await deps.kvGet(env, `ttpub:${id}`)) || "";
      if (!pid) return json({ status: "NONE" });
      const st = await tt(token, "/post/publish/status/fetch/", { publish_id: pid });
      if (st.status === "PUBLISH_COMPLETE" && !(await deps.kvGet(env, `ttdone:${id}`))) {
        await deps.kvSet(env, `ttdone:${id}`, "1");
        await deps.notify(job, "🎵 TikTok: đã đăng xong");
      }
      return json(st);
    }
  } catch (e) { return json({ error: e.message }, 500); }
  return new Response("not found", { status: 404 });
}

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page({ id, s, title, video, dur, heading }) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Post to TikTok · THT Audit</title>
<style>
:root{--ink:#23272D;--mut:#6B7280;--line:#E5E7EB;--bg:#F6F5F2;--gold:#F7A933;--green:#009A57;--red:#E0242B}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:var(--bg);color:var(--ink)}
.wrap{max-width:520px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
h1{font-size:18px;margin:4px 0 12px}.sub{color:var(--mut);font-size:13px}
.acct{display:flex;align-items:center;gap:10px}.acct img{width:44px;height:44px;border-radius:50%;background:#ddd;object-fit:cover}
.acct b{display:block}video{width:100%;max-height:420px;border-radius:10px;background:#000}
label.f{display:block;font-weight:bold;font-size:14px;margin:12px 0 6px}
textarea,select{width:100%;font:inherit;font-size:15px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
textarea{min-height:130px}
.row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}.row small{display:block;color:var(--mut)}
.sw{position:relative;width:46px;height:26px;flex:none}.sw input{opacity:0;width:0;height:0}
.sw span{position:absolute;inset:0;background:#D1D5DB;border-radius:26px;transition:.2s}
.sw span:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}
.sw input:checked+span{background:var(--green)}.sw input:checked+span:before{transform:translateX(20px)}
.sw input:disabled+span{opacity:.4}
.opt{display:flex;gap:10px;align-items:flex-start;padding:8px 0}.opt input{width:20px;height:20px;margin-top:2px}
.hint{font-size:13px;color:var(--mut);margin-top:6px}.warn{color:var(--red)}
.consent{font-size:13px;color:var(--mut);line-height:1.5;margin:4px 0 12px}.consent a{color:var(--ink)}
button{width:100%;padding:14px;font-size:16px;font-weight:bold;border:0;border-radius:12px;background:var(--ink);color:#fff}
button:disabled{background:#9CA3AF}
.st{text-align:center;padding:14px;font-size:15px}.ok{color:var(--green)}.bad{color:var(--red)}
.brand{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);margin-bottom:8px}.brand i{width:10px;height:10px;background:var(--gold);display:inline-block}
</style></head><body><div class="wrap">
<div class="brand"><i></i>THT Audit · Content publisher</div>
<h1>Đăng lên TikTok <span class="sub">· Post to TikTok</span></h1>
<div class="card"><div class="acct"><img id="av" alt=""><div><b id="nick">Đang tải tài khoản… · Loading account…</b><span class="sub" id="uname"></span></div></div>
<div id="cerr" class="hint warn"></div></div>
<div class="card"><div class="sub" style="margin-bottom:8px">${esc(heading)}</div>
${video ? `<video src="${esc(video)}" controls playsinline preload="metadata"></video>` : `<div class="hint warn">Video chưa dựng xong · Video is not ready yet</div>`}
<div class="hint" id="durhint"></div>
<label class="f" for="title">Mô tả · Caption <span class="sub">(sửa được · editable)</span></label>
<textarea id="title" maxlength="2200">${esc(title)}</textarea>
<label class="f" for="priv">Ai có thể xem video này? · Who can view this video</label>
<select id="priv"><option value="" selected disabled>— Chọn · Select —</option></select>
<div class="hint" id="privhint"></div></div>
<div class="card"><div class="sub" style="font-weight:bold;color:var(--ink)">Cho phép người xem · Allow users to</div>
<div class="row"><span>Bình luận · Comment</span><label class="sw"><input type="checkbox" id="cmt"><span></span></label></div>
<div class="row"><span>Duet</span><label class="sw"><input type="checkbox" id="duet"><span></span></label></div>
<div class="row"><span>Stitch</span><label class="sw"><input type="checkbox" id="stitch"><span></span></label></div></div>
<div class="card"><div class="row"><span><b>Công bố nội dung thương mại</b><small>Disclose video content – video quảng bá thương hiệu, sản phẩm hoặc dịch vụ</small></span><label class="sw"><input type="checkbox" id="disc"><span></span></label></div>
<div id="discbox" style="display:none">
<label class="opt"><input type="checkbox" id="own"><span><b>Thương hiệu của bạn · Your brand</b><br><small class="sub">Bạn quảng bá cho chính mình hoặc doanh nghiệp của mình. Video sẽ gắn nhãn “Promotional content”.</small></span></label>
<label class="opt"><input type="checkbox" id="bc"><span><b>Nội dung có thương hiệu · Branded content</b><br><small class="sub">Bạn quảng bá cho bên thứ ba. Video sẽ gắn nhãn “Paid partnership”.</small></span></label>
<div class="hint" id="dischint"></div></div></div>
<div class="consent" id="consent"></div>
<button id="go" disabled>Đăng · Post</button>
<div class="st" id="st"></div>
<div class="hint" style="text-align:center">Sau khi đăng, TikTok có thể cần vài phút để xử lý trước khi video hiện trên trang cá nhân.<br>After posting, it may take a few minutes for the video to appear on your profile.</div>
</div>
<script>
const Q="?s=${esc(s)}", ID="${esc(id)}", DUR=${Number(dur) || 0};
const $=(x)=>document.getElementById(x);
const NAMES={PUBLIC_TO_EVERYONE:"Mọi người · Everyone",MUTUAL_FOLLOW_FRIENDS:"Bạn bè · Friends",FOLLOWER_OF_CREATOR:"Người theo dõi · Followers",SELF_ONLY:"Chỉ mình tôi · Only me"};
let info=null, busy=false;
function consent(){
  const bc=$("disc").checked&&$("bc").checked;
  $("consent").innerHTML = bc
    ? 'Khi đăng, bạn đồng ý với <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank">Chính sách nội dung có thương hiệu</a> và <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank">Xác nhận sử dụng âm nhạc</a> của TikTok.<br>By posting, you agree to TikTok\\'s Branded Content Policy and Music Usage Confirmation.'
    : 'Khi đăng, bạn đồng ý với <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank">Xác nhận sử dụng âm nhạc</a> của TikTok.<br>By posting, you agree to TikTok\\'s Music Usage Confirmation.';
}
function validate(){
  const disc=$("disc").checked, own=$("own").checked, bc=$("bc").checked;
  $("discbox").style.display=disc?"block":"none";
  // Nội dung có thương hiệu không được để riêng tư
  const so=[...$("priv").options].find(o=>o.value==="SELF_ONLY");
  if(so){ so.disabled = disc&&bc; so.textContent = NAMES.SELF_ONLY + (disc&&bc?" (không áp dụng cho nội dung có thương hiệu · not available for branded content)":""); }
  if(disc&&bc&&$("priv").value==="SELF_ONLY"){ $("priv").value=""; $("privhint").textContent="Đã bỏ “Chỉ mình tôi” vì nội dung có thương hiệu phải công khai · Branded content visibility cannot be set to private."; }
  $("dischint").innerHTML = disc ? (bc ? 'Video sẽ gắn nhãn “Paid partnership” · Your video will be labeled “Paid partnership”' : own ? 'Video sẽ gắn nhãn “Promotional content” · Your video will be labeled “Promotional content”' : '<span class="warn">Chọn ít nhất 1 mục · You need to indicate if your content promotes yourself, a third party, or both.</span>') : "";
  consent();
  const tooLong = info && DUR && info.max_video_post_duration_sec && DUR > info.max_video_post_duration_sec;
  $("go").disabled = busy || !info || !$("priv").value || (disc && !own && !bc) || tooLong || ${video ? "false" : "true"};
}
async function load(){
  try{
    const r=await fetch("/tiktok/api/creator/"+ID+Q); const j=await r.json();
    if(j.error) throw new Error(j.error);
    info=j;
    $("nick").textContent=j.creator_nickname||j.creator_username||"TikTok";
    $("uname").textContent=j.creator_username?"@"+j.creator_username:"";
    if(j.creator_avatar_url) $("av").src=j.creator_avatar_url;
    for(const p of j.privacy_level_options||[]){ const o=document.createElement("option"); o.value=p; o.textContent=NAMES[p]||p; $("priv").appendChild(o); }
    [["cmt","comment_disabled"],["duet","duet_disabled"],["stitch","stitch_disabled"]].forEach(([el,k])=>{ if(j[k]){ $(el).checked=false; $(el).disabled=true; $(el).closest(".row").querySelector("span").insertAdjacentHTML("beforeend",' <small>(đã tắt trong cài đặt TikTok · disabled in your TikTok settings)</small>'); }});
    if(DUR && j.max_video_post_duration_sec){ $("durhint").innerHTML = DUR>j.max_video_post_duration_sec ? '<span class="warn">Video dài '+DUR+'s, vượt giới hạn '+j.max_video_post_duration_sec+'s của tài khoản · Video exceeds the maximum duration.</span>' : "Thời lượng "+DUR+"s · Duration "+DUR+"s"; }
  }catch(e){ $("cerr").textContent="Tài khoản hiện không đăng được, thử lại sau · This account cannot post right now, please try again later. ("+e.message+")"; }
  validate();
}
async function poll(n){
  const r=await fetch("/tiktok/api/status/"+ID+Q); const j=await r.json();
  if(j.status==="PUBLISH_COMPLETE"){ $("st").innerHTML='<span class="ok">✅ Đã đăng lên TikTok · Posted to TikTok</span>'; return; }
  if(j.status==="FAILED"||j.error){ $("st").innerHTML='<span class="bad">❌ '+(j.fail_reason||j.error)+'</span>'; busy=false; validate(); return; }
  $("st").textContent="⏳ TikTok đang xử lý… · Processing… ("+(j.status||"")+")";
  if(n<60) setTimeout(()=>poll(n+1),4000); else $("st").textContent="TikTok vẫn đang xử lý, video sẽ sớm xuất hiện trên trang cá nhân · Still processing, the video will appear on your profile shortly.";
}
$("go").onclick=async()=>{
  busy=true; validate(); $("st").textContent="⏳ Đang gửi video lên TikTok… · Uploading…";
  const body={title:$("title").value,privacy_level:$("priv").value,allow_comment:$("cmt").checked,allow_duet:$("duet").checked,allow_stitch:$("stitch").checked,
    brand_content_toggle:$("disc").checked&&$("bc").checked,brand_organic_toggle:$("disc").checked&&$("own").checked,consent:true};
  try{ const r=await fetch("/tiktok/api/publish/"+ID+Q,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); const j=await r.json();
    if(j.error) throw new Error(j.error); poll(0);
  }catch(e){ $("st").innerHTML='<span class="bad">❌ '+e.message+'</span>'; busy=false; validate(); }
};
["priv","disc","own","bc"].forEach(x=>$(x).addEventListener("change",validate));
load();
</script></body></html>`;
}
