/* ChatGPT Search Tool PWA TEST — device-only storage. Never sends archive to a server. */
(() => {
 'use strict';
 const BASE = new URL('./', location.href);
 if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
 if (!location.pathname.startsWith(BASE.pathname)) return;
 const DB_NAME='ChatGPTSearchTool-PWATest-v1';
 const DB_VERSION=1;
 const ARCHIVE_KEY='archive';
 const STATE_KEY='state';
 const app=window.oiArchive;
 if (!app) return;
 let active=false;
 let pendingArchive=false;
 let pendingState=false;
 let working=false;
 let timer=null;
 let dbPromise=null;
 let lastError=null;
 let sourceImporting=false;
 const status=document.createElement('span');
 status.id='oi-device-storage-status';
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 status.style.cssText='font-size:11px;color:var(--muted);display:block;text-align:right;padding:0 3px 5px;';
 status.textContent='Local storage: preparing…';
 const main=document.getElementById('view-main');
 const header=main?.querySelector('.header');
 header?.insertAdjacentElement('afterend',status);
 const show=(msg,bad=false)=>{status.textContent='Local storage: '+msg;status.style.color=bad?'#9c2935':'var(--muted)';};
 function db(){
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable'));
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded=()=>request.result.createObjectStore('records');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||new Error('Cannot open local storage'));
   request.onblocked=()=>reject(new Error('Local storage is blocked by another open tab'));
  }).catch(err=>{dbPromise=null;throw err});
  return dbPromise;
 }
 async function get(key){
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readonly');
   const r=tx.objectStore('records').get(key);
   r.onsuccess=()=>resolve(r.result??null);
   r.onerror=()=>reject(r.error||new Error('Read failed'));
  });
 }
 async function put(key,value){
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readwrite');
   tx.objectStore('records').put(value,key);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||new Error('Save failed'));
   tx.onabort=()=>reject(tx.error||new Error('Save aborted'));
  });
 }
 async function encode(payload){
  const json=JSON.stringify(payload);
  if(typeof CompressionStream==='undefined') return {encoding:'json',body:json};
  const body=await new Response(new Blob([json],{type:'application/json'}).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return {encoding:'gzip',body};
 }
 async function encodeLiveArchive(){
  if(typeof CompressionStream==='undefined')throw Error('On-device gzip compression unavailable');
  const encoder=new TextEncoder();
  const all=app.entries;
  const header=JSON.stringify({schema:'oi-linked-messages-v2',accent:app.accent,imports:app.imports,research:app.research,workspace:app.captureWorkspace()});
  const prefix=header.slice(0,-1)+',"entries":[';
  let index=-1;
  const stream=new ReadableStream({async pull(controller){
   if(index===-1){index=0;controller.enqueue(encoder.encode(prefix));return}
   if(index<all.length){
    const entry=all[index];
    const serialized=entry.source?(({messages,_text,...rest})=>rest)(entry):(({_text,...rest})=>rest)(entry);
    controller.enqueue(encoder.encode((index?',':'')+JSON.stringify(serialized)));
    index++;
    if(index%10===0)await new Promise(resolve=>setTimeout(resolve,0));
    return;
   }
   controller.enqueue(encoder.encode(']}'));controller.close();
  }});
  const body=await new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob();
  return {encoding:'gzip',body};
 }
 async function decode(stored){
  if(!stored) return null;
  let json;
  if(stored.encoding==='gzip'){
   if(typeof DecompressionStream==='undefined')throw Error('Cannot decompress saved archive');
   json=await new Response(stored.body.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }else if(stored.encoding==='json') json=stored.body;
  else throw Error('Unsupported local storage encoding');
  const payload=JSON.parse(json);
  if(!payload||!Array.isArray(payload.entries))throw Error('Corrupted locally stored archive');
  return payload;
 }
 // Archive is compressed only when its imported conversation set changes.
 // Bookmarks, folders, lists and saved searches are stored separately.
 async function flush(){
  if (!active || working) return;
  working=true;
  if(timer){clearTimeout(timer);timer=null}
  try {
   while(pendingArchive || pendingState){
    const writingArchive=pendingArchive;
    const writingState=pendingState;
    pendingArchive=false;pendingState=false;
    show('saving on this device…');
    if(writingArchive){
     const encoded=await encodeLiveArchive();
     const now=Date.now();
     const latest={research:structuredClone(app.research),workspace:app.captureWorkspace(),savedAt:now};
     await putBoth({...encoded,savedAt:now},latest);
    }else if(writingState){
     const latest={research:structuredClone(app.research),workspace:app.captureWorkspace(),savedAt:Date.now()};
     await put(STATE_KEY,latest);
    }
    lastError=null;
   }
   show('saved on this device');
  } catch(error){
   lastError=error;
   show('SAVE FAILED — export a backup ('+(error?.name||error?.message||'error')+')',true);
   console.error('Local device save failed:',error);
  } finally {working=false;}
 }
 function schedule(archive){
  if(!active||sourceImporting)return;
  if(archive)pendingArchive=true;
  pendingState=true;
  if(lastError)lastError=null;
  show('waiting to save…');
  if(timer)clearTimeout(timer);
  timer=setTimeout(flush,archive?200:650);
 }
 window.addEventListener('oi-research-change',()=>schedule(false));
 window.addEventListener('oi-archive-change',()=>{if(sourceImporting)return;if(active)schedule(true);else if(app.ready)void restore()});
 // Restore happens exactly once. An empty hosted page never overwrites stored data.
 let started=false;
 async function restore(){
  if(started)return;
  started=true;
  try {
   show('checking this device…');
   const [savedArchive,savedState]=await Promise.all([get(ARCHIVE_KEY),get(STATE_KEY)]);
   if(savedArchive || savedState){
    if(savedArchive?.encoding==='source-zip'||savedArchive?.encoding==='source-json'){
     show('reloading conversations from locally saved '+(savedArchive.encoding==='source-zip'?'ZIP':'JSON')+'…');
     app.loadLocal({schema:'oi-linked-messages-v2',entries:[],imports:[],accent:savedArchive.accent||'blue',research:savedState?.research||{},workspace:savedState?.workspace});
     const source=new File([savedArchive.body],savedArchive.filename||'saved-export.zip',{type:savedArchive.body.type||'application/octet-stream'});
     const ok=await app.restoreFromSource(savedArchive.encoding,source);
     if(!ok||app.entries.length!==savedArchive.count)throw Error('Could not restore all '+savedArchive.count+' saved conversations');
     show('restored '+app.entries.length.toLocaleString()+' conversations from saved '+(savedArchive.encoding==='source-zip'?'ZIP':'JSON'));
    }else{
     show('restoring saved conversations…');
     const archive=await decode(savedArchive);
     const payload=archive||{schema:'oi-linked-messages-v2',entries:[],imports:[],accent:'blue',research:{}};
     if(savedState){payload.research=savedState.research||{};payload.workspace=savedState.workspace||payload.workspace;}
     app.loadLocal(payload);
     show('restored '+app.entries.length.toLocaleString()+' conversations');
    }
   }else show('ready · no saved archive');
   active=true;
  }catch(error){
   active=false;
   show('RESTORE FAILED — do not import until reviewed ('+(error?.name||'error')+')',true);
   console.error('Local restore failed; no stored data overwritten:',error);
  }
 }
 // Atomic migration: replace both archive and research records in ONE IndexedDB transaction.
 async function putBoth(archive,state){
  const database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readwrite');
   const store=tx.objectStore('records');
   store.put(archive,ARCHIVE_KEY);
   store.put(state,STATE_KEY);
   tx.oncomplete=()=>resolve();
   tx.onabort=()=>reject(tx.error||new Error('Restore save aborted'));
   tx.onerror=()=>reject(tx.error||new Error('Restore save failed'));
  });
 }
 let importing=false;
 async function importPayload(payload,originalGzip=null){
  if(!active || importing)throw Error('Device storage is not ready');
  importing=true;
  while(working)await new Promise(resolve=>setTimeout(resolve,60));
  if(timer){clearTimeout(timer);timer=null;}
  pendingArchive=false;pendingState=false;
  active=false;
  let changed=false;
  try {
   show('preparing saved HTML archive…');
   const encoded=originalGzip?{encoding:'gzip',body:originalGzip}:await encode(payload);
   changed=true;
   app.loadLocal(payload);
   const now=Date.now();
   const state={research:structuredClone(app.research),workspace:app.captureWorkspace(),savedAt:now};
   show('saving recovered data on this device…');
   await putBoth({...encoded,savedAt:now},state);
   lastError=null;
   show('restored and saved '+app.entries.length.toLocaleString()+' conversations');
  } catch(error) {
   if(changed){
    try{
     const [oldArchive,oldState]=await Promise.all([get(ARCHIVE_KEY),get(STATE_KEY)]);
     const oldPayload=await decode(oldArchive)||{schema:'oi-linked-messages-v2',entries:[],imports:[],accent:'blue',research:{}};
     if(oldState){oldPayload.research=oldState.research||{};oldPayload.workspace=oldState.workspace||oldPayload.workspace;}
     app.loadLocal(oldPayload);
    }catch(revertError){console.error('Could not reload previous in-memory archive:',revertError);}
   }
   show('IMPORT FAILED — original device data retained ('+(error?.name||'error')+')',true);
   throw error;
  }finally{
   active=true;
   importing=false;
  }
 }
 function beginSourceImport(){
  sourceImporting=true;
  if(timer){clearTimeout(timer);timer=null;}
  pendingArchive=false;pendingState=false;
 }
 async function saveSourceImport(kind,file,count){
  if(!active)return;
  if(!['source-zip','source-json'].includes(kind)||!file||!Number.isInteger(count))throw Error('Invalid imported file');
  while(working)await new Promise(resolve=>setTimeout(resolve,50));
  show('saving original '+(kind==='source-zip'?'ZIP':'JSON')+' file on this device…');
  const now=Date.now();
  const record={encoding:kind,body:file,filename:file.name,accent:app.accent,count,savedAt:now};
  const state={research:structuredClone(app.research),workspace:app.captureWorkspace(),savedAt:now};
  try{
   await putBoth(record,state);
   lastError=null;
   show('saved '+count.toLocaleString()+' conversations (original export retained locally)');
  }catch(error){
   lastError=error;
   show('SAVE FAILED — imported conversations may disappear on restart ('+(error?.name||'error')+')',true);
   console.error('Saving original ZIP/JSON failed:',error);
  }
 }
 function endSourceImport(){sourceImporting=false;}
 if(app.ready)void restore();
 // Basic service worker: only caches the public application files, never imported content.
 if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
   navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('Offline cache unavailable:',e));
  },{once:true});
 }
 window.oiPwaTest={get status(){return status.textContent},flush:()=>flush(),get ready(){return active},importPayload,beginSourceImport,saveSourceImport,endSourceImport};
})();
