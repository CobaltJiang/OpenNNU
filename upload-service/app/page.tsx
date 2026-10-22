import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Home() {
  if((await headers()).get('host')?.split(':')[0]==='review.cybercobalt.xyz')redirect('/review');
  return <main style={{maxWidth:640,margin:'80px auto',padding:24}}><h1>OpenNNU 资料投稿服务</h1><p>文件私下保存，审核通过后由维护者提交到 GitHub。</p><p><a href="https://cobaltjiang.github.io/OpenNNU/#/contribute">前往上传资料 →</a></p><p><a href="/review">维护者审核登录 →</a></p></main>;
}
