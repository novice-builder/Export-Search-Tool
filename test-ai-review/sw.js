const CACHE='chatgpt-search-ai-review-trial-shell-v4';
const SHELL=['./index.html','./manifest.webmanifest','./ai-review-import.js?v=4','./ai-review-package.js?v=1','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chatgpt-search-ai-review-trial-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
 if(req.mode==='navigate')event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});}return response;}).catch(()=>caches.match('./index.html')));
 else event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});