const CACHE='chatgpt-search-incremental-v5-shell-1';
const FILES=['./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chatgpt-search-incremental-v5-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);if(req.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
 if(req.mode==='navigate')event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});}return res;}).catch(()=>caches.match('./index.html')));
 else event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});