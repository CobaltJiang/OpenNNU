import { createServer } from 'node:http';
import { readFile, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 上传服务在 Cloudflare 上，直接连会命中它的脚本流量拦截；
// 本机 PowerShell 走系统代理，因此所有远程调用都交给它，而不是在 Node 里裸连。
dns.setDefaultResultOrder('ipv4first');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const publicDir = path.join(here, 'public');
const adminScript = path.join(repo, 'scripts', 'upload-admin.ps1');
const apiScript = path.join(here, 'admin-api.ps1');
const PORT = Number(process.env.REVIEW_PORT || 4180);
const HOST = '127.0.0.1';

const site = JSON.parse(await readFile(path.join(repo, 'data', 'site.json'), 'utf8'));
const service = String(site.uploadService || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(service)) throw new Error('data/site.json 缺少 uploadService');

const pwshCandidates = [
  process.env.PWSH_PATH,
  'pwsh',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'pwsh.exe'),
  'C:\\Users\\谷晚钟\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe',
].filter(Boolean);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repo, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { err += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(Object.assign(new Error((err || out).trim() || `退出码 ${code}`), { exitCode: code })));
  });
}

let PWSH = null;
for (const candidate of pwshCandidates) {
  if (await run(candidate, ['-NoProfile', '-Command', 'exit 0']).then(() => true, () => false)) { PWSH = candidate; break; }
}
if (!PWSH) throw new Error('未找到 PowerShell 7（可用 PWSH_PATH 指定）');

async function pwsh(args) {
  const out = await run(PWSH, ['-NoProfile', '-File', ...args]);
  const text = out.trim();
  if (!text) throw new Error('PowerShell 没有返回结果');
  try { return JSON.parse(text); } catch { return text; }
}
const adminApi = (mode, extra = []) => pwsh([apiScript, '-Mode', mode, ...extra]);

const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.zip': 'application/zip' };
const INLINE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv']);

const json = (res, status, data) => {
  const payload = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': payload.length });
  res.end(payload);
};
const fail = (res, status, message) => json(res, status, { error: message });

async function body(req, limit = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('请求过大'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new Error('请求格式无效'); }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === '/api/config') {
      const courses = JSON.parse(await readFile(path.join(repo, 'data', 'courses.json'), 'utf8'));
      return json(res, 200, { service, courses: courses.map(({ id, name, code }) => ({ id, name, code })) });
    }
    if (url.pathname === '/api/queue') {
      const list = await adminApi('pending');
      return json(res, 200, Array.isArray(list) ? list : []);
    }
    const fileMatch = url.pathname.match(/^\/api\/file\/([a-f0-9-]{36})\/(\d+)$/);
    if (fileMatch) {
      const temp = path.join(tmpdir(), `opennnu-review-${randomUUID()}`);
      await adminApi('file', ['-Id', fileMatch[1], '-Index', fileMatch[2], '-OutFile', temp]);
      const info = await stat(temp);
      const original = url.searchParams.get('name') || 'file';
      const ext = path.extname(original).toLowerCase();
      res.writeHead(200, {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Content-Disposition': `${INLINE.has(ext) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(original)}`,
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
      });
      const stream = createReadStream(temp);
      stream.pipe(res);
      stream.on('close', () => unlink(temp).catch(() => {}));
      stream.on('error', () => { res.destroy(); unlink(temp).catch(() => {}); });
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return fail(res, 403, '只接受来自本页面的请求');
      const payload = await body(req);
      if (url.pathname === '/api/reject') {
        if (!/^[a-f0-9-]{36}$/.test(payload.id || '')) return fail(res, 400, '投稿编号无效');
        await adminApi('reject', ['-Id', payload.id]);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/publish') {
        const { id, courseId, title, source, license, origin, answerStatus } = payload;
        if (!/^[a-f0-9-]{36}$/.test(id || '')) return fail(res, 400, '投稿编号无效');
        if (!/^[a-z0-9-]{3,}$/.test(courseId || '')) return fail(res, 400, '课程编号无效');
        for (const value of [title, source, license, origin, answerStatus]) if (!String(value || '').trim()) return fail(res, 400, '发布字段不完整');
        // Publish 读取 .local/review/<id>/，先落地待审文件；重复执行是幂等的。
        await run(PWSH, ['-NoProfile', '-File', adminScript, '-Mode', 'Download', '-Id', id]);
        const output = await run(PWSH, ['-NoProfile', '-File', adminScript, '-Mode', 'Publish', '-Id', id, '-CourseId', courseId, '-Title', title, '-Source', source, '-License', license, '-Origin', origin, '-AnswerStatus', answerStatus]);
        return json(res, 200, { ok: true, commit: (output.match(/https:\/\/github\.com\/\S+/) || [])[0] || null, output });
      }
      return fail(res, 404, '接口不存在');
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    if (!/^(index\.html|app\.js|style\.css)$/.test(name)) return fail(res, 404, '未找到');
    const content = await readFile(path.join(publicDir, name));
    const type = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' }[name];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': content.length });
    res.end(content);
  } catch (error) {
    return fail(res, 500, error.message || '本地审核服务出错');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OpenNNU 审核台: http://${HOST}:${PORT}`);
  console.log(`上传服务: ${service}`);
  console.log(`PowerShell: ${PWSH}`);
  console.log('远程调用经 PowerShell 走系统代理；「通过」会公开文件并直接提交 main。');
});
