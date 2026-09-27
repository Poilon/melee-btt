import {createHash} from 'node:crypto';
import routine from './gecko/target-motion.json' with {type:'json'};

export const motionVersion = 'ttrc-motion-v1';
// Internal ground IDs, in the same order as the BTT generator's stage list.
const groundIds = [44,40,51,49,55,61,43,41,65,45,46,54,47,48,59,62,50,42,56,57,58,53,63,52,64];
const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const cross = (a,b) => a.x*b.y-a.y*b.x;
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
const point = ([x,y]) => ({x,y});
export function segmentDistance(a,b,c,d) {
  const distance=(p,a,b)=>{
    const v=subtract(b,a),w=subtract(p,a),length=v.x*v.x+v.y*v.y;
    const t=length?Math.max(0,Math.min(1,(w.x*v.x+w.y*v.y)/length)):0;
    return Math.hypot(p.x-a.x-v.x*t,p.y-a.y-v.y*t);
  };
  const v=subtract(b,a),w=subtract(d,c),delta=subtract(c,a),denominator=cross(v,w);
  if(denominator){const t=cross(delta,w)/denominator,u=cross(delta,v)/denominator;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
  return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
}
const polygon = shape => shape.length===2 ? [shape[0],[shape[1][0],shape[0][1]],shape[1],[shape[0][0],shape[1][1]]] : shape;
export function inside({x,y},shape) {
  if(shape.length===2)return x>=shape[0][0]&&x<=shape[1][0]&&y>=shape[0][1]&&y<=shape[1][1];
  let yes=false;
  for(let i=0,j=shape.length-1;i<shape.length;j=i++){
    const [xi,yi]=shape[i],[xj,yj]=shape[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;
  }
  return yes;
}
export function validMotionPoint(p,geometry) {
  const {bounds:b,mismatch=[],exceptions=[],excluded=[]}=geometry;
  if(p.x<b.x1||p.x>b.x2||p.y<b.y1||p.y>b.y2||mismatch.some(s=>inside(p,s)))return false;
  if(exceptions.some(s=>inside(p,s)))return true;
  return !excluded.some(s=>inside(p,s));
}
// Split the segment at every polygon boundary, then check every interval. Unlike
// a sparse distance sample this cannot skip a thin exclusion or a narrow wall.
export function safeMotionSegment(a,b,geometry) {
  const cuts=[0,1],direction=subtract(b,a);
  for(const shape of [...geometry.mismatch,...geometry.exceptions,...geometry.excluded]){
    const vertices=polygon(shape);
    for(let i=0;i<vertices.length;i++){
      const p=point(vertices[i]),q=point(vertices[(i+1)%vertices.length]),edge=subtract(q,p);
      const denominator=cross(direction,edge);
      if(Math.abs(denominator)<1e-12)continue;
      const offset=subtract(p,a),t=cross(offset,edge)/denominator,u=cross(offset,direction)/denominator;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
  }
  cuts.sort((a,b)=>a-b);
  const valid=t=>validMotionPoint({x:a.x+direction.x*t,y:a.y+direction.y*t},geometry);
  return cuts.every(valid)&&cuts.slice(1).every((t,i)=>valid((t+cuts[i])/2));
}
function randomFor(seed,stage) {
  let counter=0;
  return ()=>createHash('sha256').update(`${motionVersion}:${seed}:${stage}:${counter++}`).digest().readUInt32BE()/0x100000000;
}
export function createMotionPlan(seed,stages,captures,geometries) {
  const courses={};
  for(const stageIndex of [...new Set(captures.filter(c=>c.stage<stages.length).map(c=>c.stage))]){
    const stage=stages[stageIndex],random=randomFor(seed,stage);
    const targets=captures.filter(c=>c.stage===stageIndex).map((c,index)=>{
      const packed=Buffer.from(c.packed,'hex');
      const anchor={x:packed.readInt16BE(0)/64,y:packed.readInt16BE(2)/64};
      return {index,kind:'static',anchor,destination:{...anchor},legFrames:0,startDelayFrames:0};
    });
    const order=targets.map(t=>t.index);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const count=Math.floor(random()*(Math.floor(targets.length*0.4)+1)),moving=Math.floor(random()*(count+1));
    let assigned=0;
    for(const index of order){
      if(assigned===count)break;
      const target=targets[index],kind=assigned<moving?'moving':'teleport';
      if(targets.some(t=>t.index!==index&&t.anchor.x===target.anchor.x&&t.anchor.y===target.anchor.y))continue;
      for(let attempt=0;attempt<96;attempt++){
        const [dx,dy]=directions[Math.floor(random()*directions.length)];
        const distance=8+Math.floor(random()*(kind==='moving'?17:29));
        const destination={x:target.anchor.x+dx*distance,y:target.anchor.y+dy*distance};
        // Every destination is also connected to its original reachable anchor
        // through the original BTT exclusion geometry for the assigned fighter.
        if(!safeMotionSegment(target.anchor,destination,geometries[stageIndex]))continue;
        if(targets.some(t=>t.index!==index&&segmentDistance(target.anchor,destination,t.anchor,t.destination)<6))continue;
        Object.assign(target,{kind,destination,legFrames:(kind==='moving'?120:180)+Math.floor(random()*5)*30,startDelayFrames:Math.floor(random()*31)*4});
        assigned++;break;
      }
    }
    if(assigned!==count)throw new Error(`Cannot place safe target paths on ${stage}; choose another seed.`);
    courses[stage]=targets;
  }
  return {version:motionVersion,mix:{minStatic:0.6,maxMoving:0.4,maxTeleport:0.4},courses};
}
export function motionPosition(target,frame) {
  if(!Number.isSafeInteger(frame)||frame<0)throw new Error('Expected a non-negative game frame.');
  if(target.kind==='static'||frame<=target.startDelayFrames)return {...target.anchor};
  const t=frame-target.startDelayFrames,leg=Math.floor(t/target.legFrames),remainder=t%target.legFrames;
  const fraction=target.kind==='teleport'?leg%2:(leg%2?target.legFrames-remainder:remainder)/target.legFrames;
  return {x:target.anchor.x+(target.destination.x-target.anchor.x)*fraction,y:target.anchor.y+(target.destination.y-target.anchor.y)*fraction};
}
export function motionGecko(plan,stages) {
  const tables=[];
  for(const [stage,targets] of Object.entries(plan.courses)){
    const moving=targets.filter(t=>t.kind!=='static'),header=Buffer.alloc(4);
    header.writeUInt16BE(groundIds[stages.indexOf(stage)],0);header.writeUInt16BE(moving.length,2);tables.push(header);
    for(const t of moving){
      const row=Buffer.alloc(20);
      row.writeFloatBE(t.anchor.x,0);row.writeFloatBE(t.anchor.y,4);
      row.writeFloatBE(t.destination.x-t.anchor.x,8);row.writeFloatBE(t.destination.y-t.anchor.y,12);
      row.writeUInt16BE(t.legFrames,16);row[18]=t.startDelayFrames/4;row[19]=t.kind==='moving'?1:2;tables.push(row);
    }
  }
  tables.push(Buffer.from('FFFFFFFF','hex'));
  const table=Buffer.concat(tables),entry=Buffer.alloc(4);
  entry.writeUInt32BE((0x48000001+table.length+4)>>>0);
  let payload=Buffer.concat([entry,table,Buffer.from(routine.words.join(''),'hex')]);
  // The final zero is reserved for Slippi's relocated return branch.
  payload=Buffer.concat([payload,Buffer.from(payload.length%8===0?'6000000000000000':'00000000','hex')]);
  const hex=payload.toString('hex').toUpperCase().match(/.{16}/g).map(line=>line.slice(0,8)+' '+line.slice(8));
  return `${routine.hook} ${(payload.length/8).toString(16).toUpperCase().padStart(8,'0')}\n${hex.join('\n')}\n`;
}
