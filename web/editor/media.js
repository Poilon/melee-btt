// Portable media: the editor previews the exact GX pixels embedded in the DAT.
export const MEDIA_BUDGET=4*1024*1024;
export const PROJECT_LIMIT=8*1024*1024;
export const PACK_LIMIT=128*1024*1024;
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s);
export const mediaBytes=m=>m.width*m.height*(m.format==='CMPR'?.5:4)*m.frames.length;
export function validateMedia(p){
 const errors=[],assets=p.media||[],pieces=p.customPieces||[],decorations=p.decorations||[];
 if(!Array.isArray(assets)||assets.length>32||!Array.isArray(pieces)||pieces.length>64||!Array.isArray(decorations)||decorations.length>64)return ['Invalid imported media library.'];
 const ids=new Set(),pieceIds=new Set();let bytes=0;
 const name=s=>typeof s==='string'&&s.trim().length>0&&s.length<=80&&!/[\x00-\x1f]/.test(s);
 for(const m of assets){
  if(!m||!validId(m.id)||ids.has(m.id)||!name(m.name)||!['CMPR','RGBA8'].includes(m.format)||![m.width,m.height].every(v=>Number.isInteger(v)&&v>=8&&v<=1024&&v%8===0)||!Array.isArray(m.frames)||!m.frames.length||m.frames.length>120||!Number.isInteger(m.frameTicks)||m.frameTicks<1||m.frameTicks>600){errors.push('Invalid imported texture.');continue;}
  ids.add(m.id);const size=m.width*m.height*(m.format==='CMPR'?.5:4),encoded=Math.ceil(size/3)*4;
  if(m.frames.some(f=>typeof f!=='string'||f.length!==encoded||!/^[A-Za-z0-9+/]*={0,2}$/.test(f)||((f.length*3/4)-(f.endsWith('==')?2:f.endsWith('=')?1:0))!==size))errors.push('Imported texture data is damaged.');
  bytes+=mediaBytes(m);
 }
 if(bytes>MEDIA_BUDGET)errors.push('Imported textures exceed the 4 MB game memory budget. Use a shorter loop or a smaller texture.');
 const dim=v=>typeof v==='number'&&Number.isFinite(v)&&v>=2&&v<=800;
 for(const c of pieces){if(!c||!validId(c.id)||!c.id.startsWith('custom-')||pieceIds.has(c.id)||!ids.has(c.media)||!name(c.name)||!['solid','platform','decoration'].includes(c.kind)||!['repeat','mirror','stretch'].includes(c.mapping)||!dim(c.width)||!dim(c.height))errors.push('Invalid custom object.');else pieceIds.add(c.id);}
 for(const d of decorations)if(!d||!pieces.some(c=>c.id===d.piece&&c.kind==='decoration')||![d.x,d.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=2000)||!dim(d.width)||!dim(d.height))errors.push('Invalid custom decoration.');
 if(p.background){const b=p.background;if(!ids.has(b.media)||!Array.isArray(b.bounds)||b.bounds.length!==4||!b.bounds.every(v=>Number.isFinite(v)&&Math.abs(v)<=2000)||b.bounds[2]-b.bounds[0]<2||b.bounds[1]-b.bounds[3]<2)errors.push('Invalid imported background.');}
 return errors;
}
export function customSkins(p){return (p.customPieces||[]).map(c=>({...c,points:[[0,0],[c.width,0],[c.width,-c.height],[0,-c.height]],height:c.height,fixedHeight:true,material:4,custom:true}));}
export function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
export function unbase64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
const rgb565=(r,g,b)=>((r>>3)<<11)|((g>>2)<<5)|(b>>3);
const color565=n=>[((n>>11)&31)*255/31,((n>>5)&63)*255/63,(n&31)*255/31];
export function encodePixels(rgba,w,h,format){
 if(w%8||h%8||rgba.length!==w*h*4)throw Error('Invalid texture dimensions.');
 const out=new Uint8Array(w*h*(format==='CMPR'?.5:4));let o=0;
 if(format==='RGBA8'){
  for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){for(let j=0;j<16;j++){const p=((y+(j>>2))*w+x+(j&3))*4;out[o+j*2]=rgba[p+3];out[o+j*2+1]=rgba[p];out[o+32+j*2]=rgba[p+1];out[o+33+j*2]=rgba[p+2];}o+=64;}
 }else{
  for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8)for(const [dx,dy]of [[0,0],[4,0],[0,4],[4,4]]){
   const pixels=[];let low=[255,255,255],high=[0,0,0];
   for(let j=0;j<16;j++){const p=((y+dy+(j>>2))*w+x+dx+(j&3))*4,c=[rgba[p],rgba[p+1],rgba[p+2]];pixels.push(c);c.forEach((v,k)=>{low[k]=Math.min(low[k],v);high[k]=Math.max(high[k],v);});}
   let a=rgb565(...high),b=rgb565(...low);if(a===b){if(a<65535)a++;else b--;}if(a<b)[a,b]=[b,a];
   const ca=color565(a),cb=color565(b),colors=[ca,cb,ca.map((v,k)=>(2*v+cb[k])/3),ca.map((v,k)=>(v+2*cb[k])/3)];
   out[o++]=a>>8;out[o++]=a&255;out[o++]=b>>8;out[o++]=b&255;
   for(let k=0;k<4;k++){let bits=0;for(let j=0;j<4;j++){const c=pixels[k*4+j];let best=0,score=Infinity;colors.forEach((v,i)=>{const e=v.reduce((sum,z,n)=>sum+(z-c[n])**2,0);if(e<score){score=e;best=i;}});bits=(bits<<2)|best;}out[o++]=bits;}
  }
 }
 return out;
}
export function decodePixels(bytes,w,h,format){
 const out=new Uint8ClampedArray(w*h*4);let o=0;
 if(format==='RGBA8')for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){for(let j=0;j<16;j++){const p=((y+(j>>2))*w+x+(j&3))*4;out.set([bytes[o+j*2+1],bytes[o+32+j*2],bytes[o+33+j*2],bytes[o+j*2]],p);}o+=64;}
 else for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8)for(const [dx,dy]of [[0,0],[4,0],[0,4],[4,4]]){const a=(bytes[o]<<8)|bytes[o+1],b=(bytes[o+2]<<8)|bytes[o+3],ca=color565(a),cb=color565(b),colors=[ca,cb,ca.map((v,k)=>(2*v+cb[k])/3),ca.map((v,k)=>(v+2*cb[k])/3)];for(let j=0;j<16;j++){const c=colors[(bytes[o+4+(j>>2)]>>(6-(j&3)*2))&3],p=((y+dy+(j>>2))*w+x+dx+(j&3))*4;out.set([...c,255],p);}o+=8;}
 return out;
}
const images=new WeakMap();
export function mediaImage(m,frame=0){if(!m)return null;let cache=images.get(m);if(!cache)images.set(m,cache=new Map());const n=Math.floor(frame/m.frameTicks)%m.frames.length;if(!cache.has(n)){const c=document.createElement('canvas');c.width=m.width;c.height=m.height;const pixels=decodePixels(unbase64(m.frames[n]),m.width,m.height,m.format);c.getContext('2d').putImageData(new ImageData(pixels,m.width,m.height),0,0);cache.set(n,c);if(cache.size>4)cache.delete(cache.keys().next().value);}return cache.get(n);}
export function drawMedia(ctx,m,poly,screen,frame=0,mapping='stretch',repeatWidth=64){
 const img=mediaImage(m,frame);if(!img)return;const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.max(...ys),b=Math.min(...ys),[left,top]=screen([l,t]),[right,bottom]=screen([r,b]);
 ctx.save();ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(...screen(p)):ctx.moveTo(...screen(p)));ctx.closePath();ctx.clip();
 const width=mapping==='stretch'?r-l:repeatWidth;
 for(let x=l,i=0;x<r-1e-6;x+=width,i++){const span=Math.min(width,r-x),[px]=screen([x,t]),[ex]=screen([x+span,t]);ctx.save();const flip=mapping==='mirror'&&i%2;ctx.translate(flip?ex:px,top);if(flip)ctx.scale(-1,1);const sx=flip?img.width*(1-span/width):0;ctx.drawImage(img,sx,0,img.width*span/width,img.height,0,0,ex-px,bottom-top);ctx.restore();}
 ctx.restore();
}
