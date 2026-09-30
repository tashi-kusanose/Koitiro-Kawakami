// DOM integration tests with an isolated in-memory Supabase adapter.
// No production reads/writes or real photographs are used.
const {JSDOM}=require(process.env.ALBUM_TEST_JSDOM || 'jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<200;i++){if(check())return;await sleep(5)}throw new Error('Timed out: '+label)}
function fixture(enabled=false){
  const photos=Array.from({length:1002},(_,i)=>({id:'p'+String(i).padStart(4,'0'),album_id:i<1001?'a2026':'a2025',owner_user_id:'owner',image_path:'images/'+i+'.webp',thumb_path:'thumbs/'+i+'.webp',position:i,caption:'写真 '+i,image_bytes:100,thumb_bytes:10}));
  return {
    site:{id:'site',slug:'album-test',owner_user_id:'owner',page_title:'川上 公一朗',eyebrow_text:'アルバム',header_text:'大切な思い出',intro_text:'一行目\n二行目',is_published:true,updated_at:'version-1',theme:{intro_enabled:enabled,intro_photos:photos.slice(0,3),custom_setting:'retain-me',background:'#8cc9ff'}},
    albums:[{id:'a2026',site_id:'site',owner_user_id:'owner',album_date:'2026-01-01',title:'2026年',is_published:true,photo_count:1001,photos:[{count:1001}],cover_path:'thumbs/0.webp'},{id:'a2025',site_id:'site',owner_user_id:'owner',album_date:'2025-01-01',title:'2025年',is_published:true,photo_count:1,photos:[{count:1}],cover_path:'thumbs/1001.webp'}],
    photos, log:[], authCallbacks:[], delaySite:null, photoGate:null, failSave:false, conflict:false,session:{user:{id:'owner'}}
  };
}
function adapter(state){
  return {
    storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:'https://images.test/'+p}}),remove:async()=>({error:null})})},
    auth:{getSession:async()=>({data:{session:state.session}}),onAuthStateChange:fn=>{state.authCallbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{state.session=null;state.authCallbacks.forEach(fn=>fn('SIGNED_OUT',null));return {error:null}}},
    from(table){
      const filters=[],sorts=[];let range=null,operation='select',payload=null,single=false;
      const query={select(){return this},eq(k,v){filters.push(row=>String(row[k])===String(v));return this},in(k,values){filters.push(row=>values.includes(row[k]));return this},order(key,options={}){sorts.push([key,options.ascending!==false]);return this},range(a,b){range=[a,b];return this},limit(n){range=[0,n-1];return this},maybeSingle(){single=true;return this},single(){single=true;return this},update(value){operation='update';payload=value;return this},delete(){operation='delete';return this},then(resolve,reject){return run().then(resolve,reject)}};
      async function run(){
        state.log.push({table,operation,payload,range});
        if(table==='photo_album_sites_public'&&state.delaySite)await state.delaySite;
        if(table==='photo_album_sites_public'&&state.failSite)return {data:null,error:{message:'TEST: site unavailable'}};
        let rows=table.startsWith('photo_album_sites')?[state.site]:table==='photo_albums'||table==='photo_albums_public'?state.albums:state.photos;
        if(table==='photo_album_sites_public')rows=rows.filter(row=>row.is_published);
        if(table==='photo_albums_public')rows=rows.filter(row=>row.is_published);
        rows=rows.filter(row=>filters.every(fn=>fn(row)));
        if(table==='photo_album_photos'&&state.photoGate)await state.photoGate(rows);
        if(operation==='update'){
          if(state.failSave)return {data:null,error:{message:'TEST: network write failed'}};
          if(state.conflict)return {data:null,error:null};
          rows.forEach(row=>{Object.assign(row,structuredClone(payload));if(table==='photo_album_sites')row.updated_at='version-'+(Number(row.updated_at.split('-')[1])+1)});
        }
        if(operation==='delete'){state.photos=state.photos.filter(row=>!rows.includes(row));return {data:null,error:null}}
        rows=[...rows].sort((a,b)=>{for(const [key,ascending] of sorts){const cmp=String(a[key]??'').localeCompare(String(b[key]??''));if(cmp)return ascending?cmp:-cmp}return 0});
        if(range)rows=rows.slice(range[0],range[1]+1);
        return {data:structuredClone(single?rows[0]||null:rows),error:null};
      }
      return query;
    }
  };
}
async function mount(name,state){
  const html=fs.readFileSync(path.join(root,name+'.html'),'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url:state.url||'https://album.test/'+name+'.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:!!state.reducedMotion});w.confirm=()=>true;w.console.error=()=>{};
  if(state.random)w.Math.random=state.random;
  w.IntersectionObserver=class{observe(){}};
  w.Image=class{set src(value){state.imageRequests??=[];state.imageRequests.push(value);const loaded=()=>this.onload?.();if(state.imageGate)state.imageGate(loaded);else queueMicrotask(loaded)}};
  const client=adapter(state);w.createClient=()=>client;
  const shared=fs.readFileSync(path.join(root,'album-settings.js'),'utf8').replace(/^export /gm,'');
  const code=fs.readFileSync(path.join(root,name+'.js'),'utf8').replace(/^import.*?;[ \t]*$/gm,'');
  const expose=name==='index'?'window.testAPI={openYear,nextPage,home,startIntro,finishIntro,hideIntro,getPhotos:()=>photos};':'window.testAPI={loadPicker,removeSavedIntroPhotos};';
  w.eval(shared+'\n'+code+'\n'+expose);
  return {w,doc:w.document,close:()=>w.close()};
}
function input(w,selector,value){const node=w.document.querySelector(selector);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));node.dispatchEvent(new w.Event('change',{bubbles:true}))}
function submit(w){w.document.querySelector('#siteForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))}
(async()=>{
  // Even before the JS module downloads, the HTML must not expose the album behind it.
  const initial=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  assert.equal(initial.window.getComputedStyle(initial.window.document.querySelector('main.page')).visibility,'hidden');
  assert(initial.window.document.querySelector('main.page').hasAttribute('inert'));
  assert.equal(initial.window.document.querySelector('#startup .startupRetry').getAttribute('href'),'');initial.window.close();

  // Delay settings, random-photo paths and image bytes separately to catch a first-paint flash.
  const startupState=fixture(true);startupState.site.theme.intro_photo_mode='random';startupState.random=()=>0;
  let releaseSettings,releaseCandidates;const imageLoads=[];
  startupState.delaySite=new Promise(resolve=>releaseSettings=resolve);
  startupState.photoGate=()=>new Promise(resolve=>releaseCandidates=()=>{startupState.photoGate=null;resolve()});
  startupState.imageGate=loaded=>imageLoads.push(loaded);
  let startupApp=await mount('index',startupState);
  const mainVisibility=()=>startupApp.w.getComputedStyle(startupApp.doc.querySelector('main.page')).visibility;
  assert.equal(mainVisibility(),'hidden');releaseSettings();
  await until(()=>!!releaseCandidates,'startup candidate request');assert.equal(mainVisibility(),'hidden');
  releaseCandidates();await until(()=>imageLoads.length===4,'startup image preload');assert.equal(mainVisibility(),'hidden');
  const revealStates=[];const observer=new startupApp.w.MutationObserver(()=>{
    if(!startupApp.doc.body.classList.contains('booting'))revealStates.push(!startupApp.doc.querySelector('#intro').classList.contains('hidden'));
  });observer.observe(startupApp.doc.body,{attributes:true,attributeFilter:['class']});
  imageLoads.forEach(loaded=>loaded());await until(()=>!startupApp.doc.body.classList.contains('booting'),'startup handoff');
  assert.deepEqual(revealStates,[true],'the intro must already be visible when the page is released');observer.disconnect();
  assert(!startupApp.doc.querySelector('main.page').hasAttribute('inert'));
  assert(startupApp.doc.querySelector('#startup').classList.contains('leaving'));
  for(const photo of startupApp.doc.querySelectorAll('#intro img'))assert(startupState.imageRequests.includes(photo.src),'preload the displayed thumbnail or expanded image');
  startupApp.w.testAPI.finishIntro();await until(()=>startupApp.doc.querySelector('#intro').classList.contains('hidden'),'startup skip');
  assert.equal(mainVisibility(),'visible');assert(!startupApp.doc.querySelector('#startup'));startupApp.close();

  for(const scenario of ['off','reduced','year','unpublished','error']){
    const state=fixture(scenario!=='off');state.site.theme.intro_photo_mode='random';
    if(scenario==='reduced')state.reducedMotion=true;
    if(scenario==='year')state.url='https://album.test/index.html?year=2025';
    if(scenario==='unpublished'){state.site.is_published=false;state.session=null}
    if(scenario==='error')state.failSite=true;
    startupApp=await mount('index',state);await until(()=>!startupApp.doc.body.classList.contains('booting'),'startup '+scenario);
    assert(startupApp.doc.querySelector('#intro').classList.contains('hidden'),scenario+' must not autoplay');
    if(scenario==='year')assert(!startupApp.doc.querySelector('#detailView').classList.contains('hidden'));
    if(scenario==='error')assert(startupApp.doc.querySelector('#retryLoad'));
    startupApp.close();
  }
  console.log('PASS: no first-paint album flash, delayed settings/photos/images, smooth handoff, OFF, reduced motion, deep links and errors');

  // Random mode includes the whole public site, not only covers or the first API page.
  let randomState=fixture(true);randomState.site.theme.intro_photo_mode='random';randomState.random=()=>0.999999;
  randomState.albums.push({id:'private',site_id:'site',is_published:false},{id:'foreign',site_id:'other-site',is_published:true});
  randomState.photos.push({id:'z-private',album_id:'private',image_path:'private.webp'},
    {id:'z-foreign',album_id:'foreign',image_path:'foreign.webp'},
    {...randomState.photos[1001],id:'z-duplicate'});
  let randomApp=await mount('index',randomState);
  await until(()=>!randomApp.doc.querySelector('#intro').classList.contains('hidden'),'random intro');
  const displayed=app=>[...app.doc.querySelectorAll('.introCard img')].map(img=>img.src);
  const firstDraw=displayed(randomApp);
  assert.equal(firstDraw.length,3);assert.equal(new Set(firstDraw).size,3);
  assert(firstDraw[0].endsWith('/thumbs/1001.webp'),'photos beyond row 1000 must be eligible');
  assert(!firstDraw.some(src=>/private|foreign/.test(src)),'exclude private albums and other sites');
  assert(randomState.log.some(q=>q.table==='photo_album_photos'&&q.range?.[0]===1000));
  const fetches=randomState.log.filter(q=>q.table==='photo_album_photos').length;
  randomApp.w.Math.random=()=>0;
  randomApp.w.testAPI.finishIntro();await randomApp.w.testAPI.startIntro();
  assert.notDeepEqual(displayed(randomApp),firstDraw,'replay must sample again');
  assert.equal(randomState.log.filter(q=>q.table==='photo_album_photos').length,fetches,'reuse the candidate list on replay');
  randomApp.close();

  // A small library never duplicates photos to fill the three slots.
  for(const count of [0,1,2]){
    const small=fixture(true);small.site.theme.intro_photo_mode='random';small.photos=small.photos.slice(0,count);
    randomApp=await mount('index',small);await until(()=>!randomApp.doc.querySelector('#intro').classList.contains('hidden'),'small random library');
    assert.equal(displayed(randomApp).length,count);randomApp.close();
  }
  const disabled=fixture(false);disabled.site.theme.intro_photo_mode='random';
  randomApp=await mount('index',disabled);await until(()=>randomApp.doc.querySelectorAll('.yearCard').length===2,'random OFF');
  assert.equal(disabled.log.filter(q=>q.table==='photo_album_photos').length,0);randomApp.close();

  // Leaving home while random candidates load must not start an intro over the year page.
  const pending=fixture(true);pending.site.theme.intro_photo_mode='random';let releasePool;
  pending.photoGate=()=>new Promise(resolve=>releasePool=()=>{pending.photoGate=null;resolve()});
  randomApp=await mount('index',pending);await until(()=>!!releasePool,'pending candidates');
  randomApp.w.testAPI.hideIntro();releasePool();await sleep(40);
  assert(randomApp.doc.querySelector('#intro').classList.contains('hidden'));randomApp.close();

  // A failed candidate request keeps playback usable with public album covers.
  const failed=fixture(true);failed.site.theme.intro_photo_mode='random';failed.photoGate=()=>Promise.reject(new Error('offline'));
  randomApp=await mount('index',failed);await until(()=>!randomApp.doc.querySelector('#intro').classList.contains('hidden'),'random fallback');
  assert.equal(displayed(randomApp).length,2);randomApp.close();

  // Mode changes survive save/reload and preserve the fixed selection and appearance.
  const editable=fixture(true),fixedSelection=JSON.stringify(editable.site.theme.intro_photos);
  randomApp=await mount('admin',editable);await until(()=>randomApp.doc.querySelector('#saveStatus').textContent==='保存済み','mode settings');
  assert.equal(randomApp.doc.querySelector('#introPhotoMode').value,'fixed');
  input(randomApp.w,'#introPhotoMode','random');
  assert(randomApp.doc.querySelector('#fixedIntroPhotos').classList.contains('hidden'));
  submit(randomApp.w);await until(()=>randomApp.doc.querySelector('#saveStatus').textContent.includes('保存しました'),'save random');
  assert.equal(editable.site.theme.intro_photo_mode,'random');assert.equal(editable.site.theme.background,'#8cc9ff');
  assert.equal(JSON.stringify(editable.site.theme.intro_photos),fixedSelection);randomApp.close();
  randomApp=await mount('admin',editable);await until(()=>randomApp.doc.querySelector('#saveStatus').textContent==='保存済み','reload mode');
  assert.equal(randomApp.doc.querySelector('#introPhotoMode').value,'random');
  input(randomApp.w,'#introPhotoMode','fixed');
  assert(!randomApp.doc.querySelector('#fixedIntroPhotos').classList.contains('hidden'));
  submit(randomApp.w);await until(()=>randomApp.doc.querySelector('#saveStatus').textContent.includes('保存しました'),'save fixed');
  assert.equal(editable.site.theme.intro_photo_mode,'fixed');assert.equal(JSON.stringify(editable.site.theme.intro_photos),fixedSelection);randomApp.close();
  randomApp=await mount('index',editable);await until(()=>!randomApp.doc.querySelector('#intro').classList.contains('hidden'),'fixed playback');
  assert.deepEqual(displayed(randomApp),editable.site.theme.intro_photos.map(photo=>'https://images.test/'+photo.thumb_path));randomApp.close();
  console.log('PASS: random replay, all public photos, unique draws, pagination, OFF, cancellation, fallback, fixed-mode save/reload');

  // Regression: restore the approved palette, then save text/intro without reviving legacy blue.
  const modernPalette={background:'#fbfaf7',surface:'#ffffff',text:'#2d2a26',muted:'#918a80',accent:'#ad9166',header:'#ffffff'};
  const restored=fixture(false);Object.assign(restored.site.theme,modernPalette);
  let preview=await mount('index',restored);
  await until(()=>preview.doc.querySelectorAll('.yearCard').length===2,'restored palette');
  assert.equal(preview.doc.documentElement.style.getPropertyValue('--page-background'),'linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%)');
  assert.equal(preview.doc.documentElement.style.getPropertyValue('--hero-background'),'transparent');
  assert.equal(preview.w.getComputedStyle(preview.doc.querySelector('.hero')).borderRadius,'0');
  preview.close();preview=await mount('admin',restored);
  await until(()=>preview.doc.querySelector('#saveStatus').textContent==='保存済み','restored settings');
  assert.equal(preview.doc.querySelector('#cBg').value,'#fbfaf7');
  input(preview.w,'#siteHeaderText','ヘッダー編集を維持');input(preview.w,'#introEnabled',true);submit(preview.w);
  await until(()=>preview.doc.querySelector('#saveStatus').textContent.includes('保存しました'),'save restored palette');
  assert.equal(restored.site.theme.background,'#fbfaf7');assert.equal(restored.site.header_text,'ヘッダー編集を維持');
  assert.equal(restored.site.theme.intro_photos.length,3);
  // A future deliberate custom color remains editable.
  input(preview.w,'#cBg','#112233');submit(preview.w);
  await until(()=>preview.doc.querySelector('#saveStatus').textContent.includes('保存しました'),'custom color');
  assert.equal(restored.site.theme.background,'#112233');preview.close();
  console.log('PASS: approved ivory gradient, unboxed title, settings save preserves palette, custom color editing');

  let state=fixture(false),release;state.delaySite=new Promise(resolve=>release=resolve);
  let app=await mount('index',state);
  assert(app.doc.querySelector('#intro').classList.contains('hidden'),'intro must be hidden before settings resolve');
  release();await until(()=>app.doc.querySelectorAll('.yearCard').length===2,'public data');
  assert(app.doc.querySelector('#intro').classList.contains('hidden'));
  assert(app.doc.querySelector('#replay').classList.contains('hidden'));
  assert.equal(app.doc.querySelector('#displayName').textContent,'川上 公一朗');
  assert.equal(app.doc.querySelector('#pageDescription').textContent,'一行目\n二行目');
  // A late response for 2026 must not append its photographs to 2025.
  let releasePhotos;const gate=new Promise(resolve=>releasePhotos=resolve);
  state.photoGate=rows=>rows[0]?.album_id==='a2026'?gate:Promise.resolve();
  const oldRequest=app.w.testAPI.openYear('2026');await sleep(5);
  await app.w.testAPI.openYear('2025');releasePhotos();await oldRequest;
  assert.equal(app.w.testAPI.getPhotos().length,1);assert.equal(app.w.testAPI.getPhotos()[0].album_id,'a2025');
  const historyLength=app.w.history.length;app.w.history.replaceState({},'','/index.html');app.w.dispatchEvent(new app.w.PopStateEvent('popstate'));await sleep(5);
  assert.equal(app.w.history.length,historyLength,'popstate cannot push new history entries');
  app.close();console.log('PASS: initial OFF, saved title/description, year request race, back history');

  state=fixture(true);app=await mount('index',state);
  await until(()=>!app.doc.querySelector('#intro').classList.contains('hidden'),'intro ON');
  assert.equal(app.doc.querySelector('.introName .main').textContent,state.site.page_title);
  assert.equal(app.doc.querySelectorAll('.introCard img').length,3);
  app.w.testAPI.finishIntro();await app.w.testAPI.startIntro();await sleep(950);
  assert(!app.doc.querySelector('#intro').classList.contains('hidden'),'old skip timeout cannot hide replay');app.close();
  console.log('PASS: ON, selected photographs, skip and immediate replay');

  state=fixture(true);app=await mount('admin',state);
  await until(()=>app.doc.querySelector('#saveStatus').textContent==='保存済み'&&app.doc.querySelector('#qCount').textContent.startsWith('1002'),'admin ready');
  assert.equal(state.log.filter(x=>x.table==='photo_album_sites'&&x.operation==='select').length,1);
  input(app.w,'#siteTitle','編集後のタイトル');input(app.w,'#siteHeaderText','変更したヘッダー');input(app.w,'#siteIntro','新しい説明\n改行を保持');input(app.w,'#introEnabled',false);
  state.authCallbacks.forEach(fn=>fn('SIGNED_IN',state.session));state.authCallbacks.forEach(fn=>fn('TOKEN_REFRESHED',state.session));await sleep(20);
  assert.equal(app.doc.querySelector('#siteTitle').value,'編集後のタイトル','auth focus event must not reset edits');
  assert.equal(app.doc.querySelector('#introEnabled').checked,false);
  app.doc.querySelector('[data-move="0"][data-dir="1"]').click();
  submit(app.w);await until(()=>app.doc.querySelector('#saveStatus').textContent.includes('保存しました'),'settings saved');
  assert.equal(state.site.theme.intro_enabled,false);assert.equal(state.site.header_text,'変更したヘッダー');assert.equal(state.site.theme.custom_setting,'retain-me');assert.equal(state.site.theme.intro_photos[0].id,'p0001');
  app.close();app=await mount('admin',state);await until(()=>app.doc.querySelector('#saveStatus').textContent==='保存済み','reload');
  assert.equal(app.doc.querySelector('#introEnabled').checked,false);assert.equal(app.doc.querySelector('#siteTitle').value,'編集後のタイトル');
  console.log('PASS: >1000-photo usage, auth focus, header + OFF save/reload, photo order, theme preservation');

  state.failSave=true;input(app.w,'#siteTitle','失敗時の入力');submit(app.w);await until(()=>app.doc.querySelector('#saveStatus').textContent.includes('保存できません'),'save failure');
  assert.equal(app.doc.querySelector('#siteTitle').value,'失敗時の入力');assert.equal(state.site.page_title,'編集後のタイトル');assert.equal(app.doc.querySelector('#saveSite').disabled,false);
  state.failSave=false;state.conflict=true;submit(app.w);await until(()=>app.doc.querySelector('#saveStatus').textContent.includes('保存できません'),'conflict');
  assert.equal(state.site.page_title,'編集後のタイトル');state.conflict=false;
  // Deleting a selected photo must preserve the last SAVED intro flag.
  input(app.w,'#introEnabled',true);await app.w.testAPI.removeSavedIntroPhotos(new Set(['p0001']));
  assert.equal(state.site.theme.intro_enabled,false);
  assert(!state.site.theme.intro_photos.some(photo=>photo.id==='p0001'));app.close();
  app=await mount('index',state);await until(()=>app.doc.querySelectorAll('.yearCard').length===2,'round-trip public');
  assert.equal(app.doc.querySelector('#displayName').textContent,'編集後のタイトル');assert(app.doc.querySelector('#intro').classList.contains('hidden'));app.close();
  console.log('PASS: failure retains edits, concurrent-save protection, deletion preserves saved flag, public round trip');
  console.log('All album regression checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
