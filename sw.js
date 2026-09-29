const CACHE_NAME='mfactu-shell-mobile10';
const STATIC_FALLBACK=[
  '/assets/styles.css?v=20260929-mobilefix1',
  '/assets/app.js?v=20260929-mobilefix1',
  '/assets/logo.svg?v=20260929-mobilefix1',
  '/manifest.webmanifest?v=20260927-7'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_FALLBACK)).catch(()=>{})
  );
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
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match('/login')));
    return;
  }

  const isLiveAsset =
    url.pathname==='/assets/app.js' ||
    url.pathname==='/assets/styles.css' ||
    url.pathname==='/manifest.webmanifest' ||
    url.pathname==='/sw.js';

  if(isLiveAsset){
    event.respondWith(
      fetch(req,{cache:'no-store'}).then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});
        }
        return response;
      }).catch(()=>caches.match(req))
    );
    return;
  }

  if(url.pathname==='/assets/logo.svg'){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
  }
});
