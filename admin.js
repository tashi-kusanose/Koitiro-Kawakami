import {introEnabled, pageSettings, applyAppearance, DEFAULT_COLORS} from './album-settings.js?v=20260930-2';
import{createClient}from'https://esm.sh/@supabase/supabase-js@2.117.2';
const sb=createClient('https://esfgrykcvdctnvdqipbj.supabase.co','sb_publishable_Rwb3qaRXdWZoo05LrbFaDg_29tMI7uI'),bucket='photo-album',maxPhotos=1500,$=s=>document.querySelector(s);
const e={siteEyebrow:$('#siteEyebrow'),siteHeaderText:$('#siteHeaderText'),siteIntro:$('#siteIntro'),titleFont:$('#titleFont'),titleSize:$('#titleSize'),introFinalText:$('#introFinalText'),saveSite:$('#saveSite'),saveStatus:$('#saveStatus'),adminStatus:$('#adminStatus'),cBg:$('#cBg'),cSurface:$('#cSurface'),cText:$('#cText'),cMuted:$('#cMuted'),cAccent:$('#cAccent'),cHeader:$('#cHeader'),presetGrid:$('#presetGrid'),auth:$('#auth'),admin:$('#admin'),logout:$('#logout'),logoutMobile:$('#logoutMobile'),login:$('#login'),email:$('#email'),pass:$('#password'),magic:$('#magic'),newAlbum:$('#newAlbum'),navNew:$('#navNew'),navSettings:$('#navSettings'),navAlbums:$('#navAlbums'),list:$('#albumList'),qCount:$('#qCount'),qBytes:$('#qBytes'),qBar:$('#qBar'),settingsToggle:$('#settingsToggle'),settingsPanel:$('#settingsPanel'),siteForm:$('#siteForm'),siteTitle:$('#siteTitle'),introEnabled:$('#introEnabled'),sitePublished:$('#sitePublished'),previewLink:$('#previewLink'),introSelected:$('#introSelected'),picker:$('#photoPicker'),pickerMore:$('#pickerMore'),pickCount:$('#pickCount'),editor:$('#editor'),editorTitle:$('#editorTitle'),close:$('#closeEditor'),form:$('#albumForm'),groupKey:$('#groupKey'),year:$('#aYear'),pub:$('#aPub'),del:$('#deleteAlbum'),upload:$('#uploadBox'),files:$('#files'),progress:$('#progress'),pBar:$('#progressBar'),pText:$('#progressText'),photos:$('#photoGrid'),toast:$('#toast')};
let user=null,site=null,albums=[],groups=[],currentGroup=null,currentAlbum=null,usage={count:0,bytes:0},introSelected=[],pickerPhotos=[],pickerPage=0,pickerMore=true;
let initializedUser=null,savingSite=false,settingsDirty=false,pickerLoading=false,pickerVersion=0,editorVersion=0,uploading=false;
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])),url=p=>p?sb.storage.from(bucket).getPublicUrl(p).data.publicUrl:'';
function toast(m){e.toast.textContent=m;e.toast.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.toast.classList.add('hidden'),3400)}function bytes(n){return n<1048576?(n/1024).toFixed(n?1:0)+' KB':(n/1048576).toFixed(1)+' MB'}
function yearOf(a){if(a.album_date&&/^\d{4}/.test(a.album_date))return a.album_date.slice(0,4);const m=String(a.title||'').match(/(?:19|20)\d{2}/);return m?m[0]:null}
function groupAlbums(){const map=new Map();albums.forEach(a=>{const y=yearOf(a)||'年未設定';if(!map.has(y))map.set(y,{key:y,year:y,albums:[],count:0,cover:'',published:false});const g=map.get(y);g.albums.push(a);g.count+=Number(a.photos?.[0]?.count||0);if(!g.cover&&a.cover_path)g.cover=a.cover_path;if(a.is_published)g.published=true});groups=[...map.values()].sort((a,b)=>{if(a.year==='年未設定')return 1;if(b.year==='年未設定')return-1;return Number(b.year)-Number(a.year)})}
function authChanged(session){
  user=session?.user||null;
  e.auth.classList.toggle('hidden',!!user);e.admin.classList.toggle('hidden',!user);
  if(!user){initializedUser=null;site=null;settingsDirty=false;return}
  // Token refresh and tab focus must never reset an unsaved settings form.
  if(initializedUser===user.id)return;
  initializedUser=user.id;bootstrap(user.id);
}
async function init(){
  // Defer database queries until Supabase has released its auth callback lock.
  sb.auth.onAuthStateChange((_event,session)=>setTimeout(()=>authChanged(session),0));
  const {data,error}=await sb.auth.getSession();
  if(error)toast(error.message);authChanged(data?.session);
}
function setSettingsBusy(busy){e.siteForm.querySelectorAll('input,textarea,select,button').forEach(node=>node.disabled=busy)}
async function bootstrap(userId){
  e.adminStatus.textContent='アルバムを読み込んでいます…';setSettingsBusy(true);
  try{
    await ensureSite();if(user?.id!==userId)return;
    fillSite();await loadAlbums();await loadPicker(true);e.adminStatus.textContent='';
  }catch(error){initializedUser=null;e.adminStatus.textContent='読み込みに失敗しました。ページを再読み込みしてください。';toast(error.message)}
  finally{if(user?.id===userId)setSettingsBusy(!site)}
}
async function ensureSite(){
  const slug=new URLSearchParams(location.search).get('site');
  let query=sb.from('photo_album_sites').select('*').eq('owner_user_id',user.id);
  query=slug?query.eq('slug',slug):query.order('created_at',{ascending:true}).limit(1);
  const {data,error}=await query.maybeSingle();if(error)throw error;
  if(data){site=data;return}
  if(slug)throw new Error('このアルバムを編集できるアカウントでログインしてください。');
  const result=await sb.from('photo_album_sites').insert({owner_user_id:user.id,page_title:'川上 公一郎',eyebrow_text:'アルバム'}).select().single();
  if(result.error)throw result.error;site=result.data;
}
const colorFields={background:'cBg',surface:'cSurface',text:'cText',muted:'cMuted',accent:'cAccent',header:'cHeader'};
const presets=[
  {name:'現在のアイボリー',...DEFAULT_COLORS},
  {name:'ピンク',background:'#fff7f8',surface:'#ffffff',text:'#402e32',muted:'#9a7c83',accent:'#c36d80',header:'#fbe4e8'},
  {name:'ホワイト',background:'#f6f7f9',surface:'#ffffff',text:'#20242a',muted:'#7b828d',accent:'#2e7dd7',header:'#ffffff'},
  {name:'ミッドナイト',background:'#0b0b0d',surface:'#17171b',text:'#f6f6f7',muted:'#9a9aa5',accent:'#f4f1ea',header:'#0b0b0d'},
  {name:'オーシャン',background:'#071521',surface:'#102536',text:'#f2f8fc',muted:'#91aabc',accent:'#56c6e8',header:'#0a1d2d'},
  {name:'フォレスト',background:'#101814',surface:'#1b2821',text:'#f3f5f0',muted:'#9eada2',accent:'#91b88d',header:'#132019'},
  {name:'ヴィンテージ',background:'#211a16',surface:'#322720',text:'#f1e5d3',muted:'#b6a28c',accent:'#d39a5c',header:'#271d18'},
  {name:'ラベンダー',background:'#171421',surface:'#252033',text:'#f7f3fc',muted:'#aaa0ba',accent:'#c6a4ed',header:'#1c1727'}
];
function renderPresets(){
  e.presetGrid.innerHTML=presets.map((preset,i)=>`<button class="presetBtn" data-preset="${i}" type="button">${preset.name}<span class="swatches">${Object.keys(colorFields).map(key=>`<i style="background:${preset[key]}"></i>`).join('')}</span></button>`).join('');
  e.presetGrid.querySelectorAll('button').forEach(button=>button.onclick=()=>{const preset=presets[Number(button.dataset.preset)];for(const [key,id] of Object.entries(colorFields))e[id].value=preset[key];markDirty();renderHeaderPreview()});
}
function markDirty(){if(!site||savingSite)return;settingsDirty=true;e.saveStatus.textContent='未保存の変更があります'}
function formSettings(){
  const colors=Object.fromEntries(Object.entries(colorFields).map(([key,id])=>[key,e[id].value]));
  return pageSettings({page_title:e.siteTitle.value,eyebrow_text:e.siteEyebrow.value,header_text:e.siteHeaderText.value,intro_text:e.siteIntro.value,theme:{...colors,title_font:e.titleFont.value,title_size:Number(e.titleSize.value)}});
}
function renderHeaderPreview(){
  const settings=formSettings();applyAppearance($('#headerPreview'),settings);
  $('#previewTitle').textContent=settings.title;$('#previewEyebrow').textContent=settings.eyebrow;
  $('#previewHeader').textContent=settings.header;$('#previewDescription').textContent=settings.description;
  e.presetGrid.querySelectorAll('button').forEach(button=>{const preset=presets[Number(button.dataset.preset)];button.classList.toggle('active',Object.keys(colorFields).every(key=>settings.colors[key].toLowerCase()===preset[key].toLowerCase()))});
}
function fillSite(){
  const settings=pageSettings(site),theme=site.theme||{};
  e.siteTitle.value=settings.title;e.siteEyebrow.value=settings.eyebrow;e.siteHeaderText.value=settings.header;e.siteIntro.value=settings.description;
  e.titleFont.value=settings.font;e.titleSize.value=settings.size;e.introFinalText.value=settings.finalText;
  for(const [key,id] of Object.entries(colorFields))e[id].value=settings.colors[key];
  e.introEnabled.checked=introEnabled(theme);e.sitePublished.checked=!!site.is_published;
  introSelected=Array.isArray(theme.intro_photos)?theme.intro_photos.filter(photo=>photo?.image_path).slice(0,3):[];
  document.querySelectorAll('[data-public-link],#previewLink').forEach(link=>link.href='index.html?site='+encodeURIComponent(site.slug));
  $('#sideTitle').textContent=settings.title;document.title=settings.title+'｜アルバム管理';
  settingsDirty=false;e.saveStatus.textContent='保存済み';renderIntroSelected();renderHeaderPreview();
}
async function saveSite(event){
  event.preventDefault();if(!site||!user||savingSite)return;
  const theme={...(site.theme||{}),...formSettings().colors,title_font:e.titleFont.value,title_size:Number(e.titleSize.value),intro_final_text:e.introFinalText.value.trim(),intro_enabled:e.introEnabled.checked,intro_photos:introSelected.slice(0,3)};
  const payload={page_title:e.siteTitle.value.trim(),eyebrow_text:e.siteEyebrow.value.trim(),header_text:e.siteHeaderText.value.trim(),intro_text:e.siteIntro.value.trim(),theme,is_published:e.sitePublished.checked};
  savingSite=true;setSettingsBusy(true);e.saveStatus.textContent='保存中…';e.saveSite.textContent='保存中…';
  try{
    let query=sb.from('photo_album_sites').update(payload).eq('id',site.id).eq('owner_user_id',user.id);
    if(site.updated_at)query=query.eq('updated_at',site.updated_at);
    const result=await query.select().maybeSingle();if(result.error)throw result.error;
    if(!result.data)throw new Error('別の画面で設定が更新されました。再読み込みしてから変更を保存してください。');
    site=result.data;fillSite();e.saveStatus.textContent='保存しました（イントロ '+(introEnabled(site.theme)?'ON':'OFF')+'）';
    e.previewLink.href='index.html?site='+encodeURIComponent(site.slug)+'&v='+Date.now();toast('ページ・イントロ設定を保存しました');
  }catch(error){e.saveStatus.textContent='保存できませんでした。変更内容はこの画面に残っています。';toast(error.message)}
  finally{savingSite=false;setSettingsBusy(false);e.saveSite.textContent='設定を保存'}
}
async function loadAlbums(){const{data,error}=await sb.from('photo_albums').select('id,title,description,album_date,is_published,cover_path,created_at,site_id,photos:photo_album_photos(count)').eq('site_id',site.id).order('album_date',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id');if(error)return toast(error.message);albums=data||[];groupAlbums();renderList();await loadUsage()}
function renderList(){e.list.innerHTML=groups.length?groups.map(g=>`<article class="row" data-key="${esc(g.key)}"><div class="thumb">${g.cover?`<img src="${esc(url(g.cover))}" alt="">`:''}</div><div><h3>${esc(g.year)} <span class="status ${g.published?'':'off'}">${g.published?'公開中':'非公開'}</span></h3><p>${g.count}枚 · ${g.albums.length}データ</p></div><div class="rowActions"><button class="outline editRow" type="button">編集</button><button class="danger deleteRow" type="button">削除</button></div></article>`).join(''):'<div class="empty">年別アルバムはまだありません。</div>';e.list.querySelectorAll('.editRow').forEach(b=>b.onclick=ev=>{ev.stopPropagation();editGroup(b.closest('.row').dataset.key)});e.list.querySelectorAll('.deleteRow').forEach(b=>b.onclick=ev=>{ev.stopPropagation();removeGroup(b.closest('.row').dataset.key)});e.list.querySelectorAll('.row').forEach(x=>x.onclick=()=>editGroup(x.dataset.key))}
async function allPhotos(makeQuery){
  const collected=[],size=500;
  for(let offset=0;;offset+=size){const {data,error}=await makeQuery().range(offset,offset+size-1);if(error)throw error;collected.push(...(data||[]));if((data||[]).length<size)return collected}
}
async function loadUsage(){
  const data=await allPhotos(()=>sb.from('photo_album_photos').select('image_bytes,thumb_bytes').eq('owner_user_id',user.id).order('id'));
  usage={count:data.length,bytes:data.reduce((sum,photo)=>sum+(photo.image_bytes||0)+(photo.thumb_bytes||0),0)};
  e.qCount.textContent=usage.count+' / '+maxPhotos+'枚';e.qBytes.textContent='推定 '+bytes(usage.bytes)+' / 1 GB';e.qBar.style.width=Math.min(100,Math.round(usage.count/maxPhotos*100))+'%';
}
function fresh(){if(uploading)return toast('写真のアップロード完了をお待ちください');if(!site)return;editorVersion++;currentGroup=null;currentAlbum=null;e.form.reset();e.groupKey.value='';e.year.value=new Date().getFullYear();e.pub.checked=true;e.del.classList.add('hidden');e.upload.classList.add('hidden');e.photos.innerHTML='';e.editorTitle.textContent='新しい年を追加';e.editor.classList.remove('hidden');e.editor.scrollIntoView({behavior:'smooth'})}
async function editGroup(key){if(uploading)return toast('写真のアップロード完了をお待ちください');currentGroup=groups.find(g=>g.key===key);if(!currentGroup)return;currentAlbum=currentGroup.albums[0];e.groupKey.value=key;e.year.value=currentGroup.year==='年未設定'?'':currentGroup.year;e.pub.checked=currentGroup.published;e.del.classList.remove('hidden');e.upload.classList.remove('hidden');e.editorTitle.textContent=currentGroup.year+'年の写真';e.editor.classList.remove('hidden');await loadPhotos();e.editor.scrollIntoView({behavior:'smooth'})}
async function saveGroup(ev){ev.preventDefault();if(uploading||!site)return;const year=String(e.year.value).trim();if(!/^(19|20)\d{2}$/.test(year))return toast('4桁の年を入力してください');if(!currentGroup){const r=await sb.from('photo_albums').insert({title:year+'年',album_date:year+'-01-01',is_published:e.pub.checked,owner_user_id:user.id,site_id:site.id,description:''}).select().single();if(r.error)return toast(r.error.message);toast(year+'年を追加しました');await loadAlbums();await editGroup(year);return}const ids=currentGroup.albums.map(a=>a.id);const r=await sb.from('photo_albums').update({title:year+'年',album_date:year+'-01-01',is_published:e.pub.checked}).in('id',ids).eq('owner_user_id',user.id);if(r.error)return toast(r.error.message);toast('保存しました');await loadAlbums();await editGroup(year)}
async function loadPhotos(){
  if(!currentGroup)return;const version=++editorVersion,ids=currentGroup.albums.map(album=>album.id),cover=currentGroup.cover;
  e.photos.innerHTML='<p class="mut">写真を読み込んでいます…</p>';
  try{
    const data=await allPhotos(()=>sb.from('photo_album_photos').select('*').in('album_id',ids).order('album_id').order('position').order('id'));
    if(version!==editorVersion)return;
    e.photos.innerHTML=data.map(photo=>`<div class="photo"><img loading="lazy" src="${esc(url(photo.thumb_path||photo.image_path))}" alt=""><button class="deletePhoto" aria-label="写真を削除" data-id="${esc(photo.id)}" data-i="${esc(photo.image_path)}" data-t="${esc(photo.thumb_path)}" data-a="${esc(photo.album_id)}">×</button><button class="coverBtn ${cover===photo.thumb_path?'current':''}" data-cover="${esc(photo.thumb_path)}" type="button">${cover===photo.thumb_path?'現在の表紙':'表紙にする'}</button></div>`).join('');
    e.photos.querySelectorAll('.deletePhoto').forEach(button=>button.onclick=()=>removePhoto(button));e.photos.querySelectorAll('.coverBtn').forEach(button=>button.onclick=()=>setCover(button.dataset.cover));
  }catch(error){if(version===editorVersion){e.photos.innerHTML='<p class="mut">写真を読み込めませんでした。もう一度「編集」を押してください。</p>';toast(error.message)}}
}
async function setCover(thumbPath){if(!currentGroup)return;const primary=currentGroup.albums[0];const r=await sb.from('photo_albums').update({cover_path:thumbPath}).in('id',currentGroup.albums.map(album=>album.id)).eq('owner_user_id',user.id);if(r.error)return toast(r.error.message);toast('年の表紙を変更しました');await loadAlbums();await editGroup(yearOf({...primary,album_date:e.year.value+'-01-01'})||currentGroup.key)}
async function removePhoto(b){if(uploading||savingSite)return;if(!confirm('この写真を削除しますか？'))return;let r=await sb.storage.from(bucket).remove([b.dataset.i,b.dataset.t]);if(r.error)return toast(r.error.message);r=await sb.from('photo_album_photos').delete().eq('id',b.dataset.id).eq('owner_user_id',user.id);if(r.error)return toast(r.error.message);const coverResult=await sb.from('photo_albums').update({cover_path:null}).eq('site_id',site.id).eq('owner_user_id',user.id).eq('cover_path',b.dataset.t);if(coverResult.error)toast('表紙を更新できませんでした。別の表紙を選んでください。');introSelected=introSelected.filter(x=>x.id!==b.dataset.id&&x.image_path!==b.dataset.i);await removeSavedIntroPhotos(new Set([b.dataset.id,b.dataset.i]));renderIntroSelected();await loadAlbums();await loadPicker(true);const key=currentGroup?.key;if(key&&groups.find(g=>g.key===key))await editGroup(key);toast('写真を削除しました')}
async function removeGroup(key){if(uploading||savingSite)return;const g=groups.find(x=>x.key===key);if(!g||!confirm('「'+g.year+'」の写真をすべて削除しますか？'))return;const ids=g.albums.map(a=>a.id);let data;try{data=await allPhotos(()=>sb.from('photo_album_photos').select('id,image_path,thumb_path').in('album_id',ids).order('id'))}catch(error){return toast(error.message)}const paths=(data||[]).flatMap(p=>[p.image_path,p.thumb_path]);for(let i=0;i<paths.length;i+=100){const r=await sb.storage.from(bucket).remove(paths.slice(i,i+100));if(r.error)return toast(r.error.message)}const r=await sb.from('photo_albums').delete().in('id',ids).eq('owner_user_id',user.id);if(r.error)return toast(r.error.message);const deleted=new Set((data||[]).map(p=>p.id));introSelected=introSelected.filter(x=>!deleted.has(x.id));await removeSavedIntroPhotos(new Set([...deleted,...(data||[]).map(p=>p.image_path)]));renderIntroSelected();if(currentGroup?.key===key){currentGroup=null;currentAlbum=null;e.editor.classList.add('hidden')}await loadAlbums();await loadPicker(true);toast('削除しました')}
async function upload(files){
  if(!currentAlbum||uploading)return;
  const list=[...files].filter(file=>file.type.startsWith('image/'));if(!list.length)return;
  const targetAlbum={...currentAlbum},ownerId=user.id;uploading=true;e.files.disabled=true;
  try{
    await loadUsage();const remain=Math.max(0,maxPhotos-usage.count),use=list.slice(0,remain);if(!use.length)return toast('写真上限に達しています');
    e.progress.classList.remove('hidden');const lastResult=await sb.from('photo_album_photos').select('position').eq('album_id',targetAlbum.id).order('position',{ascending:false}).limit(1).maybeSingle();if(lastResult.error)throw lastResult.error;
    let position=(lastResult.data?.position??-1)+1,ok=0;
    for(let i=0;i<use.length;i++){progress(i,use.length,'変換中: '+use[i].name);try{await uploadOne(use[i],position++,targetAlbum.id,ownerId);ok++}catch(error){console.error(error);toast(use[i].name+': '+error.message)}}
    progress(use.length,use.length,ok+'枚完了');await loadAlbums();await loadPicker(true);
    uploading=false;const key=yearOf(targetAlbum)||currentGroup?.key;if(key&&groups.some(group=>group.key===key))await editGroup(key);
    setTimeout(()=>e.progress.classList.add('hidden'),1800);
  }catch(error){toast(error.message)}finally{uploading=false;e.files.value='';e.files.disabled=false}
}
async function uploadOne(file,pos,albumId,ownerId){let bmp;try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{bmp=await createImageBitmap(file)}try{const view=await encode(bmp,1800,720,.80,.44,400*1024),thumb=await encode(bmp,420,240,.68,.40,50*1024),key=crypto.randomUUID(),base=ownerId+'/'+albumId,img=base+'/'+key+'.webp',th=base+'/thumbs/'+key+'.webp';let r=await sb.storage.from(bucket).upload(img,view,{contentType:'image/webp',cacheControl:'31536000'});if(r.error)throw r.error;r=await sb.storage.from(bucket).upload(th,thumb,{contentType:'image/webp',cacheControl:'31536000'});if(r.error){await sb.storage.from(bucket).remove([img]);throw r.error}r=await sb.from('photo_album_photos').insert({album_id:albumId,owner_user_id:ownerId,image_path:img,thumb_path:th,position:pos,image_bytes:view.size,thumb_bytes:thumb.size});if(r.error){await sb.storage.from(bucket).remove([img,th]);throw r.error}}finally{bmp?.close?.()}}
async function encode(bmp,maxSide,minSide,q,minQ,target){const om=Math.max(bmp.width,bmp.height);let side=Math.min(maxSide,om),last=null;for(let a=0;a<16;a++){const ratio=Math.min(1,side/om),w=Math.max(1,Math.round(bmp.width*ratio)),h=Math.max(1,Math.round(bmp.height*ratio)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(bmp,0,0,w,h);last=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('画像変換失敗')),'image/webp',q));if(last.size<=target)return last;if(q>minQ+.03)q=Math.max(minQ,q-.07);else if(side>minSide){side=Math.max(minSide,Math.round(side*.84));q=.70}else break}throw new Error('容量まで圧縮できませんでした')}
function progress(done,total,label){e.pBar.style.width=(total?Math.round(done/total*100):0)+'%';e.pText.textContent=done+' / '+total+' · '+label}
function toggleSettings(force){const open=e.settingsToggle.getAttribute('aria-expanded')==='true',next=typeof force==='boolean'?force:!open;e.settingsToggle.setAttribute('aria-expanded',String(next));e.settingsPanel.classList.toggle('hidden',!next);e.settingsToggle.querySelector('strong').textContent=next?'ページ・イントロ設定を閉じる':'ページ・イントロ設定を開く';if(next)e.settingsPanel.scrollIntoView({behavior:'smooth',block:'nearest'})}
function renderIntroSelected(){
  e.introSelected.innerHTML=[0,1,2].map(i=>{const photo=introSelected[i];return `<div class="slot">${photo?`<img src="${esc(url(photo.thumb_path||photo.image_path))}" alt="イントロ写真 ${i+1}">`:''}<span class="slotNum">${i+1}</span>${photo?`<div class="slotControls">${i>0?`<button type="button" data-move="${i}" data-dir="-1" aria-label="写真 ${i+1} を前へ">‹</button>`:''}<button type="button" data-remove="${i}" aria-label="写真 ${i+1} の選択を解除">×</button>${i<introSelected.length-1?`<button type="button" data-move="${i}" data-dir="1" aria-label="写真 ${i+1} を後へ">›</button>`:''}</div>`:''}</div>`}).join('');
  e.introSelected.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{introSelected.splice(Number(button.dataset.remove),1);markDirty();renderIntroSelected()});
  e.introSelected.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.move),j=i+Number(button.dataset.dir);[introSelected[i],introSelected[j]]=[introSelected[j],introSelected[i]];markDirty();renderIntroSelected()});
  renderPickerSelection();
}
async function loadPicker(reset=false){
  if(reset){pickerVersion++;pickerPhotos=[];pickerPage=0;pickerMore=true;pickerLoading=false}
  if(!site||!pickerMore||pickerLoading)return;
  const ids=albums.map(album=>album.id);if(!ids.length){pickerMore=false;renderPicker();return}
  const version=pickerVersion;pickerLoading=true;e.pickerMore.disabled=true;
  try{
    const size=96,from=pickerPage*size;
    const {data,error}=await sb.from('photo_album_photos').select('id,image_path,thumb_path,album_id,position').eq('owner_user_id',user.id).in('album_id',ids).order('album_id',{ascending:false}).order('position',{ascending:false}).order('id').range(from,from+size-1);
    if(version!==pickerVersion)return;if(error)throw error;
    pickerPhotos.push(...(data||[]));pickerPage++;pickerMore=(data||[]).length===size;renderPicker();
  }catch(error){toast(error.message)}finally{if(version===pickerVersion){pickerLoading=false;e.pickerMore.disabled=false}}
}
function renderPicker(){e.pickCount.textContent=introSelected.length+' / 3枚選択';e.picker.innerHTML=pickerPhotos.map(p=>`<button type="button" class="pick" data-id="${esc(p.id)}"><img loading="lazy" src="${esc(url(p.thumb_path||p.image_path))}" alt=""><span class="order hidden"></span></button>`).join('');e.picker.querySelectorAll('.pick').forEach(b=>b.onclick=()=>toggleIntroPhoto(b.dataset.id));e.pickerMore.classList.toggle('hidden',!pickerMore);renderPickerSelection()}
function renderPickerSelection(){if(!e.picker)return;e.pickCount.textContent=introSelected.length+' / 3枚選択';e.picker.querySelectorAll('.pick').forEach(b=>{const i=introSelected.findIndex(x=>String(x.id)===String(b.dataset.id));b.classList.toggle('selected',i>=0);const o=b.querySelector('.order');if(o){o.classList.toggle('hidden',i<0);o.textContent=i>=0?String(i+1):''}})}
function toggleIntroPhoto(id){const found=pickerPhotos.find(p=>String(p.id)===String(id));if(!found)return;const i=introSelected.findIndex(x=>String(x.id)===String(id));if(i>=0)introSelected.splice(i,1);else{if(introSelected.length>=3)return toast('イントロ写真は3枚までです');introSelected.push({id:found.id,image_path:found.image_path,thumb_path:found.thumb_path})}markDirty();renderIntroSelected()}
async function removeSavedIntroPhotos(deleted){
  const saved=Array.isArray(site?.theme?.intro_photos)?site.theme.intro_photos:[];
  const retained=saved.filter(photo=>!deleted.has(photo.id)&&!deleted.has(photo.image_path));
  if(saved.length===retained.length)return;
  // Deletion cleanup must not save an unchecked, still-unsaved intro switch.
  let query=sb.from('photo_album_sites').update({theme:{...site.theme,intro_photos:retained}}).eq('id',site.id).eq('owner_user_id',user.id);
  if(site.updated_at)query=query.eq('updated_at',site.updated_at);
  const result=await query.select().maybeSingle();
  if(result.error||!result.data){toast('写真は削除されましたがイントロ設定を更新できませんでした。設定を確認して保存してください。');return}
  site=result.data;renderIntroSelected();
}
renderPresets();
e.siteForm.addEventListener('input',()=>{markDirty();renderHeaderPreview()});
e.siteForm.addEventListener('change',markDirty);
addEventListener('beforeunload',event=>{if(settingsDirty||uploading){event.preventDefault();event.returnValue=''}});

e.settingsToggle.onclick=()=>toggleSettings();e.navSettings.onclick=()=>toggleSettings(true);e.siteForm.onsubmit=saveSite;e.pickerMore.onclick=()=>loadPicker(false);e.login.onsubmit=async ev=>{ev.preventDefault();const{error}=await sb.auth.signInWithPassword({email:e.email.value,password:e.pass.value});if(error)toast(error.message)};e.magic.onclick=async()=>{const email=e.email.value.trim();if(!email)return toast('メールアドレスを入力してください');const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.href,shouldCreateUser:false}});toast(error?error.message:'ログインリンクを送信しました')};const logout=()=>sb.auth.signOut();e.logout.onclick=logout;e.logoutMobile.onclick=logout;e.newAlbum.onclick=fresh;e.navNew.onclick=fresh;e.navAlbums.onclick=()=>scrollTo({top:0,behavior:'smooth'});e.close.onclick=()=>e.editor.classList.add('hidden');e.form.onsubmit=saveGroup;e.del.onclick=()=>currentGroup&&removeGroup(currentGroup.key);e.files.onchange=v=>upload(v.target.files);['dragenter','dragover'].forEach(n=>e.upload.addEventListener(n,v=>{v.preventDefault();e.upload.classList.add('drag')}));['dragleave','drop'].forEach(n=>e.upload.addEventListener(n,v=>{v.preventDefault();e.upload.classList.remove('drag')}));e.upload.addEventListener('drop',v=>upload(v.dataTransfer.files));init();
