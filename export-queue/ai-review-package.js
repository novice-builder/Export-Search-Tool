/* AI review evidence ZIP generator: uses native browser APIs; no external services.
   Creates a ZIP with stored (uncompressed) entries to avoid duplicating large JSON buffers. */
(()=>{
'use strict';
const MAX=0xffffffff, FLAGS=0x0808; // UTF-8 file names + streaming ZIP data descriptor
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;
});
function number16(view,at,value){view.setUint16(at,value,true)}
function number32(view,at,value){view.setUint32(at,value>>>0,true)}
function check32(value,label){
 if(!Number.isSafeInteger(value)||value<0||value>MAX)throw Error(label+' is too large for a standard ZIP file. Export fewer conversations.');
 return value;
}
function dosTime(date){
 const y=Math.max(1980,Math.min(2107,date.getFullYear()));
 return {time:((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((date.getSeconds()>>>1)&31),
 date:((y-1980)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31)};
}
async function checksum(blob){
 const reader=blob.stream().getReader();let crc=0xffffffff,read=0,steps=0;
 try{
  for(;;){
   const part=await reader.read();if(part.done)break;
   const bytes=part.value;
   read+=bytes.length;
   for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
   if(++steps%64===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{reader.releaseLock()}
 if(read!==blob.size)throw Error('Evidence file changed while creating ZIP');
 return (crc^0xffffffff)>>>0;
}
async function makeZip(items){
 if(!items.length||items.length>65535)throw Error('Invalid ZIP file count');
 const parts=[],central=[],timestamp=dosTime(new Date());let offset=0,centralSize=0;
 for(const item of items){
  const name=encoder.encode(item.name);
  if(!name.length||name.length>65535)throw Error('Invalid ZIP entry name');
  const blob=item.body instanceof Blob?item.body:new Blob([item.body]);
  const length=check32(blob.size,'Evidence');
  const crc=await checksum(blob);
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
  number32(lv,0,0x04034b50);number16(lv,4,20);number16(lv,6,FLAGS);number16(lv,8,0);
  number16(lv,10,timestamp.time);number16(lv,12,timestamp.date);
  number16(lv,26,name.length);number16(lv,28,0);local.set(name,30);
  const descriptor=new Uint8Array(16),dd=new DataView(descriptor.buffer);
  number32(dd,0,0x08074b50);number32(dd,4,crc);number32(dd,8,length);number32(dd,12,length);
  const cd=new Uint8Array(46+name.length),cv=new DataView(cd.buffer);
  number32(cv,0,0x02014b50);number16(cv,4,20);number16(cv,6,20);number16(cv,8,FLAGS);
  number16(cv,10,0);number16(cv,12,timestamp.time);number16(cv,14,timestamp.date);
  number32(cv,16,crc);number32(cv,20,length);number32(cv,24,length);
  number16(cv,28,name.length);number16(cv,30,0);number16(cv,32,0);number16(cv,34,0);
  number16(cv,36,0);number32(cv,38,0);number32(cv,42,check32(offset,'ZIP offset'));
  cd.set(name,46);
  parts.push(local,blob,descriptor);central.push(cd);
  offset=check32(offset+local.length+length+descriptor.length,'ZIP offset');
  centralSize=check32(centralSize+cd.length,'ZIP directory');
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);
 number32(ev,0,0x06054b50);number16(ev,4,0);number16(ev,6,0);
 number16(ev,8,items.length);number16(ev,10,items.length);
 number32(ev,12,centralSize);number32(ev,16,offset);number16(ev,20,0);
 return new File([...parts,...central,end],'ChatGPT_Search_AI_Review_Package.zip',{type:'application/zip'});
}
window.oiZipAIReviewFiles=makeZip;
window.oiBuildAIReviewPackage=async choice=>{
 const guide=window.oiAIReviewImport?.instructions?.();
 if(!guide)throw Error('AI review instructions are unavailable');
 if(!window.oiBuildEvidenceExport)throw Error('Search evidence exporter is unavailable');
 // Always include exact original conversation and message IDs for recommendation matching.
 const evidence=window.oiBuildEvidenceExport({...choice,audience:'ai',format:'json',sources:true});
 const entries=[
  {name:'ChatGPT_Search_Evidence.json',body:evidence.file},
  {name:'AI_Review_Instructions.txt',body:new Blob([guide],{type:'text/plain;charset=utf-8'})}
 ];
 if(choice.format==='markdown'){
  const md=window.oiBuildEvidenceExport({...choice,audience:'ai',format:'markdown',sources:true});
  entries.push({name:'ChatGPT_Search_Evidence.md',body:md.file});
 }
 const result=await makeZip(entries);
 return new File([result],window.oiFileNames.file('searchAI','zip'),{type:'application/zip'});
};
})();