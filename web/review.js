import {formatTime} from '/time.js';
import {startLoading,showSkeleton} from '/loading.js';
const $ = id => document.getElementById(id);
const node = (tag, text, css) => { const n = document.createElement(tag); n.textContent = text; if (css) n.className = css; return n; };
const characterName = value => value.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const localTime = value => new Date(value).toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
let current;
async function request(path, body, {quiet=false}={}) {
  const control=path==='login'?$('login').querySelector('button'):path==='schedule'?$(body.endsAt===null?'remove-deadline':'save-deadline'):$(({queue:'refresh',close:'confirm-close',generate:'publish-challenge'})[path]);
  const done=quiet?()=>{}:startLoading(({queue:'Loading submissions…',login:'Signing in…',schedule:'Saving end date…',close:'Revealing results…',generate:'Generating challenge…'})[path]||'Loading…',control);
  try{
  const response = await fetch(`/api/review/${path}`, body ? {method: 'POST', headers: {'Content-Type': 'application/json', 'X-TTRC-Action': 'review'}, body: JSON.stringify(body)} : {});
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed'), {status: response.status});
  return result;
  }finally{done();}
}
function renderQueue() {
  if (!current) return;
  const query = $('player-filter').value.trim().toLowerCase(), character = $('character-filter').value, status = $('status-filter').value;
  const rows = current.submissions.filter(r => (!query || r.displayName.toLowerCase().includes(query)) && (!character || r.character === character) && (!status || r.status === status))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.character.localeCompare(b.character));
  $('queue').replaceChildren();
  $('result-count').textContent = `${rows.length} run${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) $('queue').append(node('p', current.submissions.length ? 'No matching submissions.' : 'No submissions yet.'));
  for (const r of rows) {
    const card = node('article', '', 'submission');
    const heading = node('div', '', 'submission-heading');
    heading.append(node('h3', `${r.displayName} · ${characterName(r.character)} → ${characterName(r.stage)}`), node('time', formatTime(r.frames)));
    card.append(heading, node('p', `${r.status.toUpperCase()} · ${localTime(r.createdAt)}`));
    const details = node('details', '', 'evidence-details');
    details.append(node('summary', 'Replay details'), node('p', `Replay ${r.replay.version} · ${(r.replay.bytes / 1024).toFixed(1)} KB · last frame ${r.replay.lastFrame}`),
      node('p', r.replay.embeddedCodeMatches ? 'Challenge code matches. Check the run and final time in playback.' : 'Exact challenge code not found in replay. Check the seed in playback.', 'warning'));
    card.append(details);
    const actions = node('div', '', 'buttons');
    const download = node('a', 'Download private .slp ↓');
    download.href = `/api/review/replay?id=${r.id}&playerId=${r.playerId}`; download.download = `${r.id}.slp`; actions.append(download);
    if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      const launch = node('button', '▶ Launch replay', 'approve');
      launch.addEventListener('click', async () => {
        launch.disabled = true;
        const done=startLoading('Opening replay…',launch);
        try {
          const response = await fetch('/api/review/launch', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-TTRC-Action': 'launch'}, body: JSON.stringify({id: r.id, playerId: r.playerId})});
          const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Playback unavailable');
          $('message').textContent = 'Replay opened in Dolphin Playback.';
        } catch (error) { $('message').textContent = error.message; }
        finally { launch.disabled = false;done(); }
      });
      actions.append(launch);
    }
    card.append(actions);
    $('queue').append(card);
  }
}
async function refresh({quiet=false}={}) {
  const initial=!current;
  $('admin-loading').hidden=!initial;
  const clear=quiet?()=>{}:showSkeleton(initial?$('admin-loading'):$('queue'),4);
  try {
    current = await request('queue',undefined,{quiet});
    $('access').hidden = true; $('desk').hidden = false;
    const {competition, challenge, submissions} = current;
    const closed = competition.phase === 'closed';
    $('generate-button').disabled=!closed;
    $('generate-note').textContent=closed?'Ready to generate a new seed.':'Close the current challenge first.';
    $('phase').textContent = `Seed ${challenge.rules.seed} · ${competition.phase.toUpperCase()}`;
    for (const id of ['close', 'deadline', 'save-deadline', 'remove-deadline']) $(id).disabled = closed;
    $('deadline-summary').textContent = closed ? `Results revealed · ${localTime(competition.closedAt)}` : competition.endsAt ? `Closes and reveals on ${localTime(competition.endsAt)}` : 'No end date. Submissions stay open until you close the challenge.';
    if (competition.endsAt) {
      const date = new Date(competition.endsAt);
      $('deadline').value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    } else $('deadline').value = '';
    $('players-count').textContent = new Set(submissions.filter(r => r.current).map(r => r.playerId)).size;
    $('records-count').textContent = submissions.filter(r => r.current).length;
    $('rejected-count').textContent = submissions.filter(r => r.status === 'rejected').length;
    const selected = $('character-filter').value;
    $('character-filter').replaceChildren(new Option('All characters', ''), ...Object.keys(challenge.assignments).sort().map(c => new Option(characterName(c), c)));
    $('character-filter').value = selected; renderQueue();
  } catch (error) {
    $('message').textContent = error.message;
    // Do not leave private records displayed after access has expired or been revoked.
    $('desk').hidden = true; $('queue').replaceChildren(); current = null;
    $('access').hidden = ![401, 403].includes(error.status);
  }finally{clear();$('admin-loading').hidden=true;}
}
async function saveDeadline(endsAt) {
  if (!current) return;
  $('save-deadline').disabled = true; $('remove-deadline').disabled = true;
  try {
    await request('schedule', {challengeId: current.challenge.id, endsAt});
    $('message').textContent = endsAt ? 'End date saved. Times and rankings will be revealed automatically.' : 'End date removed. You can close the challenge manually.';
    await refresh();
  } catch (error) { $('message').textContent = error.message; $('save-deadline').disabled = false; $('remove-deadline').disabled = false; }
}
$('timezone').textContent = `Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Times and rankings become public at this date.`;
$('schedule').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('deadline').value) { $('message').textContent = 'Choose an end date, or use Remove date.'; return; }
  const date = new Date($('deadline').value);
  if (!Number.isFinite(date.getTime())) { $('message').textContent = 'Choose a valid end date.'; return; }
  saveDeadline(date.toISOString());
});
$('remove-deadline').addEventListener('click', () => saveDeadline(null));
for (const id of ['player-filter', 'character-filter', 'status-filter']) $(id).addEventListener('input', renderQueue);
$('login').addEventListener('submit', async event => {
  event.preventDefault();
  try { await request('login', {key: $('key').value}); $('key').value = ''; $('message').textContent = ''; await refresh(); }
  catch (error) { $('message').textContent = error.message; }
});
$('refresh').addEventListener('click', refresh);
$('close').addEventListener('click', () => {
  $('confirm-error').textContent = '';
  $('confirm-summary').textContent = `Seed ${current.challenge.rules.seed} · ${current.submissions.filter(r => r.current).length} current records`;
  $('confirm').showModal();
});
$('confirm-close').addEventListener('click', async () => {
  $('confirm-close').disabled = true;
  try { await request('close', {challengeId: current.challenge.id, confirm: 'REVEAL'}); $('confirm').close(); $('message').textContent = 'Challenge closed. Times and rankings are now public.'; await refresh(); }
  catch (error) { $('confirm-error').textContent = error.message; }
  finally { $('confirm-close').disabled = false; }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({quiet:true}); });
await refresh();

let pendingSeed;
$('generate').addEventListener('submit',event=>{
 event.preventDefault();pendingSeed=$('new-seed').value?Number($('new-seed').value):undefined;
 $('generate-summary').textContent=pendingSeed?`New seed: ${pendingSeed}.`:'A random seed will be generated.';
 $('generate-error').textContent='';$('generate-confirm').showModal();
});
$('publish-challenge').addEventListener('click',async()=>{
 $('publish-challenge').disabled=true;$('publish-challenge').textContent='Generating…';
 try{const result=await request('generate',{challengeId:current.challenge.id,seed:pendingSeed,confirm:'NEW CHALLENGE'});$('generate-confirm').close();$('new-seed').value='';await refresh();$('message').textContent=`Seed ${result.challenge.rules.seed} is live. The companion can download the new challenge.`;}
 catch(error){$('generate-error').textContent=error.message;}
 finally{$('publish-challenge').disabled=false;$('publish-challenge').textContent='Generate & publish';}
});
