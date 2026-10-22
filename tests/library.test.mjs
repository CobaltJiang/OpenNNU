import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCourses, filterResources, safeURL, escapeHTML, contributionURL, paginate } from '../assets/library.js';
import { validateCatalog } from '../scripts/validate.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const courses = [{ id: 'mechanics', name: '力学', area: '物理', aliases: ['牛顿力学'], topics: ['动量'] }, { id: 'math', name: '高等数学 I（上）', area: '数学', aliases: ['高数', 'calculus'], topics: ['极限'] }];
const resources = [{ id: 'note', courseId: 'mechanics', title: '运动学笔记', type: '课程笔记', year: '2025', added: '2026-10-20' }, { id: 'review', courseId: 'math', title: '极限复习', type: '复习提纲', year: '2026', added: '2026-10-22' }];

test('课程搜索支持别名、主题、全角字符和多词组合', () => {
  assert.deepEqual(filterCourses(courses, { query: '高数' }).map(c => c.id), ['math']);
  assert.deepEqual(filterCourses(courses, { query: 'ＣＡＬＣＵＬＵＳ 极限' }).map(c => c.id), ['math']);
  assert.deepEqual(filterCourses(courses, { query: '动量', area: '数学' }), []);
  assert.equal(filterCourses(courses, { query: '不存在' }).length, 0);
});

test('资料检索组合课程、类型、年份筛选并支持课程简称', () => {
  assert.deepEqual(filterResources(resources, courses, { query: '高数', year: '2026', type: '复习提纲' }).map(r => r.id), ['review']);
  assert.deepEqual(filterResources(resources, courses, { courseId: 'mechanics', year: '2026' }), []);
  assert.deepEqual(filterResources(resources, courses).map(r => r.id), ['review', 'note']);
});

test('链接拒绝脚本协议、相对越界及凭据，编码中文本地文件', () => {
  for (const value of ['javascript:alert(1)', '//evil.example/a', 'http://example.com/a', 'https://user:secret@example.com', 'courses/math/../private.pdf', 'courses/math/./file.pdf', 'courses\\math\\file.pdf']) assert.equal(safeURL(value), null);
  assert.equal(safeURL('courses/math/中文笔记.pdf'), './courses/math/%E4%B8%AD%E6%96%87%E7%AC%94%E8%AE%B0.pdf');
  assert.equal(safeURL('courses/math/中文 笔记.pdf'), './courses/math/%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0.pdf');
  assert.equal(safeURL('https://example.com/note.pdf'), 'https://example.com/note.pdf');
  assert.equal(escapeHTML('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

test('投稿草稿保留中文和特殊字符，提交确认保持未勾选', () => {
  const draft = { course: '力学', title: '动量 & 能量 #1', type: '课程笔记', source: '我原创，CC BY 4.0', url: 'https://example.com/a?x=1&y=2' };
  const url = new URL(contributionURL('https://github.com/CobaltJiang/OpenNNU', draft));
  assert.equal(url.origin, 'https://github.com');
  assert.match(url.searchParams.get('title'), /动量 & 能量 #1/);
  assert.ok(url.searchParams.get('body').includes(draft.url));
  assert.match(url.searchParams.get('body'), /- \[ \] 我确认/);
  assert.ok(!url.searchParams.get('body').includes('- [x]'));
});

test('正式目录使用真实数据，尚未收录时保持空数组', async () => {
  const catalog = await validateCatalog();
  assert.ok(catalog.courses.length > 0);
  assert.ok(Array.isArray(catalog.resources));
});

test('目录校验拒绝许可待确认和缺失本地文件', async () => {
  const base = await mkdtemp(join(tmpdir(), 'opennnu-catalog-'));
  try {
    await mkdir(join(base, 'data'));
    const original = await validateCatalog();
    const actual = { ...original, courses: [{ ...original.courses[0], directory: `courses/${original.courses[0].id}` }] };
    for (const course of actual.courses) { await mkdir(join(base, course.directory), { recursive: true }); await writeFile(join(base, course.directory, 'README.md'), '# Course'); }
    await writeFile(join(base, 'data/site.json'), JSON.stringify(actual.site));
    await writeFile(join(base, 'data/courses.json'), JSON.stringify(actual.courses));
    const resource = { id: 'test-note', courseId: actual.courses[0].id, title: '测试资料', type: '课程笔记', year: '年份待核', source: '测试', license: '测试许可', permission: 'pending', added: '2026-10-22', origin: '学生原创', answerStatus: '不适用', url: `courses/${actual.courses[0].id}/missing.pdf` };
    await writeFile(join(base, 'data/resources.json'), JSON.stringify([resource]));
    await assert.rejects(validateCatalog(base), /分享许可尚未确认/);
    resource.permission = 'confirmed';
    await writeFile(join(base, 'data/resources.json'), JSON.stringify([resource]));
    await assert.rejects(validateCatalog(base), /本地文件不存在/);
    await writeFile(join(base, resource.url), 'test');
    assert.equal((await validateCatalog(base)).resources.length, 1);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('课程筛选组合开课单位、校区、类型，并按真实资料数量筛选', () => {
  const items = [{ ...courses[0], code: '001', departments: ['物科院'], campuses: ['仙林'], types: ['学科基础课程'], teachers: ['张老师'] }, { ...courses[1], code: '002', departments: ['数学部'], campuses: ['随园'], types: ['学科基础课程'], teachers: ['李老师'] }];
  assert.deepEqual(filterCourses(items, { query: '张老师', department: '物科院', campus: '仙林', type: '学科基础课程' }).map(c => c.id), ['mechanics']);
  assert.deepEqual(filterCourses(items, { query: '002' }).map(c => c.id), ['math']);
  assert.deepEqual(filterCourses(items, { department: '物科院', campus: '随园' }), []);
  assert.deepEqual(filterCourses(items, { withResources: true, resources: [resources[0]] }).map(c => c.id), ['mechanics']);
});

test('大目录分页无遗漏，筛选后页码越界回到有效页', () => {
  const items = Array.from({ length: 2011 }, (_, id) => id);
  const combined = [];
  for (let page = 1; page <= 84; page++) combined.push(...paginate(items, page).items);
  assert.deepEqual(combined, items);
  assert.equal(paginate(items, 84).items.length, 19);
  assert.equal(paginate(items.slice(0, 3), 84).page, 1);
  assert.deepEqual(paginate([], 84), { items: [], page: 1, pages: 1, total: 0 });
});
