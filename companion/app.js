import { formatTime } from '/time.js';
const $ = id => document.getElementById(id), text = (id, value) => { $(id).textContent = value; };
const names = { 'dr-mario':'Dr. Mario',mario:'Mario',luigi:'Luigi',bowser:'Bowser',peach:'Peach',yoshi:'Yoshi','donkey-kong':'Donkey Kong','captain-falcon':'Captain Falcon',ganondorf:'Ganondorf',falco:'Falco',fox:'Fox',ness:'Ness','ice-climbers':'Ice Climbers',kirby:'Kirby',samus:'Samus',zelda:'Zelda',link:'Link','young-link':'Young Link',pichu:'Pichu',pikachu:'Pikachu',jigglypuff:'Jigglypuff',mewtwo:'Mewtwo','game-and-watch':'Mr. Game & Watch',marth:'Marth',roy:'Roy' };
const make = (tag, value, css) => { const n=document.createElement(tag);n.textContent=value;if(css)n.className=css;return n; };
let data, tab='all', toastTimer, seen, savingSettings=false, launchingDolphin=false, settingsRevision=0;
function renderSettings(settings){
 if(savingSettings)return;
 $('play-settings').disabled=!settings||launchingDolphin;
 if(!settings){text('settings-note','Play settings unavailable.');return;}
 $('game-music').checked=settings.music;$('controller-rumble').checked=settings.rumble;
 text('settings-note','Saved automatically · applies the next time you launch Dolphin.');
}
for(const id of ['game-music','controller-rumble'])$(id).addEventListener('change',async()=>{
 const previous=data?.settings;
 savingSettings=true;settingsRevision++;$('play-settings').disabled=true;$('play').disabled=true;
 text('settings-note','Saving…');
 try{const result=await post('settings',{music:$('game-music').checked,rumble:$('controller-rumble').checked},'settings');if(data)data.settings=result.settings;}
 catch(error){if(data)data.settings=previous;toast('Could not save play settings. Please try again.');}
 finally{savingSettings=false;settingsRevision++;$('play').disabled=false;renderSettings(data?.settings);}
});
function renderSetup(setup){
 const needsSetup=setup&&setup.ready===false;
 document.body.classList.toggle('needs-setup',Boolean(needsSetup));$('setup-panel').hidden=!needsSetup;
 if(!needsSetup)return;
 text('setup-message',setup.message||'Choose your ISO to get started.');
 $('setup-iso').disabled=Boolean(setup.busy);$('setup-install').disabled=Boolean(setup.busy);
 $('setup-iso-step').classList.toggle('complete',Boolean(setup.isoReady));
 text('setup-iso',setup.isoReady?'Choose another ISO':'Choose Melee ISO');
 $('setup-progress').hidden=!setup.busy;$('setup-progress').value=setup.progress||0;
 $('setup-error').hidden=!setup.error;text('setup-error',setup.error||'');
}
for(const [id,action]of [['setup-iso','iso'],['setup-install','install'],['setup-folder','folder']])$(id).addEventListener('click',async()=>{
 $(id).disabled=true;
 try{await post('setup/'+action,{},'setup');await refresh();}catch(error){toast(error.message);}finally{$(id).disabled=false;}
});
function toast(message){text('toast',message);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
async function post(path,body,action='profile') { const r=await fetch(`/api/${path}`,{method:'POST',headers:{'X-TTRC-Action':action,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const v=await r.json();if(!r.ok)throw new Error(v.error||'Please try again.');return v; }
function render(d){
 data=d;renderSettings(d.settings);renderSetup(d.setup);const ident=d.identity,c=d.capture,connected=c.status==='connected';
 $('player-required').hidden=Boolean(ident);
 $('replay-folder').hidden=!c.replayEnabled;$('recorder').hidden=Boolean(c.replayEnabled);text('recorder-state',c.replayEnabled?'Replay-enabled profile ready. Launch Dolphin here for your next recorded attempt.':'Standard Dolphin does not create .slp files. Prepare the replay-enabled profile for new attempts.');
 text('seed',d.challenge.rules.seed);text('player-name',ident?.displayName||'No player loaded');text('player-code',ident?.connectCode||'Import your challenge user.json');text('avatar',ident?.displayName.slice(0,2).toUpperCase()||'?');
 text('check-player',`${ident?'✓':'○'} Player file loaded`);text('connection',connected?ident?'Dolphin connected':'Practice · no player':'Waiting for Dolphin');$('connection').classList.toggle('on',connected&&Boolean(ident));
 text('live-character',connected&&c.inGame&&names[c.character]?`${names[c.character]}${names[c.stage]?' → '+names[c.stage]:''}`:'Choose your character in Melee');
 const artCharacter=connected&&c.inGame&&Object.hasOwn(names,c.character)?c.character:'fox';
 if($('live-art').dataset.character!==artCharacter){$('live-art').src=`/assets/melee/${artCharacter}.webp`;$('live-art').dataset.character=artCharacter;}
 text('live-time',formatTime(connected&&c.inGame?c.timerFrames||0:0));text('capture-state',connected?c.inGame?'Attempt in progress':'Dolphin ready':'Waiting for Dolphin');
 text('capture-note',!ident?'Import your player file to save runs.':c.recording==='saved'?'Run saved. Its replay will be attached automatically.':'Experimental capture · only fresh, completed runs are saved.');
 text('launch-note',ident?'Automatic submissions on · valid personal bests upload with their replays.':'Practice mode: import user.json before starting a scored run.');
 $('targets').replaceChildren(...Array.from({length:d.challenge.rules.targets},(_,i)=>make('span','',i<(c.remaining??d.challenge.rules.targets)?'remaining':'')));
 text('sync',d.remote?.lastError|| (d.remote?.pending?`${d.remote.pending} submission(s) waiting to upload.`:'Automatic submissions on. No uploads waiting.'));
 const count=Object.values(d.progress||{}).filter(p=>p.best).length;$('progress-count').replaceChildren(document.createTextNode(count+' '),make('small','/ 25 cleared'));$('progress').value=count;
 for(const [character,cache]of attempts){if(cache.loading)continue;const fresh=new Map(d.history.map(r=>[r.id,r]));cache.rows=cache.rows.map(r=>fresh.get(r.id)||r);}
 renderRuns(d);
 for(const best of d.bestRuns||[]){const cache=attempts.get(best.character);if(expanded.has(best.character)&&cache&&!cache.loading&&cache.total!==best.attemptCount)loadHistory(best.character,false,true);}
 if(seen){const fresh=d.history.find(r=>!seen.has(r.id));if(fresh&&!fresh.exclusionReason)toast(`Run saved: ${names[fresh.character]} · ${formatTime(fresh.frames)}. Replay syncs automatically after leaving the results screen.`);}seen=new Set(d.history.map(r=>r.id));
}
const expanded=new Set(), attempts=new Map(), submitting=new Set();let runsKey, historyPlayer;
function matchesTab(r){return tab==='all'||(tab==='ready'?['local','upload-error'].includes(r.submissionStatus):!['local','upload-error'].includes(r.submissionStatus));}
function makeRunRow(r,group=false){
 const row=make('article','','run'),info=make(group?'button':'div','','run-info'),top=make('div','','run-top');
 top.append(make('strong',group?names[r.character]:`${names[r.character]} → ${names[r.stage]}`),make('time',formatTime(r.frames)),make('span',r.exclusionReason?'Excluded':({local:'Local only',queued:'Queued',pending:'In review',approved:'Approved',rejected:'Rejected','upload-error':'Upload failed',superseded:'Replaced'})[r.submissionStatus]||'Local only',`badge ${r.submissionStatus}`));
 info.append(top,make('small',group?`Personal best · ${r.attemptCount} attempt${r.attemptCount===1?'':'s'} · ${expanded.has(r.character)?'Hide':'Show'} history ${expanded.has(r.character)?'▴':'▾'}`:new Date(r.createdAt).toLocaleString('en-US')));
 if(group){const portrait=make('img','','run-portrait');portrait.src=`/assets/melee/${r.character}-portrait.webp`;portrait.alt='';portrait.width=58;portrait.height=72;portrait.loading='lazy';info.prepend(portrait);info.type='button';info.classList.add('run-summary');info.setAttribute('aria-expanded',String(expanded.has(r.character)));info.setAttribute('aria-label',`${names[r.character]}: ${expanded.has(r.character)?'hide':'show'} run history`);info.addEventListener('click',()=>toggleHistory(r.character));}
 if(r.exclusionReason)info.append(make('small',r.exclusionReason,'muted'));
 if(r.reviewNote)info.append(make('small',r.reviewNote));
 const replayHint=Date.now()-Date.parse(r.createdAt)<120000?'Waiting for replay · exit the results screen to finish saving.':'No replay found for this run. New runs need replay recording enabled.';
 const buttons=make('div','','run-actions'),watch=make('button','▶ Watch replay','secondary');watch.disabled=!r.hasReplay;watch.title=r.hasReplay?'Open this run’s replay in Dolphin':replayHint;watch.addEventListener('click',()=>launchReplay('runs/replay/launch',{id:r.id},watch));buttons.append(watch);
 if(!r.exclusionReason&&['local','upload-error'].includes(r.submissionStatus||'local')){
  const submit=make('button',submitting.has(r.id)?'Submitting…':r.submissionStatus==='upload-error'?'Retry upload':'Submit ↗','primary');
  submit.disabled=!r.hasReplay||submitting.has(r.id);submit.title=r.hasReplay?'Send this run and its replay for review':watch.title;
  submit.addEventListener('click',async()=>{
   if(submitting.has(r.id))return;submitting.add(r.id);renderRuns(data);
   try{await post('submissions',{id:r.id},'submit');toast('Run submitted privately with its replay.');await refresh();}
   catch(error){toast(error.message);}finally{submitting.delete(r.id);renderRuns(data);}
  });buttons.append(submit);
 }
 if(!r.hasReplay)info.append(make('small',replayHint,'muted'));
 row.append(info,buttons);return row;
}
function renderRuns(d){
 if(historyPlayer!==d.identity?.id){historyPlayer=d.identity?.id;expanded.clear();attempts.clear();runsKey=null;}
 const groups=d.bestRuns||[];const key=JSON.stringify([groups,tab,[...expanded],[...attempts],[...submitting]]);if(key===runsKey)return;runsKey=key;
 const visible=groups.filter(matchesTab);text('run-count',`${groups.length} character${groups.length===1?'':'s'} · ${Object.values(d.progress||{}).reduce((n,p)=>n+p.runs,0)} runs`);$('empty').hidden=visible.length>0;$('run-list').replaceChildren();
 for(const r of visible){const group=make('section','','run-group');group.append(makeRunRow(r,true));if(expanded.has(r.character)){const list=make('div','','attempt-history');const cache=attempts.get(r.character);list.append(make('p',`All ${names[r.character]} attempts · newest first`,'eyebrow'));if(!cache||cache.loading&&!cache.rows.length)list.append(make('p','Loading attempts…','muted'));if(cache){for(const attempt of cache.rows){const row=makeRunRow(attempt);if(attempt.id===r.id)row.classList.add('best-attempt');list.append(row);}if(cache.error)list.append(make('p',cache.error,'muted'));if(cache.rows.length<r.attemptCount&&!cache.loading){const more=make('button',cache.error?'Retry':'Load older runs','quiet');more.addEventListener('click',()=>loadHistory(r.character,true));list.append(more);}}group.append(list);} $('run-list').append(group);}
}
function toggleHistory(character){if(expanded.has(character)){expanded.delete(character);renderRuns(data);}else{expanded.add(character);renderRuns(data);loadHistory(character);}}
async function loadHistory(character,more=false,keepDepth=false){
 const old=attempts.get(character);if(old?.loading)return;
 const player=historyPlayer,total=data.bestRuns.find(r=>r.character===character)?.attemptCount;
 const state={rows:more||keepDepth?old?.rows||[]:[],loading:true,total};attempts.set(character,state);renderRuns(data);
 try{
  const rows=more?[...state.rows]:[],limit=keepDepth?Math.max(50,state.rows.length):rows.length+50;
  do{const response=await fetch(`/api/runs?character=${character}&offset=${rows.length}`);if(!response.ok)throw new Error();const result=await response.json();rows.push(...result.runs);if(result.runs.length<50)break;}while(rows.length<limit);
  if(player!==historyPlayer)return;attempts.set(character,{rows,loading:false,total});
 }catch{if(player!==historyPlayer)return;attempts.set(character,{rows:state.rows,loading:false,total,error:'Could not load attempts.'});}renderRuns(data);
}
async function refresh(){try{const revision=settingsRevision,r=await fetch('/api/dashboard');if(!r.ok)throw new Error();const next=await r.json();if(revision!==settingsRevision||savingSettings)next.settings=data?.settings;render(next);}catch{text('connection','Companion offline');}}
for(const [id,value]of [['tab-all','all'],['tab-ready','ready'],['tab-sent','sent']])$(id).addEventListener('click',()=>{tab=value;for(const b of document.querySelectorAll('.run-tabs button'))b.classList.toggle('active',b.id===id);if(data)render(data);});
for(const id of ['import-player','import-required'])$(id).addEventListener('click',()=>$('player-file').click());
$('player-file').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>4096)throw new Error('Use your challenge user.json.');await post('player/import',JSON.parse(await f.text()));seen=undefined;toast('Player loaded. Start a fresh run to save your time.');refresh();}catch(err){toast(err.message);}});
$('website').addEventListener('click',async()=>{if(!data?.identity){location.href='https://target-test-randomizer-challenge.vercel.app';return;}try{location.href=(await post('remote/browser')).url;}catch(err){toast(err.message);}});
$('play').addEventListener('click',async()=>{launchingDolphin=true;$('play').disabled=true;$('play-settings').disabled=true;try{const result=await post('launch',{},'launch');toast(result.status==='already-running'?'Dolphin is already running.':'Dolphin is starting. Choose your character in Target Test.');refresh();}catch(err){toast(err.message);}finally{launchingDolphin=false;$('play').disabled=false;renderSettings(data?.settings);}});
$('replay-folder').addEventListener('click',async()=>{try{await post('recorder/folder',{},'launch');}catch(e){toast(e.message);}});
$('recorder').addEventListener('click',async()=>{$('recorder').disabled=true;try{const result=await post('recorder/prepare',{},'launch');text('recorder-note',result.message);toast('Replay profile prepared. Close the current Dolphin, then use Launch Dolphin.');refresh();}catch(err){text('recorder-note',err.message);}finally{$('recorder').disabled=false;}});
$('export').addEventListener('click',()=>{if(!data?.history.length){toast('Finish a run first.');return;}const csv=['character,stage,frames,time,status',...data.history.map(r=>[r.character,r.stage,r.frames,formatTime(r.frames),r.submissionStatus].join(','))].join('\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download='target-test-local-runs.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
let replayLaunching=false;
async function launchReplay(path,body,button){if(replayLaunching)return;replayLaunching=true;if(button)button.disabled=true;try{await post(path,body,'launch');toast('Replay opened in Dolphin Playback.');}catch(e){toast(e.message);}finally{replayLaunching=false;if(button)button.disabled=false;}}
await refresh();setInterval(()=>{if(!document.hidden)refresh();},1500);

const publicParams=new URLSearchParams(location.search),publicRun=publicParams.get('publicRun'),publicPlayer=publicParams.get('playerId');
if(publicRun&&publicPlayer){
 $('shared-dialog').showModal();
 try{const response=await fetch(`/api/shared/run?id=${encodeURIComponent(publicRun)}&playerId=${encodeURIComponent(publicPlayer)}`),result=await response.json();if(!response.ok)throw new Error(result.error);
  text('shared-summary',`${result.run.displayName} · ${names[result.run.character]} → ${names[result.run.stage]} · ${formatTime(result.run.frames)}`);$('shared-launch').disabled=false;
 }catch(error){text('shared-error',error.message||'Public replay unavailable.');}
 $('shared-launch').addEventListener('click',()=>launchReplay('shared/launch',{id:publicRun,playerId:publicPlayer},$('shared-launch')));
}
