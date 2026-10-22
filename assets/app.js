import { RESOURCE_TYPES, escapeHTML as e, filterCourses, filterResources, safeURL, contributionURL } from './library.js';

const iconPaths = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  files: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2zM12 6v15"/>',
  sprout: '<path d="M12 22v-9M12 16C5 16 3 11 3 5c6 0 9 3 9 8 0-7 4-10 9-10 0 8-3 11-9 11"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2M15 22v-4a3.5 3.5 0 0 0-1-3c3 0 6-1 6-6a4.6 4.6 0 0 0-1-3c0-1 0-2-1-3-2 0-3 1-4 1a11 11 0 0 0-4 0c-1 0-2-1-4-1-1 1-1 2-1 3a4.6 4.6 0 0 0-1 3c0 5 3 6 6 6a3.5 3.5 0 0 0-1 3v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  external: '<path d="M14 3h7v7M10 14L21 3M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  shield: '<path d="M12 22s9-4 9-11V4l-9-3-9 3v7c0 7 9 11 9 11zM8 11l3 3 5-5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.files}</svg>`;
const $ = selector => document.querySelector(selector);
const main = $('#main');
const storageKey = 'opennnu:saved:v1';
let saved = new Set();
try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(value)) saved = new Set(value.filter(item => typeof item === 'string')); } catch { /* Storage is optional. */ }
let site, courses = [], resources = [], toastTimer;
let currentPage = 'home';
const courseFilters = { query: '', area: 'all', sort: 'default' };
const resourceFilters = { query: '', courseId: 'all', type: 'all', year: 'all', sort: 'newest' };

function fillIcons() { document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); node.removeAttribute('data-icon'); }); }
fillIcons();

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2500);
}

function bookmarkButton(key, name) {
  const active = saved.has(key);
  return `<button class="icon-button ${active ? 'is-saved' : ''}" data-save="${e(key)}" aria-label="${active ? '取消收藏' : '收藏'}${e(name)}" aria-pressed="${active}">${icon('bookmark')}</button>`;
}

function emptyState(title, description, action = '', glyph = 'folder') {
  return `<div class="empty-state"><div class="empty-icon">${icon(glyph)}</div><h3>${title}</h3><p>${description}</p>${action}</div>`;
}

const contributeButton = (courseId = '', text = '贡献第一份资料') => `<a class="button button-ghost" href="#/contribute${courseId ? `?course=${encodeURIComponent(courseId)}` : ''}">${icon('plus')}${text}</a>`;

function courseCard(course) {
  const count = resources.filter(resource => resource.courseId === course.id).length;
  return `<article class="course-card">
    <div class="course-card-top"><div class="course-symbol ${course.area === '数学' ? 'math' : ''}" aria-hidden="true">${course.area === '数学' ? '∫' : 'F'}</div>${bookmarkButton(`course:${course.id}`, course.name)}</div>
    <p class="course-code">${e(course.code)}</p><h3><a href="#/course/${e(course.id)}">${e(course.name)}</a></h3><p class="course-english">${e(course.englishName)}</p>
    <p class="course-description">${e(course.description)}</p><div class="pills"><span class="pill">${e(course.area)}</span><span class="pill">${e(course.semester)}</span><span class="pill">${e(course.audience)}</span></div>
    <div class="course-card-footer"><span class="course-state"><span class="status-dot"></span>${count ? `${count} 份资料已收录` : '资料征集中 · 0 份收录'}</span><a class="text-link" href="#/course/${e(course.id)}">进入课程 ${icon('arrow')}</a></div>
  </article>`;
}

function resourceCard(resource) {
  const course = courses.find(item => item.id === resource.courseId);
  const url = safeURL(resource.url);
  const sourceURL = safeURL(resource.sourceUrl, { local: false });
  return `<article class="resource-card"><div class="resource-type-icon">${icon('files')}</div><div class="resource-body"><h3>${e(resource.title)}</h3><div class="resource-meta">${e(course?.name)} <span aria-hidden="true">/</span> ${e(resource.year)} <span aria-hidden="true">/</span> ${e(resource.type)}</div><div class="pills"><span class="pill">${e(resource.origin)}</span><span class="pill">${e(resource.answerStatus)}</span><span class="pill">${e(resource.license)}</span></div><p class="resource-provenance">来源：${sourceURL ? `<a href="${e(sourceURL)}" target="_blank" rel="noopener noreferrer">${e(resource.source)} ↗</a>` : e(resource.source)} · 收录于 ${e(resource.added)}</p></div><div class="resource-actions">${bookmarkButton(`resource:${resource.id}`, resource.title)}${url ? `<a class="button" href="${e(url)}" target="_blank" rel="noopener noreferrer">查看资料 ${icon('external')}</a>` : ''}</div></article>`;
}

function searchBox(placeholder, value = '') {
  return `<div class="searchbox">${icon('search')}<label class="sr-only" for="library-search">${e(placeholder)}</label><input id="library-search" type="search" value="${e(value)}" placeholder="${e(placeholder)}" autocomplete="off"><button class="search-clear" id="clear-search" aria-label="清空搜索" ${value ? '' : 'hidden'}>${icon('close')}</button><kbd aria-hidden="true">/</kbd></div>`;
}

function banner() {
  return `<aside class="contribution-banner"><div><h3>你的积累，可以成为别人的起点。</h3><p>一份笔记、一套旧卷、一条纠错建议，都能让这里更完整。</p></div><a class="button" href="#/contribute">一起建设 OpenNNU ${icon('arrow')}</a></aside>`;
}

function homeView() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">南京师范大学 · 开放课程资料计划</div><h1>让后来的人，<br><em>不必再从零开始。</em></h1><p>把散落的课程资料，汇成一份可以传承的积累。<br>从一份笔记、一道习题、一张试卷开始，让知识自由流动。</p><div class="hero-stamp"><span>OPEN ACCESS</span> 由学生发起，为每一位求知者而建</div></div>
    <div class="hero-art" aria-hidden="true"><svg viewBox="0 0 300 230" fill="none"><path d="M17 187l126 34 142-55-128-33z" fill="#e9eddf"/><path d="M38 152l108 30 113-43-108-29z" fill="#fcfcf8" stroke="#aab59b"/><path d="M38 152v18l108 31 113-44v-18M146 182v19" stroke="#aab59b"/><path d="M49 135l108 29 113-43-108-29z" fill="#f5f4e9" stroke="#aab59b"/><path d="M49 135v10l108 30 113-44v-10M157 164v11" stroke="#aab59b"/><path d="M34 111l108 29 113-43-108-29z" fill="#fffef7" stroke="#aab59b"/><path d="M34 111v15l108 29 113-43V97M142 140v15" stroke="#aab59b"/><path d="M54 87l108 29 113-43-108-29z" fill="#f7eae4" stroke="#b39a8d"/><path d="M54 87v13l108 29 113-43V73M162 116v13" stroke="#b39a8d"/><path d="M84 72l36 10M92 65l55 15M100 58l36 10" stroke="#c8afa1"/><path d="M167 20v19M158 29h18M42 62v13M36 68h12M259 30v12M253 36h12" stroke="#bac2ac"/><circle cx="213" cy="16" r="3" fill="#c2cab4"/><circle cx="22" cy="139" r="2" fill="#b2bda1"/><path d="M83 167l25 7M83 173l16 5" stroke="#c2c9b5"/><path d="M235 185c2-12 9-15 17-16-1 11-7 16-17 16zm0 0c-10-2-15-8-14-15 9 2 14 6 14 15zm0 0v15" stroke="#8e9e78"/></svg></div></section>
    <section class="summary-strip" aria-label="资料库概况"><div class="summary-item"><span class="summary-icon">${icon('book')}</span><div><div class="summary-number">${courses.length.toString().padStart(2, '0')}</div><div class="summary-caption">首批筹建课程</div></div><span class="summary-aside">从这里开始</span></div><div class="summary-item"><span class="summary-icon">${icon('files')}</span><div><div class="summary-number">${resources.length.toString().padStart(2, '0')}</div><div class="summary-caption">已收录资料</div></div><span class="summary-aside">每一份都可追溯</span></div><div class="summary-item"><span class="summary-icon">${icon('heart')}</span><div><div class="summary-number open-value">免费开放</div><div class="summary-caption">共同建设 · 持续传承</div></div></div></section>
    <section aria-label="查找课程">${searchBox('搜索课程、学科或关键词…', courseFilters.query)}<div class="popular-search"><span>从这些开始：</span><button data-query="力学">力学</button><button data-query="高数">高等数学</button><button data-query="微积分">微积分</button></div></section>
    <section aria-labelledby="course-heading"><div class="section-heading"><div><div class="section-title"><h2 id="course-heading">课程目录</h2><span class="count-tag" id="course-result-count">${courses.length}</span></div><p class="section-subtitle">找到你的课程，接着前人的积累继续探索。</p></div><a class="section-action" href="#/contribute">没有找到课程？添加一门 ${icon('plus')}</a></div>
    <div class="filter-toolbar"><div class="tabs" role="group" aria-label="学科筛选">${['all', ...new Set(courses.map(course => course.area))].map(area => `<button class="tab ${area === courseFilters.area ? 'active' : ''}" data-area="${e(area)}" aria-pressed="${area === courseFilters.area}">${area === 'all' ? '全部课程' : e(area)}</button>`).join('')}</div><label class="sort-control">排列方式 <select id="course-sort"><option value="default">默认顺序</option><option value="name">课程名称</option><option value="resources">资料数量</option></select></label></div><div class="course-grid" id="course-results"></div>
    <div class="growing-note">${icon('sprout')}<span>资料库刚刚发芽。目前先从力学和高数开始，欢迎为其他课程种下第一份资料。</span><a href="#/contribute">添加课程 ↗</a></div></section>
    <section aria-labelledby="recent-heading"><div class="section-heading"><div class="section-title"><h2 id="recent-heading">最近收录</h2></div><a href="#/resources" class="section-action">查看全部资料 ${icon('arrow')}</a></div><div class="${resources.length ? 'resource-list' : 'resource-preview'}">${resources.length ? [...resources].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 3).map(resourceCard).join('') : emptyState('第一份积累，等你留下', '目前还没有公开收录的资料。所有收录数量都来自实际目录，欢迎把你愿意分享的学习成果留在这里。', contributeButton())}</div></section>${banner()}`;
}

function resourcesView() {
  const years = [...new Set(resources.map(resource => resource.year))].sort().reverse();
  return `<div class="page-header"><div class="eyebrow">THE OPEN ARCHIVE</div><h1>全部资料</h1><p>从课程到年份，找到需要的那一份。原卷、回忆版和原创资料会明确标注。</p></div>${searchBox('搜索资料标题、课程或关键词…', resourceFilters.query)}<div class="resource-filters"><label class="filter-select">课程<select id="resource-course"><option value="all">全部课程</option>${courses.map(course => `<option value="${e(course.id)}">${e(course.name)}</option>`).join('')}</select></label><label class="filter-select">类型<select id="resource-type"><option value="all">全部类型</option>${RESOURCE_TYPES.map(type => `<option>${e(type)}</option>`).join('')}</select></label><label class="filter-select">年份<select id="resource-year"><option value="all">全部年份</option>${years.map(year => `<option>${e(year)}</option>`).join('')}</select></label><label class="filter-select">排序<select id="resource-sort"><option value="newest">最近收录</option><option value="name">标题顺序</option></select></label></div><div class="section-heading"><div class="section-title"><h2>资料目录</h2><span class="count-tag" id="resource-result-count">${resources.length}</span></div><button class="section-action" id="reset-resource-filters">重置筛选</button></div><div id="resource-results"></div><p class="inline-note">每份资料均展示来源、分享许可与答案状态。资料与当前课程的适用性，请结合自己的教材和授课要求判断。</p>${banner()}`;
}

function courseView(id) {
  const course = courses.find(item => item.id === id);
  if (!course) return notFound();
  const items = resources.filter(resource => resource.courseId === id);
  const folder = `${site.repository}/tree/main/${course.directory}`;
  return `<a class="back-link" href="#/">${icon('back')}返回课程目录</a><article class="detail-header"><div class="detail-title-row"><div class="course-symbol ${course.area === '数学' ? 'math' : ''}" aria-hidden="true">${course.area === '数学' ? '∫' : 'F'}</div><div><h1>${e(course.name)}</h1><p>${e(course.englishName)}</p></div>${bookmarkButton(`course:${id}`, course.name)}</div><p class="detail-description">${e(course.description)}</p><div class="pills">${course.topics.map(topic => `<span class="pill">${e(topic)}</span>`).join('')}</div><dl class="detail-facts"><div><dt>面向同学</dt><dd>${e(course.audience)}</dd></div><div><dt>初始导航学期</dt><dd>${e(course.semester)}</dd></div><div><dt>实际收录</dt><dd>${items.length} 份资料${items.length ? '' : ' · 正在征集'}</dd></div></dl><p class="detail-note">${e(course.note)}</p><div class="detail-actions">${contributeButton(id, '为这门课贡献资料')}<a class="button" href="${e(folder)}" target="_blank" rel="noopener noreferrer">${icon('github')}查看原始目录</a></div></article><div class="section-heading"><div class="section-title"><h2>课程资料</h2><span class="count-tag">${items.length}</span></div></div><div class="${items.length ? 'resource-list' : 'resource-preview'}">${items.length ? items.map(resourceCard).join('') : emptyState('这门课，还在等待第一份资料', '你可以分享自己整理的笔记、获得分享许可的旧卷，或留下一条公开资料的线索。', contributeButton(id))}</div>`;
}

function savedView() {
  const savedCourses = courses.filter(course => saved.has(`course:${course.id}`));
  const savedResources = resources.filter(resource => saved.has(`resource:${resource.id}`));
  return `<div class="page-header"><div class="eyebrow">YOUR READING SHELF</div><h1>我的收藏</h1><p>把常用的课程和资料放在手边。收藏保存在当前浏览器中，无需注册账号。</p></div>${!savedCourses.length && !savedResources.length ? `<div class="resource-preview">${emptyState('书架还是空的', '点击课程或资料旁的书签，就能把它留在这里。', '<a class="button" href="#/">去发现课程 →</a>', 'bookmark')}</div>` : `${savedCourses.length ? `<div class="section-heading"><div class="section-title"><h2>收藏的课程</h2><span class="count-tag">${savedCourses.length}</span></div></div><div class="course-grid">${savedCourses.map(courseCard).join('')}</div>` : ''}${savedResources.length ? `<div class="section-heading" style="margin-top:30px"><div class="section-title"><h2>收藏的资料</h2><span class="count-tag">${savedResources.length}</span></div></div><div class="resource-list">${savedResources.map(resourceCard).join('')}</div>` : ''}`}<p class="inline-note">清理浏览器站点数据会移除收藏；不同设备之间暂不同步。</p>`;
}

function contributeView(courseId) {
  return `<div class="page-header"><div class="eyebrow">LEAVE SOMETHING FOR THE NEXT</div><h1>留下一份你的积累</h1><p>不需要懂代码。一份笔记、一条资料线索，或者一门还没出现在目录中的课程，都欢迎。</p></div><div class="form-layout"><form class="form-card" id="contribution-form"><h2 class="form-section-title"><span class="step-number">1</span>这是一份什么资料？</h2><div class="field"><label for="contribution-course">课程名称 *</label><input id="contribution-course" name="course" list="course-options" maxlength="80" required placeholder="选择已有课程，或输入新课程名称" value="${e(courses.find(course => course.id === courseId)?.name || '')}"><datalist id="course-options">${courses.map(course => `<option value="${e(course.name)}"></option>`).join('')}</datalist></div><div class="field"><label for="contribution-title">资料标题 *</label><input id="contribution-title" name="title" maxlength="80" required placeholder="例如：自己整理的第一章学习笔记"></div><div class="field-row"><div class="field"><label for="contribution-type">资料类型 *</label><select id="contribution-type" name="type">${RESOURCE_TYPES.map(type => `<option>${e(type)}</option>`).join('')}</select></div><div class="field"><label for="contribution-year">年份 / 学期</label><input id="contribution-year" name="year" maxlength="40" placeholder="例如：2025—2026 学年上学期"></div></div><div class="form-divider"></div><h2 class="form-section-title"><span class="step-number">2</span>让来源清楚，让分享安心</h2><div class="field"><label for="contribution-source">作者、来源与分享许可 *</label><textarea id="contribution-source" name="source" maxlength="300" required placeholder="例如：这是我自己整理的原创笔记，我愿意以 CC BY 4.0 分享。若由他人提供，请说明分享许可。"></textarea></div><div class="field"><label for="contribution-url">公开文件链接（可选）</label><input id="contribution-url" name="url" type="url" pattern="https://.*" maxlength="500" placeholder="https://…"><small>没有链接也可以，下一步可在 GitHub 投稿页面添加文件。请勿填写包含密码或个人访问令牌的链接。</small></div><div class="field"><label for="contribution-note">补充说明（可选）</label><textarea id="contribution-note" name="note" maxlength="300" placeholder="适用专业、授课教师、教材版本、是否有答案，或需要特别说明的地方。"></textarea></div><label class="checkbox-field"><input type="checkbox" name="confirm" required><span>我已核对来源和公开分享许可，并检查资料中没有个人信息及未结束考试的内容。</span></label><div class="form-actions"><button class="button button-primary" type="submit">前往 GitHub 确认投稿 ${icon('external')}</button><button class="button" type="button" id="copy-contribution">${icon('copy')}复制投稿内容</button></div><p class="privacy-note">此页只生成投稿草稿。前往 GitHub 后，登录并检查内容，再点击提交；维护者审核后才会加入资料目录。尚未提交的表单不会自动保存。</p><p class="form-status" id="form-status" role="status"></p></form><aside class="form-hint"><h3>小小一份，也有用。</h3><p>欢迎原创课程笔记、复习提纲、习题解析，以及获准公开的历年资料。</p><p>资料不必完美，来源要说明白。回忆版请标注“回忆版”，答案没有核对也可以如实说明。</p><p>提交后，维护者会协助分类、命名和整理。</p><p><a href="${e(site.repository)}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">阅读完整贡献指南 ↗</a></p></aside></div>`;
}

function aboutView() {
  return `<div class="page-header"><div class="eyebrow">A STUDENT-LED OPEN PROJECT</div><h1>关于 OpenNNU</h1><p>一个由学生发起、希望跨越年级持续传承的课程资料共享计划。</p></div><article class="about-panel"><h2>从“找不到一张往年卷”开始。</h2><p>一些学习积累，散落在群聊、网盘和不同人的硬盘里。后来的人，常常需要再走一遍相同的寻找之路。我们想把愿意公开分享的积累连接起来，让它们有清楚的目录，也有可追溯的来源。</p><blockquote class="about-quote">让后来的人，<br>不必再从零开始。</blockquote><div class="principles"><div class="principle">${icon('book')}<strong>免费开放</strong><p>公开目录和资料索引，不向使用者收取访问费用。</p></div><div class="principle">${icon('shield')}<strong>来源可追溯</strong><p>说明原卷、回忆版、原创资料与答案核对状态。</p></div><div class="principle">${icon('sprout')}<strong>一起传下去</strong><p>通过开放的版本记录，让每一份贡献留下痕迹。</p></div></div><h2>我们现在走到哪里？</h2><p>项目处于初建阶段。目前有 ${courses.length} 门筹建课程，正式收录 ${resources.length} 份资料。筹建课程仅提供导航，尚未收录的内容不会计入资料数量。下一步是逐份收集、核对并归档可以分享的学习资料。</p><h2>如何参与？</h2><p>你可以贡献一份资料，补充课程信息，报告错误，或参与界面与工具的开发。普通资料投稿可使用本站表单生成 GitHub Issue；熟悉 Git 的同学可以直接提交 Pull Request。审核合并后，网站会随目录更新。</p><h2>公开资料与使用说明</h2><p>OpenNNU 是学生自发项目，非南京师范大学官方网站。代码采用 MIT 许可证；课程资料的使用条件以每份资料的来源和许可说明为准。发现错误、来源问题或需要撤下资料，可通过仓库 Issue 联系维护者。</p><div class="about-links"><a href="#/contribute" class="button button-primary">${icon('plus')}贡献一份资料</a><a href="${e(site.repository)}" class="button" target="_blank" rel="noopener noreferrer">${icon('github')}查看开源仓库</a><a href="${e(site.repository)}/issues/new?template=correction.yml" class="button" target="_blank" rel="noopener noreferrer">反馈与纠错 ${icon('external')}</a></div></article>`;
}

function notFound() {
  return `<div class="page-header"><div class="eyebrow">PAGE NOT FOUND</div><h1>这页还没有被写下。</h1></div><div class="resource-preview">${emptyState('没有找到这门课程或页面', '可以返回课程目录，或贡献一门新的课程。', '<a class="button" href="#/">返回课程目录 →</a>')}</div>`;
}

function updateCourseResults() {
  const results = filterCourses(courses, { ...courseFilters, resources });
  $('#course-result-count').textContent = results.length;
  $('#course-results').innerHTML = results.length ? results.map(courseCard).join('') : emptyState('没有找到匹配的课程', '试试课程简称，或清空搜索与学科筛选。也欢迎为新课程贡献资料。', '<button class="button" id="reset-course-filters">重置搜索与筛选</button>', 'search');
  $('#course-results').style.display = results.length ? '' : 'block';
  document.querySelectorAll('[data-area]').forEach(button => { const active = button.dataset.area === courseFilters.area; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
}

function updateResourceResults() {
  const results = filterResources(resources, courses, resourceFilters);
  $('#resource-result-count').textContent = results.length;
  $('#resource-results').className = results.length ? 'resource-list' : 'resource-preview';
  $('#resource-results').innerHTML = results.length ? results.map(resourceCard).join('') : resources.length ? emptyState('没有匹配的资料', '换一个关键词，或点击上方“重置筛选”。', '', 'search') : emptyState('资料目录，从第一份开始', '目前还没有正式收录的资料。课程目录已经准备好，欢迎分享你愿意留下的学习积累。', contributeButton());
}

function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#scrim').hidden = true;
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
}

function updateSavedCount() {
  const validKeys = new Set([...courses.map(c => `course:${c.id}`), ...resources.map(r => `resource:${r.id}`)]);
  $('#nav-saved-count').textContent = [...saved].filter(key => validKeys.has(key)).length;
}

function render({ focus = false } = {}) {
  if (!site) return;
  let path, params;
  try { const [route, query = ''] = (location.hash.slice(1) || '/').split('?'); path = decodeURIComponent(route); params = new URLSearchParams(query); } catch { path = '/404'; params = new URLSearchParams(); }
  const route = path.split('/').filter(Boolean);
  currentPage = route[0] || 'home';
  const titles = { home: '发现课程', resources: '全部资料', saved: '我的收藏', contribute: '贡献资料', about: '关于这个计划', course: '课程详情' };
  let html;
  if (currentPage === 'home') html = homeView();
  else if (currentPage === 'resources') { if (params.has('q')) resourceFilters.query = params.get('q'); html = resourcesView(); }
  else if (currentPage === 'course') html = courseView(route[1]);
  else if (currentPage === 'saved') html = savedView();
  else if (currentPage === 'contribute') html = contributeView(params.get('course'));
  else if (currentPage === 'about') html = aboutView();
  else html = notFound();
  main.innerHTML = html;
  $('#breadcrumb-current').textContent = titles[currentPage] || '未找到页面';
  document.title = `${currentPage === 'course' ? courses.find(c => c.id === route[1])?.name || '课程未找到' : titles[currentPage] || '未找到页面'} · OpenNNU`;
  document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === currentPage || (currentPage === 'course' && link.dataset.nav === 'home'); link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (currentPage === 'home') { $('#course-sort').value = courseFilters.sort; updateCourseResults(); }
  if (currentPage === 'resources') {
    for (const [name, key] of [['course', 'courseId'], ['type', 'type'], ['year', 'year'], ['sort', 'sort']]) $(`#resource-${name}`).value = resourceFilters[key];
    updateResourceResults();
  }
  updateSavedCount();
  closeMenu();
  if (focus) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
}

function resetCourses() {
  Object.assign(courseFilters, { query: '', area: 'all', sort: 'default' });
  $('#library-search').value = '';
  $('#course-sort').value = 'default';
  $('#clear-search').hidden = true;
  updateCourseResults();
}

document.addEventListener('click', async event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); main.scrollIntoView(); return; }
  const save = event.target.closest('[data-save]');
  if (save) {
    const key = save.dataset.save;
    saved.has(key) ? saved.delete(key) : saved.add(key);
    const active = saved.has(key);
    let stored = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { stored = false; }
    updateSavedCount();
    if (currentPage === 'saved') render();
    else document.querySelectorAll('[data-save]').forEach(button => { if (button.dataset.save !== key) return; button.classList.toggle('is-saved', active); button.setAttribute('aria-pressed', active); button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^(取消收藏|收藏)/, active ? '取消收藏' : '收藏')); });
    toast(stored ? active ? '已加入收藏' : '已取消收藏' : '已更新本次收藏；浏览器未允许长期保存');
    return;
  }
  const areaButton = event.target.closest('[data-area]');
  if (areaButton) { courseFilters.area = areaButton.dataset.area; updateCourseResults(); }
  const queryButton = event.target.closest('[data-query]');
  if (queryButton) { $('#library-search').value = queryButton.dataset.query; $('#library-search').dispatchEvent(new Event('input', { bubbles: true })); $('#library-search').focus(); }
  if (event.target.closest('#clear-search')) { $('#library-search').value = ''; $('#library-search').dispatchEvent(new Event('input', { bubbles: true })); $('#library-search').focus(); }
  if (event.target.closest('#reset-course-filters')) resetCourses();
  if (event.target.closest('#reset-resource-filters')) { Object.assign(resourceFilters, { query: '', courseId: 'all', type: 'all', year: 'all', sort: 'newest' }); history.replaceState(null, '', '#/resources'); render(); }
  if (event.target.closest('#copy-contribution')) {
    const draft = getDraft();
    const content = new URL(contributionURL(site.repository, draft)).searchParams.get('body');
    try { await navigator.clipboard.writeText(content); $('#form-status').textContent = '投稿内容已复制，可粘贴到 GitHub Issue 或发给维护者。'; toast('投稿内容已复制'); }
    catch { $('#form-status').textContent = '浏览器未允许复制。请点击“前往 GitHub 确认投稿”，即可看到生成的草稿。'; }
  }
});

document.addEventListener('input', event => {
  if (event.target.id !== 'library-search') return;
  const value = event.target.value;
  $('#clear-search').hidden = !value;
  if (currentPage === 'home') { courseFilters.query = value; updateCourseResults(); }
  if (currentPage === 'resources') { resourceFilters.query = value; updateResourceResults(); }
});

document.addEventListener('change', event => {
  if (event.target.id === 'course-sort') { courseFilters.sort = event.target.value; updateCourseResults(); }
  const field = { 'resource-course': 'courseId', 'resource-type': 'type', 'resource-year': 'year', 'resource-sort': 'sort' }[event.target.id];
  if (field) { resourceFilters[field] = event.target.value; updateResourceResults(); }
});

function getDraft() { return Object.fromEntries(new FormData($('#contribution-form')).entries()); }
document.addEventListener('submit', event => {
  if (event.target.id !== 'contribution-form') return;
  event.preventDefault();
  const url = contributionURL(site.repository, getDraft());
  if (url.length > 7600) { $('#form-status').textContent = '内容较长，请缩短补充说明后再打开，或先复制投稿内容到 GitHub Issue。'; return; }
  window.open(url, '_blank', 'noopener,noreferrer');
  $('#form-status').textContent = '请在 GitHub 页面检查草稿、添加文件并提交。如果未出现新页面，请允许此站点打开投稿页面。';
});

$('#menu-toggle').addEventListener('click', () => { const open = !$('#sidebar').classList.contains('open'); $('#sidebar').classList.toggle('open', open); $('#scrim').hidden = !open; $('#menu-toggle').setAttribute('aria-expanded', open); });
$('#scrim').addEventListener('click', closeMenu);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenu(); $('#menu-toggle').focus(); }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { const input = $('#library-search'); if (input) { event.preventDefault(); input.focus(); } }
  if (event.key === 'Tab' && $('#sidebar').classList.contains('open') && matchMedia('(max-width:720px)').matches) {
    const focusable = [...$('#sidebar').querySelectorAll('a,button')];
    if (event.shiftKey && (document.activeElement === focusable[0] || !$('#sidebar').contains(document.activeElement))) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && (document.activeElement === focusable.at(-1) || !$('#sidebar').contains(document.activeElement))) { event.preventDefault(); focusable[0].focus(); }
  }
});
window.addEventListener('hashchange', () => render({ focus: true }));
window.addEventListener('storage', event => { if (event.key !== storageKey) return; try { const value = JSON.parse(event.newValue || '[]'); saved = new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []); render(); } catch { /* Ignore malformed data from another tab. */ } });

async function load() {
  try {
    [site, courses, resources] = await Promise.all(['site', 'courses', 'resources'].map(async name => { const response = await fetch(`./data/${name}.json`); if (!response.ok) throw new Error(name); return response.json(); }));
    if (!Array.isArray(courses) || !Array.isArray(resources) || !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(site.repository)) throw new Error('Invalid catalog');
    $('#nav-course-count').textContent = courses.length;
    $('#nav-resource-count').textContent = resources.length;
    document.querySelectorAll('.repo-link').forEach(link => { link.href = site.repository; });
    render();
  } catch {
    main.innerHTML = `<div class="error-panel"><h1>资料目录暂时没能打开。</h1><p>请检查网络后重新加载，或先访问 GitHub 仓库。如果直接打开了本地 HTML 文件，请使用项目中的 npm run dev 启动预览。</p><a class="button" href="https://github.com/CobaltJiang/OpenNNU">访问 GitHub 仓库 ↗</a> <button class="button" id="retry-load">重新加载</button></div>`;
    $('#retry-load').addEventListener('click', load);
  }
}
await load();
