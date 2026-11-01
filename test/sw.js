const CACHE='chatgpt-search-tool-pwa-test-shell-v4';
const ROOT=new URL('./',self.registration.scope);
const SHELL=['./index.html','./local-persistence.js?v=4','./saved-html-import.js?v=3','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('chatgpt-search-tool-pwa-test-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT.pathname))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});}return resp;}).catch(()=>caches.match('./index.html')));
 }else{
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
 }
});
