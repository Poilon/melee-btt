// Explicit user actions get feedback; background polling stays quiet.
const active=new Map(),controls=new WeakMap(),regions=new WeakMap();
let status;
function renderStatus(){
 if(!status){status=document.createElement('div');status.id='loading-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);}
 status.hidden=!active.size;status.textContent=[...active.values()].at(-1)||'';
 document.documentElement.classList.toggle('request-pending',active.size>0);
}
export function startLoading(label='Loading…',control){
 const token={};active.set(token,label);renderStatus();
 if(control){const count=controls.get(control)||0;controls.set(control,count+1);control.setAttribute('aria-busy','true');control.classList.add('action-pending');}
 let done=false;
 return ()=>{
  if(done)return;done=true;active.delete(token);renderStatus();
  if(control){const count=(controls.get(control)||1)-1;controls.set(control,count);if(!count){control.removeAttribute('aria-busy');control.classList.remove('action-pending');}}
 };
}
export function skeletonRows(rows=3){
 const block=document.createElement('div');block.className='loading-skeleton';block.setAttribute('aria-hidden','true');
 for(let i=0;i<rows;i++){const row=document.createElement('div');row.className='skeleton-row';for(let j=0;j<3;j++){const bar=document.createElement('span');bar.className='skeleton-bar';row.append(bar);}block.append(row);}
 return block;
}
export function showSkeleton(target,rows=3){
 const token={},block=skeletonRows(rows);let placeholder=block;regions.set(target,token);target.setAttribute('aria-busy','true');
 if(target.tagName==='TBODY'){placeholder=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=8;cell.append(block);placeholder.append(cell);}
 target.replaceChildren(placeholder);
 return ()=>{if(regions.get(target)!==token)return;regions.delete(target);target.removeAttribute('aria-busy');placeholder.remove();};
}
// Prevent repeated mouse or keyboard activation while a control is working.
document.addEventListener('click',event=>{if(event.target.closest('.action-pending')){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener('submit',event=>{if(event.submitter?.classList.contains('action-pending')){event.preventDefault();event.stopImmediatePropagation();}},true);
// Same-origin replay and Gecko downloads also show progress and errors.
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[download]');if(!link||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const url=new URL(link.href,location.href);if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return;
 event.preventDefault();const done=startLoading('Downloading…',link);
 try{
  const response=await fetch(url);if(!response.ok)throw Error('Download failed. Please try again.');
  const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=link.download||response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]||'download';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
 }catch(error){
  let notice=link.parentElement.querySelector('.download-error');if(!notice){notice=document.createElement('p');notice.className='download-error';notice.setAttribute('role','alert');link.after(notice);}notice.textContent=error.message;
 }finally{done();}
});
