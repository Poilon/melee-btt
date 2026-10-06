import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{encodePixels,decodePixels,validateMedia,mediaBytes,MEDIA_BUDGET,base64}from'../web/editor/media.js';
import{validateProject,clone,History,addPiece,moveSelection}from'../web/editor/model.js';
const pixels=Uint8Array.from({length:8*8*4},(_,i)=>[255,64,8,i%8?255:0][i%4]);
const media={id:'test-media',name:'Texture',width:8,height:8,format:'RGBA8',frameTicks:6,frames:[base64(encodePixels(pixels,8,8,'RGBA8'))]};
const piece={id:'custom-test',name:'My block',kind:'solid',media:media.id,width:32,height:24,mapping:'repeat'};
test('GX RGBA8 round-trips every channel and alpha; CMPR is bounded and opaque',()=>{
 assert.deepEqual([...decodePixels(encodePixels(pixels,8,8,'RGBA8'),8,8,'RGBA8')],[...pixels]);
 const input=new Uint8Array(8*8*4);for(let i=0;i<input.length;i+=4)input.set([240,80,24,255],i);
 const encoded=encodePixels(input,8,8,'CMPR');assert.equal(encoded.length,32);const decoded=decodePixels(encoded,8,8,'CMPR');
 for(let i=0;i<decoded.length;i++)assert(Math.abs(decoded[i]-input[i])<9);
});
test('media validation rejects corruption, duplicate identifiers, broken references and excessive native memory',()=>{
 const p={media:[media],customPieces:[piece],background:{media:media.id,bounds:[-300,200,300,-100]},decorations:[]};assert.deepEqual(validateMedia(p),[]);
 for(const change of [p=>p.media[0].frames[0]='AAAA',p=>p.media.push(clone(media)),p=>p.customPieces[0].media='missing',p=>p.background.bounds[2]=-400,p=>p.media[0].frameTicks=0,p=>p.media[0].width=9,p=>p.media[0].frames[0]='!'.repeat(p.media[0].frames[0].length)]){const bad=clone(p);change(bad);assert(validateMedia(bad).length);}
 const big={...media,width:1024,height:1024,frames:['A'.repeat(Math.ceil(1024*1024*4/3)*4),'A'.repeat(Math.ceil(1024*1024*4/3)*4)]};assert(mediaBytes(big)>MEDIA_BUDGET);assert(validateMedia({media:[big]}).length);
});
test('custom solid, platform and decoration survive export, undo and browser-side validation',async()=>{
 const b=JSON.parse(await readFile(new URL('../web/editor/data/Fx.json',import.meta.url))),p=clone(b.project);
 p.media=[media];p.customPieces=[piece,{...piece,id:'custom-platform',kind:'platform'},{...piece,id:'custom-decor',kind:'decoration'}];
 const h=new History(p);const solid=addPiece(p,b,piece.id,-320,150);addPiece(p,b,'custom-platform',-320,180);const decor=addPiece(p,b,'custom-decor',-300,160);moveSelection(p,decor,12,4,b);
 assert.deepEqual(p.decorations[0],{piece:'custom-decor',x:-288,y:164,width:32,height:24});assert.equal(solid.type,'solid');
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p)),b).errors,[]);h.push(p);assert.equal(h.undo().decorations,undefined);assert.equal(h.redo().decorations[0].x,-288);
});
test('local playtest accepts embedded textures beyond the former 512 KB limit',async t=>{
 const {createApp}=await import('../server/app.mjs');let received;
 const app=createApp({launchCustomStage:async(id,p)=>{received=p;return {status:'started'};}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const origin=`http://127.0.0.1:${app.address().port}`,p={stage:'Mr',media:[{id:'texture',name:'Fond étoilé',width:1024,height:1024,format:'CMPR',frameTicks:6,frames:[Buffer.alloc(524288,33).toString('base64')]}]};
 const response=await fetch(origin+'/api/editor/test',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-TTRC-Action':'launch'},body:JSON.stringify(p)});assert.equal(response.status,200);assert.deepEqual(received,p);
});
