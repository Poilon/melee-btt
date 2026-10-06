// IndexedDB handles embedded textures without the small localStorage quota.
let connection,pending=Promise.resolve();
function db(){return connection??=new Promise((resolve,reject)=>{const r=indexedDB.open('custom-melee-btt-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function access(mode,action){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('drafts',mode),request=action(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft storage interrupted.'));});}
export const drafts={
 async get(key){await pending;const stored=await access('readonly',s=>s.get(key));return stored??localStorage.getItem(key);},
 set(key,value){const write=pending.catch(()=>{}).then(()=>access('readwrite',s=>s.put(value,key)));pending=write.catch(()=>{});return write;},
 async remove(key){await pending;await access('readwrite',s=>s.delete(key));localStorage.removeItem(key);}
};
