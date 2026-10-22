import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyActionsIdentity} from '../upload-service/lib/actions-identity.mjs';
test('GitHub OIDC 验签且严格绑定仓库、工作流、主分支和任务 audience',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-key-1',alg:'RS256'};
  const now=Math.floor(Date.now()/1000),base='https://review.cybercobalt.xyz/api/publish-jobs/test-job';
  const claims={iss:'https://token.actions.githubusercontent.com',aud:base,iat:now,exp:now+300,repository:'CobaltJiang/OpenNNU',ref:'refs/heads/main',event_name:'workflow_dispatch',workflow_ref:'CobaltJiang/OpenNNU/.github/workflows/publish-resource.yml@refs/heads/main',run_id:'12345',run_attempt:'1'};
  const jwt=(overrides={})=>{const data=[{alg:'RS256',kid:jwk.kid},{...claims,...overrides}].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');return `${data}.${sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;};
  const request=token=>new Request(base,{headers:{Authorization:`Bearer ${token}`}});
  const keys=async()=>Response.json({keys:[jwk]});
  assert.equal(await verifyActionsIdentity(request(jwt()),'test-job',keys),'12345:1');
  for(const override of [{aud:'https://evil.test'},{repository:'someone/fork'},{ref:'refs/heads/other'},{event_name:'pull_request'},{workflow_ref:'CobaltJiang/OpenNNU/.github/workflows/other.yml@refs/heads/main'},{exp:now-1},{iat:now+600}])await assert.rejects(verifyActionsIdentity(request(jwt(override)),'test-job',keys),/身份无效/);
  const valid=jwt().split('.');valid[1]=Buffer.from(JSON.stringify({...claims,run_id:'999'})).toString('base64url');await assert.rejects(verifyActionsIdentity(request(valid.join('.')),'test-job',keys),/身份无效/);
});
