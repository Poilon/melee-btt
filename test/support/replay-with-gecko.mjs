// Synthetic regression variants of a public fixture only. Never alter or upload
// a player's replay. Preserve every gameplay event and the original metadata.
export function withGecko(bytes, gecko) {
 const raw=bytes.subarray(15,15+bytes.readUInt32BE(11));
 const table=Buffer.from(raw.subarray(0,raw[1]+1)),sizes=new Map();
 for(let i=2;i<table.length;i+=3){sizes.set(table[i],table.readUInt16BE(i+1));if(table[i]===0x3d)table.writeUInt16BE(gecko.length,i+1);}
 const parts=[table];let inserted=false;
 for(let p=table.length;p<raw.length;){
  const command=raw[p],length=sizes.get(command)+1;
  if(!Number.isInteger(length))throw Error('Unknown fixture event');
  const event=raw.subarray(p,p+length);
  if(command===0x3d||(command===0x10&&event[0x203]===0x3d)){
   if(!inserted){parts.push(Buffer.from([0x3d]),gecko);inserted=true;}
  }else parts.push(event);
  p+=length;
 }
 if(!inserted)throw Error('Fixture has no Gecko list');
 const updated=Buffer.concat(parts),header=Buffer.from(bytes.subarray(0,15));header.writeUInt32BE(updated.length,11);
 return Buffer.concat([header,updated,bytes.subarray(15+raw.length)]);
}
