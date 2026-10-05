const legacy=new URLSearchParams(location.search);
if(location.hash.startsWith('#signin=')||legacy.has('character')||legacy.has('challenge')||legacy.has('connect')||['#profil','#old-challenges','#parcours','#records-legacy'].includes(location.hash))location.replace('/legacy-challenge.html'+location.search+location.hash);
const challengeId=legacy.get('event');
function scoped(path){if(!challengeId)return path;const url=new URL(path,location.origin);url.searchParams.set('event',challengeId);return url.pathname+url.search;}
const $=id=>document.getElementById(id);let catalog=[],selected,offset=0,request=0,total=0,controller;const cache=new Map();
const totalCourse={id:'total',character:'total',name:'Total time'};
const names={'total':'All characters','dr-mario':'Dr. Mario','captain-falcon':'C. Falcon','donkey-kong':'Donkey Kong','ice-climbers':'Ice Climbers','game-and-watch':'Mr. Game & Watch','young-link':'Young Link'};
const label=c=>names[c.character]||c.character.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ');
const time=f=>`${Math.floor(f/3600)}:${String(Math.floor(f/60)%60).padStart(2,'0')}.${String(Math.floor(f%60*100/60)).padStart(2,'0')}`;
async function json(url,signal){const response=await fetch(scoped(url),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load records.');return data;}
function controls(busy){$('refresh').disabled=busy;$('previous').disabled=busy||offset===0;$('next').disabled=busy||offset+100>=total;$('rows').setAttribute('aria-busy',String(busy));}
function loading(){const rows=Array.from({length:5},()=>{const tr=document.createElement('tr');tr.className='skeleton';tr.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)tr.append(document.createElement('td'));return tr;});$('rows').replaceChildren(...rows);}
async function show(course,from=0,force=false){
 const seq=++request;controller?.abort();controller=new AbortController();const signal=controller.signal,isTotal=course.id==='total';
 selected=course;offset=from;controls(true);loading();$('status').textContent='Loading records…';$('page-count').textContent='';$('character-name').textContent=label(course);$('level-name').textContent=course.name;$('detail-heading').textContent=isTotal?'Completed':'Replay';
 for(const b of $('characters').children)b.setAttribute('aria-pressed',String(b.dataset.id===course.id));
 const hash='#'+course.character;if(location.hash!==hash)history.replaceState(null,'',hash);
 try{
  const key=course.id+':'+offset,cached=cache.get(key),url=isTotal?'/api/worlds/total?offset='+offset:'/api/worlds/leaderboard?course='+encodeURIComponent(course.id)+'&offset='+offset;
  const board=!force&&cached&&Date.now()-cached.at<15000?cached.board:await json(url,signal);if(seq!==request)return;cache.set(key,{board,at:Date.now()});total=board.total;
  const displayed=isTotal&&offset===0?[...board.rows,...board.inProgress]:board.rows;
  const rows=displayed.map(r=>{const tr=document.createElement('tr');for(const text of [r.rank??'—',r.username,r.frames===null?'—':time(r.frames)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}const td=document.createElement('td');
   if(isTotal)td.textContent=`${r.completed} / ${board.requiredCharacters}`;
   else{const a=document.createElement('a');a.textContent='Replay ↓';a.href=scoped('/api/worlds/replay?'+new URLSearchParams({course:course.id,player:r.playerId,id:r.id}));a.download='';a.setAttribute('aria-label',`Download ${r.username}'s replay`);td.append(a);}tr.append(td);return tr;});$('rows').replaceChildren(...rows);
  $('status').textContent=isTotal?`Sum of personal bests · Complete all ${board.requiredCharacters} characters to rank.`:total?`${total} player${total===1?'':'s'} · Best run per player`:'No records yet.';
  $('page-count').textContent=total?`${offset+1}–${Math.min(offset+100,total)} of ${total}`:'';
 }catch(e){if(seq!==request)return;$('rows').replaceChildren();$('status').textContent=e.name==='TimeoutError'?'The server took too long. Try Refresh.':e.message;total=0;}finally{if(seq===request)controls(false);}
}
async function load(){controls(true);try{const data=await json('/api/worlds/catalog');catalog=data.courses;if(data.challenge){document.querySelector('.intro h1').textContent=data.challenge.name;document.querySelector('.intro p:not(.eyebrow)').textContent='26 custom stages · '+(data.challenge.phase==='closed'?'Ended':'Ends')+' 31 December 2026 at 23:59:59 (Paris time).';document.title=data.challenge.name+' · Custom Melee BTT Beta';}if(!catalog.length){$('status').textContent='The first level set is being prepared.';$('level-name').textContent='No published levels';controls(false);return;}
 $('characters').replaceChildren(...[totalCourse,...catalog].map(c=>{const b=document.createElement('button');b.className='character';b.dataset.id=c.id;b.setAttribute('aria-pressed','false');const img=document.createElement('img');img.src=c.id==='total'?'/target.svg':'/assets/melee/'+c.character+'-portrait.'+(c.character==='sheik'?'png':'webp');img.alt='';const span=document.createElement('span');span.textContent=c.id==='total'?'Total time':label(c);b.append(img,span);b.onclick=()=>show(c);return b;}));await show(location.hash==='#total'?totalCourse:catalog.find(c=>location.hash==='#'+c.character)||catalog[0]);
 }catch(e){$('status').textContent='Could not load levels. Try Refresh.';controls(false);}}
$('refresh').onclick=()=>selected?show(selected,offset,true):load();$('previous').onclick=()=>show(selected,Math.max(0,offset-100));$('next').onclick=()=>show(selected,offset+100);await load();
