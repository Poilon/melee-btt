import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const challenge=JSON.parse(await readFile(new URL('../cloud/worlds-first-challenge.json',import.meta.url)));
test('single authored-stage challenge has the exact Paris deadline and closes at that instant',async({page})=>{
 await page.clock.install({time:new Date('2026-12-31T22:59:57Z')});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4319/challenges.html');
 await expect(page.locator('.challenge-card')).toHaveCount(1);await expect(page.getByRole('heading',{name:'First challenge'})).toBeVisible();
 await expect(page.locator('#challenge-end')).toHaveAttribute('datetime','2026-12-31T23:59:59+01:00');expect(Date.parse(await page.locator('#challenge-end').getAttribute('datetime'))).toBe(Date.parse(challenge.endsAt));
 await expect(page.locator('#challenge-state')).toHaveText('Open');await expect(page.locator('body')).toContainText('26 custom stages');
 await expect(page.locator('#seed,#course-grid,#profil')).toHaveCount(0);
 await page.screenshot({path:'build/first-challenge/page-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'build/first-challenge/page-mobile.png',fullPage:true});
 await page.clock.fastForward(2000);await expect(page.locator('#challenge-state')).toHaveText('Ended');await expect(page.locator('#challenge-countdown')).toHaveText('Ended');expect(errors).toEqual([]);
});
test('challenge board scopes catalog, totals, character records and replay links to the fixed level set',async({page})=>{
 const course=challenge.courses[0];
 await page.route('**/api/worlds/catalog?event=first-challenge',r=>r.fulfill({json:{courses:[course],challenge:{...challenge,phase:'open'}}}));
 await page.route('**/api/worlds/total?*',r=>{expect(new URL(r.request().url()).searchParams.get('event')).toBe('first-challenge');return r.fulfill({json:{total:0,rows:[],inProgress:[],requiredCharacters:26}});});
 await page.route('**/api/worlds/leaderboard?*',r=>{expect(new URL(r.request().url()).searchParams.get('event')).toBe('first-challenge');return r.fulfill({json:{total:1,rows:[{rank:1,username:'player',playerId:'b'.repeat(64),id:'00000000-0000-0000-0000-000000000001',frames:120}]}});});
 await page.goto('http://localhost:4319/custom-stages.html?event=first-challenge#total');await expect(page.locator('.intro h1')).toHaveText('First challenge');
 await page.getByRole('button',{name:'Dr. Mario',exact:true}).click();await expect(page.locator('#rows a')).toHaveAttribute('href',/event=first-challenge/);await expect(page.locator('#rows')).toContainText('player');
});
