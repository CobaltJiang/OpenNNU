import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {versionWebAssets} from '../scripts/web-assets.mjs';

test('发布版本贯穿 HTML、CSS 和模块依赖，策略更新后旧缓存不会复用',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opennnu-assets-'));
  try{
    const output=join(root,'dist');
    await Promise.all([mkdir(join(root,'assets')),mkdir(join(root,'upload-service/lib'),{recursive:true}),mkdir(join(output,'assets'),{recursive:true})]);
    await writeFile(join(root,'assets/app.js'),"import {hint} from './uploads.js';");
    await writeFile(join(root,'assets/uploads.js'),"export {hint} from '../upload-service/lib/upload-policy.mjs';");
    await writeFile(join(root,'assets/style.css'),'body{}');
    await writeFile(join(root,'upload-service/lib/upload-policy.mjs'),"export const hint='90 MB';");
    const html='<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/style.css">';
    await writeFile(join(output,'index.html'),html);
    const first=await versionWebAssets(root,output);
    assert.match(await readFile(join(output,'index.html'),'utf8'),new RegExp(`app.js\\?v=${first}`));
    assert.ok((await readFile(join(output,'assets/app.js'),'utf8')).includes(`./uploads.js?v=${first}`));
    assert.ok((await readFile(join(output,'assets/uploads.js'),'utf8')).includes(`./upload-policy.js?v=${first}`));
    assert.ok(!(await readFile(join(output,'assets/uploads.js'),'utf8')).includes('../upload-service'));
    assert.match(await readFile(join(output,'assets/upload-policy.js'),'utf8'),/90 MB/);
    await writeFile(join(root,'upload-service/lib/upload-policy.mjs'),"export const hint='new policy';");
    await writeFile(join(output,'index.html'),html);
    const next=await versionWebAssets(root,output);assert.notEqual(first,next);
    assert.ok((await readFile(join(output,'assets/app.js'),'utf8')).includes(`./uploads.js?v=${next}`));
  }finally{await rm(root,{recursive:true,force:true});}
});
