import { RESOURCE_TYPES, escapeHTML as e, filterCourses, filterResources, safeURL, paginate, contributionURL } from './library.js';
import { FILE_ACCEPT, UPLOAD_LIMIT_HINT, validateFiles, submitUpload } from './uploads.js';
import {downloadSources} from './downloads.js';

const paths = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  files: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2zM12 6v15"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2M15 22v-4a3.5 3.5 0 0 0-1-3c3 0 6-1 6-6a4.6 4.6 0 0 0-1-3c0-1 0-2-1-3-2 0-3 1-4 1a11 11 0 0 0-4 0c-1 0-2-1-4-1-1 1-1 2-1 3a4.6 4.6 0 0 0-1 3c0 5 3 6 6 6a3.5 3.5 0 0 0-1 3v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  external: '<path d="M14 3h7v7M10 14L21 3M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.files}</svg>`;
const $ = selector => document.querySelector(selector);
const main = $('#main');
const storageKey = 'opennnu:saved:v1';
const defaults = { query: '', department: 'all', campus: 'all', type: 'all', withResources: false, sort: 'default' };
const courseFilters = { ...defaults };
const resourceFilters = { query: '', courseId: 'all', type: 'all', year: 'all', sort: 'newest' };
let saved = new Set();
try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(value)) saved = new Set(value.filter(item => typeof item === 'string')); } catch { /* Optional browser storage. */ }
let site, catalog, courses = [], resources = [], currentPage = 'home', coursePage = 1, toastTimer;
let courseById = new Map(), resourceCounts = new Map();
const unique = values => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'));
const text = values => values?.length ? values.map(e).join(' / ') : '—';
const number = value => Number(value).toLocaleString('zh-CN');
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); node.removeAttribute('data-icon'); });

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

function bookmarkButton(key, name) {
  const active = saved.has(key);
  return `<button class="icon-button ${active ? 'is-saved' : ''}" data-save="${e(key)}" aria-label="${active ? '取消收藏' : '收藏'}${e(name)}" aria-pressed="${active}">${icon('bookmark')}</button>`;
}

function emptyState(title, action = '', glyph = 'folder') {
  return `<div class="empty-state"><div class="empty-icon">${icon(glyph)}</div><h3>${title}</h3>${action}</div>`;
}

function contributeButton(courseId = '', label = '贡献资料') {
  return `<a class="button button-ghost" href="#/contribute${courseId ? `?course=${encodeURIComponent(courseId)}` : ''}">${icon('plus')}${label}</a>`;
}

function courseCard(course) {
  const count = resourceCounts.get(course.id) || 0;
  return `<article class="catalog-card"><div class="catalog-card-title"><div><p class="course-code">${e(course.code)}</p><h3><a href="#/course/${e(course.id)}">${e(course.name)}</a></h3></div>${bookmarkButton(`course:${course.id}`, course.name)}</div><p class="catalog-department">${text(course.departments)}</p><div class="catalog-facts"><span>${text(course.credits)} 学分</span><span>${course.sectionCount} 个教学班</span></div><p class="catalog-teachers" title="${e(course.teachers.join('、'))}">${course.teachers.length ? e(course.teachers.join('、')) : '教师未列出'}</p><div class="catalog-card-footer"><span class="${count ? 'has-materials' : ''}">${count ? `${count} 份资料` : '暂无资料'}</span><a class="text-link" href="#/course/${e(course.id)}">查看 ${icon('arrow')}</a></div></article>`;
}

function resourceCard(resource) {
  const course = courseById.get(resource.courseId);
  const sources=downloadSources(resource,site),url=sources[0]?.url,sourceURL = safeURL(resource.sourceUrl, { local: false });
  return `<article class="resource-card"><div class="resource-type-icon">${icon('files')}</div><div class="resource-body"><h3>${e(resource.title)}</h3><div class="resource-meta">${e(course?.name)} · ${e(course?.code)} · ${e(resource.year)} · ${e(resource.type)}</div><div class="pills"><span class="pill">${e(resource.origin)}</span><span class="pill">${e(resource.answerStatus)}</span><span class="pill">${e(resource.license)}</span></div><p class="resource-provenance">来源：${sourceURL ? `<a href="${e(sourceURL)}" target="_blank" rel="noopener noreferrer">${e(resource.source)} ↗</a>` : e(resource.source)}</p></div><div class="resource-actions">${bookmarkButton(`resource:${resource.id}`, resource.title)}${url ? `<a class="button" href="${e(url)}" target="_blank" rel="noopener noreferrer">查看 ${icon('external')}</a>` : ''}${sources.length>1?`<details class="download-sources"><summary>备用下载</summary>${sources.slice(1).map(source=>`<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.label)} ↗</a>`).join('')}</details>`:''}</div></article>`;
}

function searchBox(placeholder, value = '') {
  return `<div class="searchbox">${icon('search')}<label class="sr-only" for="library-search">${e(placeholder)}</label><input id="library-search" type="search" value="${e(value)}" placeholder="${e(placeholder)}" autocomplete="off"><button class="search-clear" id="clear-search" aria-label="清空搜索" ${value ? '' : 'hidden'}>${icon('close')}</button><kbd aria-hidden="true">/</kbd></div>`;
}

function selectFilter(id, label, options) {
  return `<label class="filter-select"><span class="sr-only">${label}</span><select id="${id}" aria-label="${label}"><option value="all">全部${label}</option>${options.map(option => `<option value="${e(option)}">${e(option)}</option>`).join('')}</select></label>`;
}

function homeView() {
  return `<div class="catalog-heading"><div><h1>课程资料库</h1><p>让后来的人，不必再从零开始。</p></div><span class="term-tag">${e(catalog.term)}</span></div>
    <section class="catalog-stats" aria-label="资料库概况"><span><strong>${number(courses.length)}</strong> 门课程</span><span><strong>${number(catalog.rowCount)}</strong> 个教学班</span><span><strong>${catalog.departmentCount}</strong> 个开课单位</span><a href="#/resources"><strong>${resources.length}</strong> 份资料</a></section>
    ${searchBox('搜索课程、课程号或教师', courseFilters.query)}
    <div class="catalog-filters">${selectFilter('course-department', '开课单位', unique(courses.flatMap(course => course.departments)))}${selectFilter('course-campus', '校区', unique(courses.flatMap(course => course.campuses)))}${selectFilter('course-type', '课程类型', unique(courses.flatMap(course => course.types)))}<label class="materials-toggle"><input id="with-resources" type="checkbox" ${courseFilters.withResources ? 'checked' : ''}>仅看有资料</label><button class="section-action" id="reset-course-filters">重置</button></div>
    <div class="section-heading" id="course-heading"><span class="result-summary" id="course-result-count" role="status" aria-live="polite"></span><label class="sort-control"><span class="sr-only">排列方式</span><select id="course-sort" aria-label="排列方式"><option value="default">默认排序</option><option value="name">课程名称</option><option value="code">课程号</option><option value="resources">资料数量</option></select></label></div><div class="catalog-grid" id="course-results"></div><nav class="pagination" id="course-pagination" aria-label="课程分页"></nav>`;
}

function resourcesView() {
  const resourceCourses = courses.filter(course => resourceCounts.has(course.id));
  return `<div class="page-header compact-header"><h1>全部资料</h1></div>${searchBox('搜索资料或课程', resourceFilters.query)}<div class="resource-filters"><label class="filter-select"><span class="sr-only">课程</span><select id="resource-course" aria-label="课程"><option value="all">全部课程</option>${resourceCourses.map(course => `<option value="${e(course.id)}">${e(course.name)} · ${e(course.code)}</option>`).join('')}</select></label>${selectFilter('resource-type', '类型', RESOURCE_TYPES)}${selectFilter('resource-year', '年份', unique(resources.map(resource => resource.year)))}<label class="filter-select"><span class="sr-only">排序</span><select id="resource-sort" aria-label="资料排序"><option value="newest">最近收录</option><option value="name">标题顺序</option></select></label><button class="section-action" id="reset-resource-filters">重置</button></div><div class="section-heading"><span class="result-summary" id="resource-result-count" role="status" aria-live="polite"></span></div><div id="resource-results"></div>`;
}

function courseView(id) {
  const course = courseById.get(id);
  if (!course) return notFound();
  const items = resources.filter(resource => resource.courseId === id);
  const fact = (label, values) => `<div><dt>${label}</dt><dd>${text(values)}</dd></div>`;
  return `<a class="back-link" href="#/">${icon('back')}课程目录</a><article class="detail-header"><div class="detail-title-row"><div><p class="course-code">${e(course.code)}</p><h1>${e(course.name)}</h1></div>${bookmarkButton(`course:${id}`, course.name)}</div><p class="detail-department">${text(course.departments)}</p><dl class="detail-facts">${fact('学分', course.credits)}${fact('学时', course.hours)}${fact('课程类型', course.types)}${fact('课程性质', course.natures)}${fact('校区', course.campuses)}${fact('通识类别', course.generalCategories)}</dl><div class="detail-actions">${contributeButton(id)}${course.directory ? `<a class="button" href="${e(site.repository)}/tree/main/${e(course.directory)}" target="_blank" rel="noopener noreferrer">${icon('github')}原始目录</a>` : ''}</div></article>
    <section class="course-materials"><div class="section-heading"><div class="section-title"><h2>课程资料</h2><span class="count-tag">${items.length}</span></div></div><div class="${items.length ? 'resource-list' : 'resource-preview'}">${items.length ? items.map(resourceCard).join('') : emptyState('暂无资料', contributeButton(id))}</div></section>
    <details class="section-table-panel" ${course.sectionCount <= 5 ? 'open' : ''}><summary>${e(catalog.term)}教学班 <span class="count-tag">${course.sectionCount}</span></summary><div class="table-scroll" role="region" aria-label="教学班信息" tabindex="0"><table class="sections-table"><thead><tr><th>班次</th><th>教师</th><th>时间地点</th><th>校区</th></tr></thead><tbody>${course.sections.map(section => `<tr><td>${e(section.number || '—')}</td><td>${e(section.teacher || '—')}</td><td class="schedule">${e(section.schedule || '—')}</td><td>${e(section.campus || '—')}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function savedView() {
  const savedCourses = courses.filter(course => saved.has(`course:${course.id}`));
  const savedResources = resources.filter(resource => saved.has(`resource:${resource.id}`));
  return `<div class="page-header compact-header"><h1>我的收藏</h1><p>保存在当前浏览器。</p></div>${!savedCourses.length && !savedResources.length ? `<div class="resource-preview">${emptyState('暂无收藏', '<a class="button" href="#/">浏览课程 →</a>', 'bookmark')}</div>` : `${savedCourses.length ? `<div class="catalog-grid">${savedCourses.map(courseCard).join('')}</div>` : ''}${savedResources.length ? `<div class="resource-list saved-resources">${savedResources.map(resourceCard).join('')}</div>` : ''}`}`;
}

function courseLabel(course) { return `${course.name}（${course.code}）`; }
function contributeView(courseId) {
  return `<div class="page-header compact-header"><h1>贡献资料</h1></div><form class="form-card contribution-form" id="contribution-form"><div class="upload-step">${icon('files')}<div><strong>直接上传，无需账号</strong><small>${e(UPLOAD_LIMIT_HINT)}</small></div></div><div class="field"><label for="contribution-files">选择文件 *</label><input id="contribution-files" type="file" name="files" multiple required accept="${FILE_ACCEPT}"><p id="file-summary" class="privacy-note"></p></div><div class="field"><label for="contribution-course">课程 *</label><input id="contribution-course" name="course" list="course-options" maxlength="150" required placeholder="输入课程名称或课程号" value="${e(courseById.has(courseId) ? courseLabel(courseById.get(courseId)) : '')}"><datalist id="course-options">${courses.map(course => `<option value="${e(courseLabel(course))}"></option>`).join('')}</datalist></div><div class="field"><label for="contribution-title">资料标题 *</label><input id="contribution-title" name="title" maxlength="80" required></div><div class="field-row"><div class="field"><label for="contribution-type">类型</label><select id="contribution-type" name="type">${RESOURCE_TYPES.map(type => `<option>${e(type)}</option>`).join('')}</select></div><div class="field"><label for="contribution-year">年份 / 学期</label><input id="contribution-year" name="year" maxlength="40"></div></div><div class="field"><label for="contribution-source">来源与分享许可 *</label><textarea id="contribution-source" name="source" maxlength="300" required placeholder="作者、原始出处及公开分享许可"></textarea></div><div class="field"><label for="contribution-note">补充说明</label><textarea id="contribution-note" name="note" maxlength="300" placeholder="适用教材、是否有答案等"></textarea></div><label class="permission-check"><input type="checkbox" name="permission" value="yes" required>我有权公开分享，文件不含个人隐私、未结束的考试或保密资料。</label><label class="upload-honeypot" aria-hidden="true">网站<input name="website" tabindex="-1" autocomplete="off"></label><div class="form-actions"><button class="button button-primary" type="submit">上传资料</button></div><p class="privacy-note">文件先私下待审；审核通过后由维护者账号提交至公开仓库。</p><progress id="upload-progress" max="100" value="0" hidden aria-label="上传进度"></progress><p class="form-status" id="form-status" role="status" aria-live="polite"></p><div class="upload-fallback" id="upload-help" hidden><button class="button" type="button" data-retry-upload>重试上传</button> <a class="text-link" id="upload-fallback-link" href="${e(site.repository + '/issues/new?template=resource.yml')}" target="_blank" rel="noopener noreferrer">一直连不上？改用 GitHub 提交 ↗</a><p class="privacy-note">备用入口受 GitHub 附件限制（文档 25 MB、图片 10 MB），适合较小的资料；已填信息会自动带入。</p></div></form>`;
}

function aboutView() {
  return `<div class="page-header compact-header"><h1>关于 OpenNNU</h1></div><article class="about-panel"><p>南师大学生发起的开放课程资料库，非学校官方网站。</p><h2>课程目录</h2><p>来自提供的本学期开课清单：${number(catalog.rowCount)} 个教学班，按课程号合并为 ${number(courses.length)} 门课程。相同名称、不同课程号的课程分别保留。</p><p><a class="text-link" href="${e(site.repository)}/blob/main/${e(catalog.sourceFile)}" target="_blank" rel="noopener noreferrer">查看原始清单 ↗</a></p><h2>资料与贡献</h2><p>代码采用 MIT 许可证。课程资料按各自标明的许可使用，投稿经审核后收录。</p><div class="about-links"><a href="#/contribute" class="button button-primary">贡献资料</a><a href="${e(site.repository)}/issues/new?template=correction.yml" class="button" target="_blank" rel="noopener noreferrer">反馈与纠错 ${icon('external')}</a></div></article>`;
}

function notFound() {
  return `<div class="resource-preview">${emptyState('未找到页面', '<a class="button" href="#/">返回课程目录 →</a>')}</div>`;
}

function updateCourseResults() {
  const results = filterCourses(courses, { ...courseFilters, resources });
  const page = paginate(results, coursePage);
  coursePage = page.page;
  $('#course-result-count').textContent = `${number(page.total)} 门课程${page.total ? ` · ${number((page.page - 1) * 24 + 1)}–${number(Math.min(page.page * 24, page.total))}` : ''}`;
  $('#course-results').innerHTML = page.items.length ? page.items.map(courseCard).join('') : emptyState('没有匹配的课程', '<button class="button" data-reset-courses>重置筛选</button>', 'search');
  $('#course-results').classList.toggle('no-results', !page.items.length);
  const pages = [...new Set([1, page.page - 1, page.page, page.page + 1, page.pages].filter(item => item > 0 && item <= page.pages))].sort((a, b) => a - b);
  let last = 0;
  $('#course-pagination').innerHTML = page.pages <= 1 ? '' : `<button class="page-button" data-page="${page.page - 1}" ${page.page === 1 ? 'disabled' : ''} aria-label="上一页">←</button>${pages.map(value => { const gap = last && value - last > 1 ? '<span aria-hidden="true">…</span>' : ''; last = value; return `${gap}<button class="page-button ${value === page.page ? 'active' : ''}" data-page="${value}" ${value === page.page ? 'aria-current="page"' : ''} aria-label="第 ${value} 页">${value}</button>`; }).join('')}<button class="page-button" data-page="${page.page + 1}" ${page.page === page.pages ? 'disabled' : ''} aria-label="下一页">→</button>`;
}

function updateResourceResults() {
  const results = filterResources(resources, courses, resourceFilters);
  $('#resource-result-count').textContent = `${results.length} 份资料`;
  $('#resource-results').className = results.length ? 'resource-list' : 'resource-preview';
  $('#resource-results').innerHTML = results.length ? results.map(resourceCard).join('') : emptyState(resources.length ? '没有匹配的资料' : '暂无资料', contributeButton());
}

function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#sidebar').inert = matchMedia('(max-width:720px)').matches;
  $('#scrim').hidden = true;
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  $('#menu-toggle').setAttribute('aria-label', '打开导航');
}

function updateSavedCount() {
  $('#nav-saved-count').textContent = [...saved].filter(key => key.startsWith('course:') ? courseById.has(key.slice(7)) : resources.some(resource => key === `resource:${resource.id}`)).length;
}

function render({ focus = false } = {}) {
  if (!site) return;
  let path, params;
  try { const [route, query = ''] = (location.hash.slice(1) || '/').split('?'); path = decodeURIComponent(route); params = new URLSearchParams(query); } catch { path = '/404'; params = new URLSearchParams(); }
  const route = path.split('/').filter(Boolean);
  currentPage = route[0] || 'home';
  const titles = { home: '发现课程', resources: '全部资料', saved: '我的收藏', contribute: '贡献资料', about: '关于', course: '课程详情' };
  if (currentPage === 'home') main.innerHTML = homeView();
  else if (currentPage === 'resources') { if (params.has('q')) resourceFilters.query = params.get('q'); main.innerHTML = resourcesView(); }
  else if (currentPage === 'course') main.innerHTML = courseView(route[1]);
  else if (currentPage === 'saved') main.innerHTML = savedView();
  else if (currentPage === 'contribute') main.innerHTML = contributeView(params.get('course'));
  else if (currentPage === 'about') main.innerHTML = aboutView();
  else main.innerHTML = notFound();
  $('#breadcrumb-current').textContent = titles[currentPage] || '未找到页面';
  document.title = `${currentPage === 'course' ? courseById.get(route[1])?.name || '课程未找到' : titles[currentPage] || '未找到页面'} · OpenNNU`;
  document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === currentPage || (currentPage === 'course' && link.dataset.nav === 'home'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (currentPage === 'home') {
    for (const key of ['department', 'campus', 'type', 'sort']) $(`#course-${key}`).value = courseFilters[key];
    updateCourseResults();
  }
  if (currentPage === 'resources') {
    for (const [name, key] of [['course', 'courseId'], ['type', 'type'], ['year', 'year'], ['sort', 'sort']]) $(`#resource-${name}`).value = resourceFilters[key];
    updateResourceResults();
  }
  updateSavedCount(); closeMenu();
  if (focus) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
}

function resetCourses() {
  Object.assign(courseFilters, defaults); coursePage = 1;
  $('#library-search').value = ''; $('#clear-search').hidden = true; $('#with-resources').checked = false;
  for (const key of ['department', 'campus', 'type', 'sort']) $(`#course-${key}`).value = courseFilters[key];
  updateCourseResults();
}

document.addEventListener('click', async event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); main.scrollIntoView(); return; }
  const retry = event.target.closest('[data-retry-upload]');
  if (retry) { retry.closest('form')?.requestSubmit(); return; }
  const save = event.target.closest('[data-save]');
  if (save) {
    const key = save.dataset.save;
    saved.has(key) ? saved.delete(key) : saved.add(key);
    let stored = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { stored = false; }
    if (currentPage === 'saved') render();
    else { updateSavedCount(); document.querySelectorAll('[data-save]').forEach(button => { if (button.dataset.save !== key) return; button.classList.toggle('is-saved', saved.has(key)); button.setAttribute('aria-pressed', saved.has(key)); button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^(取消收藏|收藏)/, saved.has(key) ? '取消收藏' : '收藏')); }); }
    toast(stored ? saved.has(key) ? '已收藏' : '已取消收藏' : '仅保存本次收藏');
    return;
  }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton && !pageButton.disabled) { coursePage = Number(pageButton.dataset.page); updateCourseResults(); $('#course-heading').scrollIntoView({ block: 'start' }); }
  if (event.target.closest('#clear-search')) { $('#library-search').value = ''; $('#library-search').dispatchEvent(new Event('input', { bubbles: true })); $('#library-search').focus(); }
  if (event.target.closest('#reset-course-filters,[data-reset-courses]')) resetCourses();
  if (event.target.closest('#reset-resource-filters')) { Object.assign(resourceFilters, { query: '', courseId: 'all', type: 'all', year: 'all', sort: 'newest' }); history.replaceState(null, '', '#/resources'); render(); }
});

document.addEventListener('input', event => {
  if (event.target.id !== 'library-search') return;
  $('#clear-search').hidden = !event.target.value;
  if (currentPage === 'home') { courseFilters.query = event.target.value; coursePage = 1; updateCourseResults(); }
  if (currentPage === 'resources') { resourceFilters.query = event.target.value; updateResourceResults(); }
});

document.addEventListener('change', event => {
  if (event.target.id === 'contribution-files') {
    const files = [...event.target.files];
    uploadTicket = null;
    $('#file-summary').textContent = validateFiles(files) || files.map(file => `${file.name}（${(file.size/1024/1024).toFixed(2)} MB）`).join(' · ');
  }
  const courseField = { 'course-department': 'department', 'course-campus': 'campus', 'course-type': 'type', 'course-sort': 'sort', 'with-resources': 'withResources' }[event.target.id];
  if (courseField) { courseFilters[courseField] = courseField === 'withResources' ? event.target.checked : event.target.value; coursePage = 1; updateCourseResults(); }
  const resourceField = { 'resource-course': 'courseId', 'resource-type': 'type', 'resource-year': 'year', 'resource-sort': 'sort' }[event.target.id];
  if (resourceField) { resourceFilters[resourceField] = event.target.value; updateResourceResults(); }
});

let uploadTicket = null;
function draftOf(form) {
  const read = name => (form.querySelector(`[name="${name}"]`)?.value ?? '').trim();
  return { course: read('course'), title: read('title'), type: read('type'), year: read('year'), source: read('source'), note: read('note') };
}
document.addEventListener('submit', async event => {
  if (event.target.id !== 'contribution-form') return;
  event.preventDefault();
  const form = event.target, status = form.querySelector('#form-status'), progress = form.querySelector('progress'), button = form.querySelector('[type="submit"]');
  const error = validateFiles([...form.querySelector('[type="file"]').files]);
  if (error) { status.textContent = error; return; }
  if (!site.uploadService) { status.textContent = '上传服务暂未开放'; return; }
  button.disabled = true; progress.hidden = false; status.textContent = '正在上传…'; form.querySelector('#upload-help').hidden=true;
  try {
    const result = await submitUpload(site.uploadService,new FormData(form),{ticket:uploadTicket,onTicket:value=>{uploadTicket=value;},onRetry:()=>{status.textContent='连接暂时中断，正在重试…';},onProgress:value=>{progress.value=value;status.textContent=value===100?'文件已发送，正在保存…':`正在上传 ${value}%`;}});
    status.textContent = `上传成功，等待审核。投稿编号：${result.id}`;
    form.reset(); uploadTicket = null; form.querySelector('#file-summary').textContent = '';
  } catch(error) {
    if([400,403,409].includes(error.status)) uploadTicket=null;
    status.textContent=error.message;
    const fallback=form.querySelector('#upload-fallback-link');
    if(fallback) fallback.href=contributionURL(site.repository,draftOf(form));
    form.querySelector('#upload-help').hidden=error.code!=='UPLOAD_NETWORK';
  }
  finally { button.disabled=false; progress.hidden=true; }
});

$('#menu-toggle').addEventListener('click', () => { const open = !$('#sidebar').classList.contains('open'); $('#sidebar').classList.toggle('open', open); $('#sidebar').inert = !open && matchMedia('(max-width:720px)').matches; $('#scrim').hidden = !open; $('#menu-toggle').setAttribute('aria-expanded', open); $('#menu-toggle').setAttribute('aria-label', open ? '关闭导航' : '打开导航'); });
matchMedia('(max-width:720px)').addEventListener('change', closeMenu);
$('#scrim').addEventListener('click', closeMenu);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(); if (matchMedia('(max-width:720px)').matches) $('#menu-toggle').focus(); }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { const input = $('#library-search'); if (input) { event.preventDefault(); input.focus(); } }
  if (event.key === 'Tab' && $('#sidebar').classList.contains('open') && matchMedia('(max-width:720px)').matches) {
    const elements = [...$('#sidebar').querySelectorAll('a,button')];
    if (event.shiftKey && (document.activeElement === elements[0] || !$('#sidebar').contains(document.activeElement))) { event.preventDefault(); elements.at(-1).focus(); }
    else if (!event.shiftKey && (document.activeElement === elements.at(-1) || !$('#sidebar').contains(document.activeElement))) { event.preventDefault(); elements[0].focus(); }
  }
});
window.addEventListener('hashchange', () => render({ focus: true }));
window.addEventListener('storage', event => { if (event.key !== storageKey) return; try { const value = JSON.parse(event.newValue || '[]'); saved = new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []); render(); } catch { /* Ignore malformed storage. */ } });

async function load() {
  try {
    [site, courses, resources, catalog] = await Promise.all(['site', 'courses', 'resources', 'catalog'].map(async name => { const response = await fetch(`./data/${name}.json`); if (!response.ok) throw new Error(name); return response.json(); }));
    if (!Array.isArray(courses) || !Array.isArray(resources) || !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(site.repository)) throw new Error('Invalid catalog');
    courseById = new Map(courses.map(course => [course.id, course]));
    resourceCounts = new Map();
    for (const resource of resources) resourceCounts.set(resource.courseId, (resourceCounts.get(resource.courseId) || 0) + 1);
    $('#nav-course-count').textContent = number(courses.length); $('#nav-resource-count').textContent = resources.length;
    document.querySelectorAll('.repo-link').forEach(link => { link.href = site.repository; });
    render();
  } catch {
    main.innerHTML = `<div class="error-panel"><h1>目录加载失败</h1><a class="button" href="https://github.com/CobaltJiang/OpenNNU">GitHub ↗</a> <button class="button" id="retry-load">重试</button></div>`;
    $('#retry-load').addEventListener('click', load);
  }
}
await load();
