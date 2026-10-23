import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import ReviewConsole from './review-console';
export const dynamic='force-dynamic';
export default async function ReviewPage(){
  const user=await requireChatGPTUser('/review');
  return <main className="review-shell"><header className="review-bar"><div><h1>OpenNNU 审核台</h1><p>看一眼资料，点一次通过。</p></div><a href={chatGPTSignOutPath('/review')} target="_top">退出登录</a></header><ReviewConsole signedInEmail={user.email}/></main>;
}
