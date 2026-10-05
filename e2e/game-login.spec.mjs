import {test,expect} from '@playwright/test';
const origin='http://localhost:4319';
async function start(request){const r=await request.post(origin+'/api/game/connect/start',{data:{}});expect(r.status()).toBe(200);return r.json();}
async function poll(request,device){return request.post(origin+'/api/game/connect/poll',{data:{id:device.id,deviceSecret:device.deviceSecret}});}
test('browser signup connects Dolphin automatically; an existing browser account needs one click',async({page,request})=>{
 const device=await start(request),username='web_'+Date.now().toString(36),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(device.url);await expect(page.getByLabel('Username')).toBeVisible();await expect(page).toHaveURL(origin+'/login.html');
 await expect(page.getByText(/connection code|check that both windows|companion/i)).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Create an account',exact:true}).click();
 await page.getByLabel('Username').fill(username);await page.getByLabel('Password',{exact:true}).fill('Browser test password 123');
 await page.getByRole('button',{name:'Create account and connect'}).click();await expect(page.getByRole('heading',{name:'Connected',exact:true})).toBeVisible();
 const first=await(await poll(request,device)).json();expect(first.status).toBe('connected');expect(first.playerFile.slug).toBe(username);
 await page.screenshot({path:'build/online-menu/browser-connected.png',fullPage:true});
 const second=await start(request);await page.goto(second.url);await expect(page.getByRole('button',{name:'Continue as '+username})).toBeVisible();
 expect((await(await poll(request,second)).json()).status).toBe('pending');await page.getByRole('button',{name:'Continue as '+username}).click();
 await expect(page.getByRole('heading',{name:'Connected',exact:true})).toBeVisible();expect((await(await poll(request,second)).json()).playerFile.id).toBe(first.playerFile.id);
 const third=await start(request);await page.goto(third.url);await page.getByRole('button',{name:'Use another account'}).click();await expect(page.getByLabel('Username')).toBeVisible();
 await page.getByLabel('Username').fill(username);await page.getByLabel('Password',{exact:true}).fill('bad password');await page.getByRole('button',{name:'Sign in and connect'}).click();await expect(page.getByRole('alert')).toContainText('incorrect');
 await page.getByLabel('Password',{exact:true}).fill('Browser test password 123');await page.getByRole('button',{name:'Sign in and connect'}).click();await expect(page.getByRole('heading',{name:'Connected',exact:true})).toBeVisible();
 expect((await(await poll(request,third)).json()).playerFile.id).toBe(first.playerFile.id);expect(errors).toEqual([]);
});
test('cancelled and missing links explain how to restart; mobile form stays within the viewport',async({page,request})=>{
 const device=await start(request);await page.setViewportSize({width:390,height:844});await page.goto(device.url);await expect(page.getByLabel('Username')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'build/online-menu/browser-mobile.png',fullPage:true});
 await request.post(origin+'/api/game/connect/cancel',{data:{id:device.id,deviceSecret:device.deviceSecret}});await page.reload();await expect(page.getByRole('alert')).toContainText('expired');await expect(page.getByLabel('Username')).toBeHidden();
 await page.goto(origin+'/login.html');await expect(page.getByRole('alert')).toContainText('Select Log in in Custom Melee BTT Dolphin');
});
