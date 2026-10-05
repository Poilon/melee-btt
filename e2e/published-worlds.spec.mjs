import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const published=JSON.parse(await readFile(new URL('../web/editor/published-levels.json',import.meta.url)));
test('a fresh editor opens the published level and exports the full published set',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/editor');
 await expect(page.locator('#stage')).toBeVisible();await expect(page.locator('#loading')).toBeHidden({timeout:30000});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ttrc-editor-v1:Pk')));expect(saved).toEqual(published.projects.find(p=>p.stage==='Pk'));
 const download=page.waitForEvent('download');await page.locator('#export-all').click();const file=await download;
 const pack=JSON.parse(await readFile(await file.path(),'utf8'));expect(pack.projects).toEqual(published.projects);expect(errors).toEqual([]);
});
