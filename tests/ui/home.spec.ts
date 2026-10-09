import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

test('Guarida organiza archivos compartidos y módulos conservan navegación',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading',{name:/Todo lo tuyo/})).toBeVisible();
  await page.screenshot({path:'artifacts/guarida-home.png',fullPage:true});
  await page.getByRole('button',{name:'Ordenar mi rincón'}).click(); await expect(page).toHaveURL(/\/archivos$/);
  await page.getByRole('button',{name:'Nueva carpeta'}).click(); await page.getByRole('textbox',{name:'Nombre de carpeta'}).fill('Mi rincón');
  await page.getByRole('button',{name:'Guardar',exact:true}).click(); await expect(page.getByRole('button',{name:'Abrir carpeta Mi rincón'})).toBeVisible();
  await page.getByRole('button',{name:'Abrir carpeta Mi rincón'}).click();
  await page.getByRole('button',{name:'Subir archivos',exact:true}).click();
  mkdirSync('artifacts',{recursive:true});const file=path.resolve('artifacts/apuntes.txt'); writeFileSync(file,'Notas de mi casa.');
  await page.locator('input[type=file]').setInputFiles(file); await page.getByRole('button',{name:'Guardar archivos'}).click();
  await expect(page.locator('.upload-item small').filter({hasText:'Guardado en casa'})).toBeVisible(); await page.getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page.getByRole('button',{name:'apuntes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Detalles de apuntes.txt'}).click(); await page.getByRole('textbox',{name:'Nombre',exact:true}).fill('Apuntes de casa');
  await page.getByRole('combobox',{name:'Guardar en'}).selectOption(''); await page.getByRole('button',{name:'Guardar cambios'}).click(); await expect(page.getByRole('dialog',{name:'Tu archivo'})).not.toBeVisible();
  await page.getByRole('textbox',{name:'Buscar archivos'}).fill('Apuntes de casa'); await expect(page.getByRole('button',{name:'Apuntes de casa',exact:true})).toBeVisible();
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('link',{name:'Descargar Apuntes de casa.txt'}).click(); const download=await downloadPromise; expect(download.suggestedFilename()).toBe('Apuntes de casa.txt');
  await page.screenshot({path:'artifacts/guarida-files.png',fullPage:true});
  page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'Detalles de Apuntes de casa.txt'}).click(); await page.getByRole('button',{name:'Eliminar de casa'}).click();
  await expect(page.getByRole('button',{name:'Apuntes de casa',exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Gaming Pronto',exact:true}).click(); await expect(page.getByRole('heading',{name:/Presiona futuro/})).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/archivos$/); expect(errors).toEqual([]);
});

test('inicio y archivos caben en móvil y enlaces directos sobreviven recarga',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const url of ['/','/archivos','/gaming']) { await page.goto(url); await expect(page.locator('.topbar')).toBeVisible(); await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); }
  await page.goto('/'); await page.screenshot({path:'artifacts/guarida-mobile.png',fullPage:true});
});
