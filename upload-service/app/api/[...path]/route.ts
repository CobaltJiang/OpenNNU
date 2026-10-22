import { env } from 'cloudflare:workers';
import { handleUpload } from '../../../lib/uploads.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleUpload(request, env);
export const POST = GET;
export const PUT = GET;
export const OPTIONS = GET;
