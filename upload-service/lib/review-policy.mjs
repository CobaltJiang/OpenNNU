export const UNVERIFIED_LICENSE='授权未核实';
export const DEFAULT_SOURCE='同学投稿（原始来源未独立核实）';
export const TYPES=['历年试卷','课程笔记','复习提纲','习题解析','其他资料'];
export const ORIGINS=['原卷','回忆版','学生原创','教师授权','其他'];
export const ANSWERS=['无答案','答案未核对','答案已校对','不适用'];
const unknown=/未获|待确认|不详|不明|未授权|未核实/;
const text=value=>typeof value==='string'?value.trim():'';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};

export function reviewDefaults(draft={},courses=[],saved={}){
  const code=text(draft.course).match(/\b(\d{10})\b/)?.[1];
  const named=courses.filter(course=>course.name===text(draft.course));
  const matched=courses.find(course=>course.code===code)||(named.length===1?named[0]:null);
  const confirmed=saved.permission==='confirmed'||saved.permissionConfirmed===true;
  return {courseId:text(saved.courseId)||matched?.id||'',title:text(saved.title)||text(draft.title),type:text(saved.type)|| (TYPES.includes(draft.type)?draft.type:'其他资料'),year:text(saved.year)||text(draft.year)||'年份未注明',source:text(saved.source)||DEFAULT_SOURCE,license:confirmed?text(saved.license):UNVERIFIED_LICENSE,rightsBasis:text(saved.rightsBasis),origin:text(saved.origin)||'其他',answerStatus:text(saved.answerStatus)||'答案未核对',permissionConfirmed:confirmed};
}

export function validateReview(body,courses,draft={}){
  if(!body||typeof body!=='object'||Array.isArray(body))invalid('审核信息无效');
  const limits={courseId:100,title:80,type:30,year:40,source:300,license:100,rightsBasis:1000,origin:30,answerStatus:30};
  for(const [key,max]of Object.entries(limits))if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>max))invalid('审核字段过长或格式无效');
  if(body.permission!==undefined&&!['confirmed','unverified'].includes(body.permission))invalid('授权状态无效');
  const result=reviewDefaults(draft,courses,body);
  if(!courses.some(course=>course.id===result.courseId))invalid('课程未匹配，请选择课程后通过');
  if(!result.title)invalid('请填写资料标题');
  if(!TYPES.includes(result.type)||!ORIGINS.includes(result.origin)||!ANSWERS.includes(result.answerStatus))invalid('资料类型或来源状态无效');
  if(result.permissionConfirmed&&(!result.license||unknown.test(result.license)||!result.rightsBasis))invalid('标记已获授权时，请填写实际许可与依据；否则保持授权未核实即可');
  return {...result,permission:result.permissionConfirmed?'confirmed':'unverified',reviewStatus:'approved'};
}

// One UI click, with review and publication still independently authorized server-side.
export async function acceptSubmission(api,{id,version,metadata,publish=false}){
  const saved=await api(`submissions/${id}/approve`,{...metadata,version});
  if(!publish)return {approved:true,version:saved.version};
  try{return {approved:true,...await api(`submissions/${id}/publish`,{version:saved.version})};}
  catch(error){throw Object.assign(new Error(`审核已通过，但尚未公开：${error.message}`),{reviewVersion:saved.version});}
}
