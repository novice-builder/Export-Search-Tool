/* Safe migration of legacy standalone Search Tool HTML backups into the test PWA.
   Source files are read as text: their HTML and JavaScript are NEVER executed. */
(() => {
 'use strict';
 const app=window.oiArchive;
 const storage=window.oiPwaTest;
 if(!app||!storage)return;
 function scriptText(html,id){
  const tag=new RegExp('<script\\b[^>]*\\bid\\s*=\\s*(["\\\'])'+id+'\\1[^>]*>','i');
  const m=tag.exec(html);
  if(!m)return null;
  const begin=m.index+m[0].length;
  const end=html.toLowerCase().indexOf('</script',begin);
  if(end<0)throw Error('Saved HTML has an unfinished '+id+' section');
  return html.slice(begin,end).trim();
 }
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 async function inflateBase64(b64){
  if(typeof DecompressionStream==='undefined')throw Error('This browser cannot decompress the saved gzip archive');
  b64=b64.replace(/\s+/g,'');
  if(b64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64))throw Error('The saved HTML archive contains invalid Base64 data');
  const pieces=[];
  const BLOCK=4*16384;
  for(let offset=0;offset<b64.length;offset+=BLOCK){
   const binary=atob(b64.slice(offset,offset+BLOCK));
   const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   pieces.push(bytes);
   if(offset%(BLOCK*32)===0)await pause();
  }
  const zipped=new Blob(pieces,{type:'application/gzip'});
  return {text:await new Response(zipped.stream().pipeThrough(new DecompressionStream('gzip'))).text(),gzip:zipped};
 }
 async function loadSavedFile(file){
  if(!/\.html?$/i.test(file.name))throw Error('Select the saved Search Tool HTML file');
  const text=await file.text();
  const archived=scriptText(text,'compressed-archive');
  const portable=scriptText(text,'portable-data');
  if(!archived && !portable)throw Error('No saved Search Tool archive was found in this HTML file');
  const recovered=archived?await inflateBase64(archived):{text:portable,gzip:null};
  const payload=JSON.parse(recovered.text);
  if(!payload || !Array.isArray(payload.entries))throw Error('This file has no saved conversation entries');
  if(!payload.schema){
   if(payload.entries.every(entry=>Array.isArray(entry.messages)))payload.schema='oi-linked-messages-v1';
   else throw Error('Unknown saved-file format: archive schema is missing');
  }
  if(!['oi-linked-messages-v1','oi-linked-messages-v2'].includes(payload.schema))throw Error('Unsupported saved-file schema: '+String(payload.schema));
  if(payload.research && (typeof payload.research!=='object'||Array.isArray(payload.research)))throw Error('Invalid research data in the backup');
  return {payload,gzip:recovered.gzip};
 }
 let loading=false;
 async function importSavedHtml(file){
  if(loading)return;
  if(!storage.ready){window.oiAlert('Local storage not ready','Please wait until local storage has finished restoring, then try again.');return;}
  loading=true;
  const picker=document.getElementById('oi-main-import');
  const priorLabel=picker.textContent;
  picker.disabled=true;
  picker.textContent='Reading…';
  try {
   const {payload,gzip}=await loadSavedFile(file);
   const conversations=payload.entries.length;
   const bookmarks=Array.isArray(payload.research?.bookmarks)?payload.research.bookmarks.length:0;
   const lists=Array.isArray(payload.research?.lists)?payload.research.lists.length:0;
   const folders=Array.isArray(payload.research?.folders)?payload.research.folders.length:0;
   const description='Found '+conversations.toLocaleString()+' conversations, '+bookmarks.toLocaleString()+' bookmarks, '+lists.toLocaleString()+' lists and '+folders.toLocaleString()+' folders in “'+file.name+'”. Restoring will replace the conversations AND research data currently stored in this test app, not merge them. Your original HTML file will not be changed. Continue?';
   window.oiConfirm('Restore saved Search Tool file?',description,'Restore and save',()=>{
    void (async()=>{
     try {
      await storage.importPayload(payload,gzip);
      app.report('Saved HTML restored: '+conversations.toLocaleString()+' conversations and accompanying research data are now saved on this device.',{kind:'success'});
     }catch(error){
      app.report('SAVED HTML RESTORE FAILED: '+(error?.message||String(error))+'. Previous saved device data was not deliberately overwritten.',{kind:'error'});
     }
    })();
   });
  }catch(error){
   console.error('Cannot read saved Search Tool HTML:',error);
   window.oiAlert('Could not restore saved HTML',error?.message||String(error));
  }finally{
   loading=false;
   picker.disabled=false;
   picker.textContent=priorLabel;
  }
 }
 window.oiImportSavedHtml=importSavedHtml;
})();
