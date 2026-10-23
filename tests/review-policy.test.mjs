import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewDefaults,validateReview,acceptSubmission,publishSubmission,publicationNotice,reviewStage,UNVERIFIED_LICENSE,DEFAULT_SOURCE} from '../upload-service/lib/review-policy.mjs';
import {validateJob} from '../scripts/publish-cloud-resource.mjs';
const courses=[{id:'mechanics',name:'力学',code:'1007003065'}];
const draft={course:'力学（1007003065）',title:'往年试卷',type:'历年试卷',source:'购买渠道与私密联系方式',year:''};
test('默认自动匹配课程和标题，不需填写许可、不泄露投稿私人来源',()=>{
  const values=reviewDefaults(draft,courses);assert.equal(values.courseId,'mechanics');assert.equal(values.title,draft.title);assert.equal(values.source,DEFAULT_SOURCE);assert.equal(values.permissionConfirmed,false);
  const approved=validateReview({},courses,draft);assert.equal(approved.reviewStatus,'approved');assert.equal(approved.permission,'unverified');assert.equal(approved.license,UNVERIFIED_LICENSE);assert.equal(approved.rightsBasis,'');
  assert.equal(reviewDefaults({course:'1007003065'},courses).courseId,'mechanics');
  assert.equal(reviewDefaults({course:'力学'},[...courses,{id:'other',name:'力学',code:'1111111111'}]).courseId,'');
});
test('明确授权必须主动选择且有实际信息；默认收录不会伪造许可',()=>{
  const values=reviewDefaults(draft,courses);
  assert.throws(()=>validateReview({...values,permissionConfirmed:true},courses),/实际许可/);
  assert.throws(()=>validateReview({...values,permissionConfirmed:true,license:'CC0'},courses),/实际许可/);
  const confirmed=validateReview({...values,permissionConfirmed:true,license:'CC0-1.0',rightsBasis:'作者明确声明'},courses);assert.equal(confirmed.permission,'confirmed');
  assert.equal(validateReview({...values,license:'CC0-1.0',permissionConfirmed:false},courses).license,UNVERIFIED_LICENSE);
  assert.throws(()=>validateReview({...values,courseId:'other'},courses),/课程/);
});
test('发布器接受审核通过且授权未核实的资料，拒绝状态伪造',()=>{
  const job={repository:'CobaltJiang/OpenNNU',id:'12345678-1234-4234-8234-123456789abc',submissionId:'22345678-1234-4234-8234-123456789abc',review:validateReview({},courses,draft),files:[{index:0,name:'test.txt',size:5}]};
  assert.equal(validateJob(job).review.permission,'unverified');
  assert.throws(()=>validateJob({...job,review:{...job.review,reviewStatus:'pending'}}),/审核结论/);
  assert.throws(()=>validateJob({...job,review:{...job.review,license:'CC0-1.0'}}),/不一致/);
});
test('一键通过按序保存和派发；审核者或未配置发布授权时绝不派发',async()=>{
  const calls=[];const api=async(path,body)=>{calls.push({path,body});return path.endsWith('/approve')?{version:3}:{job:'job-1',state:'queued'};};
  assert.equal((await acceptSubmission(api,{id:'test',version:2,metadata:{},publish:true})).job,'job-1');assert.equal(calls[1].body.version,3);
  calls.length=0;await acceptSubmission(api,{id:'test',version:2,metadata:{}});assert.equal(calls.length,1);
  await assert.rejects(acceptSubmission(async(path)=>{if(path.endsWith('/approve'))return{version:4};throw Error('网络中断');},{id:'test',version:3,metadata:{},publish:true}),error=>error.reviewVersion===4&&/审核已通过，但尚未公开/.test(error.message));
});
test('审核页默认展示预览与单个通过按钮，没有二次通过弹窗或必填许可',async()=>{
  const cloud=await readFile(new URL('../upload-service/app/review/review-console.tsx',import.meta.url),'utf8');
  assert.match(cloud,/acceptSubmission\(api/);assert.match(cloud,/review-preview/);assert.doesNotMatch(cloud,/confirm\(|prompt\(|name="permissionConfirmed".*required/);
});

test('独立发布只调用 publish 并携带现有审核版本，不重复 approve',async()=>{
  const calls=[];const api=async(path,body)=>{calls.push({path,body});return{job:'existing',state:'queued'};};
  await publishSubmission(api,{id:'approved',version:7});assert.deepEqual(calls,[{path:'submissions/approved/publish',body:{version:7}}]);
  assert.throws(()=>publishSubmission(api,{id:'missing',version:0}),/审核版本/);assert.equal(calls.length,1);
  assert.equal(reviewStage({state:'pending',review_version:7}),'approved');assert.equal(reviewStage({state:'publishing',review_version:7}),'publishing');assert.equal(reviewStage({state:'pending',review_version:null}),'pending');
  assert.match(publicationNotice({state:'failed'}),/失败/);assert.match(publicationNotice({state:'dispatch_unknown'}),/未确认/);assert.match(publicationNotice({state:'queued'}),/正在发布/);
});
test('审核页对已审核资料提供独立发布入口，失败和成功均刷新队列',async()=>{
  const source=await readFile(new URL('../upload-service/app/review/review-console.tsx',import.meta.url),'utf8');
  assert.match(source,/publishSubmission\(api,\{id:item.id,version\}\)/);
  assert.match(source,/approved&&item.state==='pending'&&config.capabilities.includes\('publish'\)/);
  assert.match(source,/disabled=\{busy\|\|!canPublish\}/);assert.match(source,/发布到 GitHub/);
  assert.match(source,/!approved&&config.capabilities.includes\('approve'\)/);
  assert.match(source,/onFailed=\{async message=>\{setNotice\(''\);await load\(\);setError\(message\);\}\}/);
  assert.match(source,/setInterval\(\(\)=>void load\(\),10000\)/);
});
