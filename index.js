import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {introEnabled, introPhotoMode, randomIntroPhotos, pageSettings, applyAppearance, uniqueIntroPhotos} from './album-settings.js?v=20260930-3';
import {albumLabel, compareAlbumLabels, isYearAlbum} from './album-labels.js?v=20261002-4';
const sb=createClient('https://esfgrykcvdctnvdqipbj.supabase.co','sb_publishable_Rwb3qaRXdWZoo05LrbFaDg_29tMI7uI');
const bucket='photo-album',videoBucket='photo-album-videos', PAGE=60, $=s=>document.querySelector(s);
const e={home:$('#homeView'),detail:$('#detailView'),years:$('#years'),yearCount:$('#yearCount'),name:$('#displayName'),back:$('#back'),detailYear:$('#detailYear'),detailYearSmall:$('#detailYearSmall'),detailCount:$('#detailCount'),photos:$('#photos'),more:$('#more'),loadMore:$('#loadMore'),intro:$('#intro'),replay:$('#replay'),viewer:$('#viewer'),counter:$('#counter'),close:$('#close'),prev:$('#prev'),next:$('#next'),stage:$('#stage'),canvas:$('#canvas'),big:$('#big'),bigVideo:$('#bigVideo'),viewerHint:$('#viewerHint'),toast:$('#toast')};
let site=null, albums=[], videoRows=[], groups=[], active=null, photos=[], page=0, more=true, loading=false, idx=-1;
let loadVersion=0, photoVersion=0, introVersion=0, introTimer, introHideTimer, lastFocus=null;
let introPhotoPoolPromise=null;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const publicUrl=p=>p?sb.storage.from(bucket).getPublicUrl(p).data.publicUrl:'';
const videoUrl=p=>p?sb.storage.from(videoBucket).getPublicUrl(p).data.publicUrl:'';
function toast(message){e.toast.textContent=message;e.toast.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.toast.classList.add('hidden'),4200)}
async function loadVideoRows(ids){
 videoRows=[];if(!ids.length)return;
 for(let offset=0;;offset+=500){
  const result=await sb.from('photo_album_videos').select('id,album_id,video_path,thumb_path,caption,created_at').in('album_id',ids)
   .order('created_at',{ascending:false}).order('id').range(offset,offset+499);
  if(result.error)throw result.error;
  videoRows.push(...(result.data||[]));
  if((result.data||[]).length<500)break;
 }
}
function makeGroups(){
  const map=new Map(),counts=new Map();videoRows.forEach(v=>counts.set(v.album_id,(counts.get(v.album_id)||0)+1));
  for(const a of albums){const year=albumLabel(a);if(!map.has(year))map.set(year,{year,albums:[],count:0,cover:''});const g=map.get(year);g.albums.push(a);g.count+=Number(a.photo_count||0)+(counts.get(a.id)||0);g.videoCount=(g.videoCount||0)+(counts.get(a.id)||0);if(!g.cover&&a.cover_path)g.cover=a.cover_path}
  groups=[...map.values()].sort((a,b)=>compareAlbumLabels(a.year,b.year));
}
function text(id,value){const node=$(id);node.textContent=value;node.classList.toggle('hidden',!value)}
function renderHeader(){
  const settings=pageSettings(site);
  e.name.textContent=settings.title;
  document.title=settings.title+'｜アルバム';
  text('#siteEyebrow',settings.eyebrow);text('#detailBrand',settings.eyebrow);
  text('#headerText',settings.header);text('#pageDescription',settings.description);
  applyAppearance(document.documentElement,settings);
  $('meta[name="theme-color"]').content=settings.colors.background;
  $('#adminLink').href='admin.html'+(site?.slug?'?site='+encodeURIComponent(site.slug):'');
}
function revealPage(){
  // The HTML covers the page before modules load; remove it only after the intro is ready.
  const startup=$('#startup'),pageRoot=$('main.page');
  document.body.classList.remove('booting');
  pageRoot.removeAttribute('inert');pageRoot.removeAttribute('aria-hidden');
  if(!startup||startup.classList.contains('leaving'))return;
  startup.setAttribute('aria-hidden','true');startup.setAttribute('inert','');
  startup.classList.add('leaving');setTimeout(()=>startup.remove(),550);
}
async function load(){
  const version=++loadVersion;
  introPhotoPoolPromise=null;
  hideIntro();e.replay.classList.add('hidden');
  try{
    const q=new URLSearchParams(location.search), slug=q.get('site');
    let query=sb.from('photo_album_sites_public').select('*');
    query=slug?query.eq('slug',slug):query.order('created_at',{ascending:true}).limit(1);
    const result=await query.maybeSingle();if(result.error)throw result.error;
    let nextSite=result.data;
    if(!nextSite){
      const sessionResult=await sb.auth.getSession(), session=sessionResult.data?.session;
      if(session){
        let ownerQuery=sb.from('photo_album_sites').select('*').eq('owner_user_id',session.user.id);
        ownerQuery=slug?ownerQuery.eq('slug',slug):ownerQuery.order('created_at',{ascending:true}).limit(1);
        const ownerResult=await ownerQuery.maybeSingle();if(ownerResult.error)throw ownerResult.error;nextSite=ownerResult.data;
      }
    }
    if(version!==loadVersion)return;
    site=nextSite;albums=[];videoRows=[];renderHeader();
    if(!site){makeGroups();renderGroups();e.years.innerHTML='<div class="empty">このアルバムは現在公開されていません。</div>';e.yearCount.textContent='';return}
    const resultAlbums=await sb.from('photo_albums_public').select('*').eq('site_id',site.id)
      .order('album_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id');
    if(resultAlbums.error)throw resultAlbums.error;
    if(version!==loadVersion)return;
    albums=resultAlbums.data||[];await loadVideoRows(albums.map(a=>a.id));if(version!==loadVersion)return;makeGroups();renderGroups();
    e.replay.classList.toggle('hidden',!introEnabled(site.theme));
    await readRoute();
    // CSS animations only start after the saved settings have been read.
    if(version===loadVersion&&!active&&introEnabled(site.theme)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)await startIntro();
  }catch(error){
    if(version!==loadVersion)return;
    hideIntro();e.yearCount.textContent='読み込みできませんでした';
    e.years.innerHTML='<div class="empty">アルバムを読み込めませんでした。<br><button id="retryLoad" class="pill" type="button">再読み込み</button></div>';
    $('#retryLoad').onclick=load;toast('読み込みに失敗しました。通信状態を確認して再読み込みしてください。');console.error(error);
  }finally{if(version===loadVersion)revealPage()}
}
function renderGroups(){
  e.yearCount.textContent=groups.length+' ALBUMS';
  e.years.innerHTML=groups.length?groups.map((g,i)=>`<button class="yearCard" data-year="${esc(g.year)}"><span class="fallback"></span>${g.cover?`<img loading="lazy" src="${esc(publicUrl(g.cover))}" alt="">`:''}<span class="yearShade"></span>${i===0&&isYearAlbum(g.year)?'<span class="latest">最新</span>':''}<span class="arrow">›</span><span class="yearInfo"><span class="yearNum${isYearAlbum(g.year)?'':' customTitle'}">${esc(g.year)}</span><span class="yearMeta">${g.count} 件（動画 ${g.videoCount||0}本）</span></span></button>`).join(''):'<div class="empty">アルバムはまだありません。</div>';
  e.years.querySelectorAll('.yearCard').forEach(button=>button.onclick=()=>openYear(button.dataset.year,true));
}
function introCovers(){
  return albums.filter(a=>a.cover_path&&!a.cover_path.includes('/video-thumbs/')).map(a=>({image_path:a.cover_path,thumb_path:a.cover_path}));
}
function loadIntroPhotoPool(){
  if(introPhotoPoolPromise)return introPhotoPoolPromise;
  // Only query albums returned for this site's public page, even for a signed-in owner.
  const ids=albums.map(album=>album.id);
  const pending=(async()=>{
    if(!ids.length)return [];
    const collected=[],size=500;
    for(let offset=0;;offset+=size){
      const {data,error}=await sb.from('photo_album_photos').select('id,image_path,thumb_path')
        .in('album_id',ids).order('id').range(offset,offset+size-1);
      if(error)throw error;
      collected.push(...(data||[]));
      if((data||[]).length<size)return collected;
    }
  })();
  introPhotoPoolPromise=pending;
  pending.catch(()=>{if(introPhotoPoolPromise===pending)introPhotoPoolPromise=null});
  return pending;
}
async function introPaths(){
  if(introPhotoMode(site?.theme)==='random'){
    const covers=introCovers();let timeout;
    try{
      // Load paths once per visit; download only the three selected photographs.
      const pool=await Promise.race([loadIntroPhotoPool(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Intro photo loading timed out')),3500)})]);
      return randomIntroPhotos(pool);
    }catch(error){console.error(error);return randomIntroPhotos(covers)}
    finally{clearTimeout(timeout)}
  }
  const selected=Array.isArray(site?.theme?.intro_photos)?site.theme.intro_photos:[];
  return uniqueIntroPhotos(selected,introCovers());
}
function clearIntroTimers(){clearTimeout(introTimer);clearTimeout(introHideTimer)}
function hideIntro(){introVersion++;clearIntroTimers();e.intro.classList.add('hidden');e.intro.classList.remove('out');e.intro.setAttribute('aria-hidden','true')}
function finishIntro(){
  const version=++introVersion;clearIntroTimers();e.intro.classList.add('out');
  e.intro.setAttribute('aria-hidden','true');
  introHideTimer=setTimeout(()=>{if(version===introVersion)e.intro.classList.add('hidden')},900);
}
async function startIntro(){
  if(!site||!introEnabled(site.theme))return;
  hideIntro();const version=introVersion;
  const settings=pageSettings(site),paths=await introPaths();
  if(version!==introVersion||!introEnabled(site?.theme))return;
  // Preload the actual three card images and the expanded photograph before revealing them.
  const imagePaths=[...new Set([...paths.map(p=>p.thumb_path||p.image_path),paths[0]?.image_path].filter(Boolean))];
  await Promise.race([
    Promise.all(imagePaths.map(path=>new Promise(resolve=>{const img=new Image();img.onload=img.onerror=resolve;img.src=publicUrl(path)}))),
    new Promise(resolve=>setTimeout(resolve,1500))
  ]);
  if(version!==introVersion||!introEnabled(site?.theme))return;
  const clone=e.intro.cloneNode(true);e.intro.replaceWith(clone);e.intro=clone;
  clone.querySelector('.introName .main').textContent=settings.title;
  clone.querySelector('.introName .sub').textContent=settings.eyebrow;
  clone.querySelector('.finalCopy .main').textContent=settings.finalText;
  clone.querySelectorAll('.introCard').forEach((card,i)=>{
    card.innerHTML=paths[i]?`<img src="${esc(publicUrl(paths[i].thumb_path||paths[i].image_path))}" alt="">`:'';
    card.style.background='linear-gradient(150deg,#e7dfcf,#c1ad90 53%,#f5eee4)';
  });
  clone.querySelector('#expandPhoto').innerHTML=paths[0]?`<img src="${esc(publicUrl(paths[0].image_path))}" alt="">`:'';
  clone.querySelectorAll('img').forEach(img=>img.onerror=()=>img.remove());
  clone.querySelector('#skip').onclick=finishIntro;
  clone.classList.remove('hidden','out');clone.setAttribute('aria-hidden','false');
  introTimer=setTimeout(finishIntro,6700);
}
e.replay.onclick=startIntro;$('#skip').onclick=finishIntro;
async function openYear(year,push=true){
  const group=groups.find(g=>g.year===year);if(!group)return;
  hideIntro();closeViewer();photoVersion++;active=group;const ids=new Set(group.albums.map(a=>a.id));photos=videoRows.filter(v=>ids.has(v.album_id)).map(v=>({...v,kind:'video',image_url:videoUrl(v.video_path),thumb_url:publicUrl(v.thumb_path)}));page=0;more=true;loading=false;
  e.home.classList.add('hidden');e.detail.classList.remove('hidden');e.detailYear.textContent=year;e.detailYear.classList.toggle('customTitle',!isYearAlbum(year));
  e.detailYearSmall.textContent=year;e.detailCount.textContent=group.count;e.photos.innerHTML=photos.map((video,i)=>`<button class="tile videoTile" data-i="${i}" aria-label="${esc(video.caption||'動画 '+(i+1))}">${video.thumb_url?`<img loading="lazy" src="${esc(video.thumb_url)}" alt="">`:'<span class="videoBlank"></span>'}<span class="playIcon" aria-hidden="true">▶</span><span class="videoLabel">VIDEO</span></button>`).join('');e.photos.querySelectorAll('.videoTile').forEach(button=>button.onclick=()=>show(Number(button.dataset.i)));e.more.textContent='';e.loadMore.classList.add('hidden');
  if(push){const q=new URLSearchParams(location.search);q.delete('album');q.set('year',year);history.pushState({albumYear:true},'',location.pathname+'?'+q)}
  scrollTo({top:0});await nextPage();
}
async function nextPage(){
  if(!active||!more||loading)return;
  const version=photoVersion,ids=active.albums.map(a=>a.id);loading=true;e.more.textContent='読み込み中…';e.loadMore.classList.add('hidden');
  try{
    const result=await sb.from('photo_album_photos').select('id,image_path,thumb_path,caption,position,album_id').in('album_id',ids)
      .order('album_id',{ascending:true}).order('position',{ascending:true}).order('id',{ascending:true}).range(page*PAGE,(page+1)*PAGE-1);
    if(version!==photoVersion)return;
    if(result.error)throw result.error;
    const batch=(result.data||[]).map(p=>({...p,image_url:publicUrl(p.image_path),thumb_url:publicUrl(p.thumb_path||p.image_path)})),base=photos.length;
    photos.push(...batch);
    batch.forEach((p,i)=>e.photos.insertAdjacentHTML('beforeend',`<button class="tile" data-i="${base+i}" aria-label="${esc(p.caption||'写真 '+(base+i+1))}"><img loading="lazy" src="${esc(p.thumb_url)}" alt="${esc(p.caption||'')}"></button>`));
    e.photos.querySelectorAll('.tile:not([data-bound])').forEach(b=>{b.dataset.bound='1';b.onclick=()=>show(Number(b.dataset.i))});
    page++;more=batch.length===PAGE;e.more.textContent=more?'スクロールしてさらに表示':photos.length+' 件の写真・動画';
    e.loadMore.textContent='さらに写真を読み込む';e.loadMore.classList.toggle('hidden',!more);
  }catch(error){if(version===photoVersion){e.more.textContent='写真を読み込めませんでした';e.loadMore.textContent='もう一度読み込む';e.loadMore.classList.remove('hidden');toast('写真の読み込みに失敗しました。再試行できます。');console.error(error)}}
  finally{if(version===photoVersion)loading=false}
}
function home(push=false){
  hideIntro();closeViewer();photoVersion++;active=null;photos=[];loading=false;
  e.detail.classList.add('hidden');e.home.classList.remove('hidden');
  if(push){const q=new URLSearchParams(location.search);q.delete('year');q.delete('album');history.pushState({},'',location.pathname+(q.size?'?'+q:''))}
  scrollTo({top:0});
}
async function readRoute(){
  closeViewer();const q=new URLSearchParams(location.search);let year=q.get('year');
  if(!year&&q.get('album')){const album=albums.find(a=>String(a.id)===q.get('album'));if(album)year=albumLabel(album)}
  if(year&&groups.some(g=>g.year===year))await openYear(year,false);else home(false);
}
e.back.onclick=()=>history.state?.albumYear?history.back():home(true);
e.loadMore.onclick=nextPage;
new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))nextPage()},{rootMargin:'600px'}).observe(e.more);
function show(i){if(!photos[i])return;idx=i;lastFocus=document.activeElement;paint();e.viewer.classList.add('show');e.viewer.setAttribute('aria-hidden','false');document.body.classList.add('viewerOpen');e.close.focus()}
function stopVideo(){
 if(!e.bigVideo.hasAttribute('src'))return;
 try{e.bigVideo.pause()}catch{}
 e.bigVideo.removeAttribute('src');
 e.bigVideo.removeAttribute('poster');
}
function paint(){
 const media=photos[idx];if(!media)return;resetZoom();stopVideo();
 const video=media.kind==='video';
 e.big.style.display=video?'none':'block';e.bigVideo.style.display=video?'block':'none';e.viewer.style.touchAction=video?'auto':'none';e.stage.style.touchAction=video?'auto':'none';
 if(video){e.big.removeAttribute('src');e.bigVideo.src=media.image_url;if(media.thumb_url)e.bigVideo.poster=media.thumb_url;e.viewerHint.textContent='再生ボタンで動画を再生 ・ 左右の矢印で移動'}
 else{e.big.src=media.image_url;e.big.alt=media.caption||'写真 '+(idx+1);e.viewerHint.textContent='左右スワイプで移動 ・ ピンチ / ダブルタップで拡大'}
 e.counter.textContent=(idx+1)+' / '+(active?.count||photos.length);
 e.prev.disabled=idx<=0;e.next.disabled=idx>=photos.length-1&&!more;
}
async function goNext(){const version=photoVersion;if(idx>=photos.length-1&&more)await nextPage();if(version===photoVersion&&e.viewer.classList.contains('show')&&idx<photos.length-1){idx++;paint()}}
function goPrev(){if(idx>0){idx--;paint()}}
function closeViewer(){const wasOpen=e.viewer.classList.contains('show');e.viewer.classList.remove('show');e.viewer.setAttribute('aria-hidden','true');document.body.classList.remove('viewerOpen');stopVideo();e.viewer.style.touchAction='none';e.stage.style.touchAction='none';resetZoom();if(wasOpen&&lastFocus?.isConnected)lastFocus.focus()}
e.close.onclick=closeViewer;e.next.onclick=goNext;e.prev.onclick=goPrev;
let scale=1,x=0,y=0,startX=0,startY=0,pinch=0,pinchScale=1,moved=false,lastTap=0;function dist(a,b){return Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)}function apply(no=true){e.canvas.style.transition=no?'none':'transform .18s ease';e.canvas.style.transform=`translate(${x}px,${y}px) scale(${scale})`}function resetZoom(){scale=1;x=0;y=0;apply(false)}e.stage.addEventListener('touchstart',ev=>{if(ev.target.closest?.('video'))return;moved=false;if(ev.touches.length===2){pinch=dist(ev.touches[0],ev.touches[1]);pinchScale=scale}else if(ev.touches.length===1){startX=ev.touches[0].clientX;startY=ev.touches[0].clientY}},{passive:false});e.stage.addEventListener('touchmove',ev=>{if(ev.target.closest?.('video'))return;ev.preventDefault();moved=true;if(ev.touches.length===2){scale=Math.min(4,Math.max(1,pinchScale*(dist(ev.touches[0],ev.touches[1])/pinch)));apply(true)}else if(ev.touches.length===1&&scale>1){const dx=ev.touches[0].clientX-startX,dy=ev.touches[0].clientY-startY;x+=dx;y+=dy;startX=ev.touches[0].clientX;startY=ev.touches[0].clientY;apply(true)}},{passive:false});e.stage.addEventListener('touchend',ev=>{if(ev.target.closest?.('video'))return;if(ev.touches.length)return;const now=Date.now();if(!moved&&now-lastTap<280){if(scale>1)resetZoom();else{scale=2;x=0;y=0;apply(false)}lastTap=0;return}if(!moved)lastTap=now;if(scale<=1.02){resetZoom();const t=ev.changedTouches?.[0];if(t){const dx=t.clientX-startX,dy=t.clientY-startY;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))(dx<0?goNext():goPrev())}}});
addEventListener('keydown',ev=>{
  if(!e.viewer.classList.contains('show'))return;
  if(ev.key==='Escape')closeViewer();
  if(ev.key==='ArrowLeft')goPrev();
  if(ev.key==='ArrowRight')goNext();
  if(ev.key==='Tab'){
    const buttons=[...e.viewer.querySelectorAll('button:not(:disabled)')];
    const first=buttons[0],last=buttons.at(-1);
    if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}
    else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}
  }
});
addEventListener('popstate',readRoute);
addEventListener('pageshow',event=>{if(event.persisted)load()});
load();
