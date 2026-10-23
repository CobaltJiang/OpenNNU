import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {appToken,publisherConfigured,publisherConfiguration,publisherConfigurationMessage,publisherFailureMessage,dispatchPublish,checkPublisher} from '../upload-service/lib/github-app.mjs';
test('GitHub App JWT 使用 RS256，安装令牌仅请求固定仓库与最少权限',async()=>{
  assert.equal(publisherConfigured({}),false);
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={REVIEW_GITHUB_APP_ID:'1234',REVIEW_GITHUB_INSTALLATION_ID:'5678',REVIEW_GITHUB_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'})};
  let count=0;
  const fetcher=async(url,options)=>{count++;assert.equal(url,'https://api.github.com/app/installations/5678/access_tokens');assert.equal(options.redirect,'manual');
    const jwt=options.headers.Authorization.slice(7),[header,payload,signature]=jwt.split('.');
    assert.equal(JSON.parse(Buffer.from(header,'base64url')).alg,'RS256');const claims=JSON.parse(Buffer.from(payload,'base64url'));assert.equal(claims.iss,'1234');assert.ok(claims.exp-claims.iat<=600);assert.equal(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),publicKey,Buffer.from(signature,'base64url')),true);
    assert.deepEqual(JSON.parse(options.body),{repositories:['OpenNNU'],permissions:{contents:'read',actions:'write'}});
    return Response.json({token:'synthetic-installation-token',expires_at:new Date(Date.now()+3600000).toISOString()});};
  assert.equal(await appToken(env,fetcher),'synthetic-installation-token');assert.equal(await appToken(env,fetcher),'synthetic-installation-token');assert.equal(count,1);
});

test('发布配置诊断验证数字 ID 与 RSA 私钥，从不包含配置值或解析器错误',()=>{
  assert.deepEqual(publisherConfiguration({}).missing,['REVIEW_GITHUB_APP_ID','REVIEW_GITHUB_INSTALLATION_ID','REVIEW_GITHUB_PRIVATE_KEY']);
  const configuration=publisherConfiguration({REVIEW_GITHUB_APP_ID:'secret-id',REVIEW_GITHUB_INSTALLATION_ID:'2',REVIEW_GITHUB_PRIVATE_KEY:'secret-key'});
  assert.equal(configuration.configured,false);assert.equal(configuration.invalid.length,2);assert.doesNotMatch(JSON.stringify(configuration),/secret-id|secret-key/);assert.match(publisherConfigurationMessage(configuration),/REVIEW_GITHUB_APP_ID/);
});
test('安装授权失败发生于派发前，允许安全重试并隐藏上游错误',async()=>{
  await assert.rejects(dispatchPublish({}, {id:'job'},'https://example.test'),error=>error.definite===true&&/授权/.test(error.message)&&!error.message.includes('PRIVATE'));
});

const testEnv=()=>({REVIEW_GITHUB_APP_ID:'1234',REVIEW_GITHUB_INSTALLATION_ID:'5678',REVIEW_GITHUB_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'})});
test('云端发布诊断以固定不存在的分支检查权限，不派发真实投稿',async()=>{
  const calls=[];
  const result=await checkPublisher(testEnv(),async(url,options)=>{
    assert.equal(options.redirect,'manual');
    calls.push(url);
    if(url.endsWith('/access_tokens'))return Response.json({token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString()});
    if(!url.endsWith('/dispatches'))return Response.json({state:'active'});
    assert.equal(JSON.parse(options.body).ref,'opennnu-diagnostic-nonexistent-ref-do-not-create');
    return Response.json({message:'No ref found for: diagnostic'},{status:422});
  });
  assert.deepEqual(result,{ok:true,stage:'dispatch',probeStatus:422});assert.equal(calls.length,3);
});
test('GitHub 拒绝信息只显示阶段状态码和固定分类，绝不反射上游正文',async()=>{
  const env=testEnv();
  const result=await checkPublisher(env,async()=>Response.json({message:'private-key secret-token private-source'},{status:401}));
  assert.equal(result.ok,false);assert.equal(result.httpStatus,401);assert.equal(result.stage,'token');
  assert.doesNotMatch(JSON.stringify(result),/private-key|secret-token|private-source/);assert.match(result.message,/GitHub 401/);
  await assert.rejects(dispatchPublish(testEnv(),{id:'test'},'https://example.test',async url=>url.endsWith('/access_tokens')?Response.json({token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString()}):Response.json({message:'private-source'},{status:503})),e=>!e.definite&&e.diagnostic.stage==='dispatch');
  assert.doesNotMatch(publisherFailureMessage({diagnostic:{stage:'unknown-secret',httpStatus:401,reason:'secret'}}),/unknown-secret/);
});

test('没有 Node 全局 Buffer 的 Worker 环境也能签署 App 身份',async()=>{
  const original=globalThis.Buffer;
  try{
    delete globalThis.Buffer;
    assert.equal(await appToken(testEnv(),async()=>({ok:true,json:async()=>({token:'worker-test-token',expires_at:new Date(Date.now()+3600000).toISOString()})})),'worker-test-token');
  }finally{globalThis.Buffer=original;}
});

test('手动重定向仍拒绝 3xx，不把 App 身份或安装令牌发给跳转目标',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});};
  await assert.rejects(appToken(testEnv(),fetcher),error=>error.diagnostic.httpStatus===302&&error.diagnostic.stage==='token');
  assert.equal(calls,1);
  let dispatchCalls=0;
  await assert.rejects(dispatchPublish(testEnv(),{id:'job'},'https://example.test',async(url,options)=>{
    assert.equal(options.redirect,'manual');
    if(url.endsWith('/access_tokens'))return Response.json({token:'synthetic-token',expires_at:new Date(Date.now()+3600000).toISOString()});
    dispatchCalls++;return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});
  }),error=>error.definite&&error.diagnostic.stage==='dispatch');
  assert.equal(dispatchCalls,1);
});
