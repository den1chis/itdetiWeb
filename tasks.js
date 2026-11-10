/* ITDETI TASKS — задачи: раздел «Задачи» (Неделя / Месяц / Проекты), блок на Главной,
 * значок числа задач в месячном календаре «Расписания».
 *
 * Изолированный модуль: подключается после lms.js. Сам добавляет раздел и пункт меню,
 * существующий код не переписывает, только оборачивает loadPage / loadDashboard / renderCalendar
 * (оригинал всегда вызывается первым). Если модуль упадёт при запуске, приложение работает как раньше.
 *
 * Сервер: маршруты /tasks/... (репозиторий itdeti, миграция 011).
 */
(function () {
  'use strict';

  // ============================================================ утилиты
  const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const WD_LOWER = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const NO_PROJECT_COLOR = '#94a3b8';
  const CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none"><path d="M2.2 6.3l2.4 2.4 5.2-5.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const pad = function (n) { return String(n).padStart(2, '0'); };
  const key = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parse = function (k) { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const addDays = function (d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayKey = function () { return key(new Date()); };
  const monday = function (d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
  const isMobile = function () { return window.matchMedia('(max-width: 760px)').matches; };
  const canDrag = function () { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; };

  function call(path, options) { return window.api('/tasks' + path, options); }
  function send(method, body) { return { method: method, body: JSON.stringify(body || {}) }; }
  function notify(message, type, title) { if (window.appNotify) window.appNotify(message, type || 'success', title || ''); }
  function fail(error) {
    console.error('ITDETI TASKS:', error);
    notify((error && error.message) || 'Ошибка', 'error');
  }

  function dayLabel(k, withWeekday) {
    if (!k) return 'Без срока';
    const t = todayKey();
    if (k === t) return 'Сегодня';
    if (k === key(addDays(parse(t), 1))) return 'Завтра';
    if (k === key(addDays(parse(t), -1))) return 'Вчера';
    const d = parse(k);
    const opts = { day: 'numeric', month: 'short' };
    if (withWeekday !== false) opts.weekday = 'short';
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('ru-RU', opts).replace('.', '');
  }

  function repeatLabel(item) {
    const n = item.repeat_interval || 1;
    switch (item.repeat) {
      case 'daily': return n === 1 ? 'Каждый день' : 'Каждые ' + n + ' дн.';
      case 'weekly': {
        const days = (item.repeat_weekdays || []).map(function (d) { return WD_LOWER[d - 1]; }).join(', ');
        return (n === 1 ? 'Каждую неделю' : 'Каждые ' + n + ' нед.') + (days ? ': ' + days : '');
      }
      case 'monthly': return n === 1 ? 'Каждый месяц' : 'Каждые ' + n + ' мес.';
      case 'yearly': return n === 1 ? 'Каждый год' : 'Каждые ' + n + ' г.';
      default: return '';
    }
  }

  // Для списков без даты и вида «Проекты»: выполненная задача видна зачёркнутой до конца дня, потом скрывается.
  // В календаре (неделя/месяц) этот фильтр не применяется — выполненные остаются на своей дате.
  function visible(item) {
    if (!item.is_done) return true;
    if (!item.done_at) return false;
    return key(new Date(item.done_at)) === todayKey();
  }

  // ============================================================ состояние
  const S = {
    view: 'week',
    anchor: new Date(),
    filter: null,          // null = все проекты, 'none' = без проекта, иначе id проекта
    projects: [],
    feed: null,            // { items, undated, overdue } для недели / месяца
    list: null,            // массив для «Проектов»
    selectedDay: null,     // выбранный день в месяце на телефоне
    error: null,
    loading: false,
    items: {},             // реестр отрисованных задач: ref -> item
    seq: 0,
    started: false,
  };
  let root = null;

  function projectById(id) { return S.projects.find(function (p) { return p.id === id; }) || null; }
  function colorOf(item) { const p = item.project_id && projectById(item.project_id); return p ? p.color : NO_PROJECT_COLOR; }
  function passFilter(item) {
    if (!S.filter) return true;
    if (S.filter === 'none') return !item.project_id || !projectById(item.project_id);
    return item.project_id === S.filter;
  }
  function register(item) {
    const ref = 't' + (++S.seq);
    S.items[ref] = item;
    return ref;
  }
  function isRecurring(item) { return item.repeat && item.repeat !== 'none'; }

  async function loadProjects() {
    S.projects = await call('/projects');
    if (S.filter && S.filter !== 'none' && !projectById(S.filter)) S.filter = null;
  }

  function range() {
    if (S.view === 'week') {
      const start = monday(S.anchor);
      return { from: start, to: addDays(start, 6) };
    }
    const first = new Date(S.anchor.getFullYear(), S.anchor.getMonth(), 1, 12);
    const start = monday(first);
    const last = new Date(S.anchor.getFullYear(), S.anchor.getMonth() + 1, 0, 12);
    let end = addDays(monday(last), 6);
    return { from: start, to: end };
  }

  function feedUrl(from, to) {
    return '/feed?date_from=' + key(from) + '&date_to=' + key(to) + '&today=' + todayKey();
  }

  async function reload() {
    S.loading = true;
    try {
      await loadProjects();
      if (S.view === 'projects') {
        S.list = await call('/list?today=' + todayKey());
      } else {
        const r = range();
        S.feed = await call(feedUrl(r.from, r.to));
      }
      S.error = null;
    } catch (error) {
      S.error = error;
      console.error('ITDETI TASKS:', error);
    } finally {
      S.loading = false;
    }
    draw();
  }

  // ============================================================ отрисовка
  function cardHtml(item, opts) {
    opts = opts || {};
    const ref = register(item);
    const t = todayKey();
    const late = !item.is_done && item.date && item.date < t;
    const classes = ['itdt-card'];
    if (item.is_done) classes.push('done');
    if (late && !isRecurring(item)) classes.push('overdue');
    else if (late) classes.push('past');
    const meta = [];
    const p = item.project_id && projectById(item.project_id);
    if (p && !S.filter) meta.push('<span><i class="itdt-dot" style="--pc:' + esc(p.color) + '"></i>' + esc(p.name) + '</span>');
    if (opts.showDate && item.date) meta.push('<span class="' + (late ? 'itdt-late' : '') + '">' + esc(dayLabel(item.date)) + '</span>');
    if (isRecurring(item)) meta.push('<span title="' + esc(repeatLabel(item)) + '">↻<span class="itdt-rep-text"> ' + esc(repeatLabel(item)) + '</span></span>');
    if (item.notes) meta.push('<span title="' + esc(item.notes.slice(0, 200)) + '">✎<span class="itdt-rep-text"> заметка</span></span>');
    return '<div class="' + classes.join(' ') + '" style="--pc:' + esc(colorOf(item)) + '" data-ref="' + ref + '" data-act="edit"' +
      (canDrag() ? ' draggable="true"' : '') + '>' +
      '<button type="button" class="itdt-check" data-act="toggle" data-ref="' + ref + '" aria-label="' + (item.is_done ? 'Снять отметку' : 'Выполнено') + '">' + CHECK_SVG + '</button>' +
      '<div class="itdt-card-body"><div class="itdt-title">' + esc(item.title) + '</div>' +
      (meta.length ? '<div class="itdt-meta">' + meta.join('') + '</div>' : '') + '</div></div>';
  }

  function toolbarHtml() {
    const seg = [['week', 'Неделя'], ['month', 'Месяц'], ['projects', 'Проекты']].map(function (v) {
      return '<button type="button" data-act="view" data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'active' : '') + '">' + v[1] + '</button>';
    }).join('');
    let period = '';
    if (S.view !== 'projects') {
      let title;
      if (S.view === 'week') {
        const r = range();
        const sameMonth = r.from.getMonth() === r.to.getMonth();
        title = r.from.getDate() + (sameMonth ? '' : ' ' + r.from.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')) +
          ' – ' + r.to.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      } else {
        title = S.anchor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      period = '<div class="itdt-period">' +
        '<button type="button" class="itdt-icon-btn" data-act="prev" aria-label="Назад">‹</button>' +
        '<button type="button" class="itdt-today-btn" data-act="today">Сегодня</button>' +
        '<button type="button" class="itdt-icon-btn" data-act="next" aria-label="Вперёд">›</button>' +
        '<span class="itdt-period-title">' + esc(title) + '</span></div>';
    }
    return '<div class="itdt-toolbar"><div class="itdt-seg">' + seg + '</div>' + period +
      '<span class="itdt-spacer"></span><button type="button" class="btn primary itdt-new" data-act="new">+ Задача</button></div>';
  }

  function chipsHtml() {
    const chips = ['<button type="button" class="itdt-chip ' + (!S.filter ? 'active' : '') + '" data-act="filter" data-id="">Все</button>'];
    S.projects.forEach(function (p) {
      chips.push('<button type="button" class="itdt-chip ' + (S.filter === p.id ? 'active' : '') + '" data-act="filter" data-id="' + esc(p.id) + '"><i class="itdt-dot" style="--pc:' + esc(p.color) + '"></i>' + esc(p.name) + '</button>');
    });
    chips.push('<button type="button" class="itdt-chip ' + (S.filter === 'none' ? 'active' : '') + '" data-act="filter" data-id="none"><i class="itdt-dot"></i>Без проекта</button>');
    chips.push('<button type="button" class="itdt-chip" data-act="projects-manage" title="Проекты">⚙ Проекты</button>');
    return '<div class="itdt-chips">' + chips.join('') + '</div>';
  }

  function projectOptions(selected, allowNone) {
    let html = allowNone === false ? '' : '<option value="">Без проекта</option>';
    S.projects.forEach(function (p) {
      html += '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    return html;
  }

  function defaultProject() { return S.filter && S.filter !== 'none' ? S.filter : ''; }

  function quickHtml() {
    // На странице «Задачи» новая задача по умолчанию без срока (на Главной — на сегодня).
    const defDate = '';
    return '<form class="itdt-quick" data-form="quick" autocomplete="off">' +
      '<input type="text" name="title" placeholder="Новая задача… (Enter — добавить)" maxlength="300">' +
      '<select name="project" aria-label="Проект">' + projectOptions(defaultProject()) + '</select>' +
      '<input type="date" name="date" value="' + defDate + '" aria-label="Дата">' +
      '<button type="submit" class="btn primary">Добавить</button></form>';
  }

  function stateHtml() {
    if (S.error) {
      return '<div class="itdt-state"><b>Задачи пока недоступны</b>' + esc(S.error.message || 'Ошибка сервера') +
        '<br><br>Если раздел открывается впервые, нужно один раз выполнить миграцию <code>011_tasks.sql</code> в Supabase.' +
        '<br><br><button type="button" class="btn" data-act="retry">Повторить</button></div>';
    }
    return '<div class="itdt-state">Загрузка…</div>';
  }

  function weekHtml() {
    const r = range();
    const t = todayKey();
    const byDay = {};
    (S.feed.items || []).forEach(function (it) {
      if (!passFilter(it)) return;  // в календаре выполненные задачи остаются на своей дате (история)
      (byDay[it.date] = byDay[it.date] || []).push(it);
    });
    const overdue = (S.feed.overdue || []).filter(passFilter);
    const undated = (S.feed.undated || []).filter(function (it) { return visible(it) && passFilter(it); });
    let html = '';
    const isCurrentWeek = key(r.from) === key(monday(new Date()));
    if (overdue.length && isCurrentWeek) {
      html += '<div class="itdt-overdue"><div class="itdt-overdue-title">Просрочено · ' + overdue.length + '</div><div class="itdt-overdue-list">' +
        overdue.map(function (it) { return cardHtml(it, { showDate: true }); }).join('') + '</div></div>';
    }
    html += '<div class="itdt-week" data-swipe="1">';
    for (let i = 0; i < 7; i++) {
      const d = addDays(r.from, i);
      const k = key(d);
      const list = byDay[k] || [];
      const open = list.filter(function (it) { return !it.is_done; }).length;
      html += '<div class="itdt-col ' + (k === t ? 'today' : '') + (list.length ? '' : ' empty-day') + '" data-drop="' + k + '">' +
        '<div class="itdt-col-head"><div><span class="itdt-col-day">' + WD_SHORT[i] + '</span><span class="itdt-col-num">' + d.getDate() + '</span>' +
        (isMobile() && k === t ? ' <span class="itdt-col-count">· сегодня</span>' : '') + '</div>' +
        '<span class="itdt-col-count">' + (open ? open : '') + '</span></div>' +
        '<div class="itdt-col-list">' + list.map(function (it) { return cardHtml(it); }).join('') +
        (list.length || isMobile() ? '' : '<div class="itdt-empty-col">—</div>') + '</div>' +
        '<button type="button" class="itdt-add-inline" data-act="new" data-date="' + k + '">+ Добавить</button></div>';
    }
    html += '</div>';
    const openUndated = undated.filter(function (it) { return !it.is_done; }).length;
    html += '<div class="itdt-undated" data-drop="">' +
      '<div class="itdt-undated-head"><span>Без срока' + (openUndated ? ' · ' + openUndated : '') + '</span>' +
      '<button type="button" class="itdt-link" data-act="new" data-date="">+ Добавить</button></div>' +
      (undated.length ? '<div class="itdt-undated-list">' + undated.map(function (it) { return cardHtml(it); }).join('') + '</div>' :
        '<div class="itdt-empty-col" style="text-align:left;padding:4px 0">' + (canDrag() ? 'Перетащите сюда задачу, чтобы убрать дату' : 'Задач без срока нет') + '</div>') +
      '</div>';
    return html;
  }

  function monthHtml() {
    const r = range();
    const t = todayKey();
    const month = S.anchor.getMonth();
    const byDay = {};
    (S.feed.items || []).forEach(function (it) {
      if (!passFilter(it)) return;  // в календаре выполненные задачи остаются на своей дате (история)
      (byDay[it.date] = byDay[it.date] || []).push(it);
    });
    let html = '<div class="itdt-month" data-swipe="1"><div class="itdt-month-head">' + WD_SHORT.map(function (d) { return '<div>' + d + '</div>'; }).join('') +
      '</div><div class="itdt-month-grid">';
    for (let d = new Date(r.from); key(d) <= key(r.to); d = addDays(d, 1)) {
      const k = key(d);
      const list = byDay[k] || [];
      const cls = ['itdt-mcell'];
      if (d.getMonth() !== month) cls.push('other');
      if (k === t) cls.push('today');
      if (S.selectedDay === k) cls.push('selected');
      const chips = list.slice(0, 3).map(function (it) {
        const ref = register(it);
        return '<div class="itdt-mchip ' + (it.is_done ? 'done' : '') + '" style="--pc:' + esc(colorOf(it)) + '" data-act="edit" data-ref="' + ref + '"' +
          (canDrag() ? ' draggable="true"' : '') + '><i class="itdt-dot"></i><span>' + esc(it.title) + '</span></div>';
      }).join('');
      const dots = list.slice(0, 4).map(function (it) {
        return '<i class="itdt-dot" style="--pc:' + esc(colorOf(it)) + ';' + (it.is_done ? 'opacity:.35' : '') + '"></i>';
      }).join('');
      html += '<div class="' + cls.join(' ') + '" data-act="day" data-date="' + k + '" data-drop="' + k + '">' +
        '<span class="itdt-mnum">' + d.getDate() + '</span>' + chips +
        (list.length > 3 ? '<span class="itdt-mmore">ещё ' + (list.length - 3) + '</span>' : '') +
        '<span class="itdt-mdots">' + dots + '</span></div>';
    }
    html += '</div></div>';
    if (S.selectedDay) {
      const list = byDay[S.selectedDay] || [];
      html += '<div class="itdt-day-panel"><div class="itdt-day-panel-title"><span>' + esc(dayLabel(S.selectedDay)) + '</span>' +
        '<button type="button" class="itdt-link" data-act="new" data-date="' + S.selectedDay + '">+ Задача</button></div>' +
        '<div style="display:grid;gap:7px">' + (list.length ? list.map(function (it) { return cardHtml(it); }).join('') :
          '<div class="itdt-empty-col">Задач нет</div>') + '</div></div>';
    }
    return html;
  }

  function projectsHtml() {
    const t = todayKey();
    const items = (S.list || []).filter(visible);
    const groups = S.projects.map(function (p) { return { id: p.id, name: p.name, color: p.color, items: [] }; });
    const none = { id: 'none', name: 'Без проекта', color: NO_PROJECT_COLOR, items: [] };
    items.forEach(function (it) {
      const g = groups.find(function (x) { return x.id === it.project_id; }) || none;
      g.items.push(it);
    });
    const all = groups.concat(none.items.length || S.filter === 'none' ? [none] : []).filter(function (g) {
      return !S.filter || S.filter === g.id;
    });
    if (!all.length) return '<div class="itdt-state">Проектов нет. Создайте первый через «⚙ Проекты».</div>';
    const section = function (label, list, late) {
      if (!list.length) return '';
      return '<div class="itdt-group-label ' + (late ? 'late' : '') + '">' + esc(label) + '</div>' + list.map(function (it) {
        const ref = register(it);
        const isLate = !it.is_done && it.date && it.date < t;
        return '<div class="itdt-row ' + (it.is_done ? 'done' : '') + '" style="--pc:' + esc(colorOf(it)) + '" data-act="edit" data-ref="' + ref + '">' +
          '<button type="button" class="itdt-check" data-act="toggle" data-ref="' + ref + '" aria-label="Выполнено">' + CHECK_SVG + '</button>' +
          '<span class="itdt-title">' + esc(it.title) + '</span>' +
          '<span class="itdt-row-date ' + (isLate ? 'late' : '') + '">' + (isRecurring(it) ? '<span title="' + esc(repeatLabel(it)) + '">↻</span>' : '') +
          esc(it.date ? dayLabel(it.date) : '') + '</span></div>';
      }).join('');
    };
    return '<div class="itdt-projects">' + all.map(function (g) {
      const late = g.items.filter(function (it) { return it.date && it.date < t && !it.is_done; });
      const today = g.items.filter(function (it) { return it.date === t || (it.date && it.date < t && it.is_done); });
      const soon = g.items.filter(function (it) { return it.date && it.date > t; });
      const undated = g.items.filter(function (it) { return !it.date; });
      const open = g.items.filter(function (it) { return !it.is_done; }).length;
      const body = section('Просрочено', late, true) + section('Сегодня', today) + section('Дальше', soon) + section('Без срока', undated);
      return '<div class="itdt-pblock" style="--pc:' + esc(g.color) + '"><div class="itdt-pblock-head"><i class="itdt-dot" style="--pc:' + esc(g.color) + ';width:11px;height:11px"></i>' +
        '<span class="itdt-pblock-name">' + esc(g.name) + '</span><span class="itdt-pblock-count">' + (open ? open + ' открыто' : '') + '</span></div>' +
        (body || '<div class="itdt-pblock-empty">Пока пусто</div>') +
        '<button type="button" class="itdt-add-inline" data-act="new" data-project="' + esc(g.id === 'none' ? '' : g.id) + '" data-date="">+ Задача в «' + esc(g.name) + '»</button></div>';
    }).join('') + '</div>';
  }

  function draw() {
    if (!root) return;
    const loaded = S.view === 'projects' ? S.list : S.feed;
    let body;
    if (S.error) body = stateHtml();
    else if (!loaded) body = stateHtml();
    else if (S.view === 'week') body = weekHtml();
    else if (S.view === 'month') body = monthHtml();
    else body = projectsHtml();
    const focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.name === 'title' ? document.activeElement.value : null;
    root.innerHTML = '<div class="itdt-root">' + toolbarHtml() + chipsHtml() + quickHtml() + body + '</div>';
    if (focused !== null) {
      const input = root.querySelector('[data-form="quick"] input[name="title"]');
      if (input) { input.value = focused; input.focus(); }
    }
  }

  // ============================================================ действия
  async function toggle(item) {
    const done = !item.is_done;
    // мгновенный отклик, затем синхронизация
    item.is_done = done;
    item.done_at = done ? new Date().toISOString() : null;
    redrawAll();
    try {
      await call('/' + item.task_id + '/done', send('POST', { done: done, occurrence_date: isRecurring(item) ? item.occurrence_date : null }));
      if (done) notify('«' + item.title + '» выполнено', 'success', 'Готово');
    } catch (error) {
      fail(error);
    }
    await refreshEverywhere();
  }

  async function move(item, toDate) {
    if (isRecurring(item) && !toDate) {
      notify('Повторяющуюся задачу нельзя перенести в «Без срока». Измените повтор в самой задаче.', 'warning', 'Нельзя');
      return;
    }
    if ((item.date || '') === (toDate || '')) return;
    try {
      await call('/' + item.task_id + '/move', send('POST', { occurrence_date: isRecurring(item) ? item.occurrence_date : null, to_date: toDate || null }));
      notify('Перенесено: ' + dayLabel(toDate), 'success', 'Готово');
    } catch (error) {
      fail(error);
    }
    await refreshEverywhere();
  }

  function redrawAll() {
    draw();
    renderDashboardTasks(true);
  }

  async function refreshEverywhere() {
    const jobs = [];
    if (isTasksPageOpen()) jobs.push(reload());
    if (document.getElementById('dashboardTasks')) jobs.push(renderDashboardTasks());
    jobs.push(decorateCalendar());
    await Promise.all(jobs.map(function (p) { return Promise.resolve(p).catch(function (e) { console.error(e); }); }));
  }

  function isTasksPageOpen() {
    const section = document.getElementById('tasks');
    return !!(section && section.classList.contains('active'));
  }

  // ---------------------------------------------------------- редактор
  function openEditor(item, preset) {
    preset = preset || {};
    const isNew = !item;
    const recurring = !!item && isRecurring(item);
    const data = item ? {
      title: item.title, notes: item.notes || '', project_id: item.project_id || '',
      due_date: recurring ? (item.series_start || item.date || '') : (item.date || ''),
      repeat: item.repeat || 'none', repeat_interval: item.repeat_interval || 1,
      repeat_weekdays: (item.repeat_weekdays || []).slice(), repeat_until: item.repeat_until || ''
    } : {
      title: preset.title || '', notes: '', project_id: preset.project_id != null ? preset.project_id : defaultProject(),
      due_date: preset.date != null ? preset.date : todayKey(), repeat: 'none', repeat_interval: 1, repeat_weekdays: [], repeat_until: ''
    };
    const t = todayKey();
    const quick = [['Сегодня', t], ['Завтра', key(addDays(parse(t), 1))], ['Через неделю', key(addDays(parse(t), 7))], ['Без срока', '']];
    const body =
      '<div class="itdt-form" id="itdtEditor">' +
      '<div><label for="itdtTitle">Задача</label><input type="text" id="itdtTitle" maxlength="300" value="' + esc(data.title) + '" placeholder="Что нужно сделать?"></div>' +
      '<div class="itdt-row2"><div><label for="itdtProject">Проект</label><select id="itdtProject">' + projectOptions(data.project_id) + '</select></div>' +
      '<div><label for="itdtDate">' + (recurring ? 'Начало повтора' : 'Дата') + '</label><input type="date" id="itdtDate" value="' + esc(data.due_date) + '">' +
      '<div class="itdt-quickdates" id="itdtQuickDates">' + quick.map(function (q) {
        return '<button type="button" data-date="' + q[1] + '" class="' + (data.due_date === q[1] ? 'active' : '') + '">' + q[0] + '</button>';
      }).join('') + '</div></div></div>' +
      '<div><label for="itdtRepeat">Повтор</label><select id="itdtRepeat">' +
      [['none', 'Не повторять'], ['daily', 'Каждый день'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']].map(function (o) {
        return '<option value="' + o[0] + '"' + (data.repeat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="itdt-repeat-box" id="itdtRepeatBox" hidden>' +
      '<div class="itdt-interval">Каждые <input type="number" id="itdtInterval" min="1" max="365" value="' + data.repeat_interval + '"> <span id="itdtUnit"></span></div>' +
      '<div id="itdtWdWrap"><label>Дни недели</label><div class="itdt-wd" id="itdtWd">' + WD_SHORT.map(function (d, i) {
        return '<button type="button" data-wd="' + (i + 1) + '" class="' + (data.repeat_weekdays.indexOf(i + 1) >= 0 ? 'active' : '') + '">' + d + '</button>';
      }).join('') + '</div></div>' +
      '<div><label for="itdtUntil">Повторять до (необязательно)</label><input type="date" id="itdtUntil" value="' + esc(data.repeat_until) + '"></div>' +
      (recurring ? '<div class="itdt-hint">Изменения повтора применяются ко всей серии, отметки прошлых повторов при этом сбрасываются.</div>' : '') +
      '</div>' +
      (recurring ? '<div><label for="itdtMoveOne">Перенести только этот повтор (' + esc(dayLabel(item.date)) + ') на</label><input type="date" id="itdtMoveOne" value="' + esc(item.date) + '"></div>' : '') +
      '<div><label for="itdtNotes">Заметка</label><textarea id="itdtNotes" maxlength="5000" placeholder="Необязательно">' + esc(data.notes) + '</textarea></div>' +
      '<div class="itdt-actions" id="itdtActions">' +
      (isNew ? '' : '<button type="button" class="btn itdt-del" id="itdtDelete">Удалить</button>') +
      '<button type="button" class="btn" id="itdtCancel">Отмена</button>' +
      '<button type="button" class="btn primary" id="itdtSave">' + (isNew ? 'Создать' : 'Сохранить') + '</button></div></div>';

    window.openModal(isNew ? 'Новая задача' : (recurring ? 'Повторяющаяся задача' : 'Задача'), body);
    const $ = function (id) { return document.getElementById(id); };
    const repeatSel = $('itdtRepeat');
    const dateInput = $('itdtDate');

    function syncRepeat() {
      const v = repeatSel.value;
      $('itdtRepeatBox').hidden = v === 'none';
      $('itdtWdWrap').hidden = v !== 'weekly';
      $('itdtUnit').textContent = { daily: 'дн.', weekly: 'нед.', monthly: 'мес.', yearly: 'г.' }[v] || '';
      const noneBtn = $('itdtQuickDates').querySelector('[data-date=""]');
      if (noneBtn) noneBtn.hidden = v !== 'none';
      if (v !== 'none' && !dateInput.value) dateInput.value = todayKey();
      if (v === 'weekly' && !$('itdtWd').querySelector('.active') && dateInput.value) {
        const wd = (parse(dateInput.value).getDay() + 6) % 7 + 1;
        const b = $('itdtWd').querySelector('[data-wd="' + wd + '"]');
        if (b) b.classList.add('active');
      }
    }
    function syncQuick() {
      $('itdtQuickDates').querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.dataset.date === dateInput.value); });
    }
    repeatSel.onchange = syncRepeat;
    dateInput.oninput = syncQuick;
    $('itdtQuickDates').onclick = function (e) {
      const b = e.target.closest('button'); if (!b) return;
      dateInput.value = b.dataset.date; syncQuick(); syncRepeat();
    };
    $('itdtWd').onclick = function (e) { const b = e.target.closest('button'); if (b) b.classList.toggle('active'); };
    $('itdtCancel').onclick = window.closeModal;
    syncRepeat();
    setTimeout(function () { if (isNew && !isMobile()) $('itdtTitle').focus(); }, 30);
    $('itdtTitle').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('itdtSave').click(); } };

    $('itdtSave').onclick = async function () {
      const btn = $('itdtSave');
      const title = $('itdtTitle').value.trim();
      if (!title) { notify('Напишите, что нужно сделать.', 'warning', 'Не заполнено'); $('itdtTitle').focus(); return; }
      const repeat = repeatSel.value;
      const payload = {
        title: title,
        notes: $('itdtNotes').value.trim() || null,
        project_id: $('itdtProject').value || null,
        due_date: dateInput.value || null,
        repeat: repeat,
        repeat_interval: Math.max(1, Math.min(365, parseInt($('itdtInterval').value, 10) || 1)),
        repeat_weekdays: repeat === 'weekly' ? Array.from($('itdtWd').querySelectorAll('.active')).map(function (b) { return Number(b.dataset.wd); }) : [],
        repeat_until: repeat !== 'none' ? ($('itdtUntil').value || null) : null
      };
      if (repeat !== 'none' && !payload.due_date) { notify('Для повтора нужна дата начала.', 'warning', 'Не заполнено'); return; }
      if (payload.repeat_until && payload.due_date && payload.repeat_until < payload.due_date) { notify('«Повторять до» раньше даты начала.', 'warning', 'Проверьте даты'); return; }
      btn.disabled = true;
      try {
        if (isNew) {
          await call('', send('POST', payload));
        } else {
          await call('/' + item.task_id, send('PATCH', payload));
          const moveOne = $('itdtMoveOne');
          const ruleSame = recurring && repeat !== 'none' && payload.due_date === data.due_date && payload.repeat === data.repeat &&
            payload.repeat_interval === data.repeat_interval && payload.repeat_until === (data.repeat_until || null) &&
            JSON.stringify(payload.repeat_weekdays) === JSON.stringify(data.repeat_weekdays.slice().sort());
          if (moveOne && ruleSame && moveOne.value && moveOne.value !== item.date) {
            await call('/' + item.task_id + '/move', send('POST', { occurrence_date: item.occurrence_date, to_date: moveOne.value }));
          }
        }
        window.closeModal();
        notify(isNew ? 'Задача добавлена' : 'Сохранено', 'success', 'Готово');
        await refreshEverywhere();
      } catch (error) {
        fail(error);
      } finally {
        btn.disabled = false;
      }
    };

    if (!isNew) {
      $('itdtDelete').onclick = function () {
        const actions = $('itdtActions');
        if (recurring) {
          actions.innerHTML = '<span class="itdt-hint" style="margin-right:auto;align-self:center">Удалить повторяющуюся задачу:</span>' +
            '<button type="button" class="btn" id="itdtDelOne">Только ' + esc(dayLabel(item.date).toLowerCase()) + '</button>' +
            '<button type="button" class="btn itdt-btn-danger" id="itdtDelAll">Всю серию</button>' +
            '<button type="button" class="btn" id="itdtDelBack">Отмена</button>';
          $('itdtDelOne').onclick = function () { remove('/' + item.task_id + '/skip', send('POST', { occurrence_date: item.occurrence_date }), 'Повтор удалён'); };
        } else {
          actions.innerHTML = '<span class="itdt-hint" style="margin-right:auto;align-self:center">Удалить задачу без возврата?</span>' +
            '<button type="button" class="btn itdt-btn-danger" id="itdtDelAll">Удалить</button>' +
            '<button type="button" class="btn" id="itdtDelBack">Отмена</button>';
        }
        $('itdtDelAll').onclick = function () { remove('/' + item.task_id, { method: 'DELETE' }, 'Задача удалена'); };
        $('itdtDelBack').onclick = function () { openEditor(item); };
      };
    }

    async function remove(path, options, message) {
      try {
        await call(path, options);
        window.closeModal();
        notify(message, 'success', 'Готово');
        await refreshEverywhere();
      } catch (error) {
        fail(error);
      }
    }
  }

  // ---------------------------------------------------------- проекты
  const PALETTE = ['#4f46e5', '#0891b2', '#d97706', '#16a34a', '#db2777', '#7c3aed', '#dc2626', '#0d9488'];

  function openProjects() {
    const rows = S.projects.map(function (p) {
      return '<div class="itdt-prow" data-id="' + esc(p.id) + '"><input type="color" value="' + esc(p.color) + '" data-field="color" aria-label="Цвет">' +
        '<input type="text" value="' + esc(p.name) + '" maxlength="60" data-field="name" aria-label="Название">' +
        '<button type="button" class="btn" data-del="1" title="Удалить проект">✕</button></div>';
    }).join('');
    const next = PALETTE[S.projects.length % PALETTE.length];
    window.openModal('Проекты', '<div class="itdt-form">' +
      '<div class="itdt-plist" id="itdtPList">' + (rows || '<div class="itdt-hint">Проектов пока нет.</div>') + '</div>' +
      '<div class="itdt-hint">Название и цвет сохраняются сразу. При удалении проекта задачи остаются и становятся «Без проекта».</div>' +
      '<div><label>Новый проект</label><div class="itdt-prow"><input type="color" id="itdtPColor" value="' + next + '">' +
      '<input type="text" id="itdtPName" maxlength="60" placeholder="Например: Магистратура">' +
      '<button type="button" class="btn primary" id="itdtPAdd">Добавить</button></div></div>' +
      '<div class="itdt-actions"><button type="button" class="btn" id="itdtPClose">Готово</button></div></div>');
    const list = document.getElementById('itdtPList');
    document.getElementById('itdtPClose').onclick = window.closeModal;

    list.addEventListener('change', async function (e) {
      const input = e.target.closest('[data-field]'); if (!input) return;
      const row = input.closest('.itdt-prow');
      const value = input.value.trim();
      if (input.dataset.field === 'name' && !value) { notify('Название не может быть пустым.', 'warning'); return; }
      try {
        const body = {}; body[input.dataset.field] = value;
        await call('/projects/' + row.dataset.id, send('PATCH', body));
        await refreshEverywhere();
      } catch (error) { fail(error); }
    });
    list.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-del]'); if (!btn) return;
      const row = btn.closest('.itdt-prow');
      if (btn.dataset.del === '1') { btn.dataset.del = '2'; btn.textContent = 'Удалить?'; btn.classList.add('itdt-btn-danger'); return; }
      try {
        await call('/projects/' + row.dataset.id, { method: 'DELETE' });
        if (S.filter === row.dataset.id) S.filter = null;
        await refreshEverywhere();
        openProjects();
      } catch (error) { fail(error); }
    });
    const add = async function () {
      const name = document.getElementById('itdtPName').value.trim();
      if (!name) { notify('Введите название проекта.', 'warning'); return; }
      try {
        await call('/projects', send('POST', { name: name, color: document.getElementById('itdtPColor').value }));
        await refreshEverywhere();
        openProjects();
      } catch (error) { fail(error); }
    };
    document.getElementById('itdtPAdd').onclick = add;
    document.getElementById('itdtPName').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  }

  // ---------------------------------------------------------- быстрое добавление
  async function quickAdd(form) {
    const title = form.elements.title.value.trim();
    if (!title) { form.elements.title.focus(); return; }
    const button = form.querySelector('button[type=submit]');
    if (button) button.disabled = true;
    try {
      await call('', send('POST', {
        title: title,
        project_id: (form.elements.project && form.elements.project.value) || null,
        due_date: (form.elements.date && form.elements.date.value) || null,
        repeat: 'none'
      }));
      form.elements.title.value = '';
      notify('Задача добавлена', 'success', 'Готово');
      await refreshEverywhere();
      const again = form.isConnected ? form : document.querySelector('[data-form="' + form.dataset.form + '"]');
      if (again && !isMobile()) again.elements.title.focus();
    } catch (error) {
      fail(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  // ---------------------------------------------------------- обработчики раздела
  function onAction(act, el) {
    const item = el.dataset.ref ? S.items[el.dataset.ref] : null;
    switch (act) {
      case 'view':
        S.view = el.dataset.view; S.selectedDay = null; S.feed = null; S.list = null; draw(); return reload();
      case 'prev': case 'next': {
        const dir = act === 'prev' ? -1 : 1;
        if (S.view === 'week') S.anchor = addDays(S.anchor, 7 * dir);
        else S.anchor = new Date(S.anchor.getFullYear(), S.anchor.getMonth() + dir, 1, 12);
        S.selectedDay = null;
        return reload();
      }
      case 'today': S.anchor = new Date(); S.selectedDay = null; return reload();
      case 'filter': S.filter = el.dataset.id || null; draw(); return;
      case 'projects-manage': return openProjects();
      case 'retry': S.error = null; draw(); return reload();
      case 'new':
        return openEditor(null, {
          date: el.dataset.date != null ? el.dataset.date : '',
          project_id: el.dataset.project != null ? el.dataset.project : undefined
        });
      case 'toggle': if (item) return toggle(item); return;
      case 'edit': if (item) return openEditor(item); return;
      case 'day': {
        const k = el.dataset.date;
        if (isMobile()) { S.selectedDay = S.selectedDay === k ? null : k; draw(); return; }
        S.view = 'week'; S.anchor = parse(k); S.feed = null; draw(); return reload();
      }
    }
  }

  function bindRoot() {
    root.addEventListener('click', function (event) {
      const el = event.target.closest('[data-act]');
      if (!el || !root.contains(el) || el.disabled) return;
      event.stopPropagation();
      Promise.resolve().then(function () { return onAction(el.dataset.act, el); }).catch(fail);
    });
    root.addEventListener('submit', function (event) {
      const form = event.target.closest('[data-form="quick"]');
      if (!form) return;
      event.preventDefault();
      quickAdd(form);
    });

    // перетаскивание (мышь)
    let dragged = null;
    root.addEventListener('dragstart', function (event) {
      const el = event.target.closest('[data-ref][draggable]');
      if (!el) return;
      dragged = S.items[el.dataset.ref];
      el.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', el.dataset.ref); } catch (e) { /* ignore */ }
    });
    root.addEventListener('dragend', function (event) {
      const el = event.target.closest && event.target.closest('[data-ref]');
      if (el) el.classList.remove('dragging');
      root.querySelectorAll('.drop').forEach(function (x) { x.classList.remove('drop'); });
      dragged = null;
    });
    root.addEventListener('dragover', function (event) {
      const zone = event.target.closest('[data-drop]');
      if (!zone || !dragged) return;
      event.preventDefault();
      root.querySelectorAll('.drop').forEach(function (x) { if (x !== zone) x.classList.remove('drop'); });
      zone.classList.add('drop');
    });
    root.addEventListener('drop', function (event) {
      const zone = event.target.closest('[data-drop]');
      if (!zone || !dragged) return;
      event.preventDefault();
      zone.classList.remove('drop');
      const item = dragged; dragged = null;
      move(item, zone.dataset.drop || null).catch(fail);
    });

    // свайп по неделе / месяцу (телефон)
    let sx = 0, sy = 0, st = 0;
    root.addEventListener('touchstart', function (e) {
      if (!e.target.closest('[data-swipe]')) { st = 0; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (!st || Date.now() - st > 600) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      st = 0;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) onAction(dx < 0 ? 'next' : 'prev', { dataset: {} });
    }, { passive: true });
  }

  // ============================================================ Главная
  let dashSeq = 0;
  let dashCache = null;

  async function renderDashboardTasks(fromCache) {
    const host = document.getElementById('dashboardTasks');
    if (!host) return;
    const my = ++dashSeq;
    if (!fromCache || !dashCache) {
      try {
        const t = todayKey();
        const res = await Promise.all([call('/projects'), call(feedUrl(parse(t), parse(t)))]);
        if (my !== dashSeq) return;
        S.projects = res[0];
        dashCache = res[1];
      } catch (error) {
        if (my !== dashSeq) return;
        host.innerHTML = '<div class="empty">Задачи недоступны: ' + esc(error.message || 'ошибка') + '</div>';
        return;
      }
    }
    const feed = dashCache;
    const overdue = feed.overdue || [];
    const today = (feed.items || []).filter(visible);
    const parts = [];
    if (overdue.length) {
      parts.push('<div class="itdt-dash-late">Просрочено · ' + overdue.length + '</div>');
      overdue.forEach(function (it) { parts.push(cardHtml(it, { showDate: true })); });
    }
    if (today.length) {
      if (overdue.length) parts.push('<div class="itdt-dash-late" style="color:var(--muted)">Сегодня</div>');
      today.forEach(function (it) { parts.push(cardHtml(it)); });
    }
    if (!parts.length) parts.push('<div class="empty">На сегодня задач нет</div>');
    parts.push('<form class="itdt-quick" data-form="dash" autocomplete="off"><input type="text" name="title" placeholder="Добавить задачу на сегодня…" maxlength="300">' +
      '<input type="hidden" name="date" value="' + todayKey() + '"><button type="submit" class="btn primary">+</button></form>');
    host.innerHTML = '<div class="itdt-dash">' + parts.join('') + '</div>';
  }

  function bindDashboard() {
    const host = document.getElementById('dashboardTasks');
    if (!host || host.__itdtBound) return;
    host.__itdtBound = true;
    host.addEventListener('click', function (event) {
      const el = event.target.closest('[data-act]');
      if (!el || !host.contains(el)) return;
      const item = el.dataset.ref ? S.items[el.dataset.ref] : null;
      if (!item) return;
      event.stopPropagation();
      if (el.dataset.act === 'toggle') toggle(item).catch(fail);
      else if (el.dataset.act === 'edit') {
        loadProjects().catch(function () {}).then(function () { openEditor(item); });
      }
    });
    host.addEventListener('submit', function (event) {
      const form = event.target.closest('[data-form="dash"]');
      if (!form) return;
      event.preventDefault();
      quickAdd(form);
    });
    const open = document.getElementById('dashboardTasksOpen');
    if (open) open.onclick = function () { S.view = 'week'; S.anchor = new Date(); window.switchPage('tasks'); };
  }

  // ============================================================ календарь «Расписание»: значок ✓N
  let calSeq = 0;
  async function decorateCalendar() {
    try {
      if (typeof state === 'undefined' || !state.calendar || state.calendar.view !== 'month') return;
      const cells = Array.from(document.querySelectorAll('#calendar .google-month-day'));
      if (!cells.length) return;
      const dated = cells.map(function (cell) {
        const m = /new Date\('(\d{4}-\d{2}-\d{2})/.exec(cell.getAttribute('onclick') || '');
        return m ? { cell: cell, date: m[1] } : null;
      }).filter(Boolean);
      if (!dated.length) return;
      const my = ++calSeq;
      const feed = await call(feedUrl(parse(dated[0].date), parse(dated[dated.length - 1].date)));
      if (my !== calSeq) return;
      const counts = {};
      const t = todayKey();
      // прошедшие дни: только невыполненные разовые задачи (пропущенные повторы не считаем)
      (feed.items || []).forEach(function (it) {
        if (it.is_done || (it.date < t && isRecurring(it))) return;
        counts[it.date] = (counts[it.date] || 0) + 1;
      });
      dated.forEach(function (x) {
        if (!x.cell.isConnected) return;
        const old = x.cell.querySelector('.itdt-cal-badge');
        if (old) old.remove();
        const n = counts[x.date];
        if (!n) return;
        const num = x.cell.querySelector('.google-month-number');
        if (!num) return;
        const badge = document.createElement('span');
        badge.className = 'itdt-cal-badge';
        badge.title = 'Задачи: ' + n;
        badge.textContent = '✓' + n;
        badge.onclick = function (e) {
          e.stopPropagation();
          S.view = 'week'; S.anchor = parse(x.date); S.feed = null;
          window.switchPage('tasks');
        };
        num.appendChild(badge);
      });
    } catch (error) {
      // значки — дополнение; календарь работает и без них
      console.warn('ITDETI TASKS: значки в календаре не показаны', error && error.message);
    }
  }

  // ============================================================ запуск
  function start() {
    const required = ['api', 'switchPage', 'loadPage', 'openModal', 'closeModal'];
    for (const name of required) {
      if (typeof window[name] !== 'function') {
        console.warn('ITDETI TASKS: не найдена базовая функция ' + name + ', модуль отключён');
        return;
      }
    }
    const nav = document.querySelector('.nav');
    const notificationsView = document.getElementById('notifications');
    const host = notificationsView && notificationsView.parentElement;
    if (!nav || !host || document.getElementById('tasks') || typeof PAGE_INFO === 'undefined') return;

    const section = document.createElement('section');
    section.id = 'tasks';
    section.className = 'view';
    section.innerHTML = '<div id="itdtRoot"></div>';
    host.appendChild(section);
    root = document.getElementById('itdtRoot');
    bindRoot();

    PAGE_INFO.tasks = ['Задачи', 'Планы по дням и проектам'];
    const originalLoadPage = window.loadPage;
    window.loadPage = async function (page) {
      if (page === 'tasks') { draw(); return reload(); }
      return originalLoadPage.apply(this, arguments);
    };

    // Пункт меню (компьютер) — строго в КОНЕЦ: значки нижнего меню телефона в mobile.css
    // привязаны к позиции кнопок (nth-child), вставка в середину сдвинула бы их.
    const navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.dataset.page = 'tasks';
    navButton.className = 'itdl-nav-desktop';
    navButton.textContent = 'Задачи';
    navButton.onclick = function () { window.switchPage('tasks'); };
    nav.appendChild(navButton);

    // Главная: блок задач (вызывается после оригинальной загрузки Главной)
    if (typeof window.loadDashboard === 'function') {
      const originalLoadDashboard = window.loadDashboard;
      window.loadDashboard = async function () {
        const result = await originalLoadDashboard.apply(this, arguments);
        bindDashboard();
        renderDashboardTasks().catch(function (e) { console.error(e); });
        return result;
      };
    }
    bindDashboard();
    renderDashboardTasks().catch(function (e) { console.error(e); });

    // Расписание: значки после каждой отрисовки календаря
    if (typeof window.renderCalendar === 'function') {
      const originalRenderCalendar = window.renderCalendar;
      window.renderCalendar = function () {
        const result = originalRenderCalendar.apply(this, arguments);
        setTimeout(decorateCalendar, 0);
        return result;
      };
    }

    // Меню «+» в шапке на телефоне (создаёт schedule-v2.js): добавить пункт «Добавить задачу».
    function ensureMobileMenuItem() {
      const menu = document.getElementById('itdetiMobileAddMenu');
      if (!menu || document.getElementById('itdtMobileAddTask')) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.id = 'itdtMobileAddTask';
      item.textContent = 'Добавить задачу';
      item.onclick = function () {
        menu.style.display = 'none';
        loadProjects().catch(function () {}).then(function () { openEditor(null, { date: isTasksPageOpen() ? '' : todayKey() }); });
      };
      menu.appendChild(item);
    }
    ensureMobileMenuItem();
    setInterval(ensureMobileMenuItem, 1500);

    // смена ширины экрана (поворот телефона) — перерисовать раздел
    let lastMobile = isMobile();
    window.addEventListener('resize', function () {
      if (isMobile() !== lastMobile) { lastMobile = isMobile(); if (isTasksPageOpen()) draw(); }
    });
    S.started = true;
  }

  try {
    start();
  } catch (error) {
    console.error('ITDETI TASKS: не удалось запуститься, остальной интерфейс не затронут', error);
  }
})();
