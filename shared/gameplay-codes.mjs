import catalog from './gameplay-codes.json' with {type:'json'};
export const itemIds = {'turnip':0x63,'beam-sword':0x0c,'bob-omb':0x06,'mr-saturn':0x07};
export const approvedPreferenceCodes = new Map([
  ['$TTRC: Music off','04023FFC 38800000'],
  ['$TTRC: UCF',catalog.ucfFix.code+'\n'+catalog.ucfDashback.code],
  ...['iceClimbers','luigiMisfire','removeGo','fixedCamera'].map(key=>['$'+catalog[key].name,catalog[key].code]),
]);
// Pre-0.6.1 profiles used this byte write, which Slippi's bootloader ignores.
// Accept only that exact legacy payload while generating the working 04 write.
export function validPreferenceCode(name, code) {
  return approvedPreferenceCodes.get(name) === code ||
    (name === '$TTRC: Always Luigi misfire' && code === '00142AFB 00000001');
}
export function peachCode(items) {
  const pairs=items.flatMap((item,i)=>item==='random'?[]:[[10-i,itemIds[item]]]),n=pairs.length;
  if(!n)return '';
  const words=[0xC211D0A4,2*n+3,0x3E608049,0x6273ED9D,0x8A930000];
  for(const [targets]of pairs)words.push(0x2C140000+targets,0x41820000+n*8);
  words.push(0x48000000+(2*n+1)*4);
  pairs.forEach(([,item],i)=>words.push(0x38C00000+item,0x48000000+(n-i)*8));
  words.push(0x7FE6FB78,0);
  const hex=words.map(word=>word.toString(16).toUpperCase().padStart(8,'0'));
  return Array.from({length:hex.length/2},(_,i)=>hex.slice(i*2,i*2+2).join(' ')).join('\n');
}
export function validPeachCode(code) {
  const words=code.split(/\s+/),n=(parseInt(words[1],16)-3)/2;
  if(words[0]!=='C211D0A4'||!Number.isInteger(n)||n<1||n>10||words.length!==8+4*n)return false;
  const items=Array(10).fill('random');let previous=11;
  for(let i=0;i<n;i++){
    const targets=parseInt(words[5+2*i],16)-0x2C140000;
    const item=Object.entries(itemIds).find(([,id])=>id===parseInt(words[6+2*n+2*i],16)-0x38C00000)?.[0];
    if(!Number.isInteger(targets)||targets<1||targets>=previous||!item)return false;
    items[10-targets]=item;previous=targets;
  }
  return peachCode(items)===code;
}
