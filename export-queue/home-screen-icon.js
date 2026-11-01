/* Home Screen icon settings. Uploaded images stay in local research storage.
   The downloaded PNG is for Apple Shortcuts; Safari PWAs cannot reliably install
   a per-user icon from browser-local state on static GitHub Pages. */
(()=>{
 'use strict';
 const APP_URL='https://novice-builder.github.io/Export-Search-Tool/export-queue/';
 const DEFAULT_ICON='./icons/apple-touch-icon.png';
 const CUSTOM_KEY='homeScreenIconPng';
 const MAX_UPLOAD=8*1024*1024;
 const app=()=>window.oiArchive;
 const getCustom=()=>{
  const value=app()?.research?.[CUSTOM_KEY];
  return typeof value==='string' && value.startsWith('data:image/png;base64,') ? value : '';
 };
 const node=(tag,klass,text)=>{
  const el=document.createElement(tag);if(klass)el.className=klass;
  if(text!==undefined)el.textContent=text;return el;
 };
 function renderPanel(panel){
  panel.replaceChildren();
  const form=node('div','oi-home-icon-panel');
  const caption=node('p','', 'Default Home Screen name: Search Tool.');
  const info=node('p','oi-home-icon-hint',
   'A custom icon can be used for an iPhone Home Screen shortcut. Safari-installed web apps use the website icon, which cannot be changed reliably from a local upload.');
  const previewRow=node('div','oi-home-icon-preview-row');
  const image=node('img','oi-home-icon-preview');
  image.alt='Selected Home Screen icon preview';
  const details=node('div','oi-home-icon-preview-info');
  const selected=node('strong','',getCustom()?'Custom icon':'Standard icon');
  const message=node('p','oi-home-icon-hint',getCustom()?'Image saved locally on this device.':'Standard Search Tool icon.');
  image.src=getCustom()||DEFAULT_ICON;
  details.append(selected,message);previewRow.append(image,details);
  const actions=node('div','oi-home-icon-controls');
  const choose=node('button','',getCustom()?'Replace image':'Choose image');
  choose.type='button';
  const picker=node('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';
  picker.hidden=true;picker.setAttribute('aria-label','Choose custom icon image');
  choose.onclick=()=>picker.click();
  const useDefault=node('button','','Use standard');
  useDefault.type='button';useDefault.disabled=!getCustom();
  const save=node('button','','Save icon PNG');
  save.type='button';
  actions.append(choose,useDefault,save,picker);
  const status=node('p','oi-home-icon-status');status.setAttribute('role','status');
  const guide=node('div','oi-home-icon-guide');
  guide.append(node('h3','','Use your icon on iPhone'));
  guide.append(node('p','',
   '1. Tap Save icon PNG and save the image to Photos or Files. 2. Open Shortcuts, make a shortcut that opens this app URL, and choose Add to Home Screen. 3. Tap the icon in the Shortcuts Home Screen editor and choose your saved photo or file.'));
  const urlRow=node('div','oi-home-icon-url-row');
  const urlText=node('code','',APP_URL);
  const copy=node('button','','Copy link');copy.type='button';
  copy.onclick=async()=>{
   try{
    await navigator.clipboard.writeText(APP_URL);
    status.textContent='App link copied.';
   }catch{
    const fallback=node('input');fallback.value=APP_URL;fallback.readOnly=true;
    urlRow.append(fallback);fallback.focus();fallback.select();
    status.textContent='Select and copy the app link.';
   }
  };
  urlRow.append(urlText,copy);
  guide.append(urlRow);
  guide.append(node('p','oi-home-icon-hint',
   'Shortcuts normally opens the site in your browser. On iPhone, the standalone web app can have different saved data from Safari. Keep using your installed web app for data stored there. This shortcut does not replace its icon. You can rename a Safari web app when adding it to the Home Screen.'));
  const close=node('button','','Close');close.type='button';
  close.onclick=()=>panel.closest('dialog')?.close();
  form.append(caption,info,previewRow,actions,status,guide,close);
  panel.append(form);

  picker.onchange=async()=>{
   const file=picker.files?.[0];picker.value='';if(!file)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_UPLOAD){
    status.textContent='Choose a PNG, JPG or WebP image smaller than 8 MB.';return;
   }
   choose.disabled=true;status.textContent='Preparing image…';
   let objectURL='';
   try{
    objectURL=URL.createObjectURL(file);
    const uploaded=new Image();uploaded.src=objectURL;await uploaded.decode();
    const width=uploaded.naturalWidth,height=uploaded.naturalHeight;
    if(!width||!height||width>16000||height>16000)throw Error('Invalid or oversized image dimensions.');
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image editing is unavailable.');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    // Centre crop to keep app icons square; originals are never altered.
    const side=Math.min(width,height),left=(width-side)/2,top=(height-side)/2;
    ctx.drawImage(uploaded,left,top,side,side,0,0,512,512);
    const png=canvas.toDataURL('image/png');
    if(png.length>2.8*1024*1024)throw Error('Prepared icon is too large. Try a simpler image.');
    app().research[CUSTOM_KEY]=png;app().changed();
    image.src=png;selected.textContent='Custom icon';
    message.textContent='Image selected and saved locally.';
    useDefault.disabled=false;choose.textContent='Replace image';
    status.textContent='Custom icon selected. Use Save icon PNG for iPhone Shortcuts.';
   }catch(e){status.textContent=e?.message||'Could not read that image.'}
   finally{choose.disabled=false;if(objectURL)URL.revokeObjectURL(objectURL)}
  };
  useDefault.onclick=()=>{
   delete app().research[CUSTOM_KEY];app().changed();
   image.src=DEFAULT_ICON;selected.textContent='Standard icon';
   message.textContent='Standard Search Tool icon.';
   useDefault.disabled=true;choose.textContent='Choose image';
   status.textContent='Standard icon selected.';
  };
  save.onclick=async()=>{
   save.disabled=true;status.textContent='Preparing PNG…';
   try{
    let blob;
    const png=getCustom();
    if(png){
     const raw=atob(png.substring('data:image/png;base64,'.length));
     const bytes=new Uint8Array(raw.length);
     for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
     blob=new Blob([bytes],{type:'image/png'});
    }else{
     const response=await fetch(DEFAULT_ICON);
     if(!response.ok)throw Error('Could not load standard icon.');
     blob=await response.blob();
    }
    const result=await window.oiDownloadFile(new File([blob],'Search Tool Icon.png',{type:'image/png'}));
    status.textContent=result?.cancelled?'Icon share cancelled.':'Choose Save Image or Save to Files from the share options.';
   }catch(e){status.textContent='Icon could not be saved: '+(e?.message||String(e))}
   finally{save.disabled=false}
  };
 }
 window.oiHomeIcon={
  open:()=>window.oiDialog('Home Screen icon',(body)=>renderPanel(body)),
  getCustom
 };
})();
