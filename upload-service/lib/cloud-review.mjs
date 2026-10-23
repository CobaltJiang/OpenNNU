import {can,memberFor,audit,boundedJSON,requireMutationOrigin,reviewJSON,reject} from './review-auth.mjs';
import {publisherConfiguration,publisherConfigurationMessage,publisherFailureMessage,dispatchPublish,verifyPublished} from './github-app.mjs';
import courseIndex from '../data/course-index.json' with {type:'json'};
import {verifyActionsIdentity} from './actions-identity.mjs';
import {validateReview} from './review-policy.mjs';
export {validateReview} from './review-policy.mjs';
const uuid=/^[a-f0-9-]{36}$/;
export async function reviewCourses(){
  return courseIndex;
}
export const sha256=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function handleReview(request,env,user,deps={}){
  try{
    if(request.method!=='GET')requireMutationOrigin(request);
    const member=await memberFor(env,user);const path=new URL(request.url).pathname;
    const requireRole=capability=>{if(!can(member,capability))reject('没有此操作权限',403);};requireRole('view');
    if(path==='/api/review/config'&&request.method==='GET'){const configuration=publisherConfiguration(env);return reviewJSON({user:{id:member.user_id,email:member.email,role:member.role},capabilities:['view','approve','publish','reject','recover','members','audit'].filter(action=>can(member,action)),publisherConfigured:configuration.configured,publisherConfiguration:configuration,courses:await(deps.courses||reviewCourses)()});}
    if(path==='/api/review/queue'&&request.method==='GET'){
      const rows=await env.DB.prepare("SELECT s.*,r.version AS review_version,r.metadata AS reviewed,(SELECT j.state FROM publish_jobs j WHERE j.submission_id=s.id ORDER BY j.created DESC,j.rowid DESC LIMIT 1) AS publish_state,(SELECT j.error FROM publish_jobs j WHERE j.submission_id=s.id ORDER BY j.created DESC,j.rowid DESC LIMIT 1) AS publish_error FROM submissions s LEFT JOIN reviews r ON r.submission_id=s.id WHERE s.state IN ('pending','publishing') ORDER BY s.created LIMIT 100").all();
      return reviewJSON(rows.results.map(row=>({...row,metadata:JSON.parse(row.metadata),files:JSON.parse(row.files).map(({name,size},index)=>({name,size,index})),reviewed:row.reviewed?JSON.parse(row.reviewed):null})));
    }
    if(path==='/api/review/members'){
      requireRole('members');
      if(request.method==='GET')return reviewJSON((await env.DB.prepare('SELECT user_id,email,role,active,created FROM maintainers ORDER BY created').all()).results);
      if(request.method==='POST'){
        const body=await boundedJSON(request);
        if(!/^[A-Za-z0-9._:-]{3,200}$/.test(body.userId||'')||!['reviewer','publisher'].includes(body.role)||typeof body.email!=='string'||body.email.length>200||!body.email.includes('@')||typeof body.active!=='boolean')reject('维护者信息无效');
        const old=await env.DB.prepare('SELECT * FROM maintainers WHERE user_id=?').bind(body.userId).first();if(old?.role==='owner')reject('不能通过此接口改变所有者',403);
        await env.DB.prepare('INSERT INTO maintainers (user_id,email,role,active,created,created_by) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,role=excluded.role,active=excluded.active').bind(body.userId,body.email,body.role,body.active?1:0,Date.now(),member.user_id).run();
        await audit(env,member.user_id,'member.update',body.userId,{role:body.role,active:body.active});return reviewJSON({ok:true});
      }
    }
    if(path==='/api/review/audit'&&request.method==='GET'){requireRole('audit');return reviewJSON((await env.DB.prepare('SELECT id,actor,action,target,detail,created FROM review_audit ORDER BY created DESC LIMIT 100').all()).results);}
    const fileMatch=path.match(/^\/api\/review\/files\/([a-f0-9-]{36})\/(\d)$/);
    if(fileMatch&&request.method==='GET'){
      const row=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(fileMatch[1]).first();if(!row)reject('投稿不存在',404);
      const file=JSON.parse(row.files)[Number(fileMatch[2])];if(!file)reject('文件不存在',404);const object=await env.BUCKET.get(file.key);if(!object)reject('文件已清理',404);
      const ext=file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();const mime={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.txt':'text/plain; charset=utf-8','.csv':'text/plain; charset=utf-8'}[ext];
      return new Response(object.body,{headers:{'Content-Type':mime||'application/octet-stream','Content-Disposition':`${mime?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Length':String(file.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
    }
    const match=path.match(/^\/api\/review\/submissions\/([a-f0-9-]{36})\/(approve|reject|publish|recover)$/);
    if(!match||request.method!=='POST')reject('接口不存在',404);
    const [,id,action]=match;requireRole(action);const body=await boundedJSON(request);
    const row=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(id).first();if(!row)reject('投稿不存在',404);
    if(action==='approve'){
      if(row.state!=='pending')reject('此投稿正在发布或已处理',409);
      const data=validateReview(body,await(deps.courses||reviewCourses)(),JSON.parse(row.metadata));
      const old=await env.DB.prepare('SELECT * FROM reviews WHERE submission_id=?').bind(id).first();
      if(body.version!==(old?.version||0))reject('审核信息已变化，请刷新',409);
      const result=await env.DB.prepare("INSERT INTO reviews (submission_id,version,metadata,actor,updated) SELECT ?,1,?,?,? WHERE EXISTS (SELECT 1 FROM submissions WHERE id=? AND state='pending') AND NOT EXISTS (SELECT 1 FROM publish_jobs WHERE submission_id=? AND state IN ('queued','dispatch_unknown','running')) ON CONFLICT(submission_id) DO UPDATE SET version=reviews.version+1,metadata=excluded.metadata,actor=excluded.actor,updated=excluded.updated WHERE reviews.version=?").bind(id,JSON.stringify(data),member.user_id,Date.now(),id,id,body.version).run();
      if(!result.meta.changes)reject('审核信息已变化，请刷新',409);
      await audit(env,member.user_id,'review.approve',id,{version:body.version+1});return reviewJSON({ok:true,version:body.version+1});
    }
    if(action==='reject'){
      if(row.state!=='pending')reject('正在发布或已处理，不能删除',409);
      const reason=typeof body.reason==='string'?body.reason.trim():'';if(!reason||reason.length>500)reject('请填写拒绝理由');
      const changed=await env.DB.prepare("UPDATE submissions SET state='rejected' WHERE id=? AND state='pending'").bind(id).run();if(!changed.meta.changes)reject('投稿状态已变化',409);
      await audit(env,member.user_id,'review.reject',id,{reason});await Promise.all(JSON.parse(row.files).map(file=>env.BUCKET.delete(file.key)));return reviewJSON({ok:true});
    }
    if(action==='recover'){
      const old=await env.DB.prepare("SELECT * FROM publish_jobs WHERE submission_id=? AND state IN ('queued','dispatch_unknown','running') ORDER BY created DESC LIMIT 1").bind(id).first();
      if(!old||old.expires>Date.now())reject('任务授权尚未过期，请先核对 GitHub Actions；一小时过期后可恢复。',409);
      await env.DB.prepare("UPDATE publish_jobs SET state='failed',error='任务过期，由所有者恢复待审' WHERE id=?").bind(old.id).run();
      await env.DB.prepare("UPDATE submissions SET state='pending' WHERE id=? AND state='publishing'").bind(id).run();await audit(env,member.user_id,'publish.recover',id,{job:old.id});return reviewJSON({ok:true});
    }
    const active=await env.DB.prepare("SELECT id,state FROM publish_jobs WHERE submission_id=? AND state IN ('queued','dispatch_unknown','running') ORDER BY created DESC LIMIT 1").bind(id).first();if(active)return reviewJSON({job:active.id,state:active.state});
    if(row.state!=='pending')reject('此投稿已处理',409);
    const configuration=publisherConfiguration(env);
    if(!configuration.configured)reject(publisherConfigurationMessage(configuration),503);
    const review=await env.DB.prepare('SELECT * FROM reviews WHERE submission_id=?').bind(id).first();if(!review||review.version!==body.version)reject('请先保存审核结论，或刷新审核版本',409);
    validateReview(JSON.parse(review.metadata),await(deps.courses||reviewCourses)());
    const jobId=crypto.randomUUID();
    const inserted=await env.DB.prepare("INSERT INTO publish_jobs (id,submission_id,state,token_hash,expires,actor,review,created) SELECT ?,?,'queued',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM submissions WHERE id=? AND state='pending') AND EXISTS (SELECT 1 FROM reviews WHERE submission_id=? AND version=?) AND NOT EXISTS (SELECT 1 FROM publish_jobs WHERE submission_id=? AND state IN ('queued','dispatch_unknown','running'))").bind(jobId,id,'unclaimed',Date.now()+3600000,member.user_id,review.metadata,Date.now(),id,id,review.version,id).run();
    if(!inserted.meta.changes)reject('此投稿已有发布任务，请刷新',409);
    await env.DB.prepare("UPDATE submissions SET state='publishing' WHERE id=? AND state='pending'").bind(id).run();await audit(env,member.user_id,'publish.queue',id,{job:jobId,version:review.version});
    try{await(deps.dispatch||dispatchPublish)(env,{id:jobId},new URL(request.url).origin);}
    catch(error){const state=error.definite?'failed':'dispatch_unknown',message=error.definite?publisherFailureMessage(error):'工作流派发未确认，请检查 GitHub Actions，不要重复公开。';const changed=await env.DB.prepare("UPDATE publish_jobs SET state=?,error=? WHERE id=? AND state='queued'").bind(state,message,jobId).run();if(error.definite&&changed.meta.changes)await env.DB.prepare("UPDATE submissions SET state='pending' WHERE id=? AND state='publishing'").bind(id).run();return reviewJSON({job:jobId,state:changed.meta.changes?state:'running',message:changed.meta.changes?message:'工作流已开始处理，请刷新队列查看。'},202);}
    return reviewJSON({job:jobId,state:'queued'},202);
  }catch(error){return reviewJSON({error:error.status?error.message:'审核服务暂不可用，请稍后重试',subject:error.status===403?user?.userId:undefined},error.status||503);}
}
export async function handlePublishJob(request,env,deps={}){
  try{
    const match=new URL(request.url).pathname.match(/^\/api\/publish-jobs\/([a-f0-9-]{36})(?:\/(files\/\d|complete|failed))?$/);if(!match||!uuid.test(match[1]))reject('接口不存在',404);
    let job=await env.DB.prepare('SELECT * FROM publish_jobs WHERE id=?').bind(match[1]).first();
    if(!job||job.expires<Date.now())reject('发布任务授权失效',401);
    if(!['queued','dispatch_unknown','running','complete'].includes(job.state))reject('任务已关闭',409);
    const identity=await(deps.identity||verifyActionsIdentity)(request,job.id);
    const fingerprint=await sha256(identity);
    if(['queued','dispatch_unknown'].includes(job.state)){
      await env.DB.prepare("UPDATE publish_jobs SET token_hash=?,state='running' WHERE id=? AND state IN ('queued','dispatch_unknown')").bind(fingerprint,job.id).run();
      job=await env.DB.prepare('SELECT * FROM publish_jobs WHERE id=?').bind(job.id).first();
    }
    if(job.token_hash!==fingerprint)reject('此任务已绑定其他工作流运行',403);
    const row=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(job.submission_id).first();if(!row)reject('投稿不存在',404);
    const files=JSON.parse(row.files);
    if(!match[2]&&request.method==='GET'){
      if(job.state==='complete')reject('此任务已完成',409);
      await env.DB.prepare("UPDATE publish_jobs SET state='running' WHERE id=?").bind(job.id).run();
      return reviewJSON({id:job.id,submissionId:row.id,review:JSON.parse(job.review),files:files.map(({name,size},index)=>({name,size,index})),repository:'CobaltJiang/OpenNNU'});
    }
    if(match[2]?.startsWith('files/')&&request.method==='GET'){
      if(job.state==='complete')reject('此任务已完成',409);const file=files[Number(match[2].split('/')[1])];if(!file)reject('文件不存在',404);const object=await env.BUCKET.get(file.key);if(!object)reject('文件不存在',404);
      return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(file.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(request.method!=='POST')reject('接口不存在',404);const body=await boundedJSON(request);
    if(match[2]==='failed'){
      if(job.state==='complete')reject('此任务已完成',409);await env.DB.prepare("UPDATE publish_jobs SET state='failed',error='GitHub Actions 执行失败，请查看工作流日志。' WHERE id=?").bind(job.id).run();await env.DB.prepare("UPDATE submissions SET state='pending' WHERE id=? AND state='publishing'").bind(row.id).run();await audit(env,job.actor,'publish.failed',row.id,{job:job.id});return reviewJSON({ok:true});
    }
    if(match[2]!=='complete'||!/^[a-f0-9]{40}$/.test(body.sha||''))reject('提交回执无效');
    if(job.state==='complete'&&body.sha!==job.receipt)reject('已完成任务的提交回执不能改写',409);
    if(job.state!=='complete'&&!await(deps.verify||verifyPublished)(env,{...job,fileCount:files.length},body.sha))reject('无法确认 GitHub 收录记录，请稍后重试',409);
    await env.DB.prepare("UPDATE publish_jobs SET state='complete',receipt=? WHERE id=?").bind(body.sha,job.id).run();await env.DB.prepare("UPDATE submissions SET state='imported',receipt=? WHERE id=?").bind(body.sha,row.id).run();await audit(env,job.actor,'publish.complete',row.id,{job:job.id,sha:body.sha});
    await Promise.all(files.map(file=>env.BUCKET.delete(file.key)));return reviewJSON({ok:true});
  }catch(error){return reviewJSON({error:error.status?error.message:'发布任务服务暂不可用'},error.status||503);}
}
