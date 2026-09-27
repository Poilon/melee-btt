// In-memory variant of the public DK fixture: add the documented scene counters.
// Never modify a player's replay or upload this fixture to production.
export function withPause(bytes, pauseFrames=35) {
  const raw=bytes.subarray(15,15+bytes.readUInt32BE(11)), table=Buffer.from(raw.subarray(0,raw[1]+1)),sizes=new Map();
  for(let i=2;i<table.length;i+=3){sizes.set(table[i],table.readUInt16BE(i+1));if(table[i]===0x3a)table.writeUInt16BE(12,i+1);}
  const parts=[table];
  for(let pos=table.length;pos<raw.length;){
    const command=raw[pos],length=sizes.get(command)+1;
    if(!Number.isInteger(length))throw Error('Unknown fixture event');
    const event=Buffer.from(raw.subarray(pos,pos+length));
    if(command===0x36)event[2]=10; // Slippi 3.10 added scene counters.
    parts.push(event);
    if(command===0x3a){const frame=event.readInt32BE(1),counter=Buffer.alloc(4);counter.writeUInt32BE(frame+123+(frame>=769?pauseFrames:0));parts.push(counter);}
    pos+=length;
  }
  const updated=Buffer.concat(parts),header=Buffer.from(bytes.subarray(0,15));header.writeUInt32BE(updated.length,11);
  return Buffer.concat([header,updated,bytes.subarray(15+raw.length)]);
}
