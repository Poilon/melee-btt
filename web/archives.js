import {formatTime} from './time.js';
import {startLoading,showSkeleton} from './loading.js';

const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
const date=iso=>iso?new Date(iso).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}):'Not recorded';
const api=(id,path)=>`/api/${path}?challenge=${encodeURIComponent(id)}`;

export function createArchivesView({signIn,toast}){
 let playerId,identityKey,loadedKey,request=0,pending=false;
 const active=()=>location.hash==='#old-challenges';
 function state(message,{login=false,retry=false}={}){
  $('old-challenges-state').hidden=false;
  $('old-challenges-message').textContent=message;
  $('old-challenges-signin').hidden=!login;
  $('old-challenges-retry').hidden=!retry;
 }
 function card(challenge){
  const article=node('article','','panel archive-card');article.dataset.seed=challenge.seed;
  const heading=node('div','','panel-heading');heading.append(node('h2',`Seed ${challenge.seed}`),node('span','FINAL','small-badge'));
  const facts=node('dl','','archive-facts');
  for(const [label,value] of [['Start date',date(challenge.startedAt)],['End date',date(challenge.endedAt)],['Your place',`#${challenge.you.rank} of ${challenge.leaderboard.length}`],['Your points',String(challenge.you.totalPoints)],['Characters',`${challenge.you.completed}/${challenge.you.totalCharacters}`],['Your THS',challenge.you.thsFrames===null?'Incomplete':formatTime(challenge.you.thsFrames)]]){
   const fact=node('div');fact.append(node('dt',label),node('dd',value));facts.append(fact);
  }
  const details=node('details','','archive-details');details.append(node('summary','Leaderboard & Gecko code'));
  const content=node('div','','archive-content');
  const tabs=node('div','','standings-tabs'),overall=node('button','Overall points','text-button'),ths=node('button','Total High Score','text-button');
  tabs.append(overall,ths);
  const wrapper=node('div','','table-wrap'),table=node('table'),thead=node('thead'),tbody=node('tbody');table.append(thead,tbody);wrapper.append(table);
  const empty=node('p','No player completed all characters.','section-note');
  function board(mode){
   const total=mode==='ths';overall.setAttribute('aria-pressed',String(!total));ths.setAttribute('aria-pressed',String(total));
   const header=node('tr');header.append(...(total?['Rank','Player','THS','THS points']:['Rank','Player','Points','Characters']).map(label=>{const th=node('th',label);th.scope='col';return th;}));thead.replaceChildren(header);
   const rows=total?challenge.leaderboard.filter(p=>p.thsFrames!==null).sort((a,b)=>a.thsRank-b.thsRank):challenge.leaderboard;
   tbody.replaceChildren(...rows.map(p=>{
    const row=node('tr');if(p.playerId===challenge.you.playerId)row.className='mine';
    row.append(...[total?p.thsRank:p.rank,p.displayName,total?formatTime(p.thsFrames):p.totalPoints,total?p.thsPoints:`${p.completed}/${p.totalCharacters}`].map(value=>node('td',String(value))));return row;
   }));empty.hidden=rows.length>0;
  }
  overall.addEventListener('click',()=>board('overall'));ths.addEventListener('click',()=>board('ths'));board('overall');
  const open=node('a','Open challenge & replays →','text-button');open.href=`/challenges.html?challenge=${challenge.id}`;
  const codeHeading=node('div','','panel-heading'),codeTitle=node('h3','Gecko code'),copy=node('button','Copy Gecko code','button secondary');copy.disabled=true;codeHeading.append(codeTitle,copy);
  const code=node('textarea','','archive-code');code.readOnly=true;code.spellcheck=false;code.setAttribute('aria-label',`Gecko code for seed ${challenge.seed}`);
  const status=node('p','Loading Gecko code…','section-note');status.setAttribute('role','status');
  const retry=node('button','Retry loading code','text-button');retry.hidden=true;
  const download=node('a','Download .txt','text-button');download.href=api(challenge.id,'challenge/code');download.download=`Custom-Melee-BTT-${challenge.seed}.txt`;
  let loading=false;
  async function loadCode(){
   if(loading||code.value)return;loading=true;retry.hidden=true;status.textContent='Loading Gecko code…';
   const done=startLoading('Loading Gecko code…',code);code.classList.add('loading-code');
   try{
    const response=await fetch(api(challenge.id,'challenge/code'));if(!response.ok)throw Error('Code unavailable');
    code.value=await response.text();copy.disabled=false;status.textContent='Select the code or copy it into Dolphin.';
   }catch{status.textContent='Could not load the Gecko code.';retry.hidden=false;}finally{loading=false;code.classList.remove('loading-code');done();}
  }
  details.addEventListener('toggle',()=>{if(details.open)loadCode();});retry.addEventListener('click',loadCode);
  copy.addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText(code.value);toast('Gecko code copied.');}
   catch{code.focus();code.select();status.textContent='Code selected. Press Ctrl+C (or ⌘C) to copy.';}
  });
  content.append(tabs,wrapper,empty,open,codeHeading,code,status,retry,download);details.append(content);article.append(heading,facts,details);return article;
 }
 async function load(){
  if(!active()||pending||loadedKey===identityKey)return;
  if(!playerId){state('Sign in to see the challenges you participated in.',{login:true});return;}
  const version=++request;pending=true;state('Loading your challenges…');
  const done=startLoading('Loading old challenges…'),clear=showSkeleton($('old-challenges-list'),4);
  try{
   const response=await fetch('/api/challenges/mine');
   if(version!==request)return;
   if(response.status===401){state('Sign in to see your old challenges.',{login:true});return;}
   if(!response.ok)throw Error('Unavailable');
   const result=await response.json();if(version!==request)return;
   $('old-challenges-list').replaceChildren(...result.challenges.map(card));
   $('old-challenges-count').textContent=`${result.challenges.length} CHALLENGE${result.challenges.length===1?'':'S'}`;
   $('old-challenges-count').hidden=false;
   if(result.challenges.length)$('old-challenges-state').hidden=true;
   else state('No finished challenges yet. Challenges with your submitted scores will appear here after the reveal.');
   loadedKey=identityKey;
  }catch{if(version===request)state('Could not load your old challenges.',{retry:true});}
  finally{clear();done();if(version===request)pending=false;}
 }
 function navigate(){
  const show=active();$('old-challenges').hidden=!show;$('current-challenge-view').hidden=show;
  const link=$('old-challenges-link');link.classList.toggle('nav-active',show);
  if(show)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  document.querySelector('nav a[href="#main"]').classList.toggle('nav-active',!show);
  if(show)load();
 }
 $('old-challenges-signin').addEventListener('click',signIn);
 $('old-challenges-retry').addEventListener('click',()=>{loadedKey=undefined;load();});
 window.addEventListener('hashchange',navigate);navigate();
 return {update(d){
  const key=JSON.stringify([d.player?.id,d.challenge.id,d.competition?.timesRevealed]);
  if(key!==identityKey){identityKey=key;playerId=d.player?.id;loadedKey=undefined;request++;pending=false;$('old-challenges-list').replaceChildren();$('old-challenges-count').hidden=true;}
  if(active())load();
 }};
}
