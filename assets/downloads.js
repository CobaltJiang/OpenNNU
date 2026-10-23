import {safeURL} from './library.js';
export function downloadSources(resource,site){
  const original=safeURL(resource.url);if(!original)return [];
  const sources=[{id:'origin',label:'本站文件',url:original}];
  // Only reviewed public repository files are eligible. Admin/upload URLs never enter this adapter.
  if(!resource.url.startsWith(`courses/${resource.courseId}/`)||!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(site.repository))return sources;
  const repo=site.repository.slice('https://github.com/'.length),path=resource.url.split('/').map(encodeURIComponent).join('/');
  const rawURL=`https://raw.githubusercontent.com/${repo}/main/${path}`;
  sources.push({id:'github',label:'GitHub 原始文件',url:rawURL});
  for(const mirror of site.downloads?.mirrors||[]){
    // Mirrors are opt-in. A public proxy may receive only a constructed public GitHub file URL.
    try{const base=new URL(mirror.baseURL);if(mirror.enabled!==true||base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!/^[-a-z0-9]{1,40}$/.test(mirror.id)||base.pathname.includes('..')||sources.some(source=>source.id===mirror.id))continue;
      const kind=mirror.kind||'static';let url;
      if(kind==='github-proxy'){
        // Pin the approved proxy. Never accept arbitrary nested URLs, API targets or credentials.
        if(base.href!=='https://ghproxy.net/')continue;
        url=`${base.href}${rawURL}`;
      }else if(kind==='static')url=new URL(path,`${base.href.replace(/\/$/,'')}/`).href;
      else continue;
      sources.push({id:mirror.id,label:String(mirror.label||'备用 CDN').slice(0,40),kind,url});
    }catch{/* Ignore invalid optional mirror configuration. */}
  }
  const preferred=site.downloads?.preferred||'origin';return sources.sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred));
}
