const CACHE_NAME='mfactu-shell-v1';
const STATIC=['/assets/styles.css','/assets/app.js','/assets/logo.svg','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('/login')));
    return;
  }

  if(STATIC.includes(url.pathname)){
    event.respondWith(
      caches.match(req).then(hit=>hit||fetch(req).then(r=>{
        const copy=r.clone();
        caches.open(CACHE_NAME).then(c=>c.put(req,copy));
        return r;
      }))
    );
  }
});
