import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOURCE_TYPES, safeURL } from '../assets/library.js';
import {UNVERIFIED_LICENSE} from '../upload-service/lib/review-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function validateCatalog(base = root) {
  const readJSON = async name => JSON.parse(await readFile(resolve(base, 'data', name), 'utf8'));
  const [site, courses, resources] = await Promise.all(['site.json', 'courses.json', 'resources.json'].map(readJSON));
  const errors = [];
  if (!Array.isArray(courses) || !Array.isArray(resources)) throw new Error('courses 和 resources 必须是数组');
  if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(site.repository)) errors.push('site.repository 必须是 GitHub 仓库地址');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(site.updated)) errors.push('site.updated 必须为 YYYY-MM-DD');
  const ids = new Set(), courseCodes = new Set(), sectionIds = new Set();
  for (const course of courses) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.id) || ids.has(course.id)) errors.push(`课程 ID 无效或重复：${course.id}`);
    ids.add(course.id);
    if (courseCodes.has(course.code)) errors.push(`课程号重复：${course.code}`);
    courseCodes.add(course.code);
    for (const key of ['name', 'code']) if (typeof course[key] !== 'string' || !course[key].trim()) errors.push(`${course.id} 缺少 ${key}`);
    for (const key of ['departments', 'credits', 'hours', 'types', 'natures', 'generalCategories', 'modules', 'campuses', 'teachers', 'aliases']) if (!Array.isArray(course[key])) errors.push(`${course.id} 的 ${key} 必须是数组`);
    if (!Array.isArray(course.sections) || course.sections.length !== course.sectionCount) errors.push(`${course.id} 教学班数量不一致`);
    for (const section of course.sections || []) {
      if (!section.id || sectionIds.has(section.id)) errors.push(`教学班 ID 缺失或重复：${section.id}`);
      sectionIds.add(section.id);
      for (const key of ['id', 'number', 'teacher', 'department', 'credits', 'hours', 'type', 'nature', 'generalCategory', 'module', 'schedule', 'campus', 'capacity', 'descriptionFlag']) if (typeof section[key] !== 'string') errors.push(`${course.id} 的教学班 ${key} 必须为字符串`);
    }
    if (course.directory) {
      if (course.directory !== `courses/${course.id}`) errors.push(`${course.id} 的资料目录不一致`);
      try { await stat(resolve(base, `courses/${course.id}/README.md`)); } catch { errors.push(`${course.id} 缺少课程说明`); }
    }
  }
  const resourceIds = new Set();
  for (const resource of resources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resource.id) || resourceIds.has(resource.id)) errors.push(`资料 ID 无效或重复：${resource.id}`);
    resourceIds.add(resource.id);
    if (!ids.has(resource.courseId)) errors.push(`${resource.id} 引用不存在的课程`);
    for (const key of ['title', 'year', 'source', 'license', 'added', 'url']) if (typeof resource[key] !== 'string' || !resource[key].trim()) errors.push(`${resource.id} 缺少 ${key}`);
    if (!RESOURCE_TYPES.includes(resource.type)) errors.push(`${resource.id} 的类型无效`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resource.added)) errors.push(`${resource.id} 的收录日期无效`);
    if (!['原卷', '回忆版', '学生原创', '教师授权', '其他'].includes(resource.origin)) errors.push(`${resource.id} 的来源类型无效`);
    if (!['无答案', '答案未核对', '答案已校对', '不适用'].includes(resource.answerStatus)) errors.push(`${resource.id} 的答案状态无效`);
    if(resource.permission!=='confirmed'&&!(resource.permission==='unverified'&&resource.reviewStatus==='approved'&&resource.license===UNVERIFIED_LICENSE))errors.push(`${resource.id} 缺少收录审核结论或授权状态不一致`);
    if (!safeURL(resource.url)) errors.push(`${resource.id} 的文件地址无效`);
    if (resource.url?.startsWith('courses/')) {
      if (!resource.url.startsWith(`courses/${resource.courseId}/`)) errors.push(`${resource.id} 的文件不在对应课程目录`);
      const path = resolve(base, resource.url);
      if (!path.startsWith(resolve(base, 'courses') + sep)) errors.push(`${resource.id} 的文件路径越界`);
      else { try { if (!(await stat(path)).isFile()) throw new Error(); } catch { errors.push(`${resource.id} 的本地文件不存在`); } }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { site, courses, resources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const { courses, resources } = await validateCatalog(); console.log(`目录检查通过：${courses.length} 门课程，${resources.length} 份真实收录资料。`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
