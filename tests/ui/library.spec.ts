import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ffmpeg: string = require('ffmpeg-static');

test('subida, reproducción, favoritos y persistencia en navegador', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  mkdirSync('artifacts', { recursive: true });
  const file = path.resolve('artifacts/ui-sample.mp4');
  execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=15',
    '-t','12','-c:v','libx264','-pix_fmt','yuv420p',file]);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/cine');
  await expect(page.getByRole('heading',{name:'Tu cartelera'})).toBeVisible();
  await page.screenshot({path:'artifacts/library-empty.png',fullPage:true});
  await page.getByRole('button',{name:'Subir videos',exact:true}).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('textbox',{name:'Título de ui-sample.mp4'}).fill('Nuestro cine de prueba');
  await page.getByRole('button',{name:'Subir videos',exact:true}).last().click();
  await expect(page.getByText('Guardado. Preparando para reproducción.')).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true})).toBeVisible({timeout:30_000});
  await page.getByRole('button',{name:'Agregar a favoritos: Nuestro cine de prueba'}).click();
  await page.getByRole('button',{name:/Mis favoritos/}).click();
  await expect(page.getByRole('heading',{name:'Nuestro cine de prueba',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => element.readyState),{timeout:15_000}).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate((element: HTMLVideoElement) => { element.currentTime = 6; element.pause(); });
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('button',{name:'Quitar de favoritos: Nuestro cine de prueba'})).toBeVisible();
  await page.getByRole('button',{name:/Seguir viendo/}).click();
  await expect(page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true}).click();
  await expect.poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime),{timeout:15_000}).toBeGreaterThanOrEqual(5.9);
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.getByRole('button',{name:/Mi videoclub/}).click();
  await page.screenshot({path:'artifacts/library-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('vista móvil: sin desbordamiento, navegación y búsqueda', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/cine');
  await expect(page.getByRole('heading',{name:'Tu cartelera'})).toBeVisible();
  const widths = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole('textbox',{name:'Buscar videos'}).fill('does-not-exist');
  await expect(page.getByRole('heading',{name:'Ese plan todavía no está aquí'})).toBeVisible();
  await page.getByRole('button',{name:'Limpiar búsqueda'}).click();
  await page.getByRole('button',{name:'Abrir menú'}).click();
  await page.getByRole('button',{name:/Mis favoritos/}).click();
  await expect(page.getByRole('heading',{name:'Tus favoritos'})).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);
  await page.screenshot({path:'artifacts/library-mobile.png',fullPage:true,animations:'disabled'});
});

test('modo TV permite navegación con flechas y conexión muestra dirección local', async ({ page }) => {
  await page.goto('/cine');
  await page.getByRole('button',{name:'Modo TV',exact:true}).click();
  await expect(page.locator('.app-shell')).toHaveClass(/tv-mode/);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-tv'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).not.toHaveClass(/tv-mode/);
  await page.getByRole('button',{name:/Conectar dispositivos/}).click();
  await expect(page.getByRole('dialog',{name:'Conecta tu casa'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Dirección para conectar'}).first()).toHaveValue(/^http:\/\//);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('web añade SRT, activa pista y conserva subtítulos tras recarga',async({page})=>{
  await page.goto('/cine'); await page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true}).click();
  await expect(page.locator('video')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'Español.srt',mimeType:'application/octet-stream',buffer:Buffer.from('1\n00:00:00,000 --> 00:00:11,000\nBienvenidos a Palomita\n')});
  await expect(page.getByRole('option',{name:'Español · es'})).toBeAttached({timeout:15000});
  const selector=page.getByRole('combobox',{name:'Subtítulos',exact:true}); await selector.selectOption({label:'Español · es'});
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.textTracks[0]?.mode)).toBe('showing');
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.textTracks[0]?.cues?.length)).toBe(1);
  await page.getByRole('button',{name:'Cerrar',exact:true}).click(); await page.reload(); await page.getByRole('button',{name:'Reproducir Nuestro cine de prueba',exact:true}).click();
  await expect(page.getByRole('option',{name:'Español · es'})).toBeAttached();
  page.once('dialog',dialog=>dialog.accept()); await page.getByRole('combobox',{name:'Subtítulos',exact:true}).selectOption({label:'Español · es'}); await page.getByRole('button',{name:'Eliminar pista'}).click();
  await expect(page.locator('video track')).toHaveCount(0);
});
