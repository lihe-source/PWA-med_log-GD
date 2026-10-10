const VERSION='1.0.0';
const PREFIX='medlog-gd-cache-';
const CACHE=PREFIX+VERSION;
const BASE=new URL('./',self.location.href);
const REQUIRED=['index.html','styles.css','app.js','model.js','storage.js','cloud.js','update.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','favicon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const metadataResponse=await fetch(new URL('version.json?t='+Date.now(),BASE),{cache:'no-store'});
    if(!metadataResponse.ok)throw new Error('Version metadata unavailable');
    const metadata=await metadataResponse.json();
    if(metadata.version!==VERSION||metadata.appId!=='medlog-gd')throw new Error('Deployment version mismatch');
    const responses=await Promise.all(REQUIRED.map(async file=>{
      const response=await fetch(new URL(file,BASE),{cache:'no-store'});
      if(!response.ok)throw new Error('Asset unavailable: '+file);
      const expected=metadata.files?.[file];
      if(!expected)throw new Error('Missing checksum: '+file);
      const hash=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
      const actual=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==expected)throw new Error('Checksum mismatch: '+file);
      return [new URL(file,BASE).href,response];
    }));
    const cache=await caches.open(CACHE);
    for(const [url,response]of responses)await cache.put(url,response);
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
  if(event.data?.type==='GET_VERSION')event.ports[0]?.postMessage({version:VERSION});
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
