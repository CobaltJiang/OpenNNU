import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLUMNS, parseCSV, groupCourses, importCatalog } from '../scripts/import-courses.mjs';

const row = overrides => Object.fromEntries(COLUMNS.map(column => [column, ({ 开课单位: '测试学院', 课程号: '000042', 课程名: '测试课程', 教学班ID: '001', 班次: '01', 学分: '2', ...overrides })[column] || '']));

test('CSV 解析保留 BOM、带引号的逗号、换行、双引号和前导零', () => {
  const cells = row({ 课程名: '文本,"例子"', 上课时间地点: '周一\n教室 A' });
  const line = COLUMNS.map(column => `"${cells[column].replaceAll('"', '""')}"`).join(',');
  const parsed = parseCSV(`\uFEFF${COLUMNS.join(',')}\r\n${line}\r\n`);
  assert.deepEqual(parsed, [cells]);
  assert.equal(parsed[0].课程号, '000042');
  assert.throws(() => parseCSV('课程名\n测试'), /缺少列/);
  assert.throws(() => parseCSV(`${COLUMNS.join(',')}\n"未闭合`), /没有闭合/);
});

test('同课程号合并教学班，同名不同课程号保持独立，空教师不编造', () => {
  const imported = groupCourses([row({ 教学班ID: '001', 教师: '张老师', 校区: '仙林' }), row({ 教学班ID: '002', 班次: '02', 教师: '', 校区: '随园' }), row({ 课程号: '000043', 教学班ID: '003' })]);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].sectionCount, 2);
  assert.deepEqual(imported[0].campuses, ['仙林', '随园']);
  assert.deepEqual(imported[0].teachers, ['张老师']);
  assert.equal(imported[0].sections[1].teacher, '');
  assert.throws(() => groupCourses([row({}), row({})]), /教学班 ID 重复/);
  assert.throws(() => groupCourses([row({}), row({ 教学班ID: '002', 课程名: '其他名称' })]), /不同名称/);
});

test('导入结果与原始 CSV 逐教学班对账，来源校验和、统计和原有链接一致', async () => {
  const bytes = await readFile(new URL('../catalog/current-semester.csv', import.meta.url));
  const rows = parseCSV(bytes.toString('utf8'));
  const actual = JSON.parse(await readFile(new URL('../data/courses.json', import.meta.url), 'utf8'));
  const meta = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const sourceFields = course => { const { aliases, directory, ...fields } = course; return fields; };
  assert.deepEqual(actual.map(sourceFields), groupCourses(rows).map(sourceFields));
  assert.equal(meta.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(meta.rowCount, rows.length);
  assert.equal(meta.courseCount, actual.length);
  assert.equal(meta.departmentCount, new Set(rows.map(item => item.开课单位)).size);
  assert.equal(actual.reduce((sum, course) => sum + course.sectionCount, 0), rows.length);
  assert.equal(new Set(actual.flatMap(course => course.sections.map(section => section.id))).size, rows.length);
  assert.equal(actual.find(course => course.code === '1007003065').id, 'mechanics');
  assert.equal(actual.find(course => course.code === '1006009001').id, 'advanced-mathematics-1');
});

test('再次导入保留人工维护的资料目录和搜索别名', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opennnu-import-'));
  try {
    await mkdir(join(root, 'data'));
    await writeFile(join(root, 'data/courses.json'), JSON.stringify([{ code: '000042', id: 'nnu-000042', directory: 'courses/nnu-000042', aliases: ['课程简称'] }]));
    const values = row({});
    await writeFile(join(root, 'input.csv'), `${COLUMNS.join(',')}\n${COLUMNS.map(column => values[column]).join(',')}\n`);
    await importCatalog(join(root, 'input.csv'), root);
    const [course] = JSON.parse(await readFile(join(root, 'data/courses.json'), 'utf8'));
    assert.equal(course.directory, 'courses/nnu-000042');
    assert.deepEqual(course.aliases, ['课程简称']);
    assert.equal(course.code, '000042');
  } finally { await rm(root, { recursive: true, force: true }); }
});
