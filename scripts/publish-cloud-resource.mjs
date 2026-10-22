import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCatalog} from './validate.mjs';
import {MAX_FILE_BYTES,MAX_TOTAL_BYTES,MAX_FILES} from '../upload-service/lib/upload-policy.mjs';

export function validateJob(job){
  if(job.repository!=='CobaltJiang/OpenNNU'||!/^[a-f0-9-]{36}$/.test(job.id||'')||!/^[a-f0-9-]{36}$/.test(job.submissionId||''))throw new Error('任务目标无效');
  const review=job.review;
  if(!review||!/^[a-z0-9-]+$/.test(review.courseId||'')||!review.title||!review.license||!review.source||!review.rightsBasis||/未获|待确认|不详|不明|未授权/.test(review.license))throw new Error('缺少已核实的审核信息');
  if(!Array.isArray(job.files)||!job.files.length||job.files.length>MAX_FILES)throw new Error('文件数量无效');
  let total=0;
  for(const [index,file]of job.files.entries()){
    if(file.index!==index||typeof file.name!=='string'||/[\x00-\x1f/\\]/.test(file.name)||!file.name.match(/\.(pdf|docx|xlsx|pptx|zip|png|jpe?g|webp|txt|csv)$/i)||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_FILE_BYTES)throw new Error('文件信息无效');total+=file.size;
  }
  if(total>MAX_TOTAL_BYTES)throw new Error('文件总大小超限');return job;
}
const command=(...args)=>{const result=spawnSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.status!==0)throw new Error(`Git 操作失败：${args[0]}，请检查工作流并发或仓库保护规则。`);return result.stdout.trim();};
async function run(){
  const jobId=process.env.REVIEW_JOB_ID;
  if(!/^[a-f0-9-]{36}$/.test(jobId||''))throw new Error('任务编号无效');
  const base=new URL(process.env.REVIEW_SERVICE_URL||'');
  if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||!['opennnu-upload.undefinedcobalt.chatgpt.site','review.cybercobalt.xyz'].includes(base.hostname))throw new Error('不允许的上传服务地址');
  const jobURL=new URL(`/api/publish-jobs/${jobId}`,base);
  // Request fresh, audience-bound GitHub OIDC credentials per request, never dispatch secrets as inputs.
  const authorization=async()=>{
    const endpoint=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL||'');
    if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.actions.githubusercontent.com'))throw new Error('OIDC 签发端点无效');
    endpoint.searchParams.set('audience',jobURL.href);
    const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('无法获取 GitHub 工作流身份');const {value}=await response.json();if(typeof value!=='string')throw new Error('OIDC 响应无效');
    console.log(`::add-mask::${value}`);return {Authorization:`Bearer ${value}`};
  };
  const call=async(suffix='',body)=>{
    const headers=await authorization();
    const response=await fetch(new URL(`${jobURL.pathname}${suffix}`,base),{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(600000)});
    if(!response.ok)throw new Error(`审核服务请求失败（${response.status}）`);return response;
  };
  let committed=false;
  try{
    const job=validateJob(await(await call()).json());if(job.id!==jobId)throw new Error('任务编号不一致');
    const root=resolve('.'),indexFile=resolve(root,'data/resources.json'),resources=JSON.parse(await readFile(indexFile,'utf8'));
    const existing=resources.filter(item=>item.submissionId===job.submissionId);
    const fields=['courseId','title','type','year','source','license','origin','answerStatus'];
    if(existing.length){if(existing.length!==job.files.length||existing.some(item=>!fields.every(field=>item[field]===job.review[field])))throw new Error('投稿已经按不同审核结论收录，需要维护者处理');}
    else{
      const courses=JSON.parse(await readFile(resolve(root,'data/courses.json'),'utf8'));if(!courses.some(course=>course.id===job.review.courseId))throw new Error('课程不存在');
      const staged=[];
      for(const file of job.files){
        const extension=file.name.match(/\.[^.]+$/)[0].toLowerCase();
        const relative=`courses/${job.review.courseId}/submissions/${job.submissionId}/${file.index}${extension}`,destination=resolve(root,relative);
        if(!destination.startsWith(resolve(root,'courses')+sep))throw new Error('文件路径越界');
        await mkdir(dirname(destination),{recursive:true});let received=0;
        const response=await call(`/files/${file.index}`);if(!response.body)throw new Error('文件内容为空');
        await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,callback){received+=chunk.length;if(received>file.size)callback(new Error('文件大小超限'));else callback(null,chunk);}}),createWriteStream(destination,{flags:'wx'}));
        if((await stat(destination)).size!==file.size)throw new Error('下载文件大小不一致');
        resources.push({id:`upload-${job.submissionId}-${file.index}`,submissionId:job.submissionId,publishJobId:jobId,courseId:job.review.courseId,title:job.review.title,type:job.review.type,year:job.review.year,source:job.review.source,license:job.review.license,permission:'confirmed',added:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),origin:job.review.origin,answerStatus:job.review.answerStatus,url:relative});staged.push(relative);
      }
      await writeFile(indexFile,`${JSON.stringify(resources,null,2)}\n`);await validateCatalog(root);
      command('config','user.name','OpenNNU Publisher');command('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
      command('add','--','data/resources.json',...staged);command('commit','-m',`收录云端审核投稿 ${job.submissionId}`,'--author','CobaltJiang <183521736+CobaltJiang@users.noreply.github.com>');command('push','origin','HEAD:main');
    }
    committed=true;
    // A GITHUB_TOKEN push does not trigger Pages automatically: explicitly dispatch it.
    const published=await fetch('https://api.github.com/repos/CobaltJiang/OpenNNU/actions/workflows/pages.yml/dispatches',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'main'})});
    if(!published.ok)console.warn('文件已提交，但 Pages 触发失败，需要维护者重跑 pages.yml。');
    await call('/complete',{sha:command('rev-parse','HEAD')});console.log('审核后的文件已收录并回执，暂存文件由服务端清理。');
  }catch(error){
    // If a commit already exists, retain the running job for reconciliation instead of re-publishing.
    if(!committed)try{await call('/failed',{});}catch{}
    throw error;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(error.message);process.exitCode=1;});
