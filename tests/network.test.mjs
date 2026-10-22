import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJSON,UPLOAD_NETWORK_MESSAGE} from '../assets/network.js';
test('偶发连接失败自动重试，不向用户泄露 Failed to fetch',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');return Response.json({ok:true});};
    assert.deepEqual(await requestJSON('https://upload.example',{}, {retryDelayMs:0}),{ok:true});assert.equal(calls,2);
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
    await assert.rejects(requestJSON('https://upload.example',{}, {retryDelayMs:0}),error=>error.code==='UPLOAD_NETWORK'&&error.message===UPLOAD_NETWORK_MESSAGE);
  }finally{globalThis.fetch=original;}
});
test('明确的表单错误不会反复提交；超时有中文网络提示',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return Response.json({error:'许可待确认'},{status:400});};
    await assert.rejects(requestJSON('https://upload.example',{}, {retryDelayMs:0}),/许可待确认/);assert.equal(calls,1);
    globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));
    await assert.rejects(requestJSON('https://upload.example',{}, {timeoutMs:5,retryDelayMs:0}),error=>error.code==='UPLOAD_NETWORK');
  }finally{globalThis.fetch=original;}
});
