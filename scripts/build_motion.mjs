// Developer tool only. Releases carry the compiled payload; no compiler is needed to play.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const source=new URL('../src/gecko/target-motion.s',import.meta.url),destination=new URL('../src/gecko/target-motion.json',import.meta.url);
const temp=mkdtempSync(join(tmpdir(),'ttrc-motion-'));
try{
 const object=join(temp,'motion.o'),binary=join(temp,'motion.bin');
 execFileSync(process.env.PPC_AS||'powerpc-linux-gnu-as',['-mgekko','-o',object,source.pathname]);
 execFileSync(process.env.PPC_OBJCOPY||'powerpc-linux-gnu-objcopy',['-O','binary','-j','.text',object,binary]);
 const bytes=readFileSync(binary),words=Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32BE(i*4).toString(16).toUpperCase().padStart(8,'0'));
 if(words.at(-1)!=='8001002C')throw Error('Missing displaced instruction');
 writeFileSync(destination,JSON.stringify({sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),hook:'C22D85D8',original:'8001002C',words},null,2)+'\n');
 console.log(`Compiled target motion: ${bytes.length} bytes`);
}finally{rmSync(temp,{recursive:true,force:true});}
