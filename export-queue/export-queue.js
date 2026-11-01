/* Export Queue — temporary collection of original organisation references.
   Works offline; does not copy or change bookmarks, lists, folders or source messages. */
(()=>{
'use strict';
const app=window.oiArchive;
if(!app)return;
const research=()=>app.research;
const ref=(type,id)=>type+':'+id;
const split=k=>{const at=String(k).indexOf(':');return at<1?null:{type:k.slice(0,at),id:k.slice(at+1)}};
const obj=(type,id)=>type==='folder'?research().folders.find(x=>x.id===id):type==='list'?research().lists.find(x=>x.id===id):type==='bookmark'?research().bookmarks.find(x=>x.id===id):null;
const valid=k=>{const p=split(k);return !!(p&&obj(p.type,p.id))};
function state(){
 if(!Array.isArray(research().exportQueue))research().exportQueue=[];
 const a=research().exportQueue,seen=new Set();
 const kept=a.filter(k=>{if(typeof k!=='string'||!valid(k)||seen.has(k))return false;seen.add(k);return true});
 if(kept.length!==a.length)a.splice(0,a.length,...kept);
 return a;
}
function exclusions(){
 if(!Array.isArray(research().exportQueueExcluded))research().exportQueueExcluded=[];
 const a=research().exportQueueExcluded,direct=state(),seen=new Set();
 const kept=a.filter(k=>{if(!direct.length||typeof k!=='string'||!valid(k)||direct.includes(k)||seen.has(k))return false;seen.add(k);return true});
 if(kept.length!==a.length)a.splice(0,a.length,...kept);
 return a;
}
const changed=()=>app.changed();
function has(type,id){return state().includes(ref(type,id))}
function status(type,id){
 const item=obj(type,id);if(!item)return '';
 const chosen=new Set(state()),denied=new Set(exclusions()),key=ref(type,id);
 if(chosen.has(key))return 'direct';
 let nearest=denied.has(key)?'excluded':'',hasSelectedAncestor=false;
 let parent=type==='folder'?obj('folder',item.parentId):obj('folder',item.folderId);
 const seen=new Set();
 while(parent&&!seen.has(parent.id)){
  seen.add(parent.id);
  const k=ref('folder',parent.id);
  if(chosen.has(k)){hasSelectedAncestor=true;if(!nearest)nearest='included'}
  if(denied.has(k)&&!nearest)nearest='excluded';
  parent=obj('folder',parent.parentId);
 }
 return nearest==='excluded'&&!hasSelectedAncestor?'':nearest;
}
function add(keys){
 const current=state(),denied=exclusions(),seen=new Set(current);let count=0;
 for(const k of keys){
  if(!valid(k)||seen.has(k))continue;
  const p=split(k),i=denied.indexOf(k);
  if(i>=0){denied.splice(i,1);count++}
  if(status(p.type,p.id)==='included')continue;
  current.push(k);seen.add(k);count++;
 }
 if(count)changed();return count;
}
// Queue management removes directly selected items only.
function remove(keys){
 const set=new Set(keys),a=state(),old=a.length;
 for(let i=a.length-1;i>=0;i--)if(set.has(a[i]))a.splice(i,1);
 if(!a.length)research().exportQueueExcluded=[];
 if(a.length!==old)changed();
 return old-a.length;
}
// Library action excludes a selected child even if its parent folder remains queued.
function exclude(keys){
 let count=0;
 for(const k of keys){
  if(!valid(k))continue;
  const p=split(k),before=status(p.type,p.id);
  if(before!=='direct'&&before!=='included')continue;
  if(before==='direct'){const a=state(),i=a.indexOf(k);if(i>=0)a.splice(i,1)}
  if(status(p.type,p.id)==='included'){
   const denied=exclusions();if(!denied.includes(k))denied.push(k);
  }
  count++;
 }
 if(!state().length)research().exportQueueExcluded=[];
 if(count)changed();return count;
}
function clear(){
 if(!state().length&&!exclusions().length)return;
 research().exportQueue=[];research().exportQueueExcluded=[];changed();
}
function excludedItems(){return exclusions().filter(k=>{const p=split(k);return status(p.type,p.id)==='excluded'})}
function expanded(){
 const direct=state().map(split),folders=new Map(),lists=new Map(),bookmarks=new Map(),visited=new Set();
 function walk(id){
  if(visited.has(id))return;
  const f=obj('folder',id);if(!f)return;
  visited.add(id);
  if(status('folder',id)!=='excluded')folders.set(id,f);
  for(const child of research().folders.filter(x=>x.parentId===id))walk(child.id);
  for(const l of research().lists.filter(x=>x.folderId===id))
   if(status('list',l.id)!=='excluded')lists.set(l.id,l);
  for(const b of research().bookmarks.filter(x=>x.folderId===id))
   if(status('bookmark',b.id)!=='excluded')bookmarks.set(b.id,b);
 }
 for(const p of direct){
  if(p.type==='folder')walk(p.id);
  if(p.type==='list'){const v=obj('list',p.id);if(v)lists.set(v.id,v)}
  if(p.type==='bookmark'){const v=obj('bookmark',p.id);if(v)bookmarks.set(v.id,v)}
 }
 return {direct,folders:[...folders.values()],lists:[...lists.values()],bookmarks:[...bookmarks.values()]};
}
const name=k=>{
 const p=split(k),item=p&&obj(p.type,p.id);
 return item&&(item.name||item.title||item.sourceTitle)||k;
};
const folderPath=id=>{
 const path=[],seen=new Set();let item=obj('folder',id);
 while(item&&!seen.has(item.id)){seen.add(item.id);path.unshift({id:item.id,name:item.name});item=obj('folder',item.parentId)}
 return path;
};
const simplifySnippet=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function makeEvidence(choice){
 const data=expanded(),entries=new Map(app.entries.map(x=>[x.id,x])),wanted=new Map();
 function record(cid,mid=null,bookId=null,needsFull=false){
  const entry=entries.get(cid);
  if(!entry)return;
  if(!wanted.has(cid))wanted.set(cid,{entry,full:false,focus:new Set(),bookmarkIds:new Set()});
  const item=wanted.get(cid);
  if(needsFull)item.full=true;
  if(mid)item.focus.add(mid);
  if(bookId)item.bookmarkIds.add(bookId);
 }
 for(const l of data.lists){
  for(const cid of l.members||[])record(cid,null,null,true);
 }
 for(const b of data.bookmarks)record(b.conversationId,b.messageId,b.id,false);
 const missing={conversations:0,bookmarkMessages:0};
 for(const l of data.lists)for(const cid of l.members||[])if(!entries.has(cid))missing.conversations++;
 for(const b of data.bookmarks){
  const entry=entries.get(b.conversationId);
  if(!entry||!entry.messages.some(m=>m.id===b.messageId))missing.bookmarkMessages++;
 }
 const conversations=[];
 for(const item of wanted.values()){
  const entry=item.entry;
  const messages=window.oiOrderedMessages?window.oiOrderedMessages(entry):entry.messages;
  const focused=new Set();
  const radius=choice.scope==='full'?messages.length:Math.max(0,Number(choice.context)||0);
  if(choice.scope==='full'||item.full)messages.forEach((_,i)=>focused.add(i));
  else messages.forEach((m,i)=>{
   if(!item.focus.has(m.id))return;
   for(let j=Math.max(0,i-radius);j<=Math.min(messages.length-1,i+radius);j++)focused.add(j);
  });
  const sourceMessages=messages.filter((_,i)=>focused.has(i)).map(m=>({
   id:m.id,role:m.role,timestamp:m.time,parent:m.parent,
   order:messages.indexOf(m)+1,
   kind:item.focus.has(m.id)?'bookmarked':item.full?'list-source':'context',
   text:m.text
  }));
  conversations.push({
   id:entry.id,title:entry.title,projectId:entry.project,
   projectName:app.projectLabel?.(entry.project)||null,sourceFile:entry.sourceFile,
   bookmarkIds:[...item.bookmarkIds],messages:sourceMessages
  });
 }
 const selections=data.direct.map(p=>({
  type:p.type,id:p.id,label:name(ref(p.type,p.id)),
  folderPath:p.type==='folder'?folderPath(p.id):folderPath(obj(p.type,p.id)?.folderId),
 }));
 const payload={
  schema:'chatgpt-search-evidence-v1',exportKind:'organisation-export-queue',
  exportedAt:new Date().toISOString(),scope:choice.scope,
  sourceSelection:selections,
  sourceExclusions:excludedItems().map(k=>{
   const p=split(k),item=obj(p.type,p.id);
   return {type:p.type,id:p.id,label:name(k),folderPath:p.type==='folder'?folderPath(item?.parentId):folderPath(item?.folderId)};
  }),
  organisation:{
   folders:data.folders.map(f=>({id:f.id,name:f.name,parentId:f.parentId,path:folderPath(f.id)})),
   lists:data.lists.map(l=>({id:l.id,name:l.name,folderId:l.folderId??null,
    members:[...(l.members||[])],snippets:simplifySnippet(l.snippets),aiReview:simplifySnippet(l.aiReview)})),
   bookmarks:data.bookmarks.map(b=>({id:b.id,conversationId:b.conversationId,messageId:b.messageId,
    folderId:b.folderId??null,title:b.title,description:b.description,
    sourceTitle:b.sourceTitle,snippet:simplifySnippet(b.snippet),
    originalSnippet:simplifySnippet(b.originalSnippet),aiReview:simplifySnippet(b.aiReview)}))
  },
  unavailableSources:missing,conversations
 };
 return payload;
}
function buildInstructions(choice,payload){
 const objective=String(choice.instructions||'').trim();
 const standard=window.oiAIReviewImport?.instructions?.()||'';
 const lines=[
  'CHATGPT SEARCH TOOL — EXPORT QUEUE REVIEW',
  '',
  'Your task for this review:',
  objective||'No task provided. Ask the user what to identify, consolidate or refine before conducting a review.',
  '',
  'The attached ChatGPT_Search_Evidence.json contains original messages, exact IDs, saved bookmark passages, conversation lists, and folder relationships.',
  'The sourceSelection field identifies manually added items. sourceExclusions identifies items omitted from included folders. organisation contains only included items; never re-add sourceExclusions.',
  'Preserve original source IDs, quotations and provenance. Distinguish source evidence, prior user notes and AI interpretation. Never invent missing source material.',
  'The same source message can have multiple different saved bookmarks or highlighted passages. Preserve these as separate user-created bookmarks.',
  'When combining previous findings, retain distinct facts, chronology, qualified claims and reasoning chains. Flag uncertainty and do not silently drop approved findings.',
  'Missing source messages are identified in unavailableSources. Do not infer their text from bookmark titles or snippets.',
  'For a normal review that will be imported into the Search Tool, return its AI review JSON format. For free-form refinement, follow the user objective; a prose report cannot be imported as bookmarks/lists.',
  '',
  'STANDARD AI REVIEW JSON IMPORT INSTRUCTIONS (for importable list/bookmark recommendations):',
  standard
 ];
 return lines.join('\n');
}
async function buildPackage(choice){
 if(typeof window.oiZipAIReviewFiles!=='function')throw Error('AI ZIP generator unavailable. Reload this page.');
 const payload=makeEvidence(choice);
 if(!payload.sourceSelection.length)throw Error('Export Queue is empty.');
 if(!payload.conversations.length)throw Error('No original conversations from your selected items are available. Reimport the missing archive first.');
 const items=[
  {name:'ChatGPT_Search_Evidence.json',body:new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})},
  {name:'AI_Review_Instructions.txt',body:new Blob([buildInstructions(choice,payload)],{type:'text/plain'})}
 ];
 if(choice.markdown){
  const output=['# ChatGPT Search Tool — Export Queue', '', '# Source selections',
   ...payload.sourceSelection.map(x=>'- '+x.type+': '+x.label+' ['+x.id+']'),'',
   ...payload.conversations.flatMap(c=>['## '+c.title,'Conversation ID: '+c.id,'',
    ...c.messages.flatMap(m=>['### '+(m.role||'Message')+' · '+m.id,
     'Timestamp: '+(m.timestamp||'unknown'),'',
     m.text,''])])].join('\n');
  items.push({name:'ChatGPT_Search_Evidence.md',body:new Blob([output],{type:'text/markdown'})});
 }
 const zip=await window.oiZipAIReviewFiles(items);
 return new File([zip],window.oiFileNames.file('exportQueue','zip'),{type:'application/zip'});
}
window.oiExportQueue={items:()=>state().slice(),excludedItems,add,remove,exclude,clear,has,status,expanded,name,buildPackage,makeEvidence};
})();