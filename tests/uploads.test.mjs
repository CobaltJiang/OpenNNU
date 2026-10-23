import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { handleUpload, validateDraft } from '../upload-service/lib/uploads.mjs';
import { validateFiles, submitUpload } from '../assets/uploads.js';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, UPLOAD_LIMIT_HINT } from '../upload-service/lib/upload-policy.mjs';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE tickets(id TEXT PRIMARY KEY,ip TEXT,created INTEGER,used INTEGER DEFAULT 0); CREATE TABLE submissions(id TEXT PRIMARY KEY,created INTEGER,state TEXT,metadata TEXT,files TEXT,receipt TEXT);');
  const objects=new Map();
  const env={UPLOAD_ADMIN_KEY:'test-only-secret',DB:{prepare(sql){return{bind(...values){return{async run(){return{meta:{changes:db.prepare(sql).run(...values).changes}};},async first(){return db.prepare(sql).get(...values);},async all(){return{results:db.prepare(sql).all(...values)};}};},async all(){return{results:db.prepare(sql).all()};}};}},BUCKET:{async put(key,stream){objects.set(key,await new Response(stream).arrayBuffer());},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async head(key){return objects.has(key)?{size:objects.get(key).byteLength}:null;},async delete(key){objects.delete(key);}}};
  return{env,db,objects};
}
const origin='https://cobaltjiang.github.io', base='https://upload.example';
function draft() {const form=new FormData();for(const [key,value] of Object.entries({course:'力学（1007003065）',title:'测试资料',type:'课程笔记',year:'2026',source:'测试自编，允许分享',note:'',permission:'yes'}))form.set(key,value);form.append('files',new File(['hello'],'笔记.txt'));return form;}
test('前后端均限制文件数量、格式、大小和明确分享许可',()=>{
  assert.equal(validateFiles([{name:'笔记.pdf',size:100}]),'');
  for(const files of [[],[{name:'x.exe',size:5}],[{name:'x.pdf',size:MAX_FILE_BYTES+1}],[{name:'x.pdf',size:0}],Array(6).fill({name:'x.pdf',size:1})])assert.ok(validateFiles(files));
  const form=draft(); assert.equal(validateDraft(form).draft.course,'力学（1007003065）');form.delete('permission');assert.throws(()=>validateDraft(form),/许可/);
  const traversal=draft();traversal.set('files',new File(['x'],'../bad.txt'));assert.throws(()=>validateDraft(traversal),/文件名/);
});
test('匿名上传持久写入、重试不重复、管理员回读、拒绝清理',async()=>{
  const {env,db,objects}=fixture();
  try{
    const ticketResponse=await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:origin}}),env);
    assert.equal(ticketResponse.status,200);assert.equal(ticketResponse.headers.get('Access-Control-Allow-Origin'),origin);
    const {ticket}=await ticketResponse.json();
    const send=()=>handleUpload(new Request(`${base}/api/upload`,{method:'POST',headers:{Origin:origin,'X-Upload-Ticket':ticket},body:draft()}),env);
    const uploaded=await send();assert.equal(uploaded.status,201);assert.equal((await uploaded.json()).state,'pending');assert.equal(objects.size,1);
    assert.equal((await send()).status,200);assert.equal(db.prepare('SELECT count(*) n FROM submissions').get().n,1);
    const adminHeaders={Authorization:`Bearer ${env.UPLOAD_ADMIN_KEY}`};
    assert.equal((await handleUpload(new Request(`${base}/api/admin/pending`),env)).status,401);
    const list=await handleUpload(new Request(`${base}/api/admin/pending`,{headers:adminHeaders}),env);assert.equal((await list.json())[0].files[0].name,'笔记.txt');
    const file=await handleUpload(new Request(`${base}/api/admin/${ticket}/0`,{headers:adminHeaders}),env);assert.equal(await file.text(),'hello');
    const rejected=await handleUpload(new Request(`${base}/api/admin/${ticket}`,{method:'POST',headers:{...adminHeaders,'Content-Type':'application/json'},body:JSON.stringify({state:'rejected'})}),env);
    assert.equal(rejected.status,200);assert.equal(objects.size,0);
  }finally{db.close();}
});
test('错误来源、失效会话、滥用配额和无许可上传均拒绝',async()=>{
  const {env,db}=fixture();try{
    const rejected=await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:'https://evil.example'}}),env);
    assert.equal(rejected.status,403);
    // 被拒的来源也要能读到原因，否则浏览器只会显示 Failed to fetch。
    assert.equal(rejected.headers.get('Access-Control-Allow-Origin'),'https://evil.example');
    assert.equal((await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:'https://evil.example'}}),env)).status,403);
    const request=()=>new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:origin}});
    let ticket;for(let i=0;i<10;i++){const r=await handleUpload(request(),env);assert.equal(r.status,200);ticket=(await r.json()).ticket;}
    assert.equal((await handleUpload(request(),env)).status,429);
    const form=draft();form.delete('permission');assert.equal((await handleUpload(new Request(`${base}/api/upload`,{method:'POST',headers:{Origin:origin,'X-Upload-Ticket':ticket},body:form}),env)).status,400);
    db.prepare('UPDATE tickets SET created=0 WHERE id=?').run(ticket);
    assert.equal((await handleUpload(new Request(`${base}/api/upload`,{method:'POST',headers:{Origin:origin,'X-Upload-Ticket':ticket},body:draft()}),env)).status,403);
  }finally{db.close();}
});

test('发布诊断仅接受管理密钥，不返回配置值或修改投稿',async()=>{
  const {env,db}=fixture();try{
    assert.equal((await handleUpload(new Request(`${base}/api/admin/publisher-check`),env)).status,401);
    const response=await handleUpload(new Request(`${base}/api/admin/publisher-check`,{headers:{Authorization:`Bearer ${env.UPLOAD_ADMIN_KEY}`}}),env);
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,false);assert.equal(result.configuration.missing.length,3);
    assert.equal(db.prepare('SELECT count(*) n FROM submissions').get().n,0);assert.doesNotMatch(JSON.stringify(result),/test-only-secret/);
  }finally{db.close();}
});
test('网页主投稿入口是真文件表单，不再跳转 GitHub 或包含令牌',async()=>{
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  assert.match(app,/type="file" name="files" multiple required/);assert.match(app,/submitUpload\(site.uploadService/);assert.ok(app.includes('${e(UPLOAD_LIMIT_HINT)}'));assert.equal(UPLOAD_LIMIT_HINT,'1–5 个文件 · 单个 ≤ 90 MB · 合计 ≤ 300 MB');assert.ok(!app.includes('window.open(url'));assert.ok(!app.includes('需登录 GitHub'));
});
test('提示与前后端共用策略，接受 90 MB 与合计 300 MB 并拒绝越界',()=>{
  const mb=1024*1024;
  const check=files=>{const form=draft();return validateDraft({get:key=>form.get(key),getAll:()=>files});};
  for(const size of [20*mb,50*mb,MAX_FILE_BYTES]){const files=[{name:'资料.pdf',size}];assert.equal(validateFiles(files),'');assert.equal(check(files).files[0].size,size);}
  const full=Array.from({length:3},(_,i)=>({name:`${i}.pdf`,size:MAX_FILE_BYTES}));full.push({name:'last.pdf',size:MAX_TOTAL_BYTES-3*MAX_FILE_BYTES});
  assert.equal(validateFiles(full),'');assert.equal(check(full).files.length,4);
  for(const files of [[{name:'x.pdf',size:MAX_FILE_BYTES+1}],[...full,{name:'x.txt',size:1}]]){assert.ok(validateFiles(files));assert.throws(()=>check(files),/90 MB|300 MB/);}
});
test('50 MB 文件流式接收，完整校验后才进入待审，支持安全重试',async()=>{
  const {env,db,objects}=fixture();try{
    const {ticket}=await (await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:origin}}),env)).json();
    const headers={Origin:origin,'X-Upload-Ticket':ticket};
    const manifest=Object.fromEntries([...draft().entries()].filter(([key])=>key!=='files'));
    const size=50*1024*1024;manifest.files=[{name:'large.pdf',size}];
    const start=()=>handleUpload(new Request(`${base}/api/uploads/start`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(manifest)}),env);
    assert.equal((await start()).status,201);assert.equal((await start()).status,200);
    const complete=()=>handleUpload(new Request(`${base}/api/uploads/${ticket}/complete`,{method:'POST',headers}),env);
    assert.equal((await complete()).status,409);assert.equal(db.prepare('SELECT state FROM submissions WHERE id=?').get(ticket).state,'uploading');
    const chunk=new Uint8Array(256*1024);let sent=0;
    const stream=new ReadableStream({pull(controller){if(sent===size){controller.close();return;}controller.enqueue(chunk);sent+=chunk.length;}});
    const uploaded=await handleUpload(new Request(`${base}/api/uploads/${ticket}/0`,{method:'PUT',headers,body:stream,duplex:'half'}),env);
    assert.equal(uploaded.status,200);assert.equal(objects.get(`pending/${ticket}/0`).byteLength,size);
    assert.equal((await complete()).status,201);assert.equal((await complete()).status,200);
    assert.equal(db.prepare('SELECT state FROM submissions WHERE id=?').get(ticket).state,'pending');
    const overwrite=await handleUpload(new Request(`${base}/api/uploads/${ticket}/0`,{method:'PUT',headers,body:'x'}),env);assert.equal(overwrite.status,409);
  }finally{db.close();}
});
test('流式接口拒绝伪造长度的超额与不完整文件',async()=>{
  for(const bytes of ['abc','abcde']){
    const {env,db,objects}=fixture();try{
      const {ticket}=await (await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:origin}}),env)).json();
      const headers={Origin:origin,'X-Upload-Ticket':ticket};const manifest=Object.fromEntries([...draft().entries()].filter(([key])=>key!=='files'));manifest.files=[{name:'file.txt',size:4}];
      await handleUpload(new Request(`${base}/api/uploads/start`,{method:'POST',headers,body:JSON.stringify(manifest)}),env);
      const r=await handleUpload(new Request(`${base}/api/uploads/${ticket}/0`,{method:'PUT',headers,body:bytes}),env);
      assert.equal(r.status,400);assert.equal(objects.size,0);assert.equal(db.prepare('SELECT state FROM submissions WHERE id=?').get(ticket).state,'uploading');
    }finally{db.close();}
  }
});
test('浏览器传输协议逐个发送原文件，并在全部完成后提交审核',async()=>{
  const originalFetch=globalThis.fetch,originalXHR=globalThis.XMLHttpRequest;
  const calls=[],sent=[],progress=[];const id='00000000-0000-4000-8000-000000000001';
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json(String(url).endsWith('/ticket')?{ticket:id}:String(url).endsWith('/start')?{id,state:'uploading'}:{id,state:'pending'});};
  globalThis.XMLHttpRequest=class {
    upload={};headers={};
    open(method,url){this.method=method;this.url=String(url);}
    setRequestHeader(key,value){this.headers[key]=value;}
    send(file){sent.push({method:this.method,url:this.url,file,headers:this.headers});this.upload.onprogress({lengthComputable:true,loaded:file.size,total:file.size});this.status=200;this.responseText='{"ok":true}';queueMicrotask(()=>this.onload());}
  };
  try{
    const form=draft();form.append('files',new File(['world'],'第二份.txt'));
    const result=await submitUpload(base,form,{onProgress:value=>progress.push(value)});
    assert.equal(result.state,'pending');assert.equal(sent.length,2);assert.ok(sent.every(item=>item.method==='PUT'&&item.file instanceof File&&item.headers['X-Upload-Ticket']===id));
    const manifest=JSON.parse(calls[1].options.body);assert.deepEqual(manifest.files,[{name:'笔记.txt',size:5},{name:'第二份.txt',size:5}]);
    assert.ok(calls[2].url.endsWith('/complete'));assert.deepEqual(progress,[50,100]);
  }finally{globalThis.fetch=originalFetch;if(originalXHR===undefined)delete globalThis.XMLHttpRequest;else globalThis.XMLHttpRequest=originalXHR;}
});

test('连接断开时保留已选文件，并给出重试与备用提交渠道',async()=>{
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  const network=await readFile(new URL('../assets/network.js',import.meta.url),'utf8');
  assert.match(app,/id="upload-help" *hidden/);
  assert.match(app,/data-retry-upload/);
  assert.match(app,/contributionURL\(site\.repository,draftOf\(form\)\)/);
  assert.match(app,/备用入口受 GitHub 附件限制/);
  assert.match(network,/networkMessage/);
  const uploads=await readFile(new URL('../assets/uploads.js',import.meta.url),'utf8');
  for(const step of ['获取上传凭据','建立上传会话','确认提交'])assert.ok(uploads.includes(`step:'${step}'`),step);
});
