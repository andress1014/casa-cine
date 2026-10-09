// Offline artwork renderer. Run after changing app icon or visible name.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const icon = await readFile(new URL('../android-tv/app/src/main/res/drawable/app_icon.xml',import.meta.url),'utf8');
const paths = [...icon.matchAll(/<path\s+([^>]+)\/>/g)].map(([,attributes]) => '<path '+attributes.replaceAll('android:fillColor','fill').replaceAll('android:strokeColor','stroke').replaceAll('android:strokeWidth','stroke-width').replaceAll('android:pathData','d')+'/>').join('');
const browser = await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:320,height:180},deviceScaleFactor:1});
 await page.setContent(`<html><body style="margin:0;background:#182113;font-family:Arial,sans-serif;color:#d8fc70;width:320px;height:180px;display:flex;align-items:center;gap:20px;padding:25px;box-sizing:border-box"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="80" height="80" style="flex-shrink:0">${paths}</svg><div><div style="font-size:10px;letter-spacing:3px;color:#a3b58d;margin-bottom:8px">TV · GUARIDA</div><div style="font-size:28px;font-weight:900;letter-spacing:-1px">palomita.</div><div style="font-size:10px;color:#efefdf;letter-spacing:1px;margin-top:9px">TU CINE EN CASA</div></div></body></html>`);
 await page.screenshot({path:new URL('../android-tv/app/src/main/res/drawable/tv_banner.png',import.meta.url).pathname});
} finally {await browser.close();}
