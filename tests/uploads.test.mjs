import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { handleUpload, validateDraft } from '../upload-service/lib/uploads.mjs';
import { validateFiles } from '../assets/uploads.js';

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE tickets(id TEXT PRIMARY KEY,ip TEXT,created INTEGER,used INTEGER DEFAULT 0); CREATE TABLE submissions(id TEXT PRIMARY KEY,created INTEGER,state TEXT,metadata TEXT,files TEXT,receipt TEXT);');
  const objects=new Map();
  const env={UPLOAD_ADMIN_KEY:'test-only-secret',DB:{prepare(sql){return{bind(...values){return{async run(){return{meta:{changes:db.prepare(sql).run(...values).changes}};},async first(){return db.prepare(sql).get(...values);},async all(){return{results:db.prepare(sql).all(...values)};}};},async all(){return{results:db.prepare(sql).all()};}};}},BUCKET:{async put(key,stream){objects.set(key,await new Response(stream).arrayBuffer());},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}};
  return{env,db,objects};
}
const origin='https://cobaltjiang.github.io', base='https://upload.example';
function draft() {const form=new FormData();for(const [key,value] of Object.entries({course:'力学（1007003065）',title:'测试资料',type:'课程笔记',year:'2026',source:'测试自编，允许分享',note:'',permission:'yes'}))form.set(key,value);form.append('files',new File(['hello'],'笔记.txt'));return form;}
test('前后端均限制文件数量、格式、大小和明确分享许可',()=>{
  assert.equal(validateFiles([{name:'笔记.pdf',size:100}]),'');
  for(const files of [[],[{name:'x.exe',size:5}],[{name:'x.pdf',size:9*1024*1024}],[{name:'x.pdf',size:0}],Array(6).fill({name:'x.pdf',size:1})])assert.ok(validateFiles(files));
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
    assert.equal((await handleUpload(new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:'https://evil.example'}}),env)).status,403);
    const request=()=>new Request(`${base}/api/ticket`,{method:'POST',headers:{Origin:origin}});
    let ticket;for(let i=0;i<10;i++){const r=await handleUpload(request(),env);assert.equal(r.status,200);ticket=(await r.json()).ticket;}
    assert.equal((await handleUpload(request(),env)).status,429);
    const form=draft();form.delete('permission');assert.equal((await handleUpload(new Request(`${base}/api/upload`,{method:'POST',headers:{Origin:origin,'X-Upload-Ticket':ticket},body:form}),env)).status,400);
    db.prepare('UPDATE tickets SET created=0 WHERE id=?').run(ticket);
    assert.equal((await handleUpload(new Request(`${base}/api/upload`,{method:'POST',headers:{Origin:origin,'X-Upload-Ticket':ticket},body:draft()}),env)).status,403);
  }finally{db.close();}
});
test('网页主投稿入口是真文件表单，不再跳转 GitHub 或包含令牌',async()=>{
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  assert.match(app,/type="file" name="files" multiple required/);assert.match(app,/submitUpload\(site.uploadService/);assert.ok(!app.includes('window.open(url'));assert.ok(!app.includes('需登录 GitHub'));
});
