import {randomInt} from 'node:crypto';
import {createCloudHandler} from './backend.mjs';
import {createLifecycle} from './lifecycle.mjs';
const pointerPath='challenges/current.json';
const packagePath=id=>`challenge-packages/${id}.json`;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function createChallengeManager({store,fallback,generate,endsAt,now=Date.now}) {
  async function current(){
    const pointer=await store.get(pointerPath);
    if(!pointer)return fallback;
    const pack=await store.get(packagePath(pointer.id));
    if(!pack)throw new Error('Current challenge is unavailable.');
    return pack;
  }
  return {
    current,
    async get(id){
      if(id===fallback.manifest.id)return fallback;
      if(!/^[a-f0-9]{64}$/.test(id||''))return null;
      if((await current()).manifest.id!==id&&!await store.get(`challenges/${id}/closed.json`))return null;
      return store.get(packagePath(id));
    },
    async list(){
      const packs=await Promise.all((await store.list('challenge-packages/')).map(f=>store.get(f.pathname)));
      const active=await current();
      const published=(await Promise.all(packs.filter(Boolean).map(async p=>p.manifest.id===active.manifest.id||await store.get(`challenges/${p.manifest.id}/closed.json`)?p:null))).filter(Boolean);
      const unique=[...new Map([fallback,...published,active].map(p=>[p.manifest.id,p])).values()];
      return (await Promise.all(unique.map(async p=>{
        const state=await createLifecycle({store,challengeId:p.manifest.id,endsAt:p.manifest.id===fallback.manifest.id?endsAt:null,now}).phase();
        return {id:p.manifest.id,seed:p.manifest.rules.seed,publishedAt:p.publishedAt||null,startedAt:p.publishedAt||null,endedAt:state.closedAt,closed:state.timesRevealed,current:p.manifest.id===active.manifest.id};
      }))).sort((a,b)=>Number(b.current)-Number(a.current)||(b.publishedAt||'').localeCompare(a.publishedAt||''));
    },
    async regenerate({challengeId,seed,confirm},reviewer){
      if(confirm!=='NEW CHALLENGE')throw fail('Confirm before publishing a new challenge.',400);
      if(seed!==undefined&&(!Number.isSafeInteger(seed)||seed<1))throw fail('Seed must be a positive safe integer.',400);
      const version=await store.readVersion(pointerPath),old=await current();
      if(old.manifest.id!==challengeId)throw fail('The current challenge changed. Refresh and try again.');
      const state=await createLifecycle({store,challengeId,endsAt:old.manifest.id===fallback.manifest.id?endsAt:null,now}).phase();
      if(!state.timesRevealed)throw fail('Close and reveal the current challenge before starting another.');
      const chosen=seed??randomInt(1,2147483647);
      if(chosen===old.manifest.rules.seed)throw fail('Choose a different seed.',400);
      let generated;
      try{generated=await generate({...old.manifest.rules,seed:chosen});}
      catch{throw fail('This seed could not be generated safely. Try another seed.',422);}
      const {manifest,gecko}=generated;
      if(await store.get(packagePath(manifest.id))||manifest.id===fallback.manifest.id)throw fail('This seed has already been used with these rules. Choose another.');
      const oldPath=packagePath(old.manifest.id);
      try{await store.put(oldPath,{manifest:old.manifest,gecko:old.gecko,publishedAt:old.publishedAt||null});}catch(error){if(!await store.get(oldPath))throw error;}
      // Keep the ended challenge closed even if its deadline came from environment settings.
      try{await store.put(`challenges/${challengeId}/closed.json`,{at:state.closedAt,reviewer});}catch(error){if(!await store.get(`challenges/${challengeId}/closed.json`))throw error;}
      const publishedAt=new Date(now()).toISOString();
      try{await store.put(packagePath(manifest.id),{manifest,gecko,publishedAt});}catch{throw fail('This seed was just generated. Refresh and try another seed.');}
      const next={id:manifest.id,publishedAt,publishedBy:reviewer};
      let won=false;
      if(version)won=await store.writeVersion(pointerPath,next,version.etag);
      else try{await store.put(pointerPath,next);won=true;}catch{}
      if(!won)throw fail('Another challenge was published at the same time. Refresh to see it.');
      return {challenge:manifest,previousId:challengeId,publishedAt};
    },
  };
}
export function createHostedHandler({store,fallback,generate,...options}){
  const manager=createChallengeManager({store,fallback,generate,...options}),handlers=new Map();
  return async(req,res)=>{
    try{
      const url=new URL(req.url,options.origin),route=url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'');
      const send=(status,value)=>{res.setHeader('Cache-Control','no-store');res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
      if(req.method==='GET'&&route==='challenge/current')return send(200,await manager.current());
      if(req.method==='GET'&&route==='challenges')return send(200,{challenges:await manager.list()});
      const id=url.searchParams.get('challenge');
      const pack=id?await manager.get(id):await manager.current();
      if(!pack)return send(404,{error:'Challenge not found.'});
      if(req.method==='GET'&&route==='challenge/package')return send(200,pack);
      if(!handlers.has(pack.manifest.id)){
        if(handlers.size>=8)handlers.delete(handlers.keys().next().value);
        handlers.set(pack.manifest.id,createCloudHandler({...options,endsAt:pack.manifest.id===fallback.manifest.id?options.endsAt:null,store,challenge:pack.manifest,gecko:pack.gecko,challengeManager:manager}));
      }
      return handlers.get(pack.manifest.id)(req,res);
    }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Challenge temporarily unavailable.'}));}
  };
}
