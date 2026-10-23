import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {appToken,publisherConfigured,publisherConfiguration,publisherConfigurationMessage,dispatchPublish} from '../upload-service/lib/github-app.mjs';
test('GitHub App JWT 使用 RS256，安装令牌仅请求固定仓库与最少权限',async()=>{
  assert.equal(publisherConfigured({}),false);
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={REVIEW_GITHUB_APP_ID:'1234',REVIEW_GITHUB_INSTALLATION_ID:'5678',REVIEW_GITHUB_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'})};
  let count=0;
  const fetcher=async(url,options)=>{count++;assert.equal(url,'https://api.github.com/app/installations/5678/access_tokens');assert.equal(options.redirect,'error');
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
