const DEFAULT_SOURCE = '学生整理，来源不详，未获明确授权';
const DEFAULT_LICENSE = '未获明确授权（仅收录，供个人学习）';
const ORIGINS = ['原卷', '回忆版', '学生原创', '教师授权', '其他'];
const ANSWERS = ['无答案', '答案未核对', '答案已校对', '不适用'];

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const when = ms => new Date(ms).toLocaleString('zh-CN', { hour12: false });

let byId = new Map(), byCode = new Map(), byName = new Map();
const courseLabel = course => `${course.name}（${course.code}）`;

function resolveCourse(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const code = raw.match(/(\d{10})/);
  if (code && byId.has(`nnu-${code[1]}`)) return byId.get(`nnu-${code[1]}`);
  if (byName.has(raw)) return byName.get(raw);
  const bare = raw.replace(/[（(].*?[)）]/g, '').trim();
  return byName.get(bare) || null;
}

const toastEl = document.getElementById('toast');
let toastTimer;
function toast(message) {
  toastEl.textContent = message; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function card(item) {
  const meta = item.metadata || {};
  const resolved = resolveCourse(meta.course);
  const courseValue = resolved ? courseLabel(resolved) : (meta.course || '');
  const files = (item.files || []).map((file, index) => ({
    ...file, index, url: `/api/file/${item.id}/${index}?name=${encodeURIComponent(file.name || 'file')}`,
  }));
  const isPdf = files.length && /\.pdf$/i.test(files[0].name || '');
  return `<article class="card" data-id="${esc(item.id)}">
  <div class="card-head">
    <h2>${esc(meta.title || '(无标题)')}</h2>
    <span class="meta">${esc(meta.course || '')} · ${esc(meta.type || '')} · ${esc(meta.year || '年份未填')}</span>
    <span class="pill">${esc(item.id.slice(0, 8))}</span>
    <span class="meta">${esc(when(item.created))}</span>
  </div>
  <div class="card-body">
    <div class="preview">
      <ul class="files">${files.map(file => `<li><a href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.name)}</a><span class="meta">${size(file.size)}</span></li>`).join('') || '<li class="meta">没有文件</li>'}</ul>
      ${isPdf ? `<details data-preview><summary>在页面内预览</summary><iframe class="frame" data-src="${esc(files[0].url)}" title="预览"></iframe></details>` : ''}
      <div class="origin-block">
        <b>投稿原文（仅本机可见，不会公开）</b>
        <dl>
          <dt>来源</dt><dd>${esc(meta.source || '—')}</dd>
          <dt>备注</dt><dd>${esc(meta.note || '—')}</dd>
        </dl>
      </div>
    </div>
    <form class="form" data-form>
      <div class="field"><label>课程（可搜索课程名或课程号）</label><input name="course" list="course-list" value="${esc(courseValue)}" required></div>
      <div class="field"><label>公开标题</label><input name="title" value="${esc(meta.title || '')}" maxlength="80" required></div>
      <div class="field"><label>公开来源说明</label><textarea name="source" maxlength="300" required>${esc(DEFAULT_SOURCE)}</textarea></div>
      <div class="field"><label>许可</label><input name="license" value="${esc(DEFAULT_LICENSE)}" maxlength="80" required></div>
      <div class="row2">
        <div class="field"><label>来源类型</label><select name="origin">${ORIGINS.map(v => `<option${v === '其他' ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>答案状态</label><select name="answer">${ANSWERS.map(v => `<option${v === '不适用' ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="actions">
        <button type="submit" class="button button-primary">通过并公开</button>
        <button type="button" class="button button-danger" data-reject>拒绝并删除</button>
      </div>
      <p class="status" data-status></p>
    </form>
  </div>
</article>`;
}

async function load() {
  const list = document.getElementById('list');
  const count = document.getElementById('count');
  try {
    const queue = await api('/api/queue');
    count.textContent = queue.length ? `待审 ${queue.length} 份` : '暂无待审';
    list.innerHTML = queue.length ? queue.map(card).join('') : '<p class="empty">队列是空的。有同学上传后会出现在这里。</p>';
  } catch (error) {
    count.textContent = '读取失败';
    list.innerHTML = `<p class="empty">读取队列失败：${esc(error.message)}</p>`;
  }
}

document.getElementById('refresh').addEventListener('click', load);

function syncCount() {
  const remaining = document.querySelectorAll('.card').length;
  document.getElementById('count').textContent = remaining ? `待审 ${remaining} 份` : '暂无待审';
  if (!remaining) document.getElementById('list').innerHTML = '<p class="empty">队列是空的。有同学上传后会出现在这里。</p>';
}

document.addEventListener('toggle', event => {
  const details = event.target;
  if (!details.matches('details[data-preview]') || !details.open) return;
  const iframe = details.querySelector('iframe[data-src]');
  if (iframe && !iframe.src) iframe.src = iframe.dataset.src;
}, true);

document.getElementById('list').addEventListener('submit', async event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const cardEl = form.closest('.card');
  const status = form.querySelector('[data-status]');
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const course = resolveCourse(data.get('course'));
  if (!course) { status.textContent = '课程无法匹配到目录，请从候选里选一个。'; status.className = 'status err'; return; }
  const summary = `标题：${data.get('title')}\n课程：${courseLabel(course)}\n许可：${data.get('license')}\n\n确认公开这两项？文件会提交到 main 并立即对所有人可见。`;
  if (!confirm(summary)) return;
  button.disabled = true; status.textContent = '正在提交…'; status.className = 'status';
  try {
    const result = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardEl.dataset.id, courseId: course.id, title: data.get('title'), source: data.get('source'), license: data.get('license'), origin: data.get('origin'), answerStatus: data.get('answer') }),
    });
    status.textContent = result.commit ? `已收录：${result.commit}` : '已收录。';
    status.className = 'status ok';
    toast('已发布，稍后 git pull 同步本地仓库');
    cardEl.remove(); syncCount(); load();
  } catch (error) {
    status.textContent = error.message; status.className = 'status err'; button.disabled = false;
  }
});

document.getElementById('list').addEventListener('click', async event => {
  const button = event.target.closest('[data-reject]');
  if (!button) return;
  const cardEl = button.closest('.card');
  const status = cardEl.querySelector('[data-status]');
  if (!confirm('拒绝会删除待审文件，投稿人需要重新上传。确认？')) return;
  button.disabled = true; status.textContent = '正在删除…'; status.className = 'status';
  try {
    await api('/api/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cardEl.dataset.id }) });
    toast('已拒绝并清除待审文件');
    cardEl.remove(); syncCount(); load();
  } catch (error) { status.textContent = error.message; status.className = 'status err'; button.disabled = false; }
});

(async () => {
  try {
    const config = await api('/api/config');
    byId = new Map(config.courses.map(course => [course.id, course]));
    byCode = new Map(config.courses.map(course => [course.code, course]));
    byName = new Map(config.courses.map(course => [course.name, course]));
    const datalist = document.createElement('datalist');
    datalist.id = 'course-list';
    datalist.innerHTML = config.courses.map(course => `<option value="${esc(courseLabel(course))}"></option>`).join('');
    document.body.append(datalist);
  } catch { /* 课程表失败时仍可查看队列，只是无法发布 */ }
  load();
})();
