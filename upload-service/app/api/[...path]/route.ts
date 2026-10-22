import { env } from 'cloudflare:workers';
import { handleUpload } from '../../../lib/uploads.mjs';
import { handleReview, handlePublishJob } from '../../../lib/cloud-review.mjs';
import { getChatGPTUser } from '../../chatgpt-auth';
export const dynamic = 'force-dynamic';
export const GET = async (request: Request) => {
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/review/'))return handleReview(request,env,await getChatGPTUser());
  if(path.startsWith('/api/publish-jobs/'))return handlePublishJob(request,env);
  return handleUpload(request,env);
};
export const POST = GET;
export const PUT = GET;
export const OPTIONS = GET;
