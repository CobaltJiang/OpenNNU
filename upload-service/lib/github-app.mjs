import {createPrivateKey,sign} from 'node:crypto';
export const REPOSITORY='CobaltJiang/OpenNNU';
let cached=null;
export function publisherConfigured(env){return Boolean(env.REVIEW_GITHUB_APP_ID&&env.REVIEW_GITHUB_INSTALLATION_ID&&env.REVIEW_GITHUB_PRIVATE_KEY);}
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export async function appToken(env,fetcher=fetch){
  if(!publisherConfigured(env))throw Object.assign(new Error('尚未配置仅限 OpenNNU 的 GitHub App，暂不能公开发布。'),{status:503});
  if(!/^\d+$/.test(env.REVIEW_GITHUB_APP_ID)||!/^\d+$/.test(env.REVIEW_GITHUB_INSTALLATION_ID))throw Object.assign(new Error('GitHub App 配置无效'),{status:503});
  const tag=`${env.REVIEW_GITHUB_APP_ID}:${env.REVIEW_GITHUB_INSTALLATION_ID}`;
  if(cached?.tag===tag&&cached.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000),payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iat:now-60,exp:now+540,iss:env.REVIEW_GITHUB_APP_ID})}`;
  const jwt=`${payload}.${sign('RSA-SHA256',Buffer.from(payload),createPrivateKey(env.REVIEW_GITHUB_PRIVATE_KEY)).toString('base64url')}`;
  const response=await fetcher(`https://api.github.com/app/installations/${env.REVIEW_GITHUB_INSTALLATION_ID}/access_tokens`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:headers(jwt),body:JSON.stringify({repositories:['OpenNNU'],permissions:{contents:'read',actions:'write'}})});
  if(!response.ok)throw Object.assign(new Error('无法获取 GitHub App 安装授权，请核对仓库与权限。'),{status:503});
  const data=await response.json();cached={tag,token:data.token,expires:Date.parse(data.expires_at)};return data.token;
}
const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'OpenNNU-cloud-review','Content-Type':'application/json'});
export async function dispatchPublish(env,job,origin){
  const authorization=await appToken(env);
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
