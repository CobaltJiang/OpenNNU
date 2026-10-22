import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COLUMNS = ['开课单位', '课程号', '课程名', '班次', '教师', '学分', '学时', '课程类型', '通识类别', '课程性质', '课程模块', '上课时间地点', '校区', '容量', '课程简述标记', '教学班ID'];
const legacyIds = { '1007003065': 'mechanics', '1006009001': 'advanced-mathematics-1' };

// RFC 4180 CSV: preserve quoted commas, escaped quotes, newlines and string IDs.
export function parseCSV(text) {
  const rows = [];
  let row = [], value = '', quoted = false, afterQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else value += char;
    } else if (char === '"' && !value && !afterQuote) quoted = true;
    else if (char === ',') { row.push(value); value = ''; afterQuote = false; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = []; value = ''; afterQuote = false;
    } else { if (afterQuote || char === '"') throw new Error('CSV 引号格式错误'); value += char; }
  }
  if (quoted) throw new Error('CSV 引号没有闭合');
  if (value || row.length || afterQuote) { row.push(value); rows.push(row); }
  const headers = rows.shift() || [];
  for (const column of COLUMNS) if (!headers.includes(column)) throw new Error(`CSV 缺少列：${column}`);
  if (new Set(headers).size !== headers.length) throw new Error('CSV 表头重复');
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 行列数不符`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
  });
}

const unique = values => [...new Set(values.filter(Boolean))];
export function groupCourses(rows) {
  const groups = new Map(), sectionIds = new Set();
  for (const row of rows) {
    for (const column of ['课程号', '课程名', '开课单位', '教学班ID']) if (!row[column]) throw new Error(`缺少${column}`);
    if (!/^[A-Za-z0-9_-]+$/.test(row.课程号)) throw new Error(`课程号格式错误：${row.课程号}`);
    if (sectionIds.has(row.教学班ID)) throw new Error(`教学班 ID 重复：${row.教学班ID}`);
    sectionIds.add(row.教学班ID);
    if (!groups.has(row.课程号)) groups.set(row.课程号, []);
    groups.get(row.课程号).push(row);
  }
  return [...groups].map(([code, classes]) => {
    const names = unique(classes.map(row => row.课程名));
    if (names.length !== 1) throw new Error(`同一课程号存在不同名称：${code}`);
    const name = names[0];
    const id = legacyIds[code] || `nnu-${code.toLowerCase().replace(/_/g, '-')}`;
    const aliases = name.includes('高等数学') ? [name.replace('高等数学', '高数')] : [];
    if (code === '1007003065') aliases.push('Mechanics', '牛顿力学');
    if (code === '1006009001') aliases.push('calculus', '微积分', '高数上');
    return {
      id, code, name,
      departments: unique(classes.map(row => row.开课单位)),
      credits: unique(classes.map(row => row.学分)),
      hours: unique(classes.map(row => row.学时)),
      types: unique(classes.map(row => row.课程类型)),
      natures: unique(classes.map(row => row.课程性质)),
      generalCategories: unique(classes.map(row => row.通识类别)),
      modules: unique(classes.map(row => row.课程模块)),
      campuses: unique(classes.map(row => row.校区)),
      teachers: unique(classes.flatMap(row => row.教师.split(/[;；]/))),
      aliases,
      ...(legacyIds[code] ? { directory: `courses/${id}` } : {}),
      sectionCount: classes.length,
      sections: classes.map(row => ({
        id: row.教学班ID, number: row.班次, department: row.开课单位,
        teacher: row.教师, credits: row.学分, hours: row.学时,
        type: row.课程类型, nature: row.课程性质, generalCategory: row.通识类别,
        module: row.课程模块, schedule: row.上课时间地点, campus: row.校区,
        capacity: row.容量, descriptionFlag: row.课程简述标记,
      })),
    };
  });
}

export async function importCatalog(input, root) {
  const bytes = await readFile(input);
  const rows = parseCSV(bytes.toString('utf8'));
  const courses = groupCourses(rows);
  // Retain reviewed repository folders and curated search aliases on re-import.
  let previous = [];
  try { previous = JSON.parse(await readFile(resolve(root, 'data/courses.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previousByCode = new Map(previous.map(course => [course.code, course]));
  for (const course of courses) {
    const existing = previousByCode.get(course.code);
    if (existing?.directory === `courses/${course.id}`) course.directory = existing.directory;
    course.aliases = unique([...course.aliases, ...(existing?.aliases || [])]);
  }
  const sourcePath = resolve(root, 'catalog/current-semester.csv');
  await mkdir(dirname(sourcePath), { recursive: true });
  if (resolve(input) !== sourcePath) await copyFile(input, sourcePath);
  const metadata = {
    term: '本学期', source: '全校课程_5065.csv', sourceFile: 'catalog/current-semester.csv',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    rowCount: rows.length, courseCount: courses.length,
    departmentCount: unique(rows.map(row => row.开课单位)).length,
    imported: new Date().toISOString().slice(0, 10),
  };
  await writeFile(resolve(root, 'data/courses.json'), JSON.stringify(courses) + '\n');
  await writeFile(resolve(root, 'data/catalog.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const summary = await importCatalog(resolve(process.argv[2] || 'catalog/current-semester.csv'), root);
  console.log(JSON.stringify(summary, null, 2));
}
