export const RESOURCE_TYPES = ['历年试卷', '课程笔记', '复习提纲', '习题解析', '其他资料'];

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

export function matchesQuery(record, query) {
  const haystack = normalize([record.name, record.title, record.code, record.englishName, record.description, record.area, record.audience, record.year, record.type, ...(record.departments ?? []), ...(record.teachers ?? []), ...(record.types ?? []), ...(record.campuses ?? []), ...(record.aliases ?? []), ...(record.topics ?? [])].join(' '));
  return normalize(query).split(' ').filter(Boolean).every(part => haystack.includes(part));
}

export function filterCourses(courses, { query = '', area = 'all', department = 'all', campus = 'all', type = 'all', withResources = false, sort = 'default', resources = [] } = {}) {
  const counts = new Map();
  for (const resource of resources) counts.set(resource.courseId, (counts.get(resource.courseId) || 0) + 1);
  const result = courses.filter(course => (area === 'all' || course.area === area) && (department === 'all' || course.departments?.includes(department)) && (campus === 'all' || course.campuses?.includes(campus)) && (type === 'all' || course.types?.includes(type)) && (!withResources || counts.has(course.id)) && matchesQuery(course, query));
  if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  if (sort === 'resources') result.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
  if (sort === 'code') result.sort((a, b) => a.code.localeCompare(b.code));
  return result;
}

export function paginate(items, page = 1, pageSize = 24) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pages, total: items.length };
}

export function filterResources(resources, courses, { query = '', courseId = 'all', type = 'all', year = 'all', sort = 'newest' } = {}) {
  const result = resources.filter(resource => {
    const course = courses.find(item => item.id === resource.courseId);
    return (courseId === 'all' || resource.courseId === courseId) && (type === 'all' || resource.type === type) && (year === 'all' || resource.year === year) && matchesQuery({ ...resource, aliases: [course?.name ?? '', ...(course?.aliases ?? [])] }, query);
  });
  return result.sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : b.added.localeCompare(a.added));
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function safeURL(value, { local = true } = {}) {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (local && /^courses\/[a-z0-9-]+\//.test(value) && !value.split('/').some(part => part === '..' || part === '.')) return `./${value.split('/').map(encodeURIComponent).join('/')}`;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function contributionURL(repository, draft) {
  const lines = ['## 资料信息', `- 课程：${draft.course || '待填写'}`, `- 标题：${draft.title || '待填写'}`, `- 类型：${draft.type || '待填写'}`, `- 年份 / 学期：${draft.year || '待填写'}`, '', '## 来源与分享许可', draft.source || '请说明作者、来源和允许公开分享的依据。', '', '## 文件或公开链接', draft.url || '请在提交前添加文件或链接。', '', '## 补充说明', draft.note || '无', '', '- [ ] 我确认上述来源信息准确，且资料可按所说明的许可公开分享。', '- [ ] 我已检查文件，不包含个人信息或未结束考试的内容。'];
  const params = new URLSearchParams({ title: `[资料投稿] ${draft.course || '课程'} · ${draft.title || '资料标题'}`, body: lines.join('\n') });
  return `${repository}/issues/new?${params}`;
}
