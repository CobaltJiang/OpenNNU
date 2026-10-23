import {createPublicKey,verify} from 'node:crypto';
import {Buffer} from 'node:buffer';
const ISSUER='https://token.actions.githubusercontent.com';
let cachedKeys=null;
export async function verifyActionsIdentity(request,jobId,fetcher=(input,init)=>globalThis.fetch(input,init)){
  const jwt=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  const fail=()=>{throw Object.assign(new Error('发布工作流身份无效'),{status:401});};
  if(!jwt||jwt.length>20000)fail();
  const parts=jwt.split('.');if(parts.length!==3)fail();
  let header,claims;try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{fail();}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==ISSUER||claims.aud!==`${new URL(request.url).origin}/api/publish-jobs/${jobId}`||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||claims.iat<now-600||(claims.nbf!==undefined&&claims.nbf>now+30)||claims.repository!=='CobaltJiang/OpenNNU'||claims.ref!=='refs/heads/main'||claims.event_name!=='workflow_dispatch'||claims.workflow_ref!=='CobaltJiang/OpenNNU/.github/workflows/publish-resource.yml@refs/heads/main'||!/^\d+$/.test(claims.run_id||'')||!/^\d+$/.test(claims.run_attempt||''))fail();
  if(!cachedKeys||cachedKeys.expires<Date.now()||!cachedKeys.keys.some(key=>key.kid===header.kid)){
    const response=await fetcher(`${ISSUER}/.well-known/jwks`,{redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('无法校验工作流签名');
    const data=await response.json();if(!Array.isArray(data.keys))fail();cachedKeys={keys:data.keys,expires:Date.now()+300000};
  }
  const jwk=cachedKeys.keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256'));if(!jwk)fail();
  if(!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))fail();
  return `${claims.run_id}:${claims.run_attempt}`;
}
