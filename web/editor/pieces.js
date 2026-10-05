// Rendering uses the same UV rectangle and collision polygon as the compiler.
export function bounds(points){const xs=points.map(v=>v[0]),ys=points.map(v=>v[1]);return [Math.min(...xs),Math.max(...ys),Math.max(...xs),Math.min(...ys)];}
// Horizontal source fractions stay continuous at every join. Only the interior
// repeats; original end caps occur once. Reflections preserve texel density.
export function textureStrips(length,width){
 if(!(length>0&&width>0))return [];
 if(length<=width+1e-8)return [[0,length,0,length/width]];
 const end=.85,interior=.7*width,strips=[[0,end*width,0,end]];
 let x=end*width,extra=length-width;
 while(extra>1e-8){
  const span=Math.min(interior,extra/2),turn=end-span/width;
  strips.push([x,x+span,end,turn],[x+span,x+2*span,turn,end]);
  x+=2*span;extra-=2*span;
 }
 strips.push([x,length,end,1]);return strips;
}
export function drawPiece(ctx,image,source,polygon,artBounds,screen,repeatWidth){
 if(!image){ctx.save();ctx.beginPath();polygon.forEach((p,i)=>i?ctx.lineTo(...screen(p)):ctx.moveTo(...screen(p)));ctx.closePath();ctx.fillStyle='#26322c';ctx.fill();ctx.restore();return;}const [sl,st,sr,sb]=source,[l,t,r,b]=artBounds,[dl,dt,dr,db]=bounds(polygon);
 ctx.save();ctx.beginPath();polygon.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath();ctx.clip();
 const [x,y]=screen([dl,dt]),[xx,yy]=screen([dr,db]);
 const width=repeatWidth>0?repeatWidth:(dr-dl);
 for(const [a,z,u,v]of textureStrips(dr-dl,width)){
  const [px]=screen([dl+a,dt]),[ex]=screen([dl+z,dt]);
  const sx=(sl-l+(sr-sl)*Math.min(u,v))/(r-l)*image.width,sw=(sr-sl)*Math.abs(v-u)/(r-l)*image.width;
  ctx.save();ctx.translate(v<u?ex:px,y);if(v<u)ctx.scale(-1,1);
  ctx.drawImage(image,sx,(t-st)/(t-b)*image.height,sw,(st-sb)/(t-b)*image.height,0,0,ex-px,yy-y);
  ctx.restore();
 }
 ctx.restore();
}
export function platformPolygon(p,skin){const [x,y,w]=p,b=bounds(skin.points),h=skin.fixedHeight?skin.height:skin.height*w/(b[2]-b[0]);const t=y+(skin.walkingInset||0)*h;return [[x,t],[x+w,t],[x+w,t-h],[x,t-h]];}
export function terrain(ctx,base,p,image,screen,sprites={}){
 const skins=new Map(base.pieces.map(s=>[s.id,s]));
 for(const s of p.solids){const skin=skins.get(s.asset);if(skin){const b=bounds(skin.points);drawPiece(ctx,skin.sprite?sprites[skin.sprite]:image,skin.sprite?[0,0,1,-1]:skin.sourceRect,s.points,skin.sprite?[0,0,1,-1]:base.artBounds,screen,b[2]-b[0]);}}
 p.platforms.forEach((platform,i)=>{const skin=skins.get(p.platformAssets[i]);if(skin){const b=bounds(skin.points);drawPiece(ctx,skin.sprite?sprites[skin.sprite]:image,skin.sprite?[0,0,1,-1]:skin.sourceRect,platformPolygon(platform,skin),skin.sprite?[0,0,1,-1]:base.artBounds,screen,skin.sharedTexture?64:skin.sprite?undefined:skin.textureWidth||b[2]-b[0]);}});
}
