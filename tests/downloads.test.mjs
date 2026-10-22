import test from 'node:test';
import assert from 'node:assert/strict';
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
