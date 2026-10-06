import {base64,encodePixels,MEDIA_BUDGET} from './media.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
function waitEvent(element,event,signal){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('The media could not be decoded in time.')),15000);const finish=error=>{clearTimeout(timer);element.removeEventListener(event,done);element.removeEventListener('error',bad);signal?.removeEventListener('abort',abort);error?reject(error):resolve();},done=()=>finish(),bad=()=>finish(Error('This browser cannot decode this file. Try PNG, JPG, GIF, MP4 or WebM.')),abort=()=>finish(new DOMException('Cancelled','AbortError'));element.addEventListener(event,done,{once:true});element.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',abort,{once:true});});}
export async function importMedia(file,{background=false,start=0,duration=4,maxWidth=1024,budget=MEDIA_BUDGET,signal,onProgress=()=>{}}={}){
 if(!file||file.size>80*1024*1024)throw Error('Choose an image or a short video under 80 MB.');
 const ext=file.name.split('.').at(-1).toLowerCase(),gif=ext==='gif'||file.type==='image/gif',video=file.type.startsWith('video/')||['mp4','webm'].includes(ext);
 if(!video&&!gif&&!['png','jpg','jpeg','webp'].includes(ext))throw Error('Choose a PNG, JPG, WebP, GIF, MP4 or WebM file.');
 signal?.throwIfAborted();let source,decoder,url,frames=1,width,height,frameTicks=6,gifFrames=[],cleanup=()=>{};
 try{
  if(video){
   source=document.createElement('video');source.muted=true;source.preload='auto';source.playsInline=true;url=URL.createObjectURL(file);const ready=waitEvent(source,'loadeddata',signal);source.src=url;await ready;
   if(!Number.isFinite(source.duration)||source.duration<=0)throw Error('The video has no readable duration.');
   if(start>=source.duration)throw Error('The clip starts after the end of the video.');duration=Math.min(duration,source.duration-start);frames=Math.max(1,Math.min(120,Math.ceil(duration*10)));width=source.videoWidth;height=source.videoHeight;
  }else if(gif){
   if(typeof ImageDecoder==='undefined')throw Error('GIF animation needs a recent Chrome or Edge browser. You can also import an MP4/WebM loop.');
   decoder=new ImageDecoder({data:await file.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;const track=decoder.tracks.selectedTrack;
   if(track.frameCount>1200)throw Error('Choose a shorter GIF (at most 1,200 source frames).');
   let time=0;for(let i=0;i<track.frameCount;i++){signal?.throwIfAborted();const {image}=await decoder.decode({frameIndex:i});width=image.displayWidth;height=image.displayHeight;if(!width||!height||width*height>64*1024*1024){image.close();throw Error('Choose media below 64 megapixels.');}const d=Math.max(.01,(image.duration||100000)/1e6);gifFrames.push({index:i,time,end:time+d});time+=d;image.close();if(time>start+duration)break;}
   if(start>=time)throw Error('The clip starts after the end of the GIF.');duration=Math.min(duration,time-start);frames=Math.max(1,Math.min(120,Math.ceil(duration*10)));
  }else{source=await createImageBitmap(file);cleanup=()=>source.close();width=source.width;height=source.height;}
  if(!width||!height||width*height>64*1024*1024)throw Error('Choose media below 64 megapixels.');
  const format=background?'CMPR':'RGBA8',bytesPerPixel=format==='CMPR'?.5:4;
  const scale=Math.min(1,maxWidth/Math.max(width,height),Math.sqrt(budget/(width*height*frames*bytesPerPixel)));
  const w=Math.floor(width*scale/8)*8,h=Math.floor(height*scale/8)*8;
  if(w<8||h<8||Math.min(w,h)<32&&frames>1)throw Error('Not enough texture memory. Remove an unused texture or shorten this loop.');
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true}),encoded=[];
  for(let i=0;i<frames;i++){
   signal?.throwIfAborted();let picture=source,close;
   if(video){const time=Math.min(source.duration-.001,start+i/10);if(Math.abs(source.currentTime-time)>.001){const ready=waitEvent(source,'seeked',signal);source.currentTime=time;await ready;}}
   else if(gif){const time=start+i/10,k=gifFrames.find(f=>time<f.end)||gifFrames.at(-1);const result=await decoder.decode({frameIndex:k.index});picture=result.image;close=()=>picture.close();}
   ctx.clearRect(0,0,w,h);if(background){ctx.fillStyle='#101820';ctx.fillRect(0,0,w,h);}ctx.drawImage(picture,0,0,w,h);close?.();
   encoded.push(base64(encodePixels(ctx.getImageData(0,0,w,h).data,w,h,format)));onProgress({current:i+1,total:frames,width:w,height:h});await tick();
  }
  signal?.throwIfAborted();return {id:'media-'+crypto.randomUUID(),name:file.name.slice(0,80).replace(/[\x00-\x1f]/g,' '),width:w,height:h,format,frames:encoded,frameTicks};
 }finally{cleanup();decoder?.close();if(video&&source){source.removeAttribute('src');source.load();}if(url)URL.revokeObjectURL(url);}
}
