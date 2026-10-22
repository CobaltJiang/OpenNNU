export const CAPABILITIES={owner:['view','approve','publish','reject','recover','members','audit'],reviewer:['view','approve'],publisher:['view','approve','publish','reject','audit']};
export const can=(member,action)=>Boolean(member?.active&&CAPABILITIES[member.role]?.includes(action));
export function reject(message,status=400){throw Object.assign(new Error(message),{status});}
export const reviewJSON=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function memberFor(env,user){
  if(!user?.userId||!user.email)reject('请先登录',401);
  if(!env.DB)reject('审核数据库尚未配置',503);
  let member=await env.DB.prepare('SELECT * FROM maintainers WHERE user_id=?').bind(user.userId).first();
  // Only the verified, server-configured owner email can bootstrap the first owner.
  if(!member&&env.REVIEW_OWNER_EMAIL&&user.email.toLowerCase()===env.REVIEW_OWNER_EMAIL.trim().toLowerCase()){
    await env.DB.prepare("INSERT OR IGNORE INTO maintainers (user_id,email,role,active,created,created_by) SELECT ?,?,'owner',1,?,? WHERE NOT EXISTS (SELECT 1 FROM maintainers WHERE role='owner')").bind(user.userId,user.email,Date.now(),user.userId).run();
    member=await env.DB.prepare('SELECT * FROM maintainers WHERE user_id=?').bind(user.userId).first();
  }
  if(!member?.active)reject('此账号尚未获得维护权限，请联系所有者。',403);
  return member;
}
export async function audit(env,actor,action,target,detail={}){
  await env.DB.prepare('INSERT INTO review_audit (id,actor,action,target,detail,created) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(detail),Date.now()).run();
}
export async function boundedJSON(request,limit=16384){
  const reader=request.body?.getReader();if(!reader)reject('缺少请求内容');let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();reject('请求过大',413);}chunks.push(value);}
  try{return JSON.parse(await new Blob(chunks).text());}catch{reject('请求格式错误');}
}
export function requireMutationOrigin(request){
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Review-Request')!=='1')reject('只允许从审核页面操作',403);
}
