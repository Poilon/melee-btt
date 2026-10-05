const $=id=>document.getElementById(id),storageKey='ttrc-game-connection';
// Browsers may reuse the existing sign-in tab for a new game request.
addEventListener('hashchange',()=>{if(location.hash.startsWith('#request='))location.reload();});
let connection,mode='login',busy=false,authenticated=false,complete=false;
const valid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
try{
 const fragment=new URLSearchParams(location.hash.slice(1));
 if(fragment.has('request')){
  connection={id:fragment.get('request'),browserSecret:fragment.get('key')};
  history.replaceState(null,'',location.pathname);
  if(valid(connection.id)&&valid(connection.browserSecret))sessionStorage.setItem(storageKey,JSON.stringify(connection));
 }else connection=JSON.parse(sessionStorage.getItem(storageKey)||'null');
}catch{}
function loading(value,button){busy=value;$('content')?.setAttribute('aria-busy',String(value));for(const b of document.querySelectorAll('button'))b.disabled=value;button?.setAttribute('aria-busy',String(value));}
async function api(path,body={}){
 const res=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await res.json();if(!res.ok){const e=Error(data.error||'Could not connect. Try again.');e.status=res.status;throw e;}return data;
}
function failure(e){$('error').textContent=e.name==='TimeoutError'?'The server took too long. Try again.':e.message;$('status').textContent='';if(e.status===410){$('form').hidden=true;$('account').hidden=true;sessionStorage.removeItem(storageKey);}else $('retry').hidden=false;}
async function connect(){
 $('status').textContent='Connecting your game…';await api('game/connect/approve',connection);
 complete=true;sessionStorage.removeItem(storageKey);$('title').textContent='Connected';$('description').textContent='Your game is now signed in.';$('status').textContent='';$('form').hidden=true;$('account').hidden=true;$('retry').hidden=true;$('complete').hidden=false;
}
async function init(){
 $('error').textContent='';$('retry').hidden=true;loading(true,$('retry'));
 try{
  if(!valid(connection?.id)||!valid(connection?.browserSecret))throw Error('Select Log in in TTRC Dolphin to open this page.');
  const {profile}=await api('game/connect/info',connection);authenticated=Boolean(profile);
  $('status').textContent='';$('form').hidden=authenticated;$('account').hidden=!authenticated;
  if(profile)$('continue').textContent=`Continue as ${profile.slug}`;
 }catch(e){failure(e);}finally{loading(false,$('retry'));}
}
$('mode').onclick=()=>{mode=mode==='login'?'signup':'login';$('title').textContent=mode==='signup'?'Create account':'Sign in';$('password').value='';$('password').minLength=mode==='signup'?8:1;$('password').autocomplete=mode==='signup'?'new-password':'current-password';$('submit').textContent=mode==='signup'?'Create account and connect':'Sign in and connect';$('mode').textContent=mode==='signup'?'I already have an account':'Create an account';$('error').textContent='';};
$('form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;loading(true,$('submit'));$('error').textContent='';$('retry').hidden=true;
 try{await api('auth/'+mode,{...connection,username:$('username').value,password:$('password').value});$('password').value='';authenticated=true;await connect();}catch(e){failure(e);}finally{loading(false,$('submit'));}
};
$('continue').onclick=async()=>{if(busy)return;loading(true,$('continue'));$('error').textContent='';try{await connect();}catch(e){failure(e);}finally{loading(false,$('continue'));}};
$('switch-account').onclick=async()=>{if(busy)return;loading(true,$('switch-account'));try{await api('auth/logout');authenticated=false;await init();}catch(e){failure(e);}finally{loading(false,$('switch-account'));}};
$('retry').onclick=async()=>{if(busy||complete)return;if(!authenticated)return init();loading(true,$('retry'));$('error').textContent='';try{await connect();}catch(e){failure(e);}finally{loading(false,$('retry'));}};
await init();
