const end=Date.parse(document.getElementById('challenge-end').dateTime);
const countdown=document.getElementById('challenge-countdown'),state=document.getElementById('challenge-state');
function update(){
 const remaining=Math.max(0,Math.ceil((end-Date.now())/1000)),closed=remaining===0;
 state.textContent=closed?'Ended':'Open';state.dataset.closed=String(closed);
 document.getElementById('countdown-label').textContent=closed?'Challenge closed':'Time remaining';
 if(closed){countdown.textContent='Ended';return;}
 const days=Math.floor(remaining/86400),hours=Math.floor(remaining%86400/3600),minutes=Math.floor(remaining%3600/60),seconds=remaining%60;
 countdown.textContent=`${days}d ${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
}
update();setInterval(update,1000);
