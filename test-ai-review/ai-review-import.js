/* Device-only AI review recommendation importer. Does not execute imported JSON. */
(()=>{
'use strict';
const SCHEMA='chatgpt-search-ai-review-v1',app=window.oiArchive;
if(!app||!window.oiResearch)return;
const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.id='oi-ai-review-file';picker.hidden=true;document.body.append(picker);
let busy=false;
const clean=(v,max=100)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const getId=v=>typeof v==='string'&&v.length<=512?v.trim():'';
const aiLabel=v=>/^AI\s*[-–—:]\s*/i.test(v)?v:'AI - '+v;
const name=(v,fallback)=>aiLabel(clean(v,95)||fallback);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const key=()=> 'research-'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');
const template={schema:SCHEMA,reviewLabel:'Example review',lists:[{label:'Funding concerns',conversationIds:['EXACT_CONVERSATION_ID']}],bookmarks:[{conversationId:'EXACT_CONVERSATION_ID',messageId:'EXACT_MESSAGE_ID',title:'Important funding discrepancy',group:'Funding/Discrepancies',description:'Optional reasoning'}]};
function choose(){if(busy){window.oiAlert('Import in progress','Wait until the current AI review import finishes.');return}picker.value='';picker.click()}
function reviewInstructions(){
 return [
 'This package contains ChatGPT_Search_Evidence.json with original conversation and message IDs. Review that JSON and return a downloadable JSON file.',
 'The JSON must have schema "'+SCHEMA+'". Include arrays "lists" and "bookmarks" (empty arrays allowed) and an optional "reviewLabel".',
 'Each list needs a short "label" and a "conversationIds" array with EXACT IDs from the source export.',
 'Each bookmark needs "conversationId", "messageId", a concise AI-suggested "title", a "group" for its folder (use / for nested groups), and optionally "description".',
 'Use only exact source IDs. Never invent IDs or use conversation titles in place of IDs. Return no prose outside the JSON file.',
 'Example:',JSON.stringify(template,null,2)
 ].join('\n');
}
function copyInstructions(){
 const text=reviewInstructions();
 const fallback=()=>window.oiDialog('AI review JSON instructions',(body,close)=>{
  const intro=document.createElement('p');intro.textContent='Copy the instructions into the AI review conversation.';
  const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.rows=13;area.style.width='100%';
  const done=document.createElement('button');done.textContent='Close';done.type='button';done.onclick=close;body.append(intro,area,done);
  queueMicrotask(()=>{area.focus();area.select()});
 });
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>window.oiAlert('Copied','Paste the AI review JSON instructions into your review conversation.'),fallback);
 else fallback();
}
function parse(doc){
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.schema!==SCHEMA)throw Error('Not a Search Tool AI review JSON file. Use schema '+SCHEMA+'.');
 for(const field of ['lists','bookmarks','bookmarkGroups'])if(doc[field]!==undefined&&!Array.isArray(doc[field]))throw Error(field+' must be an array');
 const lists=doc.lists||[],bookmarks=[...(doc.bookmarks||[])];
 if(lists.length>500)throw Error('Maximum 500 lists per import');
 for(const g of doc.bookmarkGroups||[]){
  if(!g||typeof g!=='object'||!Array.isArray(g.bookmarks))throw Error('Invalid bookmarkGroups item');
  for(const b of g.bookmarks)bookmarks.push({...b,group:b?.group||g.label||g.name||'General'});
 }
 if(bookmarks.length>20000)throw Error('Maximum 20,000 bookmarks per import');
 if(!lists.length&&!bookmarks.length)throw Error('No list or bookmark recommendations found');
 return {lists,bookmarks,reviewLabel:clean(doc.reviewLabel||doc.label||'',95)};
}
function apply(doc){
 const all=new Map(app.entries.map(e=>[String(e.id),e]));
 const research=app.research;
 for(const key of ['lists','bookmarks','folders'])if(!Array.isArray(research[key]))throw Error('Research records unavailable');
 const count={newLists:0,updatedLists:0,addedMembers:0,newBookmarks:0,newFolders:0,existingBookmarks:0,missingConversations:0,missingMessages:0,invalid:0};
 const stamp=new Date().toISOString(),meta=(kind,label)=>({schema:SCHEMA,kind,reviewLabel:doc.reviewLabel,requestedLabel:label,importedAt:stamp});
 const tagged=(obj,kind)=>obj?.aiReview?.schema===SCHEMA&&obj.aiReview.kind===kind;
 const unique=(requested,used)=>{let v=requested,i=2;while(used.has(v.toLowerCase()))v=requested+' '+i++;return v};
 for(const item of doc.lists){
  if(!item||typeof item!=='object'){count.invalid++;continue}
  const label=name(item.label||item.name,'Review list'),ids=item.conversationIds??item.conversations??[];
  if(!Array.isArray(ids)){count.invalid++;continue}
  if(ids.length>50000)throw Error('Too many conversation IDs in a list');
  const found=new Set();
  for(const raw of ids){const cid=getId(raw);if(cid&&all.has(cid))found.add(cid);else count.missingConversations++}
  if(!found.size)continue;
  let list=research.lists.find(x=>tagged(x,'list')&&(same(x.name,label)||same(x.aiReview.requestedLabel,label)));
  if(!list){
   const used=new Set(research.lists.map(x=>String(x.name).toLowerCase()));
   list={id:key(),name:unique(label,used),members:[],slot:null,aiReview:meta('list',label)};
   research.lists.push(list);count.newLists++;
  }else count.updatedLists++;
  const members=new Set(list.members||[]);
  for(const cid of found)if(!members.has(cid)){members.add(cid);count.addedMembers++}
  list.members=[...members];
 }
 const bookmarkIds=new Set(research.bookmarks.map(b=>JSON.stringify([String(b.conversationId),String(b.messageId)])));
 function folder(label,parent,kind){
  let existing=research.folders.find(f=>f.parentId===parent&&tagged(f,kind)&&(same(f.name,label)||same(f.aiReview.requestedLabel,label)));
  if(existing)return existing;
  const used=new Set(research.folders.filter(f=>f.parentId===parent).map(f=>String(f.name).toLowerCase()));
  const made={id:key(),name:unique(label,used),parentId:parent,aiReview:meta(kind,label)};
  research.folders.push(made);count.newFolders++;return made;
 }
 let root=null;
 for(const item of doc.bookmarks){
  if(!item||typeof item!=='object'){count.invalid++;continue}
  const cid=getId(item.conversationId||item.conversation_id),mid=getId(item.messageId||item.message_id);
  if(!cid||!mid){count.invalid++;continue}
  const conv=all.get(cid);if(!conv){count.missingConversations++;continue}
  const msg=conv.messages?.find(m=>String(m.id)===mid);
  if(!msg){count.missingMessages++;continue}
  const bookmarkKey=JSON.stringify([cid,mid]);
  if(bookmarkIds.has(bookmarkKey)){count.existingBookmarks++;continue}
  if(!root)root=folder('AI Bookmarks',null,'root');
  const parts=clean(item.group||item.folder||'General',240).split('/').map(x=>clean(x,70)).filter(Boolean).slice(0,4);
  let parent=root;
  for(const part of parts.length?parts:['General'])parent=folder(name(part,'General'),parent.id,'folder');
  const excerpt=window.oiBookmarkText.anchor(msg.text||'');
  research.bookmarks.push({
   id:key(),conversationId:cid,messageId:mid,folderId:parent.id,favourite:false,
   title:name(item.title||item.label,'Message from '+clean(conv.title,55)),
   description:clean(item.description||item.note||item.reason||'',1200),
   sourceTitle:conv.title,snippet:excerpt,originalSnippet:structuredClone(excerpt),aiReview:meta('bookmark')
  });
  bookmarkIds.add(bookmarkKey);count.newBookmarks++;
 }
 return count;
}
async function load(file){
 if(busy)return;
 const storage=window.oiPwaTest;
 if(!storage?.ready){window.oiAlert('Storage not ready','Wait until local storage finishes restoring.');return}
 if(!app.entries.length){window.oiAlert('Import ChatGPT conversations first','This separate test installation has no conversations yet. Import a ChatGPT export first so recommendations can match exact conversation and message IDs.');return}
 if(file.size>25*1024*1024){window.oiAlert('File too large','AI review JSON must be smaller than 25 MB.');return}
 busy=true;const prior=structuredClone(app.research);let modified=false;
 try{
  const data=parse(JSON.parse(await file.text()));
  modified=true;
  const totals=apply(data);
  if(totals.newLists||totals.updatedLists||totals.newBookmarks){
   await storage.persistAIReview();app.changed();
  }
  const message=[
   totals.newLists+' AI lists created; '+totals.updatedLists+' existing AI lists updated',
   totals.addedMembers+' conversation assignments added',
   totals.newBookmarks+' AI bookmarks added; '+totals.newFolders+' AI folders created',
   totals.existingBookmarks+' already-bookmarked messages left unchanged',
   (totals.missingConversations+totals.missingMessages+totals.invalid)+' recommendations skipped (missing/unknown IDs or invalid)'
  ].join('\n');
  window.oiAlert('AI review imported',message);
 }catch(error){
  if(modified){
   for(const group of ['lists','bookmarks','folders'])app.research[group]=prior[group];
   app.changed();
  }
  console.error('AI review import:',error);
  window.oiAlert('AI review could not be imported',error?.message||String(error));
 }finally{busy=false}
}
picker.addEventListener('change',()=>{const file=picker.files?.[0];picker.value='';if(file)void load(file)});
window.oiAIReviewImport={choose,copyInstructions,template,instructions:reviewInstructions};
})();