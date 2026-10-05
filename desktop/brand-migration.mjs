// Older updaters accept only the original launcher filename. Rename that
// managed launcher after a successful update, without touching player data.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export async function migrateLauncher(root){
 try{await readFile(join(root,'release.json'));}catch{return;}
 const old=join(root,'TTRC Companion.vbs'),next=join(root,'Custom Melee BTT Companion.vbs');
 let source;try{source=await readFile(old,'utf8');}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(!source.includes('\\desktop\\native.mjs')||!source.includes(' --open'))return;
 const launcher=await readFile(join(root,'desktop/companion.vbs'));
 try{await writeFile(next,launcher,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 // Only remove a launcher matching the shipped script, or its earlier branding.
 if(source.replaceAll('TTRC','Custom Melee BTT')===launcher.toString('utf8'))await unlink(old);
}
