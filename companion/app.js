import { formatTime } from '/time.js';
import {startLoading,showSkeleton,skeletonRows} from '/loading.js';
const $ = id => document.getElementById(id), text = (id, value) => { $(id).textContent = value; };
const names = { 'dr-mario':'Dr. Mario',mario:'Mario',luigi:'Luigi',bowser:'Bowser',peach:'Peach',yoshi:'Yoshi','donkey-kong':'Donkey Kong','captain-falcon':'Captain Falcon',ganondorf:'Ganondorf',falco:'Falco',fox:'Fox',ness:'Ness','ice-climbers':'Ice Climbers',kirby:'Kirby',samus:'Samus',zelda:'Zelda',link:'Link','young-link':'Young Link',pichu:'Pichu',pikachu:'Pikachu',jigglypuff:'Jigglypuff',mewtwo:'Mewtwo','game-and-watch':'Mr. Game & Watch',marth:'Marth',roy:'Roy' };
const make = (tag, value, css) => { const n=document.createElement(tag);n.textContent=value;if(css)n.className=css;return n; };
let companionClosed=false,loadedVersion,updateLoading;
function renderUpdate(update){
 $('app-update').hidden=!update?.supported;if(!update?.supported)return;
 if(loadedVersion&&update.currentVersion!==loadedVersion){location.reload();return;}loadedVersion=update.currentVersion;
 text('app-version',`TTRC ${update.currentVersion}`);
 const messages={idle:'Automatic updates on.',checking:'Checking for updates…',current:'Up to date · automatic updates on.',downloading:`Downloading ${update.version} · ${update.progress}%`,verifying:'Verifying update…',ready:`${update.version} is ready. It will install automatically when Dolphin is closed.`,installing:'Installing update… The companion will reconnect automatically.',error:update.error||'Could not check for updates. You can keep playing.'};
 text('app-update-message',messages[update.phase]||'Automatic updates on.');
 $('app-update-progress').hidden=update.phase!=='downloading';$('app-update-progress').value=update.progress||0;
 $('check-app-update').disabled=['checking','downloading','verifying','ready','installing'].includes(update.phase);
 if(update.phase==='installing'){if(!updateLoading)updateLoading=startLoading('Installing update…');$('play').disabled=true;$('play-settings').disabled=true;$('character-settings').disabled=true;}else if(updateLoading){updateLoading();updateLoading=null;$('play').disabled=false;}
}
$('check-app-update').addEventListener('click',async()=>{try{await post('app-update/check',{},'update',$('check-app-update'));await refresh();}catch(e){toast(e.message);}});
let sharingRun,updatingChallenge=false;
let customLaunching=false;
let data, tab='all', toastTimer, seen, savingSettings=false, launchingDolphin=false, settingsRevision=0;
const peachOptions=[['random','Random'],['turnip','Turnip'],['beam-sword','Beam Sword'],['bob-omb','Bob-omb'],['mr-saturn','Mr. Saturn']];
for(let i=0;i<10;i++){
 const label=make('label',''),select=make('select','');select.id=`peach-item-${10-i}`;select.setAttribute('aria-label',`Peach item with ${10-i} targets left`);
 for(const [value,name]of peachOptions){const option=make('option',name);option.value=value;select.append(option);}
 label.append(make('span',`${10-i} left`),select);$('peach-items').append(label);
}
function renderSettings(settings){
 if(savingSettings)return;
 for(const id of ['play-settings','character-settings'])$(id).disabled=!settings||launchingDolphin;
 if(!settings){text('settings-note','Play settings unavailable.');return;}
 $('game-music').checked=settings.music;$('controller-rumble').checked=settings.rumble;
 $('remove-go').checked=Boolean(settings.removeGo);$('fixed-camera').checked=Boolean(settings.fixedCamera);
 $('ucf').checked=settings.ucf??true;$('ice-climbers').checked=Boolean(settings.iceClimbers);$('luigi-misfire').checked=Boolean(settings.luigiMisfire);
 for(let i=0;i<10;i++)$(`peach-item-${10-i}`).value=settings.peachItems?.[i]||'random';
 text('settings-note',data?.capture?.dolphinRunning?'Saved automatically · close and relaunch Dolphin to apply changes.':'Saved automatically · applies the next time you launch Dolphin.');
}
async function saveSettings(){
 const previous=data?.settings;
 savingSettings=true;settingsRevision++;$('play-settings').disabled=true;$('character-settings').disabled=true;$('play').disabled=true;
 text('settings-note','Saving…');
 try{
  const settings={music:$('game-music').checked,rumble:$('controller-rumble').checked,ucf:$('ucf').checked,removeGo:$('remove-go').checked,fixedCamera:$('fixed-camera').checked,iceClimbers:$('ice-climbers').checked,luigiMisfire:$('luigi-misfire').checked,peachItems:Array.from({length:10},(_,i)=>$(`peach-item-${10-i}`).value)};
  const result=await post('settings',settings,'settings');if(data)data.settings=result.settings;
 }catch(error){if(data)data.settings=previous;toast('Could not save play settings. Please try again.');}
 finally{savingSettings=false;settingsRevision++;$('play').disabled=false;renderSettings(data?.settings);}
}
for(const id of ['game-music','controller-rumble','ucf','remove-go','fixed-camera','ice-climbers','luigi-misfire',...Array.from({length:10},(_,i)=>`peach-item-${10-i}`)])$(id).addEventListener('change',saveSettings);
$('peach-reset').addEventListener('click',()=>{for(let i=0;i<10;i++)$(`peach-item-${10-i}`).value='random';saveSettings();});
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
function toast(message){if(companionClosed)return;text('toast',message);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
async function post(path,body,action='profile',control) {
 const controls={'launch':'play','account/start':'sign-in','account/logout':'sign-out','account/cancel':'account-cancel','remote/browser':'website','quit':'quit-companion','recorder/prepare':'recorder','recorder/folder':'replay-folder','challenge/update':'update-challenge','setup/iso':'setup-iso','setup/install':'setup-install','setup/folder':'setup-folder'};
 const labels={'launch':'Launching Dolphin…','account/start':'Connecting companion…','account/logout':'Signing out…','remote/browser':'Opening website…','quit':'Closing companion…','recorder/prepare':'Preparing Dolphin…','challenge/update':'Updating challenge…','settings':'Saving settings…','submissions':'Submitting run…','submissions/disclose':'Updating disclosure…'};
 const done=startLoading(labels[path]||(action==='launch'?'Opening replay…':'Loading…'),control||$(controls[path]));
 try{const r=await fetch(`/api/${path}`,{method:'POST',headers:{'X-TTRC-Action':action,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const v=await r.json();if(!r.ok)throw new Error(v.error||'Please try again.');return v;}finally{done();}
}
function renderCustomStages(stages){
 stages=stages?.filter(course=>course.id!=='grassland-1');
 $('custom-stages').hidden=!stages?.length;
 if(!stages?.length)return;
 const list=$('custom-stage-list');
 for(const course of stages){
  const key=`custom-${course.id}`;let card=$(key);
  if(!card){
   card=make('article','','custom-stage-card');card.id=key;
   const preview=make('a','');preview.href=course.preview+'?v=20261005';preview.target='_blank';preview.rel='noopener';preview.title='View all courses';
   const img=make('img','');img.src=(course.thumbnail||course.preview)+'?v=20261005';img.alt=course.name;img.width=360;img.loading='lazy';preview.append(img);
   const info=make('div','','custom-stage-info'),title=make('div','','custom-stage-title');
   title.append(make('h3',course.id==='character-worlds'?'TTRC stages':course.name),make('span',`${course.character} · ${course.targets} targets`,'pill'));
   const status=make('p','','muted');status.dataset.status='';status.setAttribute('role','status');
   info.append(title,make('p',course.description),make('p',course.id==='character-worlds'?'Sign in and view records from Melee’s Leaderboard menu.':'Local play · no challenge submissions.','muted'),status);
   if(course.id==='character-worlds'){const link=make('a','Preview Luigi’s manor ↗','custom-stage-preview');link.href='/assets/custom-stages/luigis-mansion.png?v=20261005';link.target='_blank';link.rel='noopener';info.append(link);}
   const button=make('button','▶ Play','secondary');button.id=course.id==='grassland-1'?'play-grassland':`play-${course.id}`;
   button.addEventListener('click',()=>launchCustomStage(course,button));card.append(preview,info,button);list.append(card);
  }
  const busy=customLaunching||course.busy,button=card.querySelector('button');
  button.disabled=busy||launchingDolphin||!course.available||data?.appUpdate?.phase==='installing';
  button.textContent=busy?'Preparing…':'▶ Play';
  card.querySelector('[data-status]').textContent=course.message||(!course.available?'Available in TTRC Dolphin.':course.prepared?(course.id==='grassland-1'?'Choose Fox in Target Test.':'Choose any character in Target Test.'):'Prepared from your Melee ISO on first launch.');
 }
 for(const card of list.children)if(!stages.some(s=>card.id===`custom-${s.id}`))card.remove();
}
async function launchCustomStage(course,button){
 if(customLaunching||launchingDolphin)return;
 customLaunching=true;renderCustomStages(data?.customStages);
 try{
  const result=await post(`custom-stages/${course.id}/launch`,{},'launch',button);
  toast(result.status==='already-running'?'Dolphin is already open.':`${course.id==='character-worlds'?'TTRC':course.name} is open. Choose ${course.id==='grassland-1'?'Fox':'your character'} in Target Test.`);
 }catch(error){toast(error.message);}
 finally{customLaunching=false;await refresh();renderCustomStages(data?.customStages);}
}
function render(d){
 if(companionClosed)return;
 data=d;renderCustomStages(d.customStages);renderAccount(d);renderSettings(d.settings);renderSetup(d.setup);const ident=d.identity,c=d.capture,connected=c.status==='connected';
 $('player-required').hidden=Boolean(ident);
 $('challenge-update').hidden=!d.challengeUpdate?.available;
 text('challenge-update-note',`Seed ${d.challengeUpdate?.seed||''} is ready. Close Dolphin to install it. Your previous runs are kept.`);
 $('update-challenge').disabled=Boolean(c.dolphinRunning)||updatingChallenge;
 $('play').hidden=false;$('recorder-note').hidden=Boolean(c.native);
 $('replay-folder').hidden=!c.replayEnabled;$('recorder').hidden=Boolean(c.replayEnabled);text('recorder-state',c.native?'Dolphin records automatically. Choose your ISO with Open in Dolphin.':c.replayEnabled?'Replay-enabled profile ready. Launch Dolphin here for your next recorded attempt.':'Standard Dolphin does not create .slp files. Prepare the replay-enabled profile for new attempts.');
 $('motion-note').hidden=!d.challenge.motion;
 text('motion-note',d.challenge.motion?'10 targets per stage · 6–10 fixed · the rest move or teleport. The seed sets the mix and timing.':'');
 text('seed',d.challenge.rules.seed);text('player-name',ident?.displayName||'Not signed in');text('player-code',ident?.slug ? `@${ident.slug}` : ident?.connectCode || 'Username and password');text('avatar',ident?.displayName.slice(0,2).toUpperCase()||'?');
 text('check-player',`${ident?'✓':'○'} Signed in`);text('connection',connected?ident?'Dolphin connected':'Practice · no player':'Waiting for Dolphin');$('connection').classList.toggle('on',connected&&Boolean(ident));
 text('launch-note',ident?'Automatic submissions on · valid personal bests upload with their replays.':'Practice mode: sign in before starting a scored run.');
 text('sync',d.remote?.lastError|| (d.remote?.pending?`${d.remote.pending} submission(s) waiting to upload.`:'Automatic submissions on. No uploads waiting.'));
 const count=Object.values(d.progress||{}).filter(p=>p.best).length;$('progress-count').replaceChildren(document.createTextNode(count+' '),make('small','/ 25 cleared'));$('progress').value=count;
 for(const [character,cache]of attempts){if(cache.loading)continue;const fresh=new Map(d.history.map(r=>[r.id,r]));cache.rows=cache.rows.map(r=>fresh.get(r.id)||r);}
 text('total-attempts',d.attempts?.total??(d.bestRuns||[]).reduce((n,r)=>n+r.attemptCount,0));text('finished-attempts',d.attempts?.finished??(d.bestRuns||[]).reduce((n,r)=>n+(r.finishedCount??r.attemptCount),0));text('active-attempts',d.attempts?.active?`${d.attempts.active} in progress`:'');
 renderUpdate(d.appUpdate);
 renderRuns(d);
 for(const best of d.bestRuns||[]){const cache=attempts.get(best.character);if(expanded.has(best.character)&&cache&&!cache.loading&&(cache.total!==best.attemptCount||cache.signature!==attemptSignature(best.character)))loadHistory(best.character,false,true);}
 if(seen){const fresh=d.history.find(r=>!seen.has(r.id));if(fresh&&!fresh.exclusionReason)toast(`Run saved: ${names[fresh.character]} · ${formatTime(fresh.frames)}. Replay syncs automatically after leaving the results screen.`);}seen=new Set(d.history.map(r=>r.id));
}
const expanded=new Set(), attempts=new Map(), submitting=new Set();let runsKey, historyPlayer;
const attemptSignature=character=>JSON.stringify(data.attempts?.byCharacter?.[character]||null);
function matchesTab(r){if(r.attemptStatus&&r.attemptStatus!=='finished')return tab==='all';if(r.exclusionReason)return tab==='all';return tab==='all'||(tab==='ready'?['local','upload-error'].includes(r.submissionStatus):!['local','upload-error'].includes(r.submissionStatus));}
function makeRunRow(r,group=false){ const unfinished=Boolean(r.attemptStatus&&r.attemptStatus!=='finished');
 const row=make('article','','run'),info=make(group?'button':'div','','run-info'),top=make('div','','run-top');
 top.append(make('strong',group?names[r.character]:`${names[r.character]} → ${names[r.stage]}`),make('time',unfinished?'—':formatTime(r.frames)),make('span',unfinished?({active:'In progress',aborted:'Aborted',interrupted:'Interrupted'})[r.attemptStatus]:r.exclusionReason?'Excluded':({local:'Local only',queued:'Queued',submitted:'Submitted',pending:'Submitted',approved:'Submitted',rejected:'Rejected','upload-error':'Upload failed',superseded:'Replaced'})[r.submissionStatus]||'Local only',`badge ${unfinished?r.attemptStatus:r.submissionStatus}`));
 info.append(top,make('small',group?`${unfinished?'No completed run':r.exclusionReason?'No valid clear':'Personal best'} · ${r.attemptCount} total attempts · ${r.finishedCount??r.attemptCount} finished · ${expanded.has(r.character)?'Hide':'Show'} history ${expanded.has(r.character)?'▴':'▾'}`:new Date(r.createdAt).toLocaleString('en-US')));
 if(group){const portrait=make('img','','run-portrait');portrait.src=`/assets/melee/${r.character}-portrait.webp`;portrait.alt='';portrait.width=32;portrait.height=36;portrait.loading='lazy';info.prepend(portrait);info.type='button';info.classList.add('run-summary');info.setAttribute('aria-expanded',String(expanded.has(r.character)));info.setAttribute('aria-label',`${names[r.character]}: ${expanded.has(r.character)?'hide':'show'} run history`);info.addEventListener('click',()=>toggleHistory(r.character));}
 if(unfinished){if(!group&&r.abortReason)info.append(make('small',r.abortReason,'muted'));row.append(info);return row;}
 if(r.exclusionReason)info.append(make('small',r.exclusionReason,'muted'));
 if(r.reviewNote&&!['pending','submitted'].includes(r.submissionStatus))info.append(make('small',r.reviewNote));
 const replayHint=Date.now()-Date.parse(r.createdAt)<120000?'Waiting for replay · exit the results screen to finish saving.':'No replay found for this run. New runs need replay recording enabled.';
 const buttons=make('div','','run-actions'),watch=make('button','▶ Watch replay','secondary');watch.disabled=!r.hasReplay;watch.title=r.hasReplay?'Open this run’s replay in Dolphin':replayHint;watch.addEventListener('click',()=>launchReplay('runs/replay/launch',{id:r.id},watch));buttons.append(watch);
 if(!r.exclusionReason&&['local','upload-error'].includes(r.submissionStatus||'local')){
  const submit=make('button',submitting.has(r.id)?'Submitting…':r.submissionStatus==='upload-error'?'Retry upload':'Submit ↗','primary');
  submit.disabled=!r.hasReplay||submitting.has(r.id);submit.title=r.hasReplay?'Submit this run and its replay':watch.title;
  submit.addEventListener('click',async()=>{
   if(submitting.has(r.id))return;submitting.add(r.id);renderRuns(data);
   try{await post('submissions',{id:r.id},'submit');toast('Run submitted privately with its replay.');await refresh();}
   catch(error){toast(error.message);}finally{submitting.delete(r.id);renderRuns(data);}
  });buttons.append(submit);
 }
 if(!r.exclusionReason&&['submitted','pending','approved','superseded'].includes(r.submissionStatus)){
  const finalPublic=data.remote?.finalRunIds?.includes(r.id);
  const kind=finalPublic?'replay':data.remote?.disclosures?.[r.id]||'private';
  const share=make('button',kind==='score'?'Score public':kind==='replay'?'Replay public':'Share…','quiet');
  share.setAttribute('aria-label',`Share ${names[r.character]} run`);
  share.addEventListener('click',()=>{sharingRun=r;for(const id of ['share-score','share-replay','share-private'])$(id).disabled=Boolean(finalPublic);text('share-summary',`${names[r.character]} · ${formatTime(r.frames)}`);text('share-status',finalPublic?'Final record: score and replay are already public.':kind==='private'?'Not disclosed.':kind==='score'?'Only the score is public.':'Score and replay are public.');$('share-dialog').showModal();});buttons.append(share);
 }
 if(!r.hasReplay)info.append(make('small',replayHint,'muted'));
 row.append(info,buttons);return row;
}
function renderRuns(d){
 if(historyPlayer!==`${d.challenge.id}:${d.identity?.id}`){historyPlayer=`${d.challenge.id}:${d.identity?.id}`;expanded.clear();attempts.clear();runsKey=null;}
 const groups=d.bestRuns||[];const key=JSON.stringify([groups,d.remote?.disclosures,d.remote?.finalRunIds,tab,[...expanded],[...attempts],[...submitting]]);if(key===runsKey)return;runsKey=key;
 const visible=groups.filter(matchesTab);text('run-count',`${groups.length} character${groups.length===1?'':'s'} · ${groups.reduce((n,r)=>n+r.attemptCount,0)} attempts`);$('empty').hidden=visible.length>0;$('run-list').replaceChildren();
 for(const r of visible){const group=make('section','','run-group');group.append(makeRunRow(r,true));if(expanded.has(r.character)){const list=make('div','','attempt-history');const cache=attempts.get(r.character);list.setAttribute('aria-busy',String(Boolean(cache?.loading)));list.append(make('p',`All ${names[r.character]} attempts · newest first`,'eyebrow'));if(!cache||cache.loading&&!cache.rows.length)list.append(skeletonRows(3));if(cache){for(const attempt of cache.rows){const row=makeRunRow(attempt);if(attempt.id===r.id&&(!attempt.attemptStatus||attempt.attemptStatus==='finished'))row.classList.add('best-attempt');list.append(row);}if(cache.error)list.append(make('p',cache.error,'muted'));if(cache.rows.length<r.attemptCount&&!cache.loading){const more=make('button',cache.error?'Retry':'Load older runs','quiet');more.addEventListener('click',()=>loadHistory(r.character,true));list.append(more);}}group.append(list);} $('run-list').append(group);}
}
function toggleHistory(character){if(expanded.has(character)){expanded.delete(character);renderRuns(data);}else{expanded.add(character);renderRuns(data);loadHistory(character);}}
async function loadHistory(character,more=false,keepDepth=false){
 const old=attempts.get(character);if(old?.loading)return;
 const player=historyPlayer,total=data.bestRuns.find(r=>r.character===character)?.attemptCount,signature=attemptSignature(character);
 const state={rows:more||keepDepth?old?.rows||[]:[],loading:true,total};attempts.set(character,state);renderRuns(data);
 const done=keepDepth?()=>{}:startLoading('Loading attempts…');
 try{
  const rows=more?[...state.rows]:[],limit=keepDepth?Math.max(50,state.rows.length):rows.length+50;
  do{const response=await fetch(`/api/runs?character=${character}&offset=${rows.length}`);if(!response.ok)throw new Error();const result=await response.json();rows.push(...result.runs);if(result.runs.length<50)break;}while(rows.length<limit);
  if(player!==historyPlayer)return;attempts.set(character,{rows,loading:false,total,signature});
 }catch{if(player!==historyPlayer)return;attempts.set(character,{rows:state.rows,loading:false,total,signature,error:'Could not load attempts.'});}finally{done();}renderRuns(data);
}
async function refresh({quiet=false}={}){
 const initial=!data,done=quiet?()=>{}:startLoading(initial?'Loading companion…':'Updating companion…'),clear=initial?showSkeleton($('run-list'),5):()=>{};
 if(initial)document.body.classList.add('initial-loading');
 try{const revision=settingsRevision,r=await fetch('/api/dashboard');if(!r.ok)throw new Error();const next=await r.json();if(revision!==settingsRevision||savingSettings)next.settings=data?.settings;render(next);}catch{if(!companionClosed)text('connection',data?.appUpdate?.phase==='installing'?'Updating TTRC…':'Companion offline');}finally{clear();done();document.body.classList.remove('initial-loading');}
}
for(const [id,value]of [['tab-all','all'],['tab-ready','ready'],['tab-sent','sent']])$(id).addEventListener('click',()=>{tab=value;for(const b of document.querySelectorAll('.run-tabs button'))b.classList.toggle('active',b.id===id);if(data)render(data);});
let startingSignIn = false;
function renderAccount(d) {
 $('sign-in').hidden = Boolean(d.identity); $('sign-out').hidden = !d.identity;
 const connection = d.auth?.connection;
 $('account-connection').hidden = !connection || ['idle', 'connected'].includes(connection.status);
 if (!connection || connection.status === 'idle') return;
 if (connection.status === 'connected') return;
 text('account-code', connection.code?.match(/.{4}/g)?.join(' ') || '');
 text('account-status', connection.error || 'Waiting for confirmation…');
 $('account-link').hidden = connection.status !== 'pending';
 if (connection.url) $('account-link').href = connection.url;
}
async function signIn() {
 if (startingSignIn) return;
 startingSignIn = true;
 const popup = window.open('about:blank', '_blank'); if (popup) popup.opener = null;
 try {
  const connection = await post('account/start');
  if (data) { data.auth.connection = connection; renderAccount(data); }
  if (popup) popup.location = connection.url;
  await refresh();
 } catch (error) { popup?.close(); toast(error.message); }
 finally { startingSignIn = false; }
}
for (const id of ['sign-in','sign-in-required']) $(id).addEventListener('click', signIn);
$('account-cancel').addEventListener('click', async () => { try { await post('account/cancel'); await refresh(); } catch (error) { toast(error.message); } });
$('sign-out').addEventListener('click', async () => { try { await post('account/logout'); seen = undefined; await refresh(); } catch (error) { toast(error.message); } });
$('website').addEventListener('click',async()=>{if(!data?.identity){location.href='https://target-test-randomizer-challenge.vercel.app';return;}try{location.href=(await post('remote/browser')).url;}catch(err){toast(err.message);}});
$('quit-companion').addEventListener('click',async()=>{if(data?.capture?.dolphinRunning&&!confirm('Quit companion? Dolphin will stay open, but new runs will not be captured until you reopen the companion.'))return;try{await post('quit',{},'quit');companionClosed=true;clearInterval(refreshTimer);clearTimeout(toastTimer);document.body.replaceChildren(make('main','Companion closed. You can close this tab.'));}catch(error){toast(error.message);}});
$('play').addEventListener('click',async()=>{launchingDolphin=true;$('play').disabled=true;$('play-settings').disabled=true;$('character-settings').disabled=true;try{const result=await post('launch',{},'launch');toast(result.status==='updating'?'TTRC is updating. Wait for the companion to reconnect.':result.status==='already-running'?'Dolphin is already running.':'Dolphin is starting. Choose your character in Target Test.');refresh();}catch(err){toast(err.message);}finally{launchingDolphin=false;$('play').disabled=false;renderSettings(data?.settings);}});
$('replay-folder').addEventListener('click',async()=>{try{await post('recorder/folder',{},'launch');}catch(e){toast(e.message);}});
$('recorder').addEventListener('click',async()=>{$('recorder').disabled=true;try{const result=await post('recorder/prepare',{},'launch');text('recorder-note',result.message);toast('Replay profile prepared. Close the current Dolphin, then use Launch Dolphin.');refresh();}catch(err){text('recorder-note',err.message);}finally{$('recorder').disabled=false;}});
$('export').addEventListener('click',()=>{if(!data?.history.length){toast('Finish a run first.');return;}const csv=['character,stage,frames,time,status',...data.history.map(r=>[r.character,r.stage,r.frames,formatTime(r.frames),r.submissionStatus].join(','))].join('\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=u;a.download='target-test-local-runs.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
let replayLaunching=false;
async function launchReplay(path,body,button){if(replayLaunching)return;replayLaunching=true;if(button)button.disabled=true;try{await post(path,body,'launch',button);toast('Replay opened in Dolphin Playback.');}catch(e){toast(e.message);}finally{replayLaunching=false;if(button)button.disabled=false;}}
await refresh();const refreshTimer=setInterval(()=>{if(!document.hidden)refresh({quiet:true});},1500);

const publicParams=new URLSearchParams(location.search),publicRun=publicParams.get('publicRun'),publicPlayer=publicParams.get('playerId'),publicChallenge=publicParams.get('challenge');
if(publicRun&&publicPlayer){
 $('shared-dialog').showModal();
 const done=startLoading('Loading replay…'),clear=showSkeleton($('shared-summary'));
 try{const response=await fetch(`/api/shared/run?id=${encodeURIComponent(publicRun)}&playerId=${encodeURIComponent(publicPlayer)}${publicChallenge?'&challenge='+encodeURIComponent(publicChallenge):''}`),result=await response.json();if(!response.ok)throw new Error(result.error);
  text('shared-summary',`${result.run.displayName} · ${names[result.run.character]} → ${names[result.run.stage]} · ${formatTime(result.run.frames)}`);$('shared-launch').disabled=result.run.hasReplay===false;
 }catch(error){text('shared-error',error.message||'Public replay unavailable.');}finally{clear();done();}
 $('shared-launch').addEventListener('click',()=>launchReplay('shared/launch',{id:publicRun,playerId:publicPlayer,challengeId:publicChallenge},$('shared-launch')));
}


for(const [id,kind] of [['share-score','score'],['share-replay','replay'],['share-private','private']])$(id).addEventListener('click',async()=>{
 if(!sharingRun)return;for(const button of ['share-score','share-replay','share-private'])$(button).disabled=true;
 try{await post('submissions/disclose',{id:sharingRun.id,kind},'disclose',$(id));text('share-status',kind==='private'?'Disclosure removed. Final records remain public after reveal.':kind==='score'?'Score shared. The replay stays private until reveal.':'Score and replay shared. Everyone can watch this run.');await refresh();}
 catch(error){text('share-status',error.message);}
 finally{for(const button of ['share-score','share-replay','share-private'])$(button).disabled=false;}
});
$('update-challenge').addEventListener('click',async()=>{
 updatingChallenge=true;$('update-challenge').disabled=true;
 try{const result=await post('challenge/update',{},'challenge');toast(result.updated?`Seed ${result.seed} installed.`:'Challenge is up to date.');await refresh();}
 catch(error){toast(error.message);}finally{updatingChallenge=false;$('update-challenge').disabled=false;}
});
