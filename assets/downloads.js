import {safeURL} from './library.js';
export function downloadSources(resource,site){
  const original=safeURL(resource.url);if(!original)return [];
  const sources=[{id:'origin',label:'本站文件',url:original}];
  // Only reviewed public repository files are eligible. Admin/upload URLs never enter this adapter.
  if(!resource.url.startsWith(`courses/${resource.courseId}/`)||!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(site.repository))return sources;
  const repo=site.repository.slice('https://github.com/'.length),path=resource.url.split('/').map(encodeURIComponent).join('/');
  sources.push({id:'github',label:'GitHub 原始文件',url:`https://raw.githubusercontent.com/${repo}/main/${path}`});
  for(const mirror of site.downloads?.mirrors||[]){
    // Explicit, owner-configured static CDN roots only; no untrusted public URL proxy.
    try{const base=new URL(mirror.baseURL);if(mirror.enabled!==true||base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!/^[-a-z0-9]{1,40}$/.test(mirror.id)||base.pathname.includes('..'))continue;
      const url=new URL(path,`${base.href.replace(/\/$/,'')}/`).href;sources.push({id:mirror.id,label:String(mirror.label||'备用 CDN').slice(0,40),url});
    }catch{/* Ignore invalid optional mirror configuration. */}
  }
  const preferred=site.downloads?.preferred||'origin';return sources.sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred));
}
