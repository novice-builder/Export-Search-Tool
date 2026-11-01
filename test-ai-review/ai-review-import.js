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
const template={schema:SCHEMA,reviewLabel:'Example review',lists:[{label:'Funding concerns',conversationIds:['EXACT_CONVERSATION_ID'],snippets:[{conversationId:'EXACT_CONVERSATION_ID',messageId:'EXACT_MESSAGE_ID',quote:'EXACT RELEVANT WORDS FROM INSIDE THE ORIGINAL MESSAGE',reason:'Short explanation of why this passage is relevant to the review objective'}]}],bookmarks:[{conversationId:'EXACT_CONVERSATION_ID',messageId:'EXACT_MESSAGE_ID',title:'Important funding discrepancy',group:'Funding/Discrepancies',quote:'EXACT RELEVANT WORDS FROM THE SOURCE MESSAGE',reason:'Short explanation of why this bookmark matters'}]};
function choose(){if(busy){window.oiAlert('Import in progress','Wait until the current AI review import finishes.');return}picker.value='';picker.click()}
function reviewInstructions(){
 return [
 'This ZIP contains ChatGPT_Search_Evidence.json. Review its ORIGINAL messages, exact conversation IDs, and message IDs.',
 'First follow the review objective from the user conversation. If the user gave NO objective or instruction, ask what they want identified or organised BEFORE reviewing. Do not assume a topic.',
 'DEFAULT IS SELECTIVE: recommend lists only for conversations relevant to the requested objective. Bookmark significant, useful messages only. Do not categorise or bookmark everything just to fill an output. Empty lists and bookmarks arrays are allowed.',
 'ONLY if the user explicitly requests comprehensive organisation, categorise all reviewed conversations in meaningful lists. Even then, do not create arbitrary bookmarks for every message.',
 'Do not equate repeated discussion with independent corroboration, and do not invent findings. Preserve source wording and distinguish observations from interpretations in descriptions.',
 'Return ONE downloadable JSON with schema "'+SCHEMA+'" and arrays "lists" and "bookmarks" (empty arrays allowed), and optional "reviewLabel".',
 'Each list needs a short "label" and "conversationIds" array containing only EXACT source IDs. For each useful conversation, include an entry under "snippets": [{"conversationId":"EXACT_ID","messageId":"EXACT_ID","quote":"EXACT VERBATIM PASSAGE","reason":"Why this conversation is relevant to this particular list"}]. Include only relevant list-specific snippets.',
 'The quote MUST copy a meaningful passage from the MIDDLE of the actual message when that is where the useful evidence begins. NEVER default to the first words merely because they start the message. Choose enough exact original text to convey the point; do not paraphrase or add leading ellipses. A message can supply different snippets for different lists.',
 'Each bookmark needs exact "conversationId" and "messageId", a concise "title", plus "quote" and "reason". The optional "group" (slash-separated categories) is kept as a suggestion for later organisation and does not create category folders by default. Bookmarks should identify useful source messages, not duplicate every list membership.',
 'Write a short, specific "reason" for each selected list conversation and bookmark, ideally one sentence of about 12–35 words. Explain WHY this material matters to the requested review objective, not merely what the conversation title says. Ground reasons in the provided passage and distinguish AI interpretation from source evidence. Avoid generic praise and unsupported assumptions.',
 'Do NOT invent or alter IDs, guess quotations or turn conversation titles into IDs. If a quote cannot be verified verbatim, omit that snippet rather than inventing one.',
 'The importer will validate IDs and verbatim quotes against original messages and preserve manually edited snippets. Reply only with the JSON file, not prose outside the file.',
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

function destinationFolders(){
 const folders=app.research.folders,byId=new Map(folders.map(f=>[f.id,f]));
 function path(f){const names=[],seen=new Set();while(f&&!seen.has(f.id)){seen.add(f.id);names.unshift(f.name);f=byId.get(f.parentId)}return names.join(' › ')}
 return folders.map(f=>({id:f.id,label:path(f)})).sort((a,b)=>a.label.localeCompare(b.label));
}
function chooseDestination(doc){
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(!settled){settled=true;resolve(value)}};
  const dialog=window.oiDialog('Import AI Review',(body,close,modal)=>{
   body.classList.add('oi-review-import');
   const form=document.createElement('form'),input=document.createElement('input');
   const nameLabel=document.createElement('label');
   nameLabel.htmlFor='oi-review-folder-name';nameLabel.textContent='Review / folder name (optional)';
   input.id='oi-review-folder-name';input.type='text';input.maxLength=95;input.value=doc.reviewLabel||'';input.placeholder='AI Review';
   form.append(nameLabel,input);
   const title=document.createElement('p');title.className='oi-review-heading';title.textContent='Destination';form.append(title);
   const choices=document.createElement('div');choices.className='oi-review-choices';
   const fresh=document.createElement('input'),existing=document.createElement('input');
   fresh.type=existing.type='radio';fresh.name=existing.name='review-target';fresh.value='new';existing.value='existing';fresh.checked=true;
   const createLabel=document.createElement('label'),existingLabel=document.createElement('label');
   createLabel.append(fresh,document.createTextNode('Create a new review folder'));
   existingLabel.append(existing,document.createTextNode('Use an existing folder'));
   choices.append(createLabel,existingLabel);form.append(choices);
   const folderLabel=document.createElement('label');folderLabel.textContent='Existing destination folder';folderLabel.htmlFor='oi-review-existing';
   const selector=document.createElement('select');selector.id='oi-review-existing';
   selector.append(new Option('Choose a folder…',''));
   for(const f of destinationFolders())selector.add(new Option(f.label,f.id));
   form.append(folderLabel,selector);
   const hint=document.createElement('p');hint.className='oi-review-hint';form.append(hint);
   const count=document.createElement('p');count.className='oi-review-hint';
   const sources=new Set(app.research.bookmarks.map(b=>JSON.stringify([String(b.conversationId),String(b.messageId)])));
   const duplicates=doc.bookmarks.filter(b=>sources.has(JSON.stringify([getId(b?.conversationId||b?.conversation_id),getId(b?.messageId||b?.message_id)]))).length;
   count.textContent=doc.lists.length+' lists and '+doc.bookmarks.length+' bookmarks suggested'+(duplicates?' · '+duplicates+' source messages already bookmarked':'');
   form.append(count);
   const summary=document.createElement('p');summary.className='oi-review-hint';
   summary.textContent='Each destination contains separate Conversation lists and Bookmarks folders. Existing bookmarks remain unchanged; copies will be marked.';
   form.append(summary);
   const controls=document.createElement('div');controls.className='oi-review-controls';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>{finish(null);close()};
   const importButton=document.createElement('button');importButton.type='submit';importButton.textContent='Import review';
   controls.append(cancel,importButton);form.append(controls);
   const sync=()=>{folderLabel.hidden=!existing.checked;selector.disabled=!existing.checked;
    nameLabel.textContent=existing.checked?'Review name (optional)':'Review / folder name (optional)';
    hint.textContent=existing.checked?'Lists and bookmarks will be placed in their own subfolders within the selected folder.':'Creates a new folder inside AI Reviewed. If you leave the name blank, AI Review (or a numbered variation) is used.';};
   fresh.onchange=existing.onchange=sync;sync();
   selector.onchange=()=>selector.setCustomValidity('');
   form.onsubmit=e=>{e.preventDefault();if(existing.checked&&!selector.value){selector.setCustomValidity('Select a folder');selector.reportValidity();return}
    finish({mode:existing.checked?'existing':'new',folderId:existing.checked?selector.value:null,name:clean(input.value,95)});close();};
   body.append(form);modal.addEventListener('close',()=>finish(null));
  });
  const original=dialog.oiClose;dialog.oiClose=()=>{finish(null);original()};
 });
}
function reviewDestination(doc,choice,count){
 const research=app.research,eq=(a,b)=>same(String(a),String(b));
 const create=(label,parent,extra={})=>{
  const record={id:key(),name:label,parentId:parent,...extra};research.folders.push(record);count.newFolders++;return record;
 };
 let review;
 if(choice.mode==='existing'){
  review=research.folders.find(f=>f.id===choice.folderId);
  if(!review)throw Error('The chosen destination folder is no longer available');
 }else{
  let root=research.folders.find(f=>f.parentId===null&&eq(f.name,'AI Reviewed'));
  if(!root)root=create('AI Reviewed',null,{aiOrganised:true});
  const base=choice.name||'AI Review';let title=base,i=2;
  while(research.folders.some(f=>f.parentId===root.id&&eq(f.name,title)))title=base+' '+i++;
  review=create(title,root.id,{aiOrganised:true,aiReviewSource:doc.reviewLabel||title});
 }
 const ensure=label=>{
  let target=research.folders.find(f=>f.parentId===review.id&&eq(f.name,label));
  if(!target)target=create(label,review.id,{aiOrganised:true,aiReviewSection:label});
  return target.id;
 };
 return {reviewId:review.id,reviewName:review.name,listsId:ensure('Conversation lists'),bookmarksId:ensure('Bookmarks')};
}
function apply(doc,choice){
 const all=new Map(app.entries.map(e=>[String(e.id),e]));
 const research=app.research;
 for(const key of ['lists','bookmarks','folders'])if(!Array.isArray(research[key]))throw Error('Research records unavailable');
 const count={newLists:0,updatedLists:0,addedMembers:0,newSnippets:0,updatedReasons:0,unverifiedSnippets:0,newBookmarks:0,newFolders:0,existingBookmarks:0,missingConversations:0,missingMessages:0,invalid:0};
 const destination=reviewDestination(doc,choice,count);
 count.reviewName=destination.reviewName;count.duplicateCopies=0;count.sameMessageCopies=0;
 const stamp=new Date().toISOString(),meta=(kind,label)=>({schema:SCHEMA,kind,reviewLabel:choice.name||doc.reviewLabel||destination.reviewName,reviewFolderId:destination.reviewId,requestedLabel:label,importedAt:stamp});
 function verifySpan(message,details){
 if(!message||typeof message.text!=='string'||!details||typeof details!=='object')return null;
 const text=message.text;
 const exact=typeof details.quote==='string'?details.quote:typeof details.snippetText==='string'?details.snippetText:typeof details.excerpt==='string'?details.excerpt:null;
 const start=details.start,end=details.end;
 if(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=text.length){
  if(exact===null||text.slice(start,end)===exact)return {start,end,text:text.slice(start,end)};
 }
 if(typeof exact!=='string'||!exact.length||exact.length>10000)return null;
 const found=text.indexOf(exact);
 // If a passage occurs more than once, an explicit valid offset is required.
 if(found<0||text.indexOf(exact,found+1)>=0)return null;
 return {start:found,end:found+exact.length,text:exact};
}

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
  let list=research.lists.find(x=>tagged(x,'list')&&x.aiReview?.reviewFolderId===destination.reviewId&&
   (same(x.name,label)||same(x.aiReview.requestedLabel,label)));
  if(!list)list=research.lists.find(x=>tagged(x,'list')&&x.folderId===destination.listsId&&same(x.aiReview.requestedLabel,label));
  if(!list){
   const used=new Set(research.lists.map(x=>String(x.name).toLowerCase()));
   list={id:key(),name:unique(label,used),members:[],slot:null,folderId:destination.listsId,aiReview:meta('list',label)};
   research.lists.push(list);count.newLists++;
  }else count.updatedLists++;
  const members=new Set(list.members||[]);
  for(const cid of found)if(!members.has(cid)){members.add(cid);count.addedMembers++}
  list.members=[...members];
  // Do not move manually reorganised lists during a repeat import.
  if(list.folderId===null||list.folderId===undefined)list.folderId=destination.listsId;
  const picks=item.snippets??item.conversationSnippets??[];
  if(!Array.isArray(picks)){count.invalid++;continue}
  if(picks.length>ids.length+1000)throw Error('Too many snippets for one list');
  list.snippets ||= {};
  for(const pick of picks){
   const cid=getId(pick?.conversationId||pick?.conversation_id),mid=getId(pick?.messageId||pick?.message_id);
   if(!cid||!mid||!found.has(cid)){count.invalid++;continue}
   if(list.snippets[cid]?.manual)continue;
   const message=all.get(cid)?.messages?.find(m=>String(m.id)===mid);
   if(!message){count.missingMessages++;continue}
   const span=verifySpan(message,pick);
   if(!span){count.unverifiedSnippets++;continue}
   const current=list.snippets[cid];
   const reason=clean(pick.reason||pick.description||pick.note||'',350);
   if(current?.messageId===mid&&current?.snippet?.text===span.text){
    if(reason&&current.note!==reason&&!current.manualReason){current.note=reason;count.updatedReasons++}
    continue;
   }
   list.snippets[cid]={messageId:mid,snippet:span,manual:false,note:reason,aiReview:meta('list-snippet',label)};
   count.newSnippets++;
  }
 }

 const keyOf=(cid,mid)=>JSON.stringify([String(cid),String(mid)]);
 const spanId=snippet=>[String(snippet?.start??''),String(snippet?.end??''),String(snippet?.text??'')].join('|');
 for(const item of doc.bookmarks){
  if(!item||typeof item!=='object'){count.invalid++;continue}
  const cid=getId(item.conversationId||item.conversation_id),mid=getId(item.messageId||item.message_id);
  if(!cid||!mid){count.invalid++;continue}
  const conv=all.get(cid);if(!conv){count.missingConversations++;continue}
  const message=conv.messages?.find(m=>String(m.id)===mid);
  if(!message){count.missingMessages++;continue}
  const excerpt=verifySpan(message,item)||window.oiBookmarkText.anchor(message.text||'');
  const matches=research.bookmarks.filter(b=>keyOf(b.conversationId,b.messageId)===keyOf(cid,mid));
  const previouslyInReview=matches.some(b=>
   (b.aiReview?.reviewFolderId===destination.reviewId||b.folderId===destination.bookmarksId)&&spanId(b.snippet)===spanId(excerpt));
  // Reimports reuse the same review's exact bookmark, preserving any manual edits.
  if(previouslyInReview){count.existingBookmarks++;continue}
  const duplicate=matches.some(b=>spanId(b.snippet)===spanId(excerpt));
  research.bookmarks.push({
   id:key(),conversationId:cid,messageId:mid,folderId:destination.bookmarksId,favourite:false,
   title:name(item.title||item.label,'Message from '+clean(conv.title,55)),
   description:clean(item.reason||item.description||item.note||'',350),
   sourceTitle:conv.title,snippet:excerpt,originalSnippet:structuredClone(excerpt),
   aiReview:{...meta('bookmark'),suggestedGroup:clean(item.group||item.folder||'',240)}
  });
  count.newBookmarks++;
  if(matches.length){if(duplicate)count.duplicateCopies++;else count.sameMessageCopies++}
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
  if(totals.newLists||totals.updatedLists||totals.newBookmarks||totals.updatedReasons){
   await storage.persistAIReview();app.changed();
  }
  const message=[
   totals.newLists+' AI lists created; '+totals.updatedLists+' existing AI lists updated',
   totals.addedMembers+' conversation assignments added; '+totals.newSnippets+' verified source passages selected; '+totals.updatedReasons+' AI explanations refreshed',
   totals.newBookmarks+' AI bookmarks added; '+totals.newFolders+' AI folders created',
   totals.existingBookmarks+' already-bookmarked messages left unchanged',
   (totals.missingConversations+totals.missingMessages+totals.invalid)+' recommendations skipped (missing/unknown IDs or invalid); '+totals.unverifiedSnippets+' passages omitted because exact text could not be verified'
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