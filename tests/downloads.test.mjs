import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {downloadSources} from '../assets/downloads.js';
const site={repository:'https://github.com/CobaltJiang/OpenNNU'},resource={courseId:'mechanics',url:'courses/mechanics/中文 笔记.pdf'};
test('默认不引入第三方镜像，仅提供本站与 GitHub 原始文件',()=>{
  const sources=downloadSources(resource,site);assert.deepEqual(sources.map(x=>x.id),['origin','github']);assert.ok(sources[1].url.startsWith('https://raw.githubusercontent.com/CobaltJiang/OpenNNU/main/'));assert.ok(sources[1].url.includes('%E4%B8%AD'));
});
test('镜像只接受维护者明确启用的 HTTPS 静态根目录，不代理审核接口',()=>{
  const configured={...site,downloads:{preferred:'own-cdn',mirrors:[{id:'own-cdn',label:'自有 CDN',baseURL:'https://cdn.example/opennnu/',enabled:true},{id:'bad',baseURL:'https://user:secret@evil.example',enabled:true},{id:'disabled',baseURL:'https://disabled.example',enabled:false}]}};
  const sources=downloadSources(resource,configured);assert.equal(sources[0].id,'own-cdn');assert.equal(sources.length,3);assert.ok(sources[0].url.startsWith('https://cdn.example/opennnu/courses/'));
  assert.equal(downloadSources({courseId:'mechanics',url:'https://review.example/api/private'},configured).length,1);
  assert.deepEqual(downloadSources({courseId:'mechanics',url:'courses/mechanics/../../secret'},configured),[]);
});

const ghproxy={id:'ghproxy',kind:'github-proxy',label:'ghproxy 镜像',baseURL:'https://ghproxy.net/',enabled:true};
const mirrored={...site,downloads:{preferred:'ghproxy',mirrors:[ghproxy]}};
test('ghproxy 优先且只包装固定仓库公开文件，中文与空格正确编码',()=>{
  const sources=downloadSources(resource,mirrored);
  assert.deepEqual(sources.map(source=>source.id),['ghproxy','origin','github']);
  assert.equal(sources[0].url,`https://ghproxy.net/https://raw.githubusercontent.com/CobaltJiang/OpenNNU/main/courses/mechanics/${encodeURIComponent('中文 笔记.pdf')}`);
  assert.equal(sources[0].kind,'github-proxy');
  for(const url of ['https://review.example/api/admin/private?token=test-only','https://github.com/CobaltJiang/OpenNNU/issues/new','https://review.example/api/uploads/start']){
    const sources=downloadSources({...resource,url},mirrored);assert.equal(sources.length,1);assert.equal(sources[0].id,'origin');
  }
  assert.deepEqual(downloadSources({...resource,url:'courses/other/private.pdf'},mirrored).map(source=>source.id),['origin']);
});

test('禁用镜像或首选源失效时回退本站，保留 GitHub 直链',()=>{
  assert.deepEqual(downloadSources(resource,{...mirrored,downloads:{preferred:'ghproxy',mirrors:[{...ghproxy,enabled:false}]}}).map(source=>source.id),['origin','github']);
  assert.equal(downloadSources(resource,{...mirrored,downloads:{...mirrored.downloads,preferred:'origin'}})[0].id,'origin');
});

test('拒绝任意代理、凭据、嵌套路径和保留源 ID，不产生开放代理',()=>{
  const invalid=[
    ...['https://evil.example/','http://ghproxy.net/','https://user:secret@ghproxy.net/','https://ghproxy.net/?url=private','https://ghproxy.net/#private','https://ghproxy.net/api/','https://ghproxy.net:8443/'].map(baseURL=>({...ghproxy,baseURL})),
    {...ghproxy,id:'origin'},{...ghproxy,id:'github'},{...ghproxy,kind:'unknown'},
  ];
  for(const mirror of invalid)assert.deepEqual(downloadSources(resource,{...mirrored,downloads:{preferred:'ghproxy',mirrors:[mirror]}}).map(source=>source.id),['origin','github']);
  assert.deepEqual(downloadSources(resource,{...mirrored,downloads:{preferred:'ghproxy',mirrors:[ghproxy,ghproxy]}}).map(source=>source.id),['ghproxy','origin','github']);
});

test('生产配置启用 ghproxy，但上传、审核、Issue 与仓库地址不替换成镜像',async()=>{
  const configured=JSON.parse(await readFile(new URL('../data/site.json',import.meta.url),'utf8'));
  assert.equal(configured.downloads.preferred,'ghproxy');assert.equal(downloadSources(resource,configured)[0].id,'ghproxy');
  assert.equal(configured.repository,'https://github.com/CobaltJiang/OpenNNU');
  assert.equal(configured.uploadService,'https://opennnu-upload.undefinedcobalt.chatgpt.site');
  assert.equal(configured.reviewURL,'https://review.cybercobalt.xyz/review');
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');assert.match(app,/ghproxy 下载/);assert.match(app,/备用下载/);assert.match(app,/site\.repository\)}\/issues\/new/);
});
