import {requireChatGPTUser,chatGPTSignOutPath} from '../chatgpt-auth';
import ReviewConsole from './review-console';
export const dynamic='force-dynamic';
export default async function ReviewPage(){
  const user=await requireChatGPTUser('/review');
  return <main className="review-shell"><header className="review-bar"><div><h1>OpenNNU 审核台</h1><p>待审资料不公开 · 审核与发布分权 · 操作留痕</p></div><a href={chatGPTSignOutPath('/review')} target="_top">退出登录</a></header><ReviewConsole signedInEmail={user.email}/></main>;
}
