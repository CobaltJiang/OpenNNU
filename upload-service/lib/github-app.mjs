import {createPrivateKey,sign,createHash} from 'node:crypto';
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
export async function appToken(env,fetcher=fetch){
  const configuration=publisherConfiguration(env);
  if(!configuration.configured)throw Object.assign(new Error(publisherConfigurationMessage(configuration)),{status:503});
  const tag=`${env.REVIEW_GITHUB_APP_ID}:${env.REVIEW_GITHUB_INSTALLATION_ID}:${createHash('sha256').update(env.REVIEW_GITHUB_PRIVATE_KEY).digest('hex')}`;
  if(cached?.tag===tag&&cached.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000),payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iat:now-60,exp:now+540,iss:env.REVIEW_GITHUB_APP_ID})}`;
  const jwt=`${payload}.${sign('RSA-SHA256',Buffer.from(payload),createPrivateKey(env.REVIEW_GITHUB_PRIVATE_KEY)).toString('base64url')}`;
  const response=await fetcher(`https://api.github.com/app/installations/${env.REVIEW_GITHUB_INSTALLATION_ID}/access_tokens`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:headers(jwt),body:JSON.stringify({repositories:['OpenNNU'],permissions:{contents:'read',actions:'write'}})});
  if(!response.ok)throw Object.assign(new Error('无法获取 GitHub App 安装授权，请核对仓库与权限。'),{status:503});
  const data=await response.json();cached={tag,token:data.token,expires:Date.parse(data.expires_at)};return data.token;
}
const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'OpenNNU-cloud-review','Content-Type':'application/json'});
export async function dispatchPublish(env,job,origin){
  let authorization;
  try{authorization=await appToken(env);}catch{throw Object.assign(new Error('无法取得 GitHub App 授权，请核对安装、仓库访问与权限后重试。'),{definite:true});}
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/publish-resource.yml/dispatches`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:headers(authorization),body:JSON.stringify({ref:'main',inputs:{job_id:job.id,service_url:origin}})});
  if(!response.ok)throw Object.assign(new Error(`GitHub 工作流派发失败（${response.status}），请核对 App 安装和 workflow 文件。`),{status:503,definite:true});
}
export async function verifyPublished(env,job,sha){
  const authorization=await appToken(env);
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/data/resources.json?ref=${sha}`,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{...headers(authorization),Accept:'application/vnd.github.raw+json'}});
  if(!response.ok)return false;
  const resources=await response.json(),review=JSON.parse(job.review),fields=['courseId','title','type','year','source','license','origin','answerStatus'];
  if(!Array.isArray(resources))return false;const matching=resources.filter(item=>item.submissionId===job.submission_id&&item.permission===(review.permission||'confirmed')&&(review.reviewStatus!=='approved'||item.reviewStatus==='approved')&&fields.every(field=>item[field]===review[field]));return matching.length===job.fileCount;
}
