import {test,expect} from '@playwright/test';
test('public worlds show per-character records, loading, replay download, and no registration',async({page})=>{
 const courses=[{id:'a'.repeat(64),character:'fox',name:'Lylat Flight Deck'},{id:'b'.repeat(64),character:'luigi',name:'Haunted Library'}];
 await page.route('**/api/worlds/catalog',r=>r.fulfill({json:{format:'ttrc-worlds-v1',courses}}));
 await page.route('**/api/worlds/leaderboard?*',async r=>{await new Promise(resolve=>setTimeout(resolve,250));await r.fulfill({json:{total:r.request().url().includes(courses[0].id)?1:0,rows:r.request().url().includes(courses[0].id)?[{rank:1,username:'a<b',playerId:'c'.repeat(64),id:'00000000-0000-0000-0000-000000000001',frames:733}]:[]}});});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:4319');
 await expect(page.locator('.skeleton').first()).toBeVisible();await expect(page.locator('#rows')).toContainText('a<b');await expect(page.locator('#rows')).toContainText('0:12.21');
 await expect(page.locator('#rows a')).toHaveAttribute('href',/worlds\/replay\?course=/);await expect(page.getByRole('button',{name:'Create account'})).toHaveCount(0);
 await page.getByRole('button',{name:'Luigi',exact:true}).click();await expect(page.locator('#status')).toHaveText('Loading records…');await expect(page.locator('#status')).toHaveText('No records yet.');await expect(page.locator('#level-name')).toHaveText('Haunted Library');
 await page.screenshot({path:'build/online-worlds/website-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Target Test',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('total time shows completion and character navigation ignores a slow earlier request',async({page})=>{
 const courses=[{id:'a'.repeat(64),character:'fox',name:'Flight Deck'},{id:'b'.repeat(64),character:'luigi',name:'Manor'}];let release;
 await page.route('**/api/worlds/catalog',r=>r.fulfill({json:{courses}}));
 await page.route('**/api/worlds/leaderboard?*',async r=>{if(r.request().url().includes(courses[0].id))await new Promise(res=>{release=res;});await r.fulfill({json:{total:0,rows:[]}}).catch(()=>{});});
 await page.route('**/api/worlds/total?*',r=>r.fulfill({json:{total:1,requiredCharacters:26,rows:[{rank:1,username:'complete',frames:36000,completed:26}],inProgress:[{username:'partial',frames:null,completed:4}]}}));
 await page.goto('http://localhost:4319');await expect(page.locator('#level-name')).toHaveText('Flight Deck');
 await page.getByRole('button',{name:'Luigi',exact:true}).click();await expect(page.locator('#status')).toHaveText('No records yet.');release();
 await page.getByRole('button',{name:'Total time',exact:true}).click();await expect(page.locator('#rows')).toContainText('10:00.00');await expect(page.locator('#rows')).toContainText('4 / 26');await expect(page.locator('#rows a')).toHaveCount(0);await expect(page.locator('#status')).toContainText('Complete all 26');
 await page.screenshot({path:'build/latest-levels/total-website.png',fullPage:true});
});
