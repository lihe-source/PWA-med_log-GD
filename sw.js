const VERSION='1.4.3';
const PREFIX='medlog-gd-cache-';
const CACHE=PREFIX+VERSION;
const BASE=new URL('./',self.location.href);
const REQUIRED=['index.html','styles.css','app.js','model.js','storage.js','cloud.js','auth.js','reminder-core.js','product-picker.js','notifications.js','update.js','photos.js','viewport.js','ai.js','interaction.js','overview.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','favicon.svg'];
async function report(type,detail={}) {
  try{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type,appId:'medlog-gd',version:VERSION,...detail});}catch{}
}
async function download(url,label,read) {
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:abort.signal});
    if(!response.ok)throw new Error('Asset unavailable: '+label+' (HTTP '+response.status+')');
    return await read(response);
  }catch(error){if(error.name==='AbortError')throw new Error('下載逾時：'+label);throw error;}
  finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
    const stamp=Date.now();let done=0;
    const metadata=await download(new URL('version.json?t='+stamp,BASE),'version.json',response=>response.json());
    if(metadata.version!==VERSION||metadata.appId!=='medlog-gd')throw new Error('Deployment version mismatch');
    const responses=await Promise.all(REQUIRED.map(async file=>{
      const expected=metadata.files?.[file];
      if(!expected)throw new Error('Missing checksum: '+file);
      // Give each release a distinct CDN URL; cache keys remain the ordinary app URLs.
      const url=new URL(file,BASE);url.searchParams.set('medlogRelease',VERSION);url.searchParams.set('t',stamp);
      const [response,bytes]=await download(url,file,async response=>[response,await response.clone().arrayBuffer()]);
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      const actual=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==expected)throw new Error('Checksum mismatch: '+file);
      await report('UPDATE_PROGRESS',{done:++done,total:REQUIRED.length});
      return [new URL(file,BASE).href,response];
    }));
    const cache=await caches.open(CACHE);
    for(const [url,response]of responses)await cache.put(url,response);
    await report('UPDATE_READY');
    }catch(error){await report('UPDATE_ERROR',{message:error.message});throw error;}
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE')self.skipWaiting();
  if(event.data?.type==='GET_VERSION')event.ports[0]?.postMessage({version:VERSION,appId:'medlog-gd'});
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  const path=url.pathname.slice(BASE.pathname.length);
  if(path==='version.json'||path==='sw.js')return;
  if(request.mode==='navigate') {
    event.respondWith((async()=>{
      const shell=await caches.match(new URL('index.html',BASE).href,{cacheName:CACHE});
      return shell||fetch(request);
    })());return;
  }
  if(REQUIRED.includes(path))event.respondWith((async()=>{
    return await caches.match(new URL(path,BASE).href,{cacheName:CACHE})||fetch(request);
  })());
});

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data={};try{data=event.data?.json()||{};}catch{}
    const valid=/^20\d\d-\d{2}-\d{2}$/.test(data.date||'')&&/^[a-f0-9]{64}$/.test(data.workspaceKey||'');
    const count=Number.isInteger(data.count)&&data.count>0&&data.count<=1000?data.count:null;
    const test=data.type==='test';
    await self.registration.showNotification(test?'MedLog 測試通知':'MedLog 每日記錄提醒',{
      body:test?'通知服務已連線，點此開啟當日記錄。':count?'今天還有 '+count+' 項每日品項尚未記錄，點此查看。':'請開啟 MedLog 確認今日每日品項。',
      icon:new URL('icon-192.png',BASE).href,badge:new URL('icon-192.png',BASE).href,
      tag:typeof data.tag==='string'?data.tag.slice(0,80):'medlog-reminder',renotify:false,
      data:valid?{date:data.date,workspaceKey:data.workspaceKey}:{}
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    const data=event.notification.data||{},url=new URL(BASE);
    if(data.date&&data.workspaceKey){url.searchParams.set('reminderDate',data.date);url.searchParams.set('reminderWorkspace',data.workspaceKey);}
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>{const u=new URL(client.url);return u.origin===BASE.origin&&u.pathname.startsWith(BASE.pathname);});
    if(existing){existing.postMessage({type:'OPEN_REMINDER',...data});await existing.focus();}
    else await self.clients.openWindow(url.href);
  })());
});
