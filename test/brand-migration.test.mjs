import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {migrateLauncher} from '../desktop/brand-migration.mjs';
test('an installed update renames its managed companion without changing player data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'brand-update-'));
 try{await mkdir(join(root,'desktop'));await mkdir(join(root,'User'));await writeFile(join(root,'release.json'),'{}');await writeFile(join(root,'User/player.json'),'private fixture');const script=await readFile('desktop/companion.vbs','utf8');await writeFile(join(root,'desktop/companion.vbs'),script);await writeFile(join(root,'TTRC Companion.vbs'),script.replaceAll('Custom Melee BTT','TTRC'));
 await migrateLauncher(root);await migrateLauncher(root);assert.equal(await readFile(join(root,'Custom Melee BTT Companion.vbs'),'utf8'),script);await assert.rejects(access(join(root,'TTRC Companion.vbs')));assert.equal(await readFile(join(root,'User/player.json'),'utf8'),'private fixture');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('launcher migration leaves an unrelated script alone',async()=>{
 const root=await mkdtemp(join(tmpdir(),'brand-update-'));try{await writeFile(join(root,'release.json'),'{}');await writeFile(join(root,'TTRC Companion.vbs'),'user-authored');await migrateLauncher(root);assert.equal(await readFile(join(root,'TTRC Companion.vbs'),'utf8'),'user-authored');}finally{await rm(root,{recursive:true,force:true});}
});
