export const UPLOAD_NETWORK_MESSAGE = '无法连接上传服务，当前网络可能无法直连该域名。请切换网络或代理后重试；已选文件仍保留。';
export const OFFLINE_MESSAGE = '当前设备处于离线状态，请恢复网络后重试；已选文件仍保留。';
// The step is what lets a failure report say which request died instead of a bare "Failed to fetch".
export function networkMessage(step) {
  return step ? `无法连接上传服务（${step}失败），当前网络可能无法直连该域名。可点下方重试；已选文件仍保留。` : UPLOAD_NETWORK_MESSAGE;
}
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
export async function requestJSON(url, options={}, {attempts=2,timeoutMs=15000,retryDelayMs=400,onRetry,step}={}) {
  for(let attempt=0;attempt<attempts;attempt++) {
    if(offline())throw Object.assign(new Error(OFFLINE_MESSAGE),{code:'UPLOAD_NETWORK'});
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetch(url,{...options,credentials:'omit',signal:controller.signal});
      let result;
      try{result=await response.json();}catch{throw Object.assign(new Error('上传服务返回异常，请稍后重试'),{status:response.status,retryable:true});}
      if(!response.ok)throw Object.assign(new Error(result.error||`上传服务暂不可用（${response.status}）`),{status:response.status,retryable:[502,503,504].includes(response.status)});
      return result;
    }catch(error) {
      const network=error instanceof TypeError || error.name==='AbortError';
      if((network||error.retryable)&&attempt+1<attempts){onRetry?.(attempt+1);await new Promise(resolve=>setTimeout(resolve,retryDelayMs));continue;}
      if(network)throw Object.assign(new Error(networkMessage(step)),{code:'UPLOAD_NETWORK'});
      throw error;
    }finally{clearTimeout(timeout);}
  }
}
