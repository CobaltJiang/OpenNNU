import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './validate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (output !== resolve(root, 'dist')) throw new Error('Invalid output directory');
const { courses, resources } = await validateCatalog();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'assets', 'data']) await cp(resolve(root, name), resolve(output, name), { recursive: true });
// Publish only files explicitly listed in the reviewed resource catalog.
for (const resource of resources.filter(item => item.url.startsWith('courses/'))) {
  const destination = resolve(output, resource.url);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(root, resource.url), destination);
}
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`已构建 dist/：${courses.length} 门课程，${resources.length} 份资料。`);
