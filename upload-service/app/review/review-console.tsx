'use client';
import {useEffect,useState} from 'react';
import './review.css';
type Course={id:string;name:string;code:string};
type Config={user:{id:string;email:string;role:string};capabilities:string[];publisherConfigured:boolean;courses:Course[]};
type Metadata={course?:string;courseId?:string;title?:string;type?:string;year?:string;source?:string;note?:string;license?:string;rightsBasis?:string;origin?:string;answerStatus?:string};
type Item={id:string;state:string;created:number;metadata:Metadata;review_version:number|null;reviewed:Metadata|null;files:{name:string;size:number;index:number}[]};
async function api<T=Record<string,unknown>>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/review/${path}`,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Review-Request':'1'},body:JSON.stringify(body)});
  const result=await response.json() as T&{error?:string;subject?:string};if(!response.ok)throw new Error(`${result.error||'请求失败'}${result.subject?`（维护者身份编号：${result.subject}）`:''}`);return result;
}
export default function ReviewConsole({signedInEmail}:{signedInEmail:string}){
  const [config,setConfig]=useState<Config|null>(null),[items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[extra,setExtra]=useState('');
  async function load(){setBusy(true);setError('');try{const conf=await api<Config>('config');setConfig(conf);setItems(await api<Item[]>('queue'));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void load();},[]);
  return <><section className="review-toolbar"><span>{signedInEmail}{config?` · ${config.user.role}`:''}</span><button onClick={()=>void load()} disabled={busy}>刷新队列</button>{config?.capabilities.includes('audit')&&<button onClick={async()=>{try{setExtra(JSON.stringify(await api('audit'),null,2));}catch(error){setError((error as Error).message);}}}>操作日志</button>}{config?.capabilities.includes('members')&&<button onClick={async()=>{try{setExtra(JSON.stringify(await api('members'),null,2));}catch(error){setError((error as Error).message);}}}>维护者</button>}</section>
  {error&&<p className="review-error" role="alert">{error}</p>}
  {config&&!config.publisherConfigured&&<p className="review-notice">审核权限已启用；GitHub App 尚未配置，公开发布保持关闭。电脑关机不影响已部署的审核服务。</p>}
  {config&&<p className="review-count">待处理 {items.length} 份 · 维护者身份编号：{config.user.id}</p>}
  {config&&items.map(item=><ReviewCard key={`${item.id}:${item.review_version}:${item.state}`} item={item} config={config} onChange={load}/>)}
  {config&&!items.length&&!busy&&<section className="review-empty">暂无待审资料</section>}
  {extra&&<details open className="review-extra"><summary>管理信息</summary><pre>{extra}</pre><button onClick={()=>setExtra('')}>收起</button></details>}
  {config?.capabilities.includes('members')&&<MemberForm onSaved={load}/>}</>;
}
function ReviewCard({item,config,onChange}:{item:Item;config:Config;onChange:()=>Promise<void>}){
  const metadata=item.reviewed||{};
  const code=item.metadata.course?.match(/(\d{10})/ )?.[1];
  const initialCourse=metadata.courseId||config.courses.find(course=>course.code===code)?.id||'';
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  async function action(name:string,body:unknown){setBusy(true);setStatus('正在保存…');try{const result=await api(`submissions/${item.id}/${name}`,body);setStatus(result.job?`发布任务：${result.job} · ${result.state}`:'已保存');await onChange();}catch(error){setStatus((error as Error).message);}finally{setBusy(false);}}
  return <article className="review-card"><header><h2>{item.metadata.title||'未命名资料'}</h2><span>{item.metadata.course} · {new Date(item.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · {item.state==='publishing'?'正在发布':'待审核'}</span></header><div className="review-columns"><section><ul>{item.files.map(file=><li key={file.index}><a href={`/api/review/files/${item.id}/${file.index}`} target="_blank" rel="noopener noreferrer">{file.name}</a><small>{(file.size/1024/1024).toFixed(1)} MB</small></li>)}</ul><details><summary>投稿原文（仅维护者可见）</summary><p>来源：{item.metadata.source}</p><p>备注：{item.metadata.note||'无'}</p></details>{item.files[0]?.name.toLowerCase().endsWith('.pdf')&&<details><summary>预览 PDF</summary><iframe title="待审 PDF" src={`/api/review/files/${item.id}/0`} sandbox="allow-same-origin"/></details>}</section>
  <form onSubmit={event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));void action('approve',{...data,version:item.review_version||0,permissionConfirmed:data.permissionConfirmed==='yes'});}}>
    <label>课程<select name="courseId" defaultValue={initialCourse} required><option value="">选择课程（课程号严格匹配）</option>{config.courses.map(course=><option key={course.id} value={course.id}>{course.name}（{course.code}）</option>)}</select></label>
    <label>公开标题<input name="title" defaultValue={metadata.title||item.metadata.title||''} maxLength={80} required/></label>
    <div className="review-row"><label>类型<select name="type" defaultValue={metadata.type||item.metadata.type}>{['历年试卷','课程笔记','复习提纲','习题解析','其他资料'].map(type=><option key={type}>{type}</option>)}</select></label><label>年份 / 学期<input name="year" defaultValue={metadata.year||item.metadata.year||'年份待核'} maxLength={40} required/></label></div>
    <label>公开来源说明<textarea name="source" defaultValue={metadata.source||''} maxLength={300} placeholder="核实来源后填写，勿包含私人信息" required/></label>
    <label>公开分享许可<input name="license" defaultValue={metadata.license||''} placeholder="填写实际获得的许可，不默认授权" maxLength={100} required/></label>
    <label>授权依据（仅维护者可见）<textarea name="rightsBasis" defaultValue={metadata.rightsBasis||''} placeholder="例如作者授权记录或明确许可的出处" maxLength={1000} required/></label>
    <div className="review-row"><label>来源类型<select name="origin" defaultValue={metadata.origin||'其他'}>{['原卷','回忆版','学生原创','教师授权','其他'].map(type=><option key={type}>{type}</option>)}</select></label><label>答案状态<select name="answerStatus" defaultValue={metadata.answerStatus||'答案未核对'}>{['无答案','答案未核对','答案已校对','不适用'].map(type=><option key={type}>{type}</option>)}</select></label></div>
    <label className="review-check"><input type="checkbox" name="permissionConfirmed" value="yes" required/>我已核对公开分享许可及必要的匿名化处理。</label>
    <div className="review-actions">{config.capabilities.includes('approve')&&<button disabled={busy||item.state!=='pending'} type="submit">保存审核结论</button>}{config.capabilities.includes('publish')&&<button type="button" disabled={busy||!item.review_version||item.state!=='pending'||!config.publisherConfigured} onClick={()=>{if(confirm('确认按已保存的审核结论发布？文件将进入公开 GitHub 仓库。'))void action('publish',{version:item.review_version});}}>公开发布</button>}{config.capabilities.includes('reject')&&<button className="danger" type="button" disabled={busy||item.state!=='pending'} onClick={()=>{const reason=prompt('拒绝理由（会清除待审文件）');if(reason&&confirm('确定拒绝并删除这份待审文件？'))void action('reject',{reason});}}>拒绝并清除</button>}</div><p className="review-status" role="status">{status}</p>
  </form></div></article>;
}
function MemberForm({onSaved}:{onSaved:()=>Promise<void>}){
  const [status,setStatus]=useState('');
  return <details className="review-extra"><summary>多人维护接口</summary><p>新维护者先登录此审核页，提供页面显示的身份编号。仅所有者可授权；审核者不能公开发布。</p><form onSubmit={async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));try{await api('members',{...data,active:data.active==='true'});setStatus('权限已更新');await onSaved();}catch(error){setStatus((error as Error).message);}}}><label>身份编号<input name="userId" required/></label><label>邮箱<input name="email" type="email" required/></label><label>角色<select name="role"><option value="reviewer">审核者</option><option value="publisher">发布者</option></select></label><label>状态<select name="active"><option value="true">启用</option><option value="false">撤销</option></select></label><button>保存权限</button><p role="status">{status}</p></form></details>;
}
