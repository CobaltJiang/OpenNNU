export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_BYTES = 100 * 1024 * 1024;
export const EXTENSIONS = /\.(pdf|docx|xlsx|pptx|zip|png|jpe?g|webp|txt|csv)$/i;
const origins = new Set(['https://cobaltjiang.github.io', 'http://127.0.0.1:4174', 'http://127.0.0.1:4173']);
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
export function validateDraft(form) {
  const draft = {};
  for (const [key, max] of Object.entries({course:150,title:80,type:30,year:40,source:300,note:300})) {
    const value = form.get(key);
    if (typeof value !== 'string' || value.length > max) fail('资料信息不完整或过长');
    draft[key] = value.trim();
  }
  if (!draft.course || !draft.title || !draft.source || form.get('permission') !== 'yes') fail('请填写资料信息并确认分享许可');
  if (form.get('website')) fail('提交无效');
  const files = form.getAll('files');
  if (!files.length || files.length > 5) fail('请选择 1–5 个文件');
  let total = 0;
  for (const file of files) {
    if (typeof file === 'string' || !file.name || file.name.length > 160 || /[\x00-\x1f/\\]/.test(file.name) || !EXTENSIONS.test(file.name)) fail('不支持此文件名或格式');
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) fail('单文件须为 1 B–50 MB');
    total += file.size;
  }
  if (total > MAX_BYTES) fail('文件总大小不能超过 100 MB');
  return { draft, files };
}
export async function handleUpload(request, env) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const allowed = origins.has(origin) || origin === url.origin;
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Ticket', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' } : {};
  try {
    if (!env.DB || !env.BUCKET || !env.UPLOAD_ADMIN_KEY) fail('上传服务尚未配置', 503);
    if (url.pathname.startsWith('/api/admin')) return await admin(request, env);
    if (!allowed) fail('不允许的来源', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
    const now = Date.now();
    if (url.pathname === '/api/ticket' && request.method === 'POST') {
      const ip = await digest(`${env.UPLOAD_ADMIN_KEY}:${request.headers.get('CF-Connecting-IP') || 'local'}:${new Date().toISOString().slice(0,10)}`);
      const id = crypto.randomUUID();
      const result = await env.DB.prepare('INSERT INTO tickets (id,ip,created,used) SELECT ?,?,?,0 WHERE (SELECT count(*) FROM tickets WHERE ip=? AND created>?)<10 AND (SELECT count(*) FROM tickets WHERE created>?)<100').bind(id,ip,now,ip,now-86400000,now-86400000).run();
      if (!result.meta.changes) fail('今天的上传次数已达上限，请稍后再试',429);
      return json({ticket:id},200,cors);
    }
    if (url.pathname.startsWith('/api/uploads/')) return await streamingUpload(request,env,cors,now);
    if (url.pathname !== '/api/upload' || request.method !== 'POST') fail('接口不存在',404);
    const id = request.headers.get('X-Upload-Ticket');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) fail('请刷新上传页面',403);
    const prior = await env.DB.prepare('SELECT id FROM submissions WHERE id=?').bind(id).first();
    if (prior) return json({id:prior.id,state:'pending'},200,cors);
    const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?').bind(id).first();
    if (!ticket || ticket.used || now-ticket.created>1800000) fail('上传会话已失效，请重试',403);
    if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) fail('请使用文件上传表单');
    const reader = request.body?.getReader();
    if (!reader) fail('没有文件内容');
    const chunks=[]; let size=0;
    // Keep the old multipart endpoint bounded for clients with cached frontend code.
    for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>20*1024*1024+64*1024){await reader.cancel();fail('请刷新页面，使用新版大文件上传',413);} chunks.push(value); }
    const form = await new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();
    const {draft,files}=validateDraft(form);
    const claimed = await env.DB.prepare('UPDATE tickets SET used=1 WHERE id=? AND used=0').bind(id).run();
    if (!claimed.meta.changes) fail('正在处理此投稿，请勿重复提交',409);
    const stored=[];
    try {
      for (const [index,file] of files.entries()) {
        const key=`pending/${id}/${index}`;
        await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:'application/octet-stream'}});
        stored.push({key,name:file.name,size:file.size});
      }
      await env.DB.prepare('INSERT INTO submissions (id,created,state,metadata,files) VALUES (?,?,\'pending\',?,?)').bind(id,now,JSON.stringify(draft),JSON.stringify(stored)).run();
    } catch (error) { await Promise.all(stored.map(file=>env.BUCKET.delete(file.key))); await env.DB.prepare('UPDATE tickets SET used=0 WHERE id=?').bind(id).run(); throw error; }
    return json({id,state:'pending'},201,cors);
  } catch(error) { return json({error:error.status?error.message:'上传服务暂时不可用，请稍后重试'},error.status||503,cors); }
}
async function smallJSON(request) {
  const reader=request.body?.getReader(); if(!reader) fail('缺少资料信息');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail('资料信息过长',413);}chunks.push(value);}
  try{return JSON.parse(await new Blob(chunks).text());}catch{fail('资料信息格式无效');}
}
async function streamingUpload(request,env,cors,now) {
  const path=new URL(request.url).pathname;
  const id=request.headers.get('X-Upload-Ticket');
  if(!/^[a-f0-9-]{36}$/.test(id||''))fail('请刷新上传页面',403);
  const ticket=await env.DB.prepare('SELECT * FROM tickets WHERE id=?').bind(id).first();
  if(!ticket || now-ticket.created>1800000)fail('上传会话已失效，请重试',403);
  const row=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(id).first();
  if(path==='/api/uploads/start' && request.method==='POST') {
    const manifest=await smallJSON(request);
    const {draft,files}=validateDraft({get:key=>manifest[key],getAll:key=>key==='files'&&Array.isArray(manifest.files)?manifest.files:[]});
    const planned=files.map((file,index)=>({key:`pending/${id}/${index}`,name:file.name,size:file.size}));
    if(row) {
      if(row.metadata!==JSON.stringify(draft)||row.files!==JSON.stringify(planned))fail('表单已修改，请重新提交',409);
      if(!['uploading','pending'].includes(row.state))fail('此投稿已经处理，请重新提交',409);
      return json({id,state:row.state},200,cors);
    }
    if(ticket.used)fail('上传会话已使用，请重试',403);
    const claimed=await env.DB.prepare('UPDATE tickets SET used=1 WHERE id=? AND used=0').bind(id).run();
    if(!claimed.meta.changes)fail('正在处理此投稿，请勿重复提交',409);
    try{await env.DB.prepare("INSERT INTO submissions (id,created,state,metadata,files) VALUES (?,?,'uploading',?,?)").bind(id,now,JSON.stringify(draft),JSON.stringify(planned)).run();}
    catch(error){await env.DB.prepare('UPDATE tickets SET used=0 WHERE id=?').bind(id).run();throw error;}
    return json({id,state:'uploading'},201,cors);
  }
  const match=path.match(/^\/api\/uploads\/([a-f0-9-]{36})\/(\d+|complete)$/);
  if(!match||match[1]!==id||!row)fail('上传会话不存在',404);
  if(match[2]==='complete' && request.method==='POST') {
    if(row.state==='pending')return json({id,state:'pending'},200,cors);
    if(row.state!=='uploading')fail('此投稿已经处理',409);
    for(const file of JSON.parse(row.files)){const object=await env.BUCKET.head(file.key);if(!object||object.size!==file.size)fail('文件尚未完整上传，请重试',409);}
    await env.DB.prepare("UPDATE submissions SET state='pending' WHERE id=? AND state='uploading'").bind(id).run();
    return json({id,state:'pending'},201,cors);
  }
  if(request.method!=='PUT'||match[2]==='complete')fail('接口不存在',404);
  if(row.state!=='uploading')fail('投稿已提交，不能覆盖文件',409);
  const file=JSON.parse(row.files)[Number(match[2])];if(!file)fail('文件不存在',404);
  if(!request.body)fail('没有文件内容');
  // FixedLengthStream enforces the declared size with backpressure: no full-file buffering.
  const stream=typeof FixedLengthStream!=='undefined'?new FixedLengthStream(file.size):exactLengthStream(file.size);
  const piping=request.body.pipeTo(stream.writable);
  try{await Promise.all([piping,env.BUCKET.put(file.key,stream.readable,{httpMetadata:{contentType:'application/octet-stream'}})]);}
  catch{await env.BUCKET.delete(file.key);fail('文件大小与声明不符或传输中断，请重试',400);}
  return json({ok:true},200,cors);
}
// Node test/runtime equivalent; hosted Workers use the native FixedLengthStream above.
export function exactLengthStream(expected) {
  let size=0;
  return new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>expected)throw new Error('length exceeded');controller.enqueue(chunk);},flush(){if(size!==expected)throw new Error('length mismatch');}});
}
async function admin(request,env) {
  if (request.headers.get('Authorization') !== `Bearer ${env.UPLOAD_ADMIN_KEY}`) fail('未授权',401);
  const url=new URL(request.url);
  if(url.pathname==='/api/admin/pending' && request.method==='GET') {
    const rows=await env.DB.prepare("SELECT * FROM submissions WHERE state='pending' ORDER BY created LIMIT 100").all();
    return json(rows.results.map(row=>({...row,metadata:JSON.parse(row.metadata),files:JSON.parse(row.files)})));
  }
  const match=url.pathname.match(/^\/api\/admin\/([a-f0-9-]{36})(?:\/(\d+))?$/);
  if(!match) fail('接口不存在',404);
  const row=await env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(match[1]).first();
  if(!row) fail('投稿不存在',404);
  const files=JSON.parse(row.files);
  if(request.method==='GET' && match[2]!==undefined) {
    const file=files[Number(match[2])]; if(!file) fail('文件不存在',404);
    const object=await env.BUCKET.get(file.key); if(!object) fail('文件不存在',404);
    return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method==='POST' && match[2]===undefined) {
    const body=await request.json();
    if(!['imported','rejected'].includes(body.state)) fail('无效状态');
    if(body.state==='imported' && !/^[a-f0-9]{40}$/.test(body.receipt||'')) fail('缺少提交记录');
    await env.DB.prepare('UPDATE submissions SET state=?,receipt=? WHERE id=?').bind(body.state,body.receipt||null,row.id).run();
    await Promise.all(files.map(file=>env.BUCKET.delete(file.key)));
    return json({ok:true});
  }
  fail('接口不存在',404);
}
