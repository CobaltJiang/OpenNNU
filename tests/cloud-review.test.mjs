import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {handleReview,handlePublishJob,validateReview} from '../upload-service/lib/cloud-review.mjs';
import {validateJob} from '../scripts/publish-cloud-resource.mjs';
import {reviewCourses} from '../upload-service/lib/cloud-review.mjs';
const base='https://review.cybercobalt.xyz',id='12345678-1234-4234-8234-123456789abc';
const owner={userId:'owner-subject',email:'owner@example.test'};
const courseList=[{id:'advanced-mathematics-1',name:'高等数学Ⅰ(上)',code:'1006009001'}];
const approved={courseId:'advanced-mathematics-1',title:'测试笔记',type:'课程笔记',year:'2026',source:'测试作者原创',license:'CC0-1.0',rightsBasis:'合成测试授权',origin:'学生原创',answerStatus:'不适用',permissionConfirmed:true,version:0};
test('云端课程索引与正式目录一致，审核页面不依赖 GitHub 网络读取课程',async()=>{
  const courses=JSON.parse(await readFile(new URL('../data/courses.json',import.meta.url),'utf8'));
  assert.deepEqual(await reviewCourses(),courses.map(({id,name,code})=>({id,name,code})));
});
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of(await readdir(new URL('../upload-service/drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL(`../upload-service/drizzle/${name}`,import.meta.url),'utf8'));
  const adapt=(sql,values=[])=>({bind(...args){return adapt(sql,args);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},async run(){return{meta:{changes:sqlite.prepare(sql).run(...values).changes}};}});
  const objects=new Map([[`pending/${id}/0`,new TextEncoder().encode('hello')]]);
  const env={REVIEW_OWNER_EMAIL:owner.email,DB:{prepare:sql=>adapt(sql)},BUCKET:{async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};
  sqlite.prepare('INSERT INTO submissions (id,created,state,metadata,files) VALUES (?,?,?,?,?)').run(id,Date.now(),'pending',JSON.stringify({title:'原文',course:'高等数学Ⅰ(上)（1006009001）',source:'待核'}),JSON.stringify([{key:`pending/${id}/0`,name:'test.txt',size:5}]));
  return{sqlite,env,objects,deps:{courses:async()=>courseList}};
}
const request=(path,body,headers={})=>new Request(`${base}/api/review/${path}`,body===undefined?{headers}:{method:'POST',headers:{Origin:base,'X-Review-Request':'1','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('匿名和未授权用户看不到队列，只有配置邮箱能引导首位所有者',async()=>{
  const f=await fixture();try{
    assert.equal((await handleReview(request('queue'),f.env,null,f.deps)).status,401);
    assert.equal((await handleReview(request('queue'),f.env,{userId:'stranger',email:'other@example.test'},f.deps)).status,403);
    const config=await handleReview(request('config'),f.env,owner,f.deps);assert.equal(config.status,200);const data=await config.json();assert.equal(data.user.role,'owner');assert.equal(data.publisherConfigured,false);assert.equal(data.courses[0].id,'advanced-mathematics-1');
    assert.equal((await(await handleReview(request('queue'),f.env,owner,f.deps)).json()).length,1);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM maintainers WHERE role='owner'").get().n,1);
  }finally{f.sqlite.close();}
});
test('维护角色分权、跨站请求拒绝、未知许可不再被标为通过',async()=>{
  const f=await fixture();try{
    await handleReview(request('config'),f.env,owner,f.deps);
    const grant=await handleReview(request('members',{userId:'reviewer-subject',email:'reviewer@example.test',role:'reviewer',active:true}),f.env,owner,f.deps);assert.equal(grant.status,200);
    const reviewer={userId:'reviewer-subject',email:'reviewer@example.test'};
    assert.equal((await handleReview(request(`submissions/${id}/publish`,{version:1}),f.env,reviewer,f.deps)).status,403);
    assert.equal((await handleReview(request('members'),f.env,reviewer,f.deps)).status,403);
    assert.equal((await handleReview(request(`submissions/${id}/approve`,approved,{Origin:'https://evil.example'}),f.env,owner,f.deps)).status,403);
    assert.equal((await handleReview(request(`submissions/${id}/approve`,{...approved,license:'未获明确授权'}),f.env,reviewer,f.deps)).status,400);
    assert.equal((await handleReview(request(`submissions/${id}/approve`,approved),f.env,reviewer,f.deps)).status,200);
    assert.equal((await handleReview(request(`submissions/${id}/approve`,approved),f.env,owner,f.deps)).status,409);
    assert.equal((await handleReview(request(`submissions/${id}/publish`,{version:1}),f.env,owner,f.deps)).status,503);
    assert.ok(f.sqlite.prepare('SELECT count(*) n FROM review_audit').get().n>=2);
  }finally{f.sqlite.close();}
});
test('发布委托只允许读取该任务文件，验证提交后才清除暂存，重复点击不派发第二个任务',async()=>{
  const f=await fixture();try{
    Object.assign(f.env,{REVIEW_GITHUB_APP_ID:'1',REVIEW_GITHUB_INSTALLATION_ID:'2',REVIEW_GITHUB_PRIVATE_KEY:'test-placeholder'});
    let dispatches=0;f.deps.dispatch=async()=>{dispatches++;};
    await handleReview(request(`submissions/${id}/approve`,approved),f.env,owner,f.deps);
    const r=await handleReview(request(`submissions/${id}/publish`,{version:1}),f.env,owner,f.deps);assert.equal(r.status,202);const {job}=await r.json();
    await handleReview(request(`submissions/${id}/publish`,{version:1}),f.env,owner,f.deps);assert.equal(dispatches,1);
    const call=(suffix='',body)=>new Request(`${base}/api/publish-jobs/${job}${suffix}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const identity={identity:async()=> '123456:1'};
    assert.equal((await handlePublishJob(call(),f.env)).status,401);
    const manifest=await(await handlePublishJob(call(),f.env,identity)).json();assert.equal(validateJob(manifest).submissionId,id);assert.equal((await handlePublishJob(call('/files/0'),f.env,identity)).status,200);
    assert.equal((await handlePublishJob(call(),f.env,{identity:async()=> '654321:1'})).status,403);
    assert.equal((await handlePublishJob(call('/files/1'),f.env,identity)).status,404);
    const sha='a'.repeat(40);assert.equal((await handlePublishJob(call('/complete',{sha}),f.env,{...identity,verify:async()=>false})).status,409);assert.equal(f.objects.size,1);
    assert.equal((await handlePublishJob(call('/complete',{sha}),f.env,{...identity,verify:async()=>true})).status,200);assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT state FROM submissions WHERE id=?').get(id).state,'imported');
    assert.equal((await handlePublishJob(call('/complete',{sha:'b'.repeat(40)}),f.env,identity)).status,409);
  }finally{f.sqlite.close();}
});
test('任务派发不明时保持锁定，不因超时误删或重复发布',async()=>{
  const f=await fixture();try{
    Object.assign(f.env,{REVIEW_GITHUB_APP_ID:'1',REVIEW_GITHUB_INSTALLATION_ID:'2',REVIEW_GITHUB_PRIVATE_KEY:'test-placeholder'});
    f.deps.dispatch=async()=>{throw new TypeError('network');};await handleReview(request(`submissions/${id}/approve`,approved),f.env,owner,f.deps);
    const response=await handleReview(request(`submissions/${id}/publish`,{version:1}),f.env,owner,f.deps);assert.equal((await response.json()).state,'dispatch_unknown');assert.equal(f.objects.size,1);assert.equal(f.sqlite.prepare('SELECT state FROM submissions WHERE id=?').get(id).state,'publishing');
  }finally{f.sqlite.close();}
});
test('发布器拒绝任意仓库、路径越界或未授权资料',()=>{
  assert.throws(()=>validateJob({repository:'other/repo'}),/目标/);
  assert.throws(()=>validateReview({...approved,permissionConfirmed:false},courseList),/许可/);
  assert.throws(()=>validateReview({...approved,courseId:'unknown'},courseList),/课程/);
});
