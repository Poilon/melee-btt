export const clone=value=>structuredClone(value);
export function validateStagePack(pack,bases){
 const errors=[];
 if(pack?.format!=='TTRC_STAGE_PACK'||pack.version!==1||!Array.isArray(pack.projects))return ['Invalid level pack.'];
 const known=new Map(bases.map(b=>[b.stage,b])),seen=new Set();
 for(const p of pack.projects){
  const b=known.get(p?.stage);
  if(!b){errors.push('Unknown stage in level pack.');continue;}
  if(seen.has(p.stage)){errors.push(`Duplicate stage: ${b.character}.`);continue;}
  seen.add(p.stage);
  errors.push(...validateProject(p,b).errors.map(e=>`${b.character}: ${e}`));
 }
 for(const b of bases)if(!seen.has(b.stage))errors.push(`Missing stage: ${b.character}.`);
 return errors;
}
export function createStagePack(bases,drafts,activeStage){
 const pack={format:'TTRC_STAGE_PACK',version:1,activeStage,projects:bases.map(b=>clone(drafts[b.stage]??b.project))};
 const errors=validateStagePack(pack,bases);if(errors.length)throw Error(errors.join(' '));return pack;
}
export function pointIn(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function validateProject(p,base){try{return validate(p,base);}catch{return {errors:['Invalid project structure.'],warnings:[]};}}
function validate(p,base){
 const errors=[],warnings=[];const fail=s=>errors.push(s);
 if(!p||p.format!=='TTRC_STAGE_PROJECT'||p.version!==1)return {errors:['Unsupported project format.'],warnings};
 if(p.stage!==base.stage||p.revision!==base.project.revision)fail('This project belongs to another stage revision.');
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||/[\x00-\x1f]/.test(p.name))fail('Use a project name of 1–80 characters.');
 const finite=(v,lo=-2000,hi=2000)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
 const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const pt=p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v));
 for(const [k,max] of [['targets',10],['solids',64],['platforms',128],['mechanisms',10],['additions',10],['targetCycles',10]])if(!Array.isArray(p[k])||p[k].length>max)fail(`Invalid ${k}.`);
 if(errors.length)return {errors,warnings};
 if(p.targets.length!==10||!p.targets.every(pt))fail('Exactly ten valid target positions are required.');
 if(!pt(p.spawn))fail('Invalid spawn position.');
 const assets=new Map((base.pieces||[]).map(a=>[a.id,a]));
 if(base.modular){if(!Array.isArray(p.platformAssets)||p.platformAssets.length!==p.platforms.length||p.platformAssets.some(k=>assets.get(k)?.kind!=='platform'))fail('Every platform needs a valid texture asset.');if(p.solids.some(s=>assets.get(s.asset)?.kind!=='solid'))fail('Every solid needs a valid texture asset.');}
 const native=p.nativeActors||[],allowed=new Set([29,...(base.project.nativeActors||[]).map(a=>a.kind)]);
 if(!Array.isArray(native)||native.length>16)fail('At most 16 native actors.');
 else for(const a of native)if(!allowed.has(a.kind)||!finite(a.x,-1500,1500)||!finite(a.y,-1500,1500)||typeof a.name!=='string'||a.name.length>80)fail('Invalid native actor.');
 if(p.stage==='Ns'&&native.filter(a=>a.kind==='traffic').length!==1)fail('Keep one native traffic lane.');
 const sources=new Set();
 for(const s of p.solids){if(s.source!=null){if(!Number.isInteger(s.source)||s.source<0||s.source>=base.project.solids.length||sources.has(s.source))fail('Invalid or duplicate original wall reference.');sources.add(s.source);}if(!Array.isArray(s.points)||s.points.length<4||s.points.length>24||!s.points.every(pt)||!finite(s.material,0,31))fail('Invalid solid outline.');}
 for(const f of p.platforms)if(!Array.isArray(f)||f.length!==4||!finite(f[0])||!finite(f[1])||!finite(f[2],2,800)||!finite(f[3],0,31))fail('Invalid one-way platform.');
 if(p.mechanisms.length!==base.mechanisms.length)fail('Keep original native mechanism order.');
 for(const [i,m] of p.mechanisms.entries()){
  if(m.base!==i)fail('Original mechanisms cannot be reordered.');
  if(!['x','y','dx','dy'].every(k=>finite(m[k],-1500,1500))||!Number.isInteger(m.period)||!finite(m.period,60,3600)||!Number.isInteger(m.hold)||!finite(m.hold,0,m.period/4)||!finite(m.angle,-180,180))fail(`Invalid motion settings for object ${i+1}.`);
 }
 for(const m of p.additions)if(!['platform','bumper','boost','template'].includes(m.kind)||!['x','y','dx','dy'].every(k=>finite(m[k],-1500,1500))||(m.kind!=='bumper'&&!finite(m.width,4,['platform','template'].includes(m.kind)?800:160))||!Number.isInteger(m.period)||!finite(m.period,60,3600)||!Number.isInteger(m.hold)||!finite(m.hold,0,m.period/4)||typeof m.name!=='string'||m.name.length>80)fail('Invalid added object.');
 for(const m of p.additions){if(m.kind==='bumper'&&!positive(m.width))fail('Bumper width must be a number greater than zero.');if(m.height!==undefined){if(m.kind!=='bumper')fail('Only bumpers support independent height.');else if(!positive(m.height))fail('Bumper height must be a number greater than zero.');}}
 for(const m of p.additions)if(m.variant!==undefined&&(m.kind!=='bumper'||!['yellow','red'].includes(m.variant)))fail('Invalid bumper color.');
 for(const m of p.additions)if(m.kind==='template'&&(!Number.isInteger(m.template)||!base.mechanisms[m.template]||base.mechanisms[m.template].opensTarget!==undefined||base.mechanisms[m.template].kind==='boost'))fail('Invalid native object template.');
 if(p.mechanisms.length+p.additions.length>10)fail('Melee supports at most 10 authored moving/hazard groups in this course.');
 const boosts=[...p.mechanisms.map((m,i)=>({...m,kind:base.mechanisms[i]?.kind})),...p.additions].filter(m=>m.kind==='boost');
 if(boosts.length&&['Ns','Ic','Sk'].includes(p.stage))fail('This stage uses a native actor descriptor and cannot also host speed boosts.');
 if(boosts.length>8)fail('At most 8 speed boosts are supported.');
 for(const m of boosts)if(m.dx||m.dy||m.angle||m.motion||m.impulseX!==undefined&&(!finite(m.impulseX,-12,12)||Math.abs(m.impulseX)<1))fail('Speed boosts stay stationary and need a signed speed from 1 to 12.');
 for(const [m,kind] of [...p.mechanisms.map((m,i)=>[m,base.mechanisms[i]?.kind]),...p.additions.map(m=>[m,m.kind==='template'?base.mechanisms[m.template]?.kind:m.kind])]){
  if(!m.motion)continue;const c=m.motion;
  if(!['platform','bumper','decoration','fire','gate','lava','trampoline','vine'].includes(kind)||!['static','moving','teleport'].includes(c.kind)||!Array.isArray(c.keys)||c.keys.length<2||c.keys.length>65){fail('Invalid object motion.');continue;}
  if(c.keys.some((k,i)=>!Array.isArray(k)||k.length!==3||!Number.isInteger(k[0])||!finite(k[0],0,m.period)||i&&k[0]<=c.keys[i-1][0]||!pt(k.slice(1)))){fail('Object stops need increasing whole-frame times and valid coordinates.');continue;}
  if(JSON.stringify(c.keys[0])!==JSON.stringify([0,m.x,m.y])||JSON.stringify(c.keys.at(-1))!==JSON.stringify([m.period,m.x,m.y]))fail('Object loops must start and finish at their position.');
 }
 const seen=new Set();for(const c of p.targetCycles){
  if(!Number.isInteger(c.target)||c.target<0||c.target>9||seen.has(c.target)){fail('An animation needs a unique target number from 1 to 10.');continue;}seen.add(c.target);
  const label=`Target ${c.target+1}`;
  if(!['moving','teleport'].includes(c.kind)){fail(`${label}: choose Moving or Teleporting.`);continue;}
  if(!Number.isInteger(c.period)||!finite(c.period,2,3600)){fail(`${label}: loop length must be a whole number from 2 to 3600 frames (currently ${c.period}).`);continue;}
  if(!Array.isArray(c.keys)||c.keys.length<2||c.keys.length>65){fail(`${label}: use 2–65 keyframes, including the start and end.`);continue;}
  if(c.keys.some((k,i)=>!Array.isArray(k)||k.length!==3||!Number.isInteger(k[0])||!finite(k[0],0,c.period)||i&&k[0]<=c.keys[i-1][0]||!pt(k.slice(1)))){fail(`${label}: keyframes need increasing whole-frame times from 0 to ${c.period} and valid positions.`);continue;}
  if(JSON.stringify(c.keys[0])!==JSON.stringify([0,...p.targets[c.target]])||JSON.stringify(c.keys.at(-1))!==JSON.stringify([c.period,...p.targets[c.target]]))fail(`${label}: the loop must begin and end at its target position.`);
 }
 for(const [i,m]of base.mechanisms.entries()){
  if(m.opensTarget!==undefined){if(p.mechanisms[i]?.motion)fail('Chest motion must stay linked to its target.');const t=m.opensTarget,e=p.mechanisms[i];if(e&&p.targets[t]&&(Math.abs(p.targets[t][0]-base.project.targets[t][0]-(e.x-m.x))>.001||Math.abs(p.targets[t][1]-base.project.targets[t][1]-(e.y-m.y))>.001||p.targetCycles.some(c=>c.target===t)))fail('The chest and its revealed target must move together, without a target animation.');}
  for(const key of ['xKeys','yKeys','angleKeys','scaleX','scaleY','blink','facingKeys'])if(m[key]&&p.mechanisms[i]&&(!p.mechanisms[i].motion||['scaleX','scaleY','blink','facingKeys'].includes(key))){const times=m[key].map(k=>Math.round(k[0]*p.mechanisms[i].period/m.period));if(times.some((t,j)=>j&&t<=times[j-1]))fail('This loop is too short to retain the original animation keyframes.');}
  if(m.kind==='boost'&&p.mechanisms[i]&&(p.mechanisms[i].dx!==m.dx||p.mechanisms[i].dy!==m.dy))fail('Speed boost contact zones are stationary; move their position instead.');
 }
 if(errors.length)return {errors:[...new Set(errors)],warnings};
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(const s of p.solids){const v=s.points;let area=0;for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];area+=a[0]*b[1]-b[0]*a[1];if(Math.hypot(a[0]-b[0],a[1]-b[1])<.05)fail('A solid edge is too short.');for(let j=i+2;j<v.length;j++){if(i===0&&j===v.length-1)continue;const c=v[j],d=v[(j+1)%v.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)fail('Solid outlines cannot cross themselves.');}}if(area>=-1)fail('Solid vertices must form a clockwise outline with positive area.');}
 const [l,t,r,b]=base.artBounds;for(const [i,pt] of [...p.targets,p.spawn].entries()){
  const label=i===10?'Spawn':`Target ${i+1}`;
  if(pt[0]<=l||pt[0]>=r||pt[1]<=b||pt[1]>=t)fail(`${label} is outside the illustrated stage.`);
  if(p.solids.some(s=>pointIn(pt,s.points)))fail(`${label} is inside a solid wall.`);
 }
 for(const c of p.targetCycles){const samples=c.keys.map(k=>k.slice(1));if(c.kind==='moving')for(let i=1;i<c.keys.length;i++)for(let n=1;n<32;n++){const a=c.keys[i-1],b=c.keys[i];samples.push([a[1]+(b[1]-a[1])*n/32,a[2]+(b[2]-a[2])*n/32]);}if(samples.some(pt=>p.solids.some(s=>pointIn(pt,s.points))))fail(`Target ${c.target+1}'s path enters a solid wall.`);}
 if(!base.modular&&(JSON.stringify(p.solids)!==JSON.stringify(base.project.solids)||JSON.stringify(p.platforms)!==JSON.stringify(base.project.platforms)))warnings.push('Collision edits do not move the baked painting. Use the overlay to inspect mismatches; added moving platforms use the stage texture.');
 if(base.sources?.length)warnings.push('Native actors retain their game AI. Their spawn anchors are editable; test their routes after moving terrain.');
 warnings.push('This preview does not simulate Melee physics, attacks or native enemy AI. Check reachability in Dolphin.');
 return {errors:[...new Set(errors)],warnings};
}
export function moveSelection(p,selection,dx,dy,base){
 const {type,index}=selection;
 if(base){for(const [i,m]of base.mechanisms.entries()){if(m.opensTarget===undefined)continue;if(type==='target'&&index===m.opensTarget){p.mechanisms[i].x+=dx;p.mechanisms[i].y+=dy;}else if(type==='mechanism'&&i===index){p.targets[m.opensTarget][0]+=dx;p.targets[m.opensTarget][1]+=dy;}}}
 if(type==='target'){p.targets[index]=p.targets[index].map((v,i)=>v+(i?dy:dx));for(const c of p.targetCycles.filter(c=>c.target===index))c.keys=c.keys.map(([f,x,y])=>[f,x+dx,y+dy]);}
 if(type==='actor'){p.nativeActors[index].x+=dx;p.nativeActors[index].y+=dy;}
 if(type==='spawn')p.spawn=[p.spawn[0]+dx,p.spawn[1]+dy];
 if(type==='solid')p.solids[index].points=p.solids[index].points.map(([x,y])=>[x+dx,y+dy]);
 if(type==='platform'){p.platforms[index][0]+=dx;p.platforms[index][1]+=dy;}
 if(type==='mechanism'||type==='addition'){const m=p[type==='mechanism'?'mechanisms':'additions'][index];m.x+=dx;m.y+=dy;if(m.motion)m.motion.keys=m.motion.keys.map(([f,x,y])=>[f,x+dx,y+dy]);}
}
export function interpolate(keys,frame,step=false){if(!keys?.length)return 0;for(let i=1;i<keys.length;i++){if(frame<keys[i][0]){const a=keys[i-1],b=keys[i];return step?a[1]:a[1]+(b[1]-a[1])*(frame-a[0])/(b[0]-a[0]);}}return keys.at(-1)[1];}
export function motion(m,original,frame){const period=m.period,t=((frame%period)+period)%period;const ratio=original?period/original.period:1;return ['x','y'].map(axis=>{
 if(m.motion){if(m.motion.kind==='static')return m[axis];return interpolate(m.motion.keys.map(k=>[k[0],k[axis==='x'?1:2]]),t,m.motion.kind==='teleport');}
 if(original?.[axis+'Keys'])return interpolate(original[axis+'Keys'].map(([f,v])=>[f*ratio,v+(m[axis]-original[axis])]),t);
 if(original?.orbit)return m[axis]+m['d'+axis]*(axis==='x'?.5-.5*Math.cos(2*Math.PI*t/period):.5*Math.sin(2*Math.PI*t/period));
 const h=m.hold;return interpolate([[0,m[axis]],[h,m[axis]],[period/2-h,m[axis]+m['d'+axis]],[period/2+h,m[axis]+m['d'+axis]],[period-h,m[axis]],[period,m[axis]]].filter((k,i,a)=>!i||k[0]>a[i-1][0]),t);
});}
export class History{constructor(project){this.items=[clone(project)];this.index=0;}push(p){this.items.splice(this.index+1);this.items.push(clone(p));if(this.items.length>100)this.items.shift();this.index=this.items.length-1;}undo(){if(this.index)this.index--;return clone(this.items[this.index]);}redo(){if(this.index<this.items.length-1)this.index++;return clone(this.items[this.index]);}}

// Explicit platform tracks use the same interpolation as the native HSD animation.
export function setPlatformMotion(m,original,kind){
 if(kind==='authored'){delete m.motion;return;}
 if(m.motion){m.motion.kind=kind;return;}
 if(original&&(original.xKeys||original.yKeys)){
  const times=[...new Set([0,m.period,...(original.xKeys||[]).map(k=>Math.round(k[0]*m.period/original.period)),...(original.yKeys||[]).map(k=>Math.round(k[0]*m.period/original.period))])].sort((a,b)=>a-b);
  const keys=times.map(f=>[f,...motion(m,original,f)]);keys[0]=[0,m.x,m.y];keys[keys.length-1]=[m.period,m.x,m.y];m.motion={kind,keys};return;
 }
 const endX=m.x+(m.dx||(m.dy?0:40)),endY=m.y+(m.dy||0);
 m.motion={kind,keys:[[0,m.x,m.y],[Math.floor(m.period/2),endX,endY],[m.period,m.x,m.y]]};
}
export function retimeMotion(m,period){const old=m.period;if(m.motion)m.motion.keys=m.motion.keys.map(([f,x,y])=>[Math.round(f*period/old),x,y]);m.period=period;m.hold=Math.min(m.hold,Math.floor(period/4));}
export function mechanismCount(p){return p.mechanisms.length+p.additions.length;}
export function randomizeTargets(input,base,seed){
 const p=clone(input);let state=seed>>>0;
 const rand=()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
 const locked=new Set(base.mechanisms.filter(m=>m.opensTarget!==undefined).map(m=>m.opensTarget));
 const [l,top,r,bottom]=base.artBounds;
 const floors=[...p.platforms.map(([x,y,w])=>[x,y,w]),...p.solids.map(s=>{const xs=s.points.map(v=>v[0]),ys=s.points.map(v=>v[1]);return [Math.min(...xs),Math.max(...ys),Math.max(...xs)-Math.min(...xs)];})];
 const apex=Math.min(65,Math.max(20,(base.movement?.ballisticJumpApex||35)/(base.scale||1)));
 const clear=pt=>pt[0]>l+10&&pt[0]<r-10&&pt[1]>bottom+10&&pt[1]<top-10&&Math.hypot(pt[0]-p.spawn[0],pt[1]-p.spawn[1])>24&&!p.solids.some(s=>pointIn(pt,s.points)||s.points.some((a,i)=>{const b=s.points[(i+1)%s.points.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(pt[0]-a[0]-dx*t,pt[1]-a[1]-dy*t)<7;}));
 let moved=0;
 for(let i=0;i<10;i++){
  if(locked.has(i))continue;const old=p.targets[i],cycle=p.targetCycles.find(c=>c.target===i),samples=[old];
  if(cycle){samples.push(...cycle.keys.map(k=>k.slice(1)));if(cycle.kind==='moving')for(let j=1;j<cycle.keys.length;j++){const a=cycle.keys[j-1],b=cycle.keys[j],steps=Math.max(32,Math.ceil(Math.hypot(b[1]-a[1],b[2]-a[2])/5));for(let n=1;n<steps;n++)samples.push([a[1]+(b[1]-a[1])*n/steps,a[2]+(b[2]-a[2])*n/steps]);}}
  for(let attempt=0;attempt<400;attempt++){
   const floor=floors.length&&floors[Math.floor(rand()*floors.length)];
   const x=Math.round(floor&&rand()<.7?floor[0]+rand()*floor[2]:l+12+rand()*(r-l-24));
   const y=Math.round(floor?floor[1]+14+rand()*apex:old[1]+(rand()-.5)*60);
   const dx=x-old[0],dy=y-old[1];if(Math.hypot(dx,dy)<12||p.targets.some((pt,j)=>j!==i&&Math.hypot(x-pt[0],y-pt[1])<24)||!samples.every(pt=>clear([pt[0]+dx,pt[1]+dy])))continue;
   // Never call moveSelection here: chest-linked objects must remain untouched.
   p.targets[i]=[x,y];if(cycle){cycle.keys=cycle.keys.map(([f,a,b])=>[f,a+dx,b+dy]);cycle.keys[0]=[0,x,y];cycle.keys[cycle.keys.length-1]=[cycle.period,x,y];}moved++;break;
  }
 }
 return {project:p,moved,locked:locked.size};
}

export function addPiece(p,base,id,x,y){
 const a=base.pieces.find(a=>a.id===id);if(!a)throw Error('Unknown block');
 const xs=a.points.map(v=>v[0]),ys=a.points.map(v=>v[1]);const l=Math.min(...xs),t=Math.max(...ys);
 if(a.kind==='solid'){if(p.solids.length>=64)throw Error('At most 64 solid blocks');p.solids.push({asset:id,points:a.points.map(([u,v])=>[u+x-l,v+y-t]),material:a.material});return {type:'solid',index:p.solids.length-1};}
 if(p.platforms.length>=128)throw Error('At most 128 platforms');
 p.platforms.push([x,y,Math.max(...xs)-l,a.material]);p.platformAssets.push(id);return {type:'platform',index:p.platforms.length-1};
}

// Insert clicked destinations before the closing anchor; keep a closed native loop.
export function appendTargetStop(c,point){
 if(c.keys.length>=65)throw Error('At most 63 destination stops.');
 if(!Number.isInteger(c.period)||c.period<c.keys.length)throw Error('Lengthen the loop before adding another stop.');
 if(!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v)||Math.abs(v)>2000))throw Error('Place the stop inside the stage.');
 const points=[...c.keys.slice(0,-1).map(k=>k.slice(1)),point,c.keys[0].slice(1)];
 c.keys=points.map(([x,y],i)=>[Math.round(i*c.period/(points.length-1)),x,y]);
 return c.keys.length-2;
}

// Side handles move the edge's two endpoints together, leaving the other
// vertices fixed. Axis locking keeps rectangular blocks rectangular.
export function solidEdgeHandles(points){
 return points.map((a,index)=>{const b=points[(index+1)%points.length];return {index,point:[(a[0]+b[0])/2,(a[1]+b[1])/2],axis:Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?1:0,length:Math.hypot(b[0]-a[0],b[1]-a[1])};});
}
export function resizeSolidEdge(points,index,delta){
 const handle=solidEdgeHandles(points)[index],axis=handle.axis,next=(index+1)%points.length;
 const a=points[index][axis],b=points[next][axis],others=points.filter((_,i)=>i!==index&&i!==next).map(p=>p[axis]);
 if(Math.abs(a-b)<1e-7){
  if(a<Math.min(...others))delta=Math.min(delta,Math.min(...others)-a-2);
  else if(a>Math.max(...others))delta=Math.max(delta,Math.max(...others)-a+2);
 }
 return points.map((p,i)=>p.map((v,j)=>v+((i===index||i===next)&&j===axis?delta:0)));
}
