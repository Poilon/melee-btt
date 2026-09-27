export const characterPoints = rank => [10,7,5,3,1][rank-1] || 0;
export const thsPoints = rank => Math.max(0,15-(rank-1)*2.5);
// Competition ranking: equal performances share a place; the next place skips ties.
function rank(rows,value){let previous,place=0;return rows.map((row,index)=>{const score=value(row);if(index===0||score!==previous){place=index+1;previous=score;}return {...row,rank:place};});}
export function overallStandings(records,assignments){
 const characters=Object.keys(assignments),players=new Map(),best=new Map();
 for(const r of records){
  if(r.current===false||r.status==='rejected'||!characters.includes(r.character))continue;
  const key=`${r.playerId}:${r.character}`,old=best.get(key);
  if(!old||r.frames<old.frames)best.set(key,r);
 }
 for(const character of characters){
  const standings=rank([...best.values()].filter(r=>r.character===character).sort((a,b)=>a.frames-b.frames||a.playerId.localeCompare(b.playerId)),r=>r.frames);
  for(const r of standings){
   if(!players.has(r.playerId))players.set(r.playerId,{playerId:r.playerId,displayName:r.displayName,connectCode:r.connectCode,characterPoints:0,thsPoints:0,thsFrames:null,thsRank:null,courses:[]});
   const p=players.get(r.playerId),points=characterPoints(r.rank);p.characterPoints+=points;p.courses.push({character,frames:r.frames,rank:r.rank,points});
  }
 }
 for(const p of players.values()){
  p.completed=p.courses.length;p.totalCharacters=characters.length;
  if(p.completed===characters.length&&characters.length)p.thsFrames=p.courses.reduce((sum,r)=>sum+r.frames,0);
 }
 const ths=rank([...players.values()].filter(p=>p.thsFrames!==null).sort((a,b)=>a.thsFrames-b.thsFrames||a.playerId.localeCompare(b.playerId)),p=>p.thsFrames);
 for(const r of ths){const p=players.get(r.playerId);p.thsRank=r.rank;p.thsPoints=thsPoints(r.rank);}
 for(const p of players.values())p.totalPoints=p.characterPoints+p.thsPoints;
 return rank([...players.values()].sort((a,b)=>b.totalPoints-a.totalPoints||a.displayName.localeCompare(b.displayName,'en')||a.playerId.localeCompare(b.playerId)),p=>p.totalPoints);
}
