import {test,expect} from '@playwright/test';
test('original Warp Star is visible and placeable in every level, including Onett',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/editor');
 await expect(page.locator('#loading')).toBeHidden({timeout:30000});
 for(const stage of ['Kb','Ns','Ic','Sk','Fx']){
  await page.selectOption('#stage',stage);await expect(page.locator('#loading')).toBeHidden();
  const card=page.locator('.piece-card').filter({hasText:'Warp Star'});await expect(card).toBeVisible();
  await card.click();
  const p=await page.evaluate(stage=>JSON.parse(localStorage.getItem('ttrc-editor-v1:'+stage)),stage);
  expect(p.nativeActors.at(-1)).toMatchObject({kind:29,name:'Warp Star',x:p.spawn[0]+40,y:p.spawn[1]+25});
  if(stage==='Kb'){expect(p.nativeActors.filter(a=>a.kind===29)).toHaveLength(2);await page.screenshot({path:'build/warp-star/editor.png'});}
 }
 expect(errors).toEqual([]);
});
