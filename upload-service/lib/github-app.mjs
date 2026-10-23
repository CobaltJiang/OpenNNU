import {createPrivateKey,sign,createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
export const REPOSITORY='CobaltJiang/OpenNNU';
let cached=null;
const configurationKeys=['REVIEW_GITHUB_APP_ID','REVIEW_GITHUB_INSTALLATION_ID','REVIEW_GITHUB_PRIVATE_KEY'];
// Return field names and fixed descriptions only. Never include configuration values or parser errors.
export function publisherConfiguration(env){
  const missing=configurationKeys.filter(key=>typeof env[key]!=='string'||!env[key].trim());
  const invalid=[];
  for(const key of configurationKeys.slice(0,2))if(!missing.includes(key)&&!/^\d+$/.test(env[key]))invalid.push(`${key} 必须为数字`);
  if(!missing.includes('REVIEW_GITHUB_PRIVATE_KEY')){
    try{if(createPrivateKey(env.REVIEW_GITHUB_PRIVATE_KEY).asymmetricKeyType!=='rsa')invalid.push('REVIEW_GITHUB_PRIVATE_KEY 必须为 RSA 私钥');}
    catch{invalid.push('REVIEW_GITHUB_PRIVATE_KEY 不是有效的 PEM 私钥');}
  }
  return {configured:!missing.length&&!invalid.length,missing,invalid};
}
export const publisherConfigured=env=>publisherConfiguration(env).configured;
export function publisherConfigurationMessage(configuration){
  return ['GitHub App 尚未正确配置',configuration.missing.length?`缺少：${configuration.missing.join('、')}`:'',...configuration.invalid].filter(Boolean).join('；');
}
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const runtimeFetch=(input,init)=>globalThis.fetch(input,init);
function identityStep(operation,fn){
  try{return fn();}catch(error){
    const kind=error instanceof ReferenceError?'reference':error instanceof TypeError?'type':error?.name==='NotSupportedError'?'unsupported':'runtime';
    throw Object.assign(new Error('App 身份签名失败'),{definite:true,diagnostic:{stage:'signing',reason:'signing',operation,kind}});
  }
}
// Upstream bodies can contain private data. Only return fixed, allowlisted categories.
async function upstreamFailure(stage,response){
  let message='';try{message=(await response.json()).message||'';}catch{}
  const reason=/rate limit/i.test(message)?'rate_limit':/Bad credentials/i.test(message)?'bad_credentials':/not accessible by integration/i.test(message)?'permissions':/workflow_dispatch/i.test(message)?'workflow_trigger':/No ref found/i.test(message)?'missing_ref':'rejected';
  return Object.assign(new Error('GitHub 请求失败'),{status:503,definite:response.status<500,diagnostic:{stage,httpStatus:response.status,reason}});
}
export function publisherFailureMessage(error){
  const d=error?.diagnostic;
  const stages={token:'获取安装令牌',workflow:'读取发布工作流',dispatch:'派发发布任务',signing:'签署 App 身份',network:'连接 GitHub'};
  if(!d||!Object.hasOwn(stages,d.stage))return '发布失败：GitHub 未接受发布任务，请核对 App 安装、仓库权限与工作流配置后重试。';
  const reasons={rate_limit:'请求频率受限，请稍后重试',bad_credentials:'App 身份验证失败',permissions:'App 权限不足',workflow_trigger:'工作流缺少手动触发入口',missing_ref:'目标分支不存在',rejected:'请核对 App 和工作流配置',network:'网络请求未完成',signing:'App 私钥签名不可用'};
  return `发布失败：${stages[d.stage]}${Number.isInteger(d.httpStatus)?`（GitHub ${d.httpStatus}）`:''}；${reasons[d.reason]||reasons.rejected}。`;
}
export async function appToken(env,fetcher=runtimeFetch){
  const configuration=publisherConfiguration(env);
  if(!configuration.configured)throw Object.assign(new Error(publisherConfigurationMessage(configuration)),{status:503});
  const tag=identityStep('hash',()=>`${env.REVIEW_GITHUB_APP_ID}:${env.REVIEW_GITHUB_INSTALLATION_ID}:${createHash('sha256').update(env.REVIEW_GITHUB_PRIVATE_KEY).digest('hex')}`);
  if(cached?.tag===tag&&cached.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000),payload=identityStep('claims',()=>`${encode({alg:'RS256',typ:'JWT'})}.${encode({iat:now-60,exp:now+540,iss:env.REVIEW_GITHUB_APP_ID})}`);
  const key=identityStep('key',()=>createPrivateKey(env.REVIEW_GITHUB_PRIVATE_KEY));
  const signature=identityStep('signature',()=>sign('RSA-SHA256',Buffer.from(payload),key));
  const jwt=identityStep('encoding',()=>`${payload}.${signature.toString('base64url')}`);
  let response;
  // Workers supports manual/follow, not redirect:error. Reject 3xx via !response.ok instead.
  try{response=await fetcher(`https://api.github.com/app/installations/${env.REVIEW_GITHUB_INSTALLATION_ID}/access_tokens`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:headers(jwt),body:JSON.stringify({repositories:['OpenNNU'],permissions:{contents:'read',actions:'write'}})});}
  catch{throw Object.assign(new Error('GitHub 安装令牌请求未完成'),{diagnostic:{stage:'token',reason:'network'}});}
  if(!response.ok)throw await upstreamFailure('token',response);
  const data=await response.json();cached={tag,token:data.token,expires:Date.parse(data.expires_at)};return data.token;
}
const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'OpenNNU-cloud-review','Content-Type':'application/json'});
export async function dispatchPublish(env,job,origin,fetcher=runtimeFetch){
  let authorization;
  try{authorization=await appToken(env,fetcher);}catch(error){throw Object.assign(new Error('无法取得 GitHub App 授权，请核对安装、仓库访问与权限后重试。'),{definite:true,diagnostic:error.diagnostic});}
  const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/publish-resource.yml/dispatches`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:headers(authorization),body:JSON.stringify({ref:'main',inputs:{job_id:job.id,service_url:origin}})});
  if(!response.ok)throw await upstreamFailure('dispatch',response);
}
export async function checkPublisher(env,fetcher=runtimeFetch){
  const configuration=publisherConfiguration(env);if(!configuration.configured)return {ok:false,configuration};
  let stage='token';
  try{
    const authorization=await appToken(env,fetcher);stage='workflow';
    const url=`https://api.github.com/repos/${REPOSITORY}/actions/workflows/publish-resource.yml`;
    const workflow=await fetcher(url,{headers:headers(authorization),redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!workflow.ok)throw await upstreamFailure(stage,workflow);
    if((await workflow.json()).state!=='active')return {ok:false,stage,reason:'workflow_disabled'};
    stage='dispatch';
    // This fixed nonexistent ref must never be created. GitHub validates permission but cannot run a job.
    const probe=await fetcher(`${url}/dispatches`,{method:'POST',headers:headers(authorization),redirect:'manual',signal:AbortSignal.timeout(20000),body:JSON.stringify({ref:'opennnu-diagnostic-nonexistent-ref-do-not-create',inputs:{job_id:'diagnostic-no-publication',service_url:'https://opennnu-upload.undefinedcobalt.chatgpt.site'}})});
    if(!probe.ok){const error=await upstreamFailure(stage,probe);if(error.diagnostic.httpStatus===422&&error.diagnostic.reason==='missing_ref')return {ok:true,stage,probeStatus:422};throw error;}
    return {ok:false,stage,reason:'unexpected_probe_result'};
  }catch(error){return {ok:false,...(error.diagnostic||{stage,reason:'network_or_signing'}),message:publisherFailureMessage(error)};}
}
export async function verifyPublished(env,job,sha){
  const authorization=await appToken(env);
  const response=await runtimeFetch(`https://api.github.com/repos/${REPOSITORY}/contents/data/resources.json?ref=${sha}`,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{...headers(authorization),Accept:'application/vnd.github.raw+json'}});
  if(!response.ok)return false;
  const resources=await response.json(),review=JSON.parse(job.review),fields=['courseId','title','type','year','source','license','origin','answerStatus'];
  if(!Array.isArray(resources))return false;const matching=resources.filter(item=>item.submissionId===job.submission_id&&item.permission===(review.permission||'confirmed')&&(review.reviewStatus!=='approved'||item.reviewStatus==='approved')&&fields.every(field=>item[field]===review[field]));return matching.length===job.fileCount;
}
