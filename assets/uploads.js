import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, FILE_SIZE_ERROR, TOTAL_SIZE_ERROR } from '../upload-service/lib/upload-policy.mjs';
import { requestJSON, networkMessage } from './network.js';
export { UPLOAD_LIMIT_HINT } from '../upload-service/lib/upload-policy.mjs';
export const FILE_ACCEPT = '.pdf,.docx,.xlsx,.pptx,.zip,.png,.jpg,.jpeg,.webp,.txt,.csv';
export function validateFiles(files) {
  if (!files.length || files.length > MAX_FILES) return `请选择 1–${MAX_FILES} 个文件`;
  let total = 0;
  for (const file of files) {
    if (!/\.(pdf|docx|xlsx|pptx|zip|png|jpe?g|webp|txt|csv)$/i.test(file.name)) return '不支持此文件格式';
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) return FILE_SIZE_ERROR;
    total += file.size;
  }
  return total > MAX_TOTAL_BYTES ? TOTAL_SIZE_ERROR : '';
}
export async function submitUpload(base, data, {ticket, onTicket, onProgress, onRetry} = {}) {
  const endpoint = new URL(base);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1') throw new Error('上传服务地址无效');
  if (!ticket) {
    const result = await requestJSON(new URL('/api/ticket', endpoint), {method:'POST'},{onRetry,step:'获取上传凭据'});
    ticket = result.ticket; onTicket?.(ticket);
  }
  const files=data.getAll('files');
  const manifest=Object.fromEntries([...data.entries()].filter(([key])=>key!=='files'));
  manifest.files=files.map(file=>({name:file.name,size:file.size}));
  const headers={'Content-Type':'application/json','X-Upload-Ticket':ticket};
  const started=await requestJSON(new URL('/api/uploads/start',endpoint),{method:'POST',headers,body:JSON.stringify(manifest)},{onRetry,step:'建立上传会话'});
  if(started.state==='pending')return started;
  const total=files.reduce((sum,file)=>sum+file.size,0);let completed=0;
  for(const [index,file] of files.entries()) {
    await sendFile(new URL(`/api/uploads/${ticket}/${index}`,endpoint),ticket,file,loaded=>onProgress?.(Math.round((completed+loaded)/total*100)),`传输第 ${index+1} 个文件`);
    completed+=file.size;
  }
  const result=await requestJSON(new URL(`/api/uploads/${ticket}/complete`,endpoint),{method:'POST',headers:{'X-Upload-Ticket':ticket}},{onRetry,step:'确认提交'});
  return result;
}
function sendFile(url,ticket,file,onProgress,step) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT',url);
    xhr.setRequestHeader('X-Upload-Ticket',ticket);
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.timeout = 600000;
    xhr.upload.onprogress = event => { if(event.lengthComputable) onProgress(event.loaded); };
    xhr.onerror = () => reject(Object.assign(new Error(networkMessage(step)),{code:'UPLOAD_NETWORK'}));
    xhr.ontimeout = () => reject(new Error('上传超时，可重试'));
    xhr.onload = () => {
      let result; try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('上传服务响应异常')); return; }
      if(xhr.status<200 || xhr.status>=300) { const error=new Error(result.error || '上传失败'); error.status=xhr.status; reject(error); }
      else resolve(result);
    };
    xhr.send(file);
  });
}
