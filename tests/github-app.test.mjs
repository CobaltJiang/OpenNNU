import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {appToken,publisherConfigured} from '../upload-service/lib/github-app.mjs';
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
