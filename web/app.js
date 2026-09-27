import { formatTime as time } from './time.js';
const names = {
  'dr-mario': 'Dr. Mario', mario: 'Mario', luigi: 'Luigi', bowser: 'Bowser', peach: 'Peach', yoshi: 'Yoshi',
  'donkey-kong': 'Donkey Kong', 'captain-falcon': 'Captain Falcon', ganondorf: 'Ganondorf', falco: 'Falco', fox: 'Fox',
  ness: 'Ness', 'ice-climbers': 'Ice Climbers', kirby: 'Kirby', samus: 'Samus', zelda: 'Zelda', link: 'Link',
  'young-link': 'Young Link', pichu: 'Pichu', pikachu: 'Pikachu', jigglypuff: 'Jigglypuff', mewtwo: 'Mewtwo',
  'game-and-watch': 'Mr. Game & Watch', marth: 'Marth', roy: 'Roy',
};
const $ = id => document.getElementById(id);
const text = (id, value) => { $(id).textContent = value; };
const node = (tag, value, className) => { const n = document.createElement(tag); n.textContent = value; if (className) n.className = className; return n; };
const date = iso => new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
let selection = new URLSearchParams(location.search).get('character') || 'fox';
if (!Object.hasOwn(names, selection)) selection = 'fox';
let data, toastTimer, busy = false, seenRuns, playerSeen;
function toast(message) {
  clearTimeout(toastTimer); text('toast', message); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function download(value, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function action(path, body) {
  const response = await fetch(`/api/${path}`, { method: 'POST',
    headers: { 'X-TTRC-Action': 'profile', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Please try again.'), { code: result.code, status: response.status });
  return result;
}
function portrait(character) {
  const img = document.createElement('img'); img.src = `/assets/melee/${character}-portrait.webp`; img.alt = ''; img.className = 'fighter-portrait'; img.width = 68; img.height = 80; img.loading = 'lazy'; return img;
}
function renderDeadline() {
  if (!data) return;
  const competition = data.competition || {};
  const closed = competition.timesRevealed;
  const timestamp = closed ? competition.closedAt : competition.endsAt;
  const date = timestamp ? new Date(timestamp) : null;
  const validDate = date && Number.isFinite(date.getTime());
  text('deadline-label', closed ? 'Challenge ended' : 'Challenge ends');
  $('deadline-admin').hidden = !data.auth?.account?.admin || closed;
  text('deadline-admin', validDate ? 'Edit end date' : 'Set end date');
  $('deadline-date').hidden = !validDate;
  if (validDate) {
    $('deadline-date').dateTime = date.toISOString();
    text('deadline-date', date.toLocaleString('en-US', {month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false, timeZoneName:'short'}));
  } else $('deadline-date').removeAttribute('datetime');
  if (closed) {
    text('deadline-countdown', 'Results revealed');
    text('deadline-note', 'Submissions are closed. Times and rankings are public.');
  } else if (!validDate) {
    text('deadline-countdown', 'No end date set');
    text('deadline-note', 'The challenge stays open until an admin sets a date or closes it.');
  } else {
    const seconds = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
    const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24, minutes = Math.floor(seconds / 60) % 60;
    const pad = value => String(value).padStart(2, '0');
    text('deadline-countdown', seconds ? `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds % 60)}s` : 'Closing…');
    text('deadline-note', seconds ? 'Time left · submissions close and results reveal at this time.' : 'Checking the final results…');
  }
}
function renderCourses() {
  if (!data) return;
  const query = $('course-search').value.trim().toLowerCase();
  const characters = Object.keys(names).filter(c => data.challenge.assignments[c] &&
    `${names[c]} ${names[data.challenge.assignments[c]]}`.toLowerCase().includes(query));
  $('course-grid').replaceChildren();
  for (const character of characters) {
    const p = data.progress?.[character];
    const button = node('button', '', `course-card${character === selection ? ' selected' : ''}${p?.best ? ' cleared' : ''}`);
    button.setAttribute('aria-label', `${names[character]} → ${names[data.challenge.assignments[character]]}`);
    button.setAttribute('aria-pressed', String(character === selection));
    button.append(portrait(character), node('strong', names[character]), node('span', `→ ${names[data.challenge.assignments[character]]}`),
      node('small', p?.best ? `✓ ${time(p.best)} · ${p.runs} run${p.runs === 1 ? '' : 's'}` : 'No submitted run', 'course-best'));
    const targets=data.challenge.motion?.courses[data.challenge.assignments[character]];
    if(targets){const counts=targets.reduce((a,t)=>(a[t.kind]++,a),{static:0,moving:0,teleport:0});button.append(node('small',`${counts.static} fixed · ${counts.moving} moving · ${counts.teleport} teleporting`,'course-best'));}
    button.addEventListener('click', () => { choose(character); $('board-title').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    $('course-grid').append(button);
  }
  text('course-count', `${characters.length} course${characters.length === 1 ? '' : 's'}`);
  $('course-empty').hidden = characters.length > 0;
}
function render(d) {
  data = d;
  renderDeadline();
  const c = d.challenge, remote = d.scope === 'public', ident = d.identity;
  document.body.classList.toggle('public-site', remote);
  document.querySelector('.local-badge').replaceChildren(node('i', ''), document.createTextNode(remote ? ' Community challenge' : ' Local companion'));
  const revealed=Boolean(d.competition?.timesRevealed);
  document.querySelector('.board-footer>span:last-child').textContent = revealed ? 'Challenge closed · results revealed' : 'All participants · alphabetical order';
  text('board-title',revealed?'Leaderboard':'Participants');
  document.querySelector('.leaderboard .eyebrow').textContent=revealed?'Results':'Current seed';
  document.querySelector('thead tr').replaceChildren(...(revealed?['RANK','PLAYER','FINAL TIME','DATE']:['PLAYER']).map(label=>{const th=node('th',label);th.scope='col';return th;}));
  text('competition-state',revealed?'Challenge closed':'Results hidden');
  text('competition-detail',revealed?'Submissions are closed. Submitted times and rankings are now visible.':'Times and rankings stay hidden until the challenge closes, except runs their owners choose to disclose.');
  if (!revealed && d.competition?.endsAt) text('competition-detail', `Closes and reveals ${new Date(d.competition.endsAt).toLocaleString('en-US', {dateStyle:'medium', timeStyle:'short'})} (your local time). Times and rankings stay hidden until then, except disclosed runs.`);
  document.querySelector('#board-empty h3').textContent=revealed?'No records yet.':'No participants yet';
  document.querySelector('#board-empty p').textContent=revealed?'No submitted results for this character.':'The companion submits valid personal bests automatically.';
  text('seed', c.rules.seed); text('board-seed', c.rules.seed); text('target-count', c.rules.targets);
  text('target-behavior',c.motion?'Seeded mix':'Fixed');
  text('hero-stage', (names[c.assignments.fox] || '—').toUpperCase());
  text('stat-courses', Object.keys(c.assignments).length); text('stat-players', d.stats.players); text('stat-runs', d.stats.completions);
  const initials = ident ? ident.displayName.trim().split(/\s+/).slice(0, 2).map(w => Array.from(w)[0]).join('').toUpperCase() : '?';
  text('avatar', initials); text('top-avatar', initials);
  text('display-name', ident?.displayName || 'Not signed in');
  const account = d.auth?.account;
  $('admin-link').hidden = !account?.admin;
  text('connect-code', ident?.slug ? `@${ident.slug}` : account ? 'Choose your TTRC username' : 'Sign in to save your records');
  if (ident?.slug) $('connect-code').href = `/players/${ident.slug}`; else $('connect-code').removeAttribute('href');
  text('top-name', ident?.displayName || 'My player');
  $('identity-check').hidden = !ident;
  text('identity-note', ident?.slug ? 'Your records are linked to this account on every PC.' : account && account.provider !== 'password' ?
    'Add a password to keep this profile and its existing records.' : 'Choose a unique username and a password to create your account.');
  text('player-action', ident?.slug ? 'Open companion ↗' : 'Sign in');
  $('player-action').disabled = !d.auth?.configured && !ident?.slug;
  $('logout').hidden = !account;
  $('create-account').hidden = account?.provider === 'password';
  text('create-account', account ? 'Add password' : 'Create account');
  text('auth-note', 'No email required.');
  renderConnection();
  $('scores').replaceChildren();
  const publicRows=revealed?d.leaderboard:(d.participants||[]);
  for (const score of publicRows) {
    const row = document.createElement('tr'); if (score.playerId === d.player?.id) row.className = 'mine';
    if(revealed)row.append(node('td', String(score.rank).padStart(2, '0'), `rank ${score.rank === 1 ? 'first-place' : ''}`));
    const player = document.createElement('td'); player.append(node('span', score.displayName, 'row-name'), node('span', score.connectCode, 'row-code'));
    row.append(player);
    if(revealed)row.append(node('td',time(score.frames),'run-time'),node('td',date(score.createdAt),'row-date'));
    $('scores').append(row);
  }
  $('board-empty').hidden = publicRows.length > 0;
  text('personal-character', names[selection].toUpperCase());
  const best = d.personalBest;
  const leader = d.leaderboard[0];
  const gap = best && leader && best.frames > leader.frames ? ` · ${time(best.frames - leader.frames)} behind #1` : '';
  $('personal-time').replaceChildren(document.createTextNode(best ? time(best.frames) : '—'), node('span', best ? `your best on this seed${gap}` : 'no completed runs yet'));
  const connected = d.capture.status === 'connected';
  text('capture-top', remote ? (revealed?'Challenge closed':'Submissions open') : connected ? ident ? '● Dolphin connected' : 'Practice only · sign in' : '○ Waiting for Dolphin');
  $('capture-top').classList.toggle('connected', remote || (connected && Boolean(ident)));
  text('capture-title', remote ? ident ? 'Submit from the companion' : 'Player required' : connected ? d.capture.inGame ? 'Run in progress' : 'Dolphin detected' : 'Local companion');
  text('capture-detail', remote ? ident ? 'Valid personal bests and their replays are submitted automatically. They stay private unless you disclose them.' : 'Sign in, then connect your companion to submit records.' :
    !ident ? 'Sign in to record your runs.' : d.remote?.lastError || (d.remote?.pending ? `${d.remote.pending} run(s) waiting to upload. Local records are safe.` : connected ? d.capture.inGame ? `${d.capture.remaining} targets left · experimental capture` : 'Start a fresh run, then click Submit on your best attempt.' : 'Play the challenge to connect Dolphin.'));
  const progress = Object.values(d.progress || {}).filter(p => p.best);
  const cleared = progress.length, total = Object.keys(c.assignments).length;
  text('progress-count', `${cleared} / ${total}`); $('progress-bar').max = total; $('progress-bar').value = cleared;
  text('progress-note', cleared === total ? 'All courses submitted.' : `${total - cleared} courses without a submitted run.`);
  text('total-best', `Combined best (${cleared}/${total}): ${cleared ? time(progress.reduce((sum, p) => sum + p.best, 0)) : '—'}`);
  const courseKey = JSON.stringify([c.id, selection, d.progress]);
  if ($('course-grid').dataset.key !== courseKey) { $('course-grid').dataset.key = courseKey; renderCourses(); }
  renderHistory(d);
  renderShared(d);
  if (playerSeen !== d.player?.id) { seenRuns = undefined; playerSeen = d.player?.id; }
  if (seenRuns) {
    const fresh = d.history.find(run => !seenRuns.has(run.id));
    if (fresh) {
      const pb = d.progress?.[fresh.character]?.best === fresh.frames;
      toast(`${pb ? 'Personal best:' : 'Run saved:'} ${names[fresh.character]} · ${time(fresh.frames)}`);
    }
  }
  seenRuns = new Set(d.history.map(run => run.id));
}
let historyKey, sharedKey, pendingDisclosure;
function renderHistory(d) {
  const key=JSON.stringify([d.player?.id,d.challenge.id,d.history]);
  if(key===historyKey)return;historyKey=key;
  const owner=`${d.player?.id||''}:${d.challenge.id}`,root=$('history-list');
  const expanded=new Set(root.dataset.owner===owner?[...root.querySelectorAll('details[open]')].map(el=>el.dataset.character):[]);
  root.dataset.owner=owner;root.replaceChildren();
  $('history-empty').hidden=d.history.length>0;$('export-runs').disabled=!d.history.length;
  text('history-empty',d.identity?'Your valid personal bests appear here automatically after the companion uploads their replays.':'Sign in to see all your submitted runs.');
  const groups=new Map();for(const r of d.history){if(!groups.has(r.character))groups.set(r.character,[]);groups.get(r.character).push(r);}
  text('history-count',`${groups.size} character${groups.size===1?'':'s'} · ${d.history.length} submitted run${d.history.length===1?'':'s'}`);
  const status=r=>({submitted:'Submitted',pending:'Submitted',approved:'Submitted',rejected:'Rejected'})[r.status]||r.status||'Submitted';
  for(const [character,runs] of [...groups].sort(([a],[b])=>names[a].localeCompare(names[b],'en'))){
    const best=runs.find(r=>r.current===true)||runs.reduce((a,b)=>b.frames<a.frames?b:a),group=node('details','','record-group');
    group.dataset.character=character;group.open=expanded.has(character);
    const summary=node('summary','','record-summary'),fighter=node('span','','record-fighter');
    fighter.append(portrait(character),node('strong',names[character]),node('small',`→ ${names[best.stage]} · ${runs.length} run${runs.length===1?'':'s'}`));
    const result=node('span','','record-result');result.append(node('span',time(best.frames),'run-time'),node('small',`${best.current===false?'Previous submission':'Current submission'} · ${status(best)}`));
    result.append(disclosureButton(best));
    summary.append(fighter,result,node('span','View history','record-toggle'));
    const list=node('div','','record-attempts');
    list.append(node('p','All submitted runs · newest first','section-note'));
    for(const run of runs){
      const row=node('div','',`history-row${run.id===best.id?' record-best':''}`),info=node('span',status(run));
      info.append(node('small',run.current===false?'Replaced by a newer record':'Current submission'));
      info.append(node('small',run.disclosed?'Public':'Private'));
      if(run.reviewNote&&!['pending','submitted'].includes(run.status))info.append(node('small',run.reviewNote));
      row.append(info,node('span',time(run.frames),'run-time'),node('span',new Date(run.createdAt).toLocaleString('en-US')));const actions=node('div','','record-actions');actions.append(disclosureButton(run));row.append(actions);list.append(row);
    }
    group.append(summary,list);root.append(group);
  }
}
function disclosureButton(run){
  const button=node('button',run.disclosed?'Make private':'Disclose run','text-button disclose-button');
  button.type='button';button.title=run.disclosed?'Remove public access to this run':'Publish this time and replay to everyone';
  button.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();
    if(run.disclosed){button.disabled=true;try{await action('submissions/disclose',{id:run.id,public:false});toast('Run is private.');await refresh();}catch(error){toast(error.message);}finally{button.disabled=false;}return;}
    pendingDisclosure=run;text('disclose-summary',`${names[run.character]} → ${names[run.stage]} · ${time(run.frames)}`);text('disclose-error','');$('disclose-dialog').showModal();
  });return button;
}
$('confirm-disclose').addEventListener('click',async()=>{
  if(!pendingDisclosure)return;$('confirm-disclose').disabled=true;text('disclose-error','');
  try{await action('submissions/disclose',{id:pendingDisclosure.id,public:true});$('disclose-dialog').close();pendingDisclosure=null;toast('Run and replay are now public.');await refresh();}
  catch(error){text('disclose-error',error.message);}finally{$('confirm-disclose').disabled=false;}
});
function renderShared(d){
  const profilePlayer=$('public-profile').dataset.player;
  const runs=(d.sharedRuns||[]).filter(r=>!profilePlayer||r.playerId===profilePlayer),key=JSON.stringify(runs);if(key===sharedKey)return;sharedKey=key;
  text('shared-count',runs.length);$('shared-empty').hidden=runs.length>0;$('shared-list').replaceChildren();
  const linkId=new URLSearchParams(location.search).get('run'),linkPlayer=new URLSearchParams(location.search).get('player');
  for(const r of runs){
    const card=node('article','','shared-run'),info=node('div','','shared-info');
    if(r.id===linkId&&r.playerId===linkPlayer)card.classList.add('shared-selected');
    info.append(node('strong',r.displayName),node('span',`${names[r.character]} → ${names[r.stage]}`),node('small',r.status==='rejected'?'Excluded':'Submitted'));
    const actions=node('div','','shared-actions'),query=new URLSearchParams({id:r.id,playerId:r.playerId});
    const watch=node('a','Watch in Dolphin','button secondary');watch.href=`http://localhost:4317/?publicRun=${r.id}&playerId=${r.playerId}`;watch.target='_blank';watch.rel='noopener';watch.title='Open the companion to play this replay';
    const download=node('a','Download .slp','text-button');download.href=`/api/shared/replay?${query}`;download.download=`${r.id}.slp`;
    const share=node('button','Copy link','text-button');share.addEventListener('click',async()=>{const url=new URL(location.origin);url.searchParams.set('run',r.id);url.searchParams.set('player',r.playerId);url.hash='shared-runs';try{await navigator.clipboard.writeText(url.href);toast('Run link copied.');}catch{toast(url.href);}});
    actions.append(watch,download,share);card.append(info,node('time',time(r.frames),'run-time'),actions);$('shared-list').append(card);
  }
}
async function refresh() {
  const requested = selection;
  try {
    const response = await fetch(`/api/dashboard?character=${encodeURIComponent(requested)}`);
    if (!response.ok) throw new Error();
    const next = await response.json(); if (requested === selection) render(next);
  } catch { text('capture-top', 'Site offline · reconnecting…'); $('capture-top').classList.remove('connected'); }
}
function choose(character) {
  selection = character;
  const url = new URL(location); url.searchParams.set('character', character); history.replaceState(null, '', url); refresh();
}
$('course-search').addEventListener('input', renderCourses);
async function play() {
  if (!data) return;
  if (data.scope === 'public') { $('play-guide').showModal(); return; }
  $('play').disabled = true;
  try {
    const response = await fetch('/api/launch', { method: 'POST', headers: { 'X-TTRC-Action': 'launch' } });
    if (!response.ok) throw new Error();
    const result = await response.json();
    toast(result.status === 'already-running' ? 'Dolphin is already running this challenge.' : 'Dolphin is starting. Pick your character in Target Test.'); refresh();
  } catch { toast('Could not launch Dolphin. Prepare the challenge with the Dolphin script, then try again.'); }
  finally { $('play').disabled = false; }
}
$('play').addEventListener('click', play); $('empty-play').addEventListener('click', play);
$('copy-seed').addEventListener('click', async () => {
  if (!data) return;
  try { await navigator.clipboard.writeText(data.challenge.motion?`TTRC ${data.challenge.rules.seed} · seeded motion · ${data.challenge.id}`:data.challenge.bttSeed); toast(data.challenge.motion?'TTRC challenge copied. Use Get Gecko code for the complete moving-target rules.':'BTT seed copied, including the course settings.'); }
  catch { toast(data.challenge.motion?`TTRC seed: ${data.challenge.rules.seed} · seeded motion`:`BTT seed: ${data.challenge.bttSeed}`); }
});
const connectId = new URLSearchParams(location.search).get('connect');
let connectionInfo, connectionDone = false, authMode = 'login';
function showAuth(mode = 'login') {
  authMode = mode;
  const signup = mode === 'signup';
  text('auth-title', signup ? 'Create account' : 'Sign in');
  text('auth-description', signup ? data?.identity ? 'Add a password to keep this profile and its records.' : 'Choose a unique username and a password. No email required.' : 'Use your TTRC account.');
  $('auth-password').minLength = signup ? 8 : 1;
  $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-username').minLength = signup ? 3 : 1;
  if (signup) $('auth-username').pattern = '[A-Za-z0-9][A-Za-z0-9_]{2,23}'; else $('auth-username').removeAttribute('pattern');
  if (signup && data?.identity?.slug) $('auth-username').value = data.identity.slug;
  $('username-hint').hidden = !signup; $('password-hint').hidden = !signup;
  text('auth-submit', signup ? 'Create account' : 'Sign in');
  $('auth-submit').disabled = false; text('auth-error', '');
  text('auth-switch', signup ? 'Already have an account? Sign in' : 'Create account');
  if (!$('auth-dialog').open) $('auth-dialog').showModal();
}
$('create-account').addEventListener('click', () => showAuth('signup'));
$('auth-switch').addEventListener('click', () => { $('auth-password').value = ''; showAuth(authMode === 'login' ? 'signup' : 'login'); });
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return; busy = true; $('auth-submit').disabled = true; text('auth-error', '');
  try {
    await action(`auth/${authMode}`, { username: $('auth-username').value, password: $('auth-password').value });
    $('auth-password').value = ''; $('auth-dialog').close(); await refresh(); toast(authMode === 'signup' ? 'Account created.' : 'Signed in.');
  } catch (error) { text('auth-error', error.message); }
  finally { busy = false; $('auth-submit').disabled = false; }
});
$('player-action').addEventListener('click', () => {
  if (!data) return;
  if (data.identity?.slug) { window.open('http://localhost:4317', '_blank', 'noopener'); return; }
  showAuth();
});
$('logout').addEventListener('click', async () => {
  try { await action('auth/logout'); await refresh(); toast('Signed out of this browser.'); }
  catch (error) { toast(error.message); }
});
function renderConnection() {
  if (!connectId) return;
  $('connect-panel').hidden = false;
  if (connectionDone) { text('connect-status', 'Connected. You can return to your companion.'); $('approve-companion').hidden = true; return; }
  if (!connectionInfo) return;
  text('connect-verification', connectionInfo.code.match(/.{4}/g).join(' '));
  const ready = data?.auth?.account?.provider === 'password' && data?.identity?.slug;
  text('connect-status', ready ? `Connect as @${data.identity.slug}` : 'Sign in or create an account to continue.');
  text('approve-companion', ready ? 'Connect companion' : data?.identity ? 'Add password' : 'Sign in');
  $('approve-companion').disabled = !data?.auth?.configured;
}
$('approve-companion').addEventListener('click', async () => {
  if (data?.auth?.account?.provider !== 'password') { showAuth(data?.identity ? 'signup' : 'login'); return; }
  $('approve-companion').disabled = true;
  try { await action('companion/connect/approve', { id: connectId, code: connectionInfo.code }); connectionDone = true; renderConnection(); }
  catch (error) { text('connect-status', error.message); }
  finally { $('approve-companion').disabled = false; }
});
$('export-runs').addEventListener('click', () => {
  if (!data?.history.length) return;
  const rows = ['character,stage,frames,time,date', ...data.history.map(r => [r.character, r.stage, r.frames, time(r.frames), r.createdAt].join(','))];
  download(rows.join('\n'), `target-test-${data.challenge.rules.seed}-all-runs.csv`, 'text/csv');
});
async function consumeSignIn() {
  if (!location.hash.startsWith('#signin=')) return;
  const ticket = location.hash.slice(8); history.replaceState(null, '', `${location.pathname}${location.search}`);
  try { await action('auth/companion', { ticket }); toast('Signed in.'); }
  catch (error) { toast(error.message); }
}
window.addEventListener('hashchange', async () => { await consumeSignIn(); await refresh(); });
await consumeSignIn();
if (connectId) {
  $('connect-panel').hidden = false;
  try {
    const response = await fetch(`/api/companion/connect/info?id=${encodeURIComponent(connectId)}`), result = await response.json();
    if (!response.ok) throw new Error(result.error);
    connectionInfo = result;
  } catch (error) { text('connect-status', error.message); }
}
const profileSlug = location.pathname.match(/^\/players\/([a-z0-9_]+)$/)?.[1];
if (profileSlug) {
  $('public-profile').hidden = false;
  try {
    const response = await fetch(`/api/players/profile?slug=${encodeURIComponent(profileSlug)}`), result = await response.json();
    if (!response.ok) throw new Error(result.error);
    text('public-name', `@${result.profile.slug}`); document.title = `@${result.profile.slug} · TTRC`;
    $('public-profile').dataset.player = result.profile.id;
  } catch (error) { text('public-name', 'Player not found'); text('public-note', error.message); }
}
await refresh();
setInterval(() => { if (!document.hidden && !busy) refresh(); }, 5000);
setInterval(() => { if (!document.hidden) renderDeadline(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
