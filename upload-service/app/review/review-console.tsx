'use client';
import {useEffect,useState} from 'react';
import {reviewDefaults,acceptSubmission,TYPES,ORIGINS,ANSWERS} from '../../lib/review-policy.mjs';
import './review.css';

type Course={id:string;name:string;code:string};
type Config={user:{id:string;email:string;role:string};capabilities:string[];publisherConfigured:boolean;courses:Course[]};
type Metadata={course?:string;courseId?:string;title?:string;type?:string;year?:string;source?:string;note?:string;license?:string;rightsBasis?:string;origin?:string;answerStatus?:string;permission?:string;permissionConfirmed?:boolean};
type Item={id:string;state:string;created:number;metadata:Metadata;review_version:number|null;reviewed:Metadata|null;files:{name:string;size:number;index:number}[]};
type Tab='pending'|'approved'|'publishing'|'all';
const roleNames:Record<string,string>={owner:'管理员',reviewer:'审核者',publisher:'发布者'};
const stage=(item:Item)=>item.state==='publishing'?'publishing':item.review_version?'approved':'pending';
const labels={pending:'待审核',approved:'待发布',publishing:'发布中',all:'全部'};
const size=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
async function api<T=Record<string,unknown>>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/review/${path}`,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Review-Request':'1'},body:JSON.stringify(body)});
  const result=await response.json() as T&{error?:string;subject?:string};
  if(!response.ok)throw new Error(`${result.error||'请求失败'}${result.subject?`（身份编号：${result.subject}）`:''}`);return result;
}

export default function ReviewConsole({signedInEmail}:{signedInEmail:string}){
  const [config,setConfig]=useState<Config|null>(null),[items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[notice,setNotice]=useState('');
  const [tab,setTab]=useState<Tab>('pending'),[query,setQuery]=useState(''),[activeId,setActiveId]=useState(''),[extra,setExtra]=useState('');
  async function load(advance=false){setLoading(true);setError('');try{
    const conf=await api<Config>('config');const rows=await api<Item[]>('queue');setConfig(conf);setItems(rows);
    if(advance)setActiveId(rows.find(item=>stage(item)==='pending')?.id||'');
  }catch(error){setError((error as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const visible=items.filter(item=>(tab==='all'||stage(item)===tab)&&[item.metadata.title,item.metadata.course,...item.files.map(file=>file.name)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const active=visible.find(item=>item.id===activeId)||visible[0];
  async function inspect(path:string){try{setExtra(JSON.stringify(await api(path),null,2));}catch(error){setError((error as Error).message);}}
  return <>
    <section className="review-toolbar"><span>{signedInEmail} <small>{roleNames[config?.user.role||'']||'登录中'}</small></span><button onClick={()=>void load()} disabled={loading||working}>{loading?'刷新中…':'刷新'}</button><details className="review-account"><summary>管理</summary><div>{config&&<p>身份编号 <code>{config.user.id}</code></p>}{config?.capabilities.includes('audit')&&<button onClick={()=>void inspect('audit')}>操作日志</button>}{config?.capabilities.includes('members')&&<button onClick={()=>void inspect('members')}>维护者列表</button>}</div></details></section>
    {error&&<p className="review-error" role="alert">{error}</p>}
    {notice&&<p className="review-success" role="status">{notice}</p>}
    {config&&!config.publisherConfigured&&<p className="review-notice">可先一键通过审核，待 GitHub 发布授权配置完成后再公开。</p>}
    <div className="review-workspace"><aside className="review-inbox" aria-label="投稿队列">
      <div className="review-inbox-head"><h2>投稿箱 <span>{items.length}</span></h2><label className="review-search"><span>搜索投稿</span><input placeholder="课程、标题、文件名" value={query} onChange={event=>setQuery(event.target.value)} disabled={working}/></label></div>
      <div className="review-tabs" aria-label="队列筛选">{(['pending','approved','publishing','all'] as Tab[]).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);setActiveId('');}} disabled={working}>{labels[value]} <span>{value==='all'?items.length:items.filter(item=>stage(item)===value).length}</span></button>)}</div>
      <div className="review-queue">{visible.map(item=><button key={item.id} className={`review-queue-item ${active?.id===item.id?'is-active':''}`} aria-current={active?.id===item.id?'true':undefined} onClick={()=>{setActiveId(item.id);setNotice('');}} disabled={working}><strong>{item.metadata.title||'未命名资料'}</strong><span>{item.metadata.course}</span><small>{item.files.length} 个文件 · {size(item.files.reduce((sum,file)=>sum+file.size,0))}<b>{labels[stage(item)]}</b></small></button>)}{!visible.length&&<p className="review-queue-empty">{loading?'正在加载…':query?'没有匹配的投稿':'这里暂时是空的'}</p>}</div>
    </aside><section className="review-reader" aria-label="当前投稿">{active&&config?<ReviewCard key={`${active.id}:${active.review_version}:${active.state}`} item={active} config={config} onBusy={setWorking} onDone={async message=>{setNotice(message);await load(true);}} onSkip={()=>{const next=visible[(visible.findIndex(item=>item.id===active.id)+1)%visible.length];if(next)setActiveId(next.id);}}/>:<div className="review-empty"><span>✓</span><h2>{loading?'正在读取投稿':'当前队列已处理完'}</h2><p>{tab==='pending'?'已通过的资料在「待发布」中。':'选择其他队列查看资料。'}</p></div>}</section></div>
    {extra&&<details open className="review-extra"><summary>管理信息</summary><pre>{extra}</pre><button onClick={()=>setExtra('')}>收起</button></details>}
    {config?.capabilities.includes('members')&&<MemberForm onSaved={()=>load()}/>}
  </>;
}

function ReviewCard({item,config,onDone,onBusy,onSkip}:{item:Item;config:Config;onDone:(message:string)=>Promise<void>;onBusy:(value:boolean)=>void;onSkip:()=>void}){
  const defaults=reviewDefaults(item.metadata,config.courses,item.reviewed||{});
  const [metadata,setMetadata]=useState(defaults),[version,setVersion]=useState(item.review_version||0),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(!defaults.courseId),[fileIndex,setFileIndex]=useState(0),[previewLarge,setPreviewLarge]=useState(false),[rejecting,setRejecting]=useState(false),[reason,setReason]=useState('不适合收录');
  const course=config.courses.find(course=>course.id===metadata.courseId);
  const [courseText,setCourseText]=useState(course?`${course.name}（${course.code}）`:'');
  const file=item.files[fileIndex];const fileURL=file?`/api/review/files/${item.id}/${file.index}`:'';
  const ext=file?.name.split('.').pop()?.toLowerCase()||'';const previewable=['pdf','png','jpg','jpeg','webp','txt','csv'].includes(ext);
  const canPublish=config.capabilities.includes('publish')&&config.publisherConfigured;
  const locked=item.state!=='pending';const setField=(key:string,value:string|boolean)=>setMetadata(old=>({...old,[key]:value}));
  async function perform(name:'accept'|'reject'|'recover'){
    setBusy(true);onBusy(true);setStatus('');try{
      if(name==='accept'){
        const result=await acceptSubmission(api,{id:item.id,version,metadata,publish:canPublish});
        await onDone(result.job?(result.state==='dispatch_unknown'?'审核已通过，发布派发尚未确认，请查看操作日志。':'已通过，正在提交到 GitHub。'):'已通过审核，已移到待发布。');
      }else{await api(`submissions/${item.id}/${name}`,name==='reject'?{reason}:{});await onDone(name==='reject'?'已拒绝并清除待审文件。':'已恢复待审核，请核对原发布任务后再操作。');}
    }catch(error){const failure=error as Error&{reviewVersion?:number};if(failure.reviewVersion)setVersion(failure.reviewVersion);setStatus(failure.message);}finally{setBusy(false);onBusy(false);}
  }
  return <article className="review-document"><header><div><p className="review-eyebrow">{item.metadata.course||'课程待匹配'} · {metadata.type}</p><h2>{metadata.title||'未命名资料'}</h2><p className="review-document-meta">{metadata.year} · {new Date(item.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}<span className="review-badge">{item.review_version?'审核已通过':'待审核'}</span></p></div><button onClick={()=>setEditing(!editing)} disabled={busy||locked} aria-expanded={editing}>修改信息</button></header>
    <div className="review-file-tabs" aria-label="投稿文件">{item.files.map((file,index)=><button key={file.index} aria-pressed={fileIndex===index} onClick={()=>{setFileIndex(index);setPreviewLarge(false);}}>{file.name} <small>{size(file.size)}</small></button>)}</div>
    <div className="review-preview">{file&&previewable&&(file.size<=20*1024*1024||previewLarge)?(['png','jpg','jpeg','webp'].includes(ext)?<img src={fileURL} alt={file.name}/>:<iframe key={fileURL} title={`文件预览：${file.name}`} src={fileURL} sandbox="allow-same-origin"/>):<div className="review-file-placeholder"><span>↗</span><strong>{file?.name||'没有文件'}</strong><p>{previewable?'大文件按需加载，避免打开审核页就下载全部内容。':'此格式请下载查看。'}</p>{previewable&&<button onClick={()=>setPreviewLarge(true)}>加载预览</button>}</div>}</div>
    <div className="review-file-tools">{file&&<a href={fileURL} target="_blank" rel="noopener noreferrer">新窗口查看 / 下载 ↗</a>}<details><summary>投稿来源与备注</summary><p>{item.metadata.source||'未填写来源'}</p><p>{item.metadata.note||'无备注'}</p></details></div>
    <form onSubmit={event=>{event.preventDefault();void perform('accept');}}>
      {editing&&<section className="review-editor" aria-label="修改资料信息"><div className="review-row"><label>课程<input list="review-course-options" value={courseText} placeholder="输入课程名或课程号" onChange={event=>{setCourseText(event.target.value);setField('courseId',reviewDefaults({course:event.target.value},config.courses).courseId);}}/><datalist id="review-course-options">{config.courses.map(course=><option key={course.id} value={`${course.name}（${course.code}）`}/>)}</datalist></label><label>标题<input value={metadata.title} onChange={event=>setField('title',event.target.value)} maxLength={80}/></label></div><div className="review-row"><label>类型<select value={metadata.type} onChange={event=>setField('type',event.target.value)}>{TYPES.map(value=><option key={value}>{value}</option>)}</select></label><label>年份 / 学期<input value={metadata.year} onChange={event=>setField('year',event.target.value)} maxLength={40}/></label></div><label>公开来源说明<input value={metadata.source} onChange={event=>setField('source',event.target.value)} maxLength={300}/></label><div className="review-row"><label>来源类型<select value={metadata.origin} onChange={event=>setField('origin',event.target.value)}>{ORIGINS.map(value=><option key={value}>{value}</option>)}</select></label><label>答案状态<select value={metadata.answerStatus} onChange={event=>setField('answerStatus',event.target.value)}>{ANSWERS.map(value=><option key={value}>{value}</option>)}</select></label></div><details className="review-rights"><summary>授权信息（选填）</summary><label className="review-check"><input type="checkbox" checked={metadata.permissionConfirmed} onChange={event=>setMetadata(old=>({...old,permissionConfirmed:event.target.checked,license:event.target.checked?'': '授权未核实'}))}/>已取得明确授权</label>{metadata.permissionConfirmed&&<><label>实际许可<input value={metadata.license} onChange={event=>setField('license',event.target.value)} maxLength={100}/></label><label>授权依据（不公开）<textarea value={metadata.rightsBasis} onChange={event=>setField('rightsBasis',event.target.value)} maxLength={1000}/></label></>}</details></section>}
      {!course&&<p className="review-error">未匹配到课程，请在「修改信息」中选择课程。</p>}
      <footer className="review-decision"><div><strong>{metadata.permissionConfirmed?'已标记明确授权':'默认收录 · 授权未核实'}</strong><small>{canPublish?'点击通过后文件将进入公开 GitHub 仓库。':'通过后进入待发布，不会立即公开。'}</small></div><div className="review-actions">{config.capabilities.includes('reject')&&<button type="button" className="review-quiet" onClick={()=>setRejecting(!rejecting)} disabled={busy||locked}>不收录</button>}<button type="button" onClick={onSkip} disabled={busy}>稍后处理</button>{config.capabilities.includes('approve')&&<button className="review-primary" type="submit" disabled={busy||locked||!course}>{busy?'处理中…':canPublish?'通过并公开':'通过审核'} <span>✓</span></button>}{locked&&config.capabilities.includes('recover')&&<button type="button" onClick={()=>void perform('recover')} disabled={busy}>恢复过期任务</button>}</div></footer>
      {rejecting&&config.capabilities.includes('reject')&&<section className="review-reject"><label>拒绝理由<input value={reason} onChange={event=>setReason(event.target.value)} maxLength={500}/></label><p>确认后会清除这份待审文件，不能撤销。</p><button type="button" className="danger" disabled={busy||!reason.trim()} onClick={()=>void perform('reject')}>拒绝并删除文件</button><button type="button" onClick={()=>setRejecting(false)}>取消</button></section>}
      {status&&<p className="review-error" role="alert">{status}</p>}
    </form>
  </article>;
}

function MemberForm({onSaved}:{onSaved:()=>Promise<void>}){
  const [status,setStatus]=useState('');
  return <details className="review-extra"><summary>协作设置</summary><p>新维护者登录后，从「管理」中复制身份编号。审核者只能审核，发布者可公开资料。</p><form onSubmit={async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));try{await api('members',{...data,active:data.active==='true'});setStatus('权限已更新');await onSaved();}catch(error){setStatus((error as Error).message);}}}><label>身份编号<input name="userId" required/></label><label>邮箱<input name="email" type="email" required/></label><label>角色<select name="role"><option value="reviewer">审核者</option><option value="publisher">发布者</option></select></label><label>状态<select name="active"><option value="true">启用</option><option value="false">撤销</option></select></label><button>保存权限</button><p role="status">{status}</p></form></details>;
}
