export const FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.zip,.png,.jpg,.jpeg,.webp,.txt,.csv';
export function validateFiles(files) {
  if (!files.length || files.length > 5) return '请选择 1–5 个文件';
  let total = 0;
  for (const file of files) {
    if (!/\.(pdf|docx|xlsx|pptx|zip|png|jpe?g|webp|txt|csv)$/i.test(file.name)) return '不支持此文件格式';
    if (!file.size || file.size > 50 * 1024 * 1024) return '单文件须为 1 B–50 MB';
    total += file.size;
  }
  return total > 100 * 1024 * 1024 ? '文件总大小不能超过 100 MB' : '';
}
export async function submitUpload(base, data, {ticket, onTicket, onProgress} = {}) {
  const endpoint = new URL(base);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1') throw new Error('上传服务地址无效');
  if (!ticket) {
    const response = await fetch(new URL('/api/ticket', endpoint), {method:'POST',credentials:'omit'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '暂时无法开始上传');
    ticket = result.ticket; onTicket?.(ticket);
  }
  const files=data.getAll('files');
  const manifest=Object.fromEntries([...data.entries()].filter(([key])=>key!=='files'));
  manifest.files=files.map(file=>({name:file.name,size:file.size}));
  const headers={'Content-Type':'application/json','X-Upload-Ticket':ticket};
  const start=await fetch(new URL('/api/uploads/start',endpoint),{method:'POST',headers,body:JSON.stringify(manifest),credentials:'omit'});
  const started=await start.json();
  if(!start.ok)throw Object.assign(new Error(started.error||'无法开始上传'),{status:start.status});
  if(started.state==='pending')return started;
  const total=files.reduce((sum,file)=>sum+file.size,0);let completed=0;
  for(const [index,file] of files.entries()) {
    await sendFile(new URL(`/api/uploads/${ticket}/${index}`,endpoint),ticket,file,loaded=>onProgress?.(Math.round((completed+loaded)/total*100)));
    completed+=file.size;
  }
  const finish=await fetch(new URL(`/api/uploads/${ticket}/complete`,endpoint),{method:'POST',headers:{'X-Upload-Ticket':ticket},credentials:'omit'});
  const result=await finish.json();
  if(!finish.ok)throw Object.assign(new Error(result.error||'保存失败，可重试'),{status:finish.status});
  return result;
}
function sendFile(url,ticket,file,onProgress) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT',url);
    xhr.setRequestHeader('X-Upload-Ticket',ticket);
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.timeout = 600000;
    xhr.upload.onprogress = event => { if(event.lengthComputable) onProgress(event.loaded); };
    xhr.onerror = () => reject(new Error('网络中断，文件仍保留在表单中，可重试'));
    xhr.ontimeout = () => reject(new Error('上传超时，可重试'));
    xhr.onload = () => {
      let result; try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('上传服务响应异常')); return; }
      if(xhr.status<200 || xhr.status>=300) { const error=new Error(result.error || '上传失败'); error.status=xhr.status; reject(error); }
      else resolve(result);
    };
    xhr.send(file);
  });
}
