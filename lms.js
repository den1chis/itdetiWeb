/* ITDETI LMS — курсы, модули, уроки, материалы и назначение курсов ученикам.
 *
 * Изолированный модуль: подключается одной строкой <script src="lms.js"> после finance-v2.js.
 * Сам добавляет раздел «Курсы» (пункт меню на десктопе + кнопка на странице «Ученики»),
 * ничего не переписывает в существующем коде. Если что-то пойдёт не так при запуске,
 * остальной интерфейс продолжит работать как раньше.
 *
 * Серверная часть: маршруты /lms/... (репозиторий itdeti, миграция 008).
 */
(function () {
  'use strict';

  function start() {
    // Базовые функции приложения должны существовать; иначе модуль тихо отключается.
    const required = ['api', 'switchPage', 'loadPage', 'openModal', 'closeModal'];
    for (const name of required) {
      if (typeof window[name] !== 'function') {
        console.warn('ITDETI LMS: не найдена базовая функция ' + name + ', модуль отключён');
        return;
      }
    }
    const nav = document.querySelector('.nav');
    const notificationsView = document.getElementById('notifications');
    const host = notificationsView && notificationsView.parentElement;
    if (!nav || !host || document.getElementById('courses') || typeof PAGE_INFO === 'undefined') return;

    // ------------------------------------------------------------ утилиты
    const esc = window.esc || function (v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    const call = function (path, options) { return window.api('/lms' + path, options); };
    const send = function (method, body) { return { method: method, body: JSON.stringify(body || {}) }; };
    const notify = function (message, type, title) {
      if (window.appNotify) window.appNotify(message, type || 'success', title || '');
    };
    const fail = function (error) {
      console.error('ITDETI LMS:', error);
      notify((error && error.message) || 'Ошибка', 'error');
    };
    const ask = function (message, title) {
      if (window.appConfirm) return window.appConfirm(message, title || 'Подтверждение', true);
      return Promise.resolve(window.confirm(message));
    };
    const fmtDate = function (value) {
      try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return ''; }
    };
    // Дата без часового пояса: '2026-11-10' -> '10.11.2026'
    const fmtPlainDate = function (value) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
      return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
    };
    const hhmm = function (value) { return value ? String(value).slice(0, 5) : ''; };
    const scheduleText = function (e) {
      const parts = [];
      if (e.weekday != null) parts.push(WEEKDAYS_SHORT[e.weekday] + (e.lesson_time ? ' ' + hhmm(e.lesson_time) : ''));
      else if (e.lesson_time) parts.push(hhmm(e.lesson_time));
      if (e.start_date) parts.push('старт ' + fmtPlainDate(e.start_date));
      return parts.length ? parts.join(' · ') : 'не задано';
    };
    const plural = function (n, one, few, many) {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
      return many;
    };

    const TYPE = { code: 'Код', no_code: 'Без кода' };
    const KIND = { link: 'Ссылка', text: 'Текст' };
    const TASK_KIND = { code: 'Код', practice: 'Практика' };
    const PROGRESS = { not_started: 'Не начат', in_progress: 'В процессе', done: 'Пройден' };
    const ENROLL = { active: 'Идёт', paused: 'Пауза', finished: 'Завершён' };
    const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    const S = { tab: 'catalog', view: 'home', courseId: null, lessonId: null, studentId: null, studentName: '', studentCtx: null, showArchived: false, expanded: {} };
    const cache = { course: null, lesson: null, enrollments: [] };
    let root = null;
    let drawToken = 0;

    // ------------------------------------------------------------ отрисовка
    async function show(view, params) {
      Object.assign(S, { view: view }, params || {});
      await draw(false);
      window.scrollTo(0, 0);
    }

    async function draw(quiet) {
      const my = ++drawToken;
      const scrollY = window.scrollY;
      if (!quiet) root.innerHTML = '<div class="itdl-loading">Загрузка…</div>';
      try {
        let html = '';
        if (S.view === 'home') html = S.tab === 'students' ? await viewStudents() : await viewCatalog();
        else if (S.view === 'course') html = await viewCourse();
        else if (S.view === 'lesson') html = await viewLesson();
        else if (S.view === 'student') html = await viewStudent();
        if (my !== drawToken) return;
        root.innerHTML = html;
        if (quiet) window.scrollTo(0, scrollY);
      } catch (error) {
        if (my !== drawToken) return;
        root.innerHTML = '<div class="card card-padding"><div class="empty">' + esc(error.message) + '</div>' +
          '<div class="itdl-actions" style="margin-top:12px"><button class="btn" data-act="home">К курсам</button></div></div>';
      }
    }

    function tabs() {
      return '<div class="itdl-tabs">' +
        '<button type="button" class="itdl-tab' + (S.tab === 'catalog' ? ' active' : '') + '" data-act="tab" data-tab="catalog">Каталог курсов</button>' +
        '<button type="button" class="itdl-tab' + (S.tab === 'students' ? ' active' : '') + '" data-act="tab" data-tab="students">Ученики</button>' +
        '</div>';
    }

    function pill(text, cls) { return '<span class="pill' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

    function countsText(modules, lessons) {
      return modules + ' ' + plural(modules, 'модуль', 'модуля', 'модулей') + ' · ' + lessons + ' ' + plural(lessons, 'урок', 'урока', 'уроков');
    }

    function statusSelect(attr, value, labels) {
      return '<select class="itdl-select" ' + attr + '>' + Object.keys(labels).map(function (key) {
        return '<option value="' + key + '"' + (key === value ? ' selected' : '') + '>' + esc(labels[key]) + '</option>';
      }).join('') + '</select>';
    }

    // ------------------------------------------------------------ каталог
    async function viewCatalog() {
      const courses = await call('/courses?include_archived=' + (S.showArchived ? 'true' : 'false'));
      let html = tabs();
      html += '<div class="itdl-bar"><button type="button" class="btn primary" data-act="course-new">+ Курс</button>' +
        '<label class="itdl-check"><input type="checkbox" data-change="archived"' + (S.showArchived ? ' checked' : '') + '> Показать архив</label></div>';
      if (!courses.length) {
        return html + '<div class="card card-padding"><div class="empty">Курсов пока нет. Создайте первый кнопкой «+ Курс».</div></div>';
      }
      html += '<div class="itdl-grid">' + courses.map(function (c) {
        return '<div class="card card-padding itdl-tile" data-act="course-open" data-id="' + esc(c.id) + '">' +
          '<div class="itdl-tile-title">' + esc(c.title) + '</div>' +
          '<div class="itdl-tags">' + pill(TYPE[c.course_type] || c.course_type, c.course_type === 'code' ? 'success' : '') +
          (c.is_archived ? pill('В архиве', 'warning') : '') + '</div>' +
          '<div class="small">' + countsText(c.modules_count, c.lessons_count) + (c.students_count ? ' · учеников: ' + c.students_count : '') + '</div>' +
          (c.description ? '<div class="itdl-desc">' + esc(c.description) + '</div>' : '') +
          '</div>';
      }).join('') + '</div>';
      return html;
    }

    // ------------------------------------------------------------ курс
    async function viewCourse() {
      const c = await call('/courses/' + S.courseId);
      cache.course = c;
      let html = '<div class="itdl-crumbs"><button type="button" class="btn" data-act="home">← Курсы</button></div>';
      html += '<div class="card card-padding"><div class="itdl-head"><div>' +
        '<h2 class="itdl-title">' + esc(c.title) + '</h2>' +
        '<div class="itdl-tags">' + pill(TYPE[c.course_type] || c.course_type, c.course_type === 'code' ? 'success' : '') +
        (c.is_archived ? pill('В архиве', 'warning') : '') + '<span class="small">' + countsText(c.modules_count, c.lessons_count) + (c.students_count ? ' · учеников: ' + c.students_count : '') + '</span></div>' +
        (c.description ? '<div class="itdl-desc">' + esc(c.description) + '</div>' : '') +
        '</div><div class="itdl-actions">' +
        '<button type="button" class="btn" data-act="course-edit">Изменить</button>' +
        '<button type="button" class="btn" data-act="course-delete">Удалить</button>' +
        '<button type="button" class="btn primary" data-act="module-new">+ Модуль</button></div></div></div>';

      if (!c.modules.length) {
        return html + '<div class="card card-padding" style="margin-top:12px"><div class="empty">В курсе пока нет модулей. Добавьте первый кнопкой «+ Модуль».</div></div>';
      }
      const moduleIds = c.modules.map(function (m) { return m.id; });
      html += c.modules.map(function (m, mi) {
        const lessonIds = m.lessons.map(function (l) { return l.id; });
        return '<div class="card card-padding itdl-module"><div class="itdl-head"><div>' +
          '<b>Модуль ' + (mi + 1) + '. ' + esc(m.title) + '</b>' +
          (m.description ? '<div class="small">' + esc(m.description) + '</div>' : '') + '</div>' +
          '<div class="itdl-actions">' +
          '<button type="button" class="btn itdl-sm" data-act="module-up" data-id="' + esc(m.id) + '"' + (mi === 0 ? ' disabled' : '') + ' title="Выше">↑</button>' +
          '<button type="button" class="btn itdl-sm" data-act="module-down" data-id="' + esc(m.id) + '"' + (mi === moduleIds.length - 1 ? ' disabled' : '') + ' title="Ниже">↓</button>' +
          '<button type="button" class="btn itdl-sm" data-act="module-edit" data-id="' + esc(m.id) + '">Изменить</button>' +
          '<button type="button" class="btn itdl-sm" data-act="module-delete" data-id="' + esc(m.id) + '">Удалить</button>' +
          '<button type="button" class="btn itdl-sm primary" data-act="lesson-new" data-id="' + esc(m.id) + '">+ Урок</button>' +
          '</div></div>' +
          (m.lessons.length ? '<div class="itdl-lessons">' + m.lessons.map(function (l, li) {
            const meta = [];
            if (l.duration_min) meta.push(l.duration_min + ' мин');
            meta.push(l.materials_count + ' ' + plural(l.materials_count, 'материал', 'материала', 'материалов'));
            if (l.tasks_count) meta.push(l.tasks_count + ' ' + plural(l.tasks_count, 'задание', 'задания', 'заданий'));
            return '<div class="itdl-lesson" data-act="lesson-open" data-id="' + esc(l.id) + '">' +
              '<span class="itdl-num">' + (li + 1) + '</span>' +
              '<span class="itdl-lt"><b>' + esc(l.title) + '</b><span class="small">' + esc(meta.join(' · ')) + '</span></span>' +
              '<span class="itdl-actions">' +
              '<button type="button" class="btn itdl-sm" data-act="lesson-up" data-id="' + esc(l.id) + '" data-parent="' + esc(m.id) + '"' + (li === 0 ? ' disabled' : '') + ' title="Выше">↑</button>' +
              '<button type="button" class="btn itdl-sm" data-act="lesson-down" data-id="' + esc(l.id) + '" data-parent="' + esc(m.id) + '"' + (li === lessonIds.length - 1 ? ' disabled' : '') + ' title="Ниже">↓</button>' +
              '</span></div>';
          }).join('') + '</div>' : '<div class="small" style="margin-top:8px">Уроков пока нет.</div>') +
          '</div>';
      }).join('');
      return html;
    }

    // ------------------------------------------------------------ урок
    async function viewLesson() {
      const l = await call('/lessons/' + S.lessonId);
      cache.lesson = l;
      let ctxStatus = null;
      if (S.studentCtx) {
        try {
          const prog = await call('/students/' + S.studentCtx + '/courses/' + l.course_id + '/progress');
          prog.modules.forEach(function (m) {
            m.lessons.forEach(function (x) { if (x.id === l.id) ctxStatus = x.status || 'not_started'; });
          });
        } catch (_) { ctxStatus = null; }
      }
      let html = '<div class="itdl-crumbs">' + (S.studentCtx
        ? '<button type="button" class="btn" data-act="student-open" data-id="' + esc(S.studentCtx) + '">← К ученику ' + esc(S.studentName) + '</button>'
        : '<button type="button" class="btn" data-act="course-open" data-id="' + esc(l.course_id) + '">← К курсу «' + esc(l.course_title) + '»</button>') + '</div>';
      html += '<div class="card card-padding"><div class="itdl-head"><div>' +
        '<h2 class="itdl-title">' + esc(l.title) + '</h2>' +
        '<div class="small">' + esc(l.course_title) + ' · ' + esc(l.module_title) + (l.duration_min ? ' · ' + l.duration_min + ' мин' : '') + '</div>' +
        (l.description ? '<div class="itdl-desc">' + esc(l.description) + '</div>' : '') +
        '</div><div class="itdl-actions">' +
        '<button type="button" class="btn" data-act="lesson-edit">Изменить</button>' +
        '<button type="button" class="btn" data-act="lesson-delete">Удалить</button></div></div>' +
        (ctxStatus ? '<div class="itdl-ctx"><span class="small">Прогресс ученика ' + esc(S.studentName) + ':</span> ' +
          statusSelect('data-change="lesson-progress"', ctxStatus, PROGRESS) + '</div>' : '') +
        '</div>';

      // материалы
      html += '<div class="card card-padding itdl-section"><div class="itdl-head"><b>Материалы</b>' +
        '<div class="itdl-actions"><button type="button" class="btn itdl-sm primary" data-act="material-new">+ Материал</button></div></div>';
      html += l.materials.length ? l.materials.map(function (m, i) {
        let body = '';
        if (m.kind === 'link') {
          body = '<div class="itdl-links"><a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">Открыть ссылку ↗</a>' +
            (m.embed_url ? '<button type="button" class="btn itdl-sm" data-act="material-embed" data-id="' + esc(m.id) + '">Показать здесь</button>' : '') + '</div>' +
            '<div class="itdl-embed" id="itdlEmbed-' + esc(m.id) + '" hidden></div>';
        } else {
          body = '<div class="itdl-text">' + esc(m.body) + '</div>';
        }
        return '<div class="itdl-item"><div class="itdl-item-main"><div><b>' + esc(m.title) + '</b> ' + pill(KIND[m.kind] || m.kind) + '</div>' + body + '</div>' +
          '<div class="itdl-actions">' +
          '<button type="button" class="btn itdl-sm" data-act="material-up" data-id="' + esc(m.id) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn itdl-sm" data-act="material-down" data-id="' + esc(m.id) + '"' + (i === l.materials.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn itdl-sm" data-act="material-edit" data-id="' + esc(m.id) + '">Изменить</button>' +
          '<button type="button" class="btn itdl-sm" data-act="material-delete" data-id="' + esc(m.id) + '">Удалить</button>' +
          '</div></div>';
      }).join('') : '<div class="small">Материалов пока нет. Добавьте ссылку на Google Диск или короткий текст.</div>';
      html += '</div>';

      // задания
      html += '<div class="card card-padding itdl-section"><div class="itdl-head"><b>Задания</b>' +
        '<div class="itdl-actions"><button type="button" class="btn itdl-sm primary" data-act="task-new">+ Задание</button></div></div>';
      html += l.tasks.length ? l.tasks.map(function (t, i) {
        return '<div class="itdl-item"><div class="itdl-item-main"><div><b>' + esc(t.title) + '</b> ' + pill(TASK_KIND[t.kind] || t.kind, t.kind === 'code' ? 'success' : '') + '</div>' +
          (t.statement ? '<div class="itdl-text">' + esc(t.statement) + '</div>' : '') +
          (t.hint ? '<div class="small">Подсказка: ' + esc(t.hint) + '</div>' : '') + '</div>' +
          '<div class="itdl-actions">' +
          '<button type="button" class="btn itdl-sm" data-act="task-up" data-id="' + esc(t.id) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn itdl-sm" data-act="task-down" data-id="' + esc(t.id) + '"' + (i === l.tasks.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn itdl-sm" data-act="task-edit" data-id="' + esc(t.id) + '">Изменить</button>' +
          '<button type="button" class="btn itdl-sm" data-act="task-delete" data-id="' + esc(t.id) + '">Удалить</button>' +
          '</div></div>';
      }).join('') : '<div class="small">Заданий пока нет. Выполнение заданий учениками на сайте появится на следующем этапе.</div>';
      html += '</div>';
      return html;
    }

    // ------------------------------------------------------------ ученики
    async function viewStudents() {
      const students = await window.api('/students');
      const results = await Promise.allSettled(students.map(function (s) { return call('/students/' + s.id + '/enrollments'); }));
      const allFailed = students.length > 0 && results.every(function (r) { return r.status === 'rejected'; });
      let html = tabs();
      if (allFailed) {
        html += '<div class="card card-padding" style="margin-bottom:12px"><div class="small">Не удалось загрузить назначенные курсы: ' +
          esc(results[0].reason && results[0].reason.message) + '</div></div>';
      }
      if (!students.length) return html + '<div class="card card-padding"><div class="empty">Учеников нет</div></div>';
      html += '<div class="card card-padding"><div class="itdl-list">' + students.map(function (s, i) {
        const list = results[i].status === 'fulfilled' ? results[i].value : [];
        const chips = list.length ? list.map(function (e) {
          return '<span class="pill">' + esc(e.course_title) + ' ' + e.lessons_done + '/' + e.lessons_total + '</span>';
        }).join(' ') : '<span class="small">Курс не назначен</span>';
        return '<div class="itdl-row" data-act="student-open" data-id="' + esc(s.id) + '" data-name="' + esc(s.full_name) + '">' +
          '<b>' + esc(s.full_name) + '</b><span class="itdl-tags">' + chips + '</span></div>';
      }).join('') + '</div></div>';
      return html;
    }

    async function viewStudent() {
      const sid = S.studentId;
      const parts = await Promise.all([window.api('/students/' + sid), call('/students/' + sid + '/enrollments'), call('/students/' + sid + '/notes')]);
      const student = parts[0], enrollments = parts[1], notes = parts[2];
      S.studentName = student.full_name;
      cache.enrollments = enrollments;
      const trees = {};
      await Promise.all(enrollments.filter(function (e) { return S.expanded[e.id]; }).map(async function (e) {
        trees[e.id] = await call('/students/' + sid + '/courses/' + e.course_id + '/progress');
      }));

      let html = '<div class="itdl-crumbs"><button type="button" class="btn" data-act="tab-students">← Ученики</button></div>';
      html += '<div class="card card-padding"><div class="itdl-head"><div><h2 class="itdl-title">' + esc(student.full_name) + '</h2>' +
        (enrollments.length ? '' : '<div class="small">Курс не назначен</div>') + '</div>' +
        (enrollments.length ? '' : '<div class="itdl-actions"><button type="button" class="btn primary" data-act="enroll">+ Назначить курс</button></div>') +
        '</div></div>';

      html += '<div class="itdl-subtitle">Курсы ученика</div>';
      html += enrollments.length ? enrollments.map(function (e) {
        const pct = e.lessons_total ? Math.round(e.lessons_done * 100 / e.lessons_total) : 0;
        const tree = trees[e.id];
        return '<div class="card card-padding itdl-module"><div class="itdl-head"><div>' +
          '<b>' + esc(e.course_title) + '</b> ' + pill(TYPE[e.course_type] || e.course_type, e.course_type === 'code' ? 'success' : '') + ' ' +
          pill(ENROLL[e.status] || e.status, e.status === 'active' ? 'success' : (e.status === 'paused' ? 'warning' : '')) +
          '</div><div class="itdl-actions">' +
          '<button type="button" class="btn itdl-sm" data-act="enr-toggle" data-id="' + esc(e.id) + '">' + (S.expanded[e.id] ? 'Скрыть программу' : 'Программа') + '</button>' +
          '<button type="button" class="btn itdl-sm" data-act="enr-schedule" data-id="' + esc(e.id) + '">Расписание</button>' +
          (e.status === 'active'
            ? '<button type="button" class="btn itdl-sm" data-act="enr-status-set" data-status="paused" data-id="' + esc(e.id) + '">Пауза</button>' +
              '<button type="button" class="btn itdl-sm" data-act="enr-status-set" data-status="finished" data-id="' + esc(e.id) + '">Завершить</button>'
            : '<button type="button" class="btn itdl-sm" data-act="enr-status-set" data-status="active" data-id="' + esc(e.id) + '">Возобновить</button>') +
          '<button type="button" class="btn itdl-sm" data-act="enr-remove" data-id="' + esc(e.id) + '">Снять курс</button></div></div>' +
          '<div class="itdl-progress"><div class="itdl-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="small">Пройдено ' + e.lessons_done + ' из ' + e.lessons_total + ' · назначен ' + esc(fmtDate(e.started_at)) + '</div>' +
          '<div class="small">Расписание: ' + esc(scheduleText(e)) + '</div>' +
          (e.next_lesson ? '<div style="margin-top:8px"><button type="button" class="btn itdl-sm primary" data-act="lesson-open-ctx" data-id="' + esc(e.next_lesson.id) + '">Следующий урок: ' + esc(e.next_lesson.title) + '</button></div>'
            : (e.lessons_total ? '<div class="small" style="margin-top:8px">Все уроки пройдены.</div>' : '')) +
          (tree ? renderTree(tree) : '') + '</div>';
      }).join('') : '<div class="card card-padding"><div class="empty">Курсы не назначены. Нажмите «+ Назначить курс».</div></div>';

      html += '<div class="itdl-subtitle">Заметки <span class="small">(видите только Вы)</span></div>';
      html += '<div class="card card-padding"><div class="form-group"><textarea id="itdlNoteText" rows="3" placeholder="Заметка об ученике: что получилось, что повторить…"></textarea></div>' +
        '<div class="itdl-actions" style="margin-top:8px"><button type="button" class="btn primary" data-act="note-add">Добавить заметку</button></div>' +
        (notes.length ? '<div class="itdl-notes">' + notes.map(function (n) {
          return '<div class="itdl-item"><div class="itdl-item-main"><div class="small">' + esc(fmtDate(n.created_at)) + '</div><div class="itdl-text">' + esc(n.content) + '</div></div>' +
            '<div class="itdl-actions"><button type="button" class="btn itdl-sm" data-act="note-edit" data-id="' + esc(n.id) + '">Изменить</button>' +
            '<button type="button" class="btn itdl-sm" data-act="note-delete" data-id="' + esc(n.id) + '">Удалить</button></div></div>';
        }).join('') + '</div>' : '') + '</div>';
      return html;
    }

    function renderTree(tree) {
      return '<div class="itdl-tree">' + tree.modules.map(function (m, mi) {
        return '<div class="itdl-tree-module"><div class="small"><b>Модуль ' + (mi + 1) + '. ' + esc(m.title) + '</b></div>' +
          (m.lessons.length ? m.lessons.map(function (l, li) {
            return '<div class="itdl-tree-lesson"><button type="button" class="itdl-link" data-act="lesson-open-ctx" data-id="' + esc(l.id) + '">' + (li + 1) + '. ' + esc(l.title) + '</button>' +
              statusSelect('data-change="progress" data-lesson="' + esc(l.id) + '"', l.status || 'not_started', PROGRESS) + '</div>';
          }).join('') : '<div class="small">Уроков нет</div>') + '</div>';
      }).join('') + '</div>';
    }

    // ------------------------------------------------------------ модальные формы
    function field(label, inner) { return '<div class="form-group"><label>' + esc(label) + '</label>' + inner + '</div>'; }

    function modalForm(title, fieldsHtml, onSubmit, submitLabel) {
      window.openModal(title, '<form class="form" id="itdlForm" novalidate>' + fieldsHtml +
        '<div class="form-actions"><button type="button" class="btn" id="itdlCancel">Отмена</button>' +
        '<button type="submit" class="btn primary" id="itdlSubmit">' + esc(submitLabel || 'Сохранить') + '</button></div></form>');
      const form = document.getElementById('itdlForm');
      document.getElementById('itdlCancel').onclick = function () { window.closeModal(); };
      form.onsubmit = async function (event) {
        event.preventDefault();
        const button = document.getElementById('itdlSubmit');
        // собственная проверка обязательных полей (включённых и видимых)
        const empty = Array.prototype.find.call(form.querySelectorAll('[data-required]'), function (el) {
          return !el.disabled && !String(el.value).trim();
        });
        if (empty) { notify('Заполните обязательное поле.', 'warning', 'Не заполнено'); empty.focus(); return; }
        button.disabled = true;
        try {
          const result = await onSubmit(new FormData(form));
          if (result !== false) window.closeModal();
        } catch (error) { fail(error); } finally { button.disabled = false; }
      };
      const first = form.querySelector('input:not([type=checkbox]),textarea,select');
      if (first) first.focus();
      return form;
    }

    function typeOptions(map, selected) {
      return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + esc(map[k]) + '</option>'; }).join('');
    }

    const val = function (fd, key) { return String(fd.get(key) == null ? '' : fd.get(key)).trim(); };

    function courseForm(course) {
      const c = course || { title: '', course_type: 'code', description: '', is_archived: false };
      modalForm(course ? 'Изменить курс' : 'Новый курс',
        field('Название', '<input name="title" data-required maxlength="200" value="' + esc(c.title) + '" placeholder="Например: Python для начинающих">') +
        field('Тип курса', '<select name="course_type">' + typeOptions(TYPE, c.course_type) + '</select>') +
        field('Описание', '<textarea name="description" rows="3">' + esc(c.description || '') + '</textarea>') +
        (course ? '<label class="itdl-check"><input type="checkbox" name="is_archived"' + (c.is_archived ? ' checked' : '') + '> В архиве (скрыт из каталога, нельзя назначить)</label>' : ''),
        async function (fd) {
          const body = { title: val(fd, 'title'), course_type: val(fd, 'course_type'), description: val(fd, 'description') || null };
          if (course) {
            body.is_archived = fd.get('is_archived') === 'on';
            await call('/courses/' + course.id, send('PATCH', body));
            await draw(true);
          } else {
            const created = await call('/courses', send('POST', body));
            notify('Курс создан');
            await show('course', { courseId: created.id });
          }
        });
    }

    function moduleForm(courseId, module) {
      const m = module || { title: '', description: '' };
      modalForm(module ? 'Изменить модуль' : 'Новый модуль',
        field('Название', '<input name="title" data-required maxlength="200" value="' + esc(m.title) + '" placeholder="Например: Циклы">') +
        field('Описание', '<textarea name="description" rows="3">' + esc(m.description || '') + '</textarea>'),
        async function (fd) {
          const body = { title: val(fd, 'title'), description: val(fd, 'description') || null };
          if (module) await call('/modules/' + module.id, send('PATCH', body));
          else await call('/courses/' + courseId + '/modules', send('POST', body));
          await draw(true);
        });
    }

    function lessonForm(moduleId, lesson) {
      const l = lesson || { title: '', description: '', duration_min: '' };
      modalForm(lesson ? 'Изменить урок' : 'Новый урок',
        field('Название', '<input name="title" data-required maxlength="200" value="' + esc(l.title) + '" placeholder="Например: Цикл for">') +
        field('Длительность, минут (необязательно)', '<input name="duration_min" type="number" min="1" max="1440" value="' + esc(l.duration_min || '') + '">') +
        field('Описание / цель урока', '<textarea name="description" rows="4">' + esc(l.description || '') + '</textarea>'),
        async function (fd) {
          const duration = val(fd, 'duration_min');
          const body = { title: val(fd, 'title'), description: val(fd, 'description') || null, duration_min: duration ? Number(duration) : null };
          if (lesson) {
            await call('/lessons/' + lesson.id, send('PATCH', body));
            await draw(true);
          } else {
            const created = await call('/modules/' + moduleId + '/lessons', send('POST', body));
            notify('Урок создан');
            await show('lesson', { lessonId: created.id, studentCtx: null });
          }
        });
    }

    function materialForm(lessonId, material) {
      const m = material || { kind: 'link', title: '', url: '', body: '' };
      const editing = !!material;
      const form = modalForm(editing ? 'Изменить материал' : 'Новый материал',
        (editing ? '' : field('Тип', '<select name="kind" id="itdlKind">' + typeOptions(KIND, m.kind) + '</select>')) +
        field('Название', '<input name="title" data-required maxlength="200" value="' + esc(m.title) + '" placeholder="Например: Презентация урока">') +
        '<div id="itdlUrlBox">' + field('Ссылка (Google Диск, Docs, Slides и др.)', '<input name="url" id="itdlUrl" data-required value="' + esc(m.url || '') + '" placeholder="https://drive.google.com/...">') +
        '<div class="small">На Диске включите доступ «у кого есть ссылка — просмотр», тогда презентация откроется прямо в уроке.</div></div>' +
        '<div id="itdlBodyBox">' + field('Текст', '<textarea name="body" id="itdlBody" data-required rows="6">' + esc(m.body || '') + '</textarea>') + '</div>',
        async function (fd) {
          const kind = editing ? m.kind : val(fd, 'kind');
          const body = { title: val(fd, 'title') };
          if (kind === 'link') body.url = val(fd, 'url'); else body.body = String(fd.get('body') || '');
          if (editing) await call('/materials/' + m.id, send('PATCH', body));
          else { body.kind = kind; await call('/lessons/' + lessonId + '/materials', send('POST', body)); }
          await draw(true);
        });
      const apply = function () {
        const kind = editing ? m.kind : document.getElementById('itdlKind').value;
        const isLink = kind === 'link';
        document.getElementById('itdlUrlBox').style.display = isLink ? '' : 'none';
        document.getElementById('itdlBodyBox').style.display = isLink ? 'none' : '';
        document.getElementById('itdlUrl').disabled = !isLink;
        document.getElementById('itdlBody').disabled = isLink;
      };
      apply();
      const select = document.getElementById('itdlKind');
      if (select) select.onchange = apply;
      return form;
    }

    function taskForm(lessonId, task) {
      const t = task || { kind: 'practice', title: '', statement: '', hint: '', starter_code: '' };
      const form = modalForm(task ? 'Изменить задание' : 'Новое задание',
        field('Тип', '<select name="kind" id="itdlTaskKind">' + typeOptions(TASK_KIND, t.kind) + '</select>') +
        field('Название', '<input name="title" data-required maxlength="200" value="' + esc(t.title) + '" placeholder="Например: Сумма двух чисел">') +
        field('Условие', '<textarea name="statement" rows="4">' + esc(t.statement || '') + '</textarea>') +
        field('Подсказка (необязательно)', '<textarea name="hint" rows="2">' + esc(t.hint || '') + '</textarea>') +
        '<div id="itdlCodeBox">' + field('Стартовый код (необязательно)', '<textarea name="starter_code" rows="5" style="font-family:monospace">' + esc(t.starter_code || '') + '</textarea>') +
        '<div class="small">Автопроверка кода будет добавлена на следующем этапе.</div></div>',
        async function (fd) {
          const body = {
            kind: val(fd, 'kind'), title: val(fd, 'title'),
            statement: val(fd, 'statement') || null, hint: val(fd, 'hint') || null,
            starter_code: String(fd.get('starter_code') || '') || null
          };
          if (task) await call('/tasks/' + task.id, send('PATCH', body));
          else await call('/lessons/' + lessonId + '/tasks', send('POST', body));
          await draw(true);
        });
      const apply = function () {
        document.getElementById('itdlCodeBox').style.display = document.getElementById('itdlTaskKind').value === 'code' ? '' : 'none';
      };
      apply();
      document.getElementById('itdlTaskKind').onchange = apply;
      return form;
    }

    function scheduleFields(e) {
      const src = e || {};
      return field('Дата старта обучения (необязательно)', '<input name="start_date" type="date" value="' + esc(src.start_date || '') + '">') +
        field('День недели (необязательно)', '<select name="weekday"><option value="">Не задан</option>' + WEEKDAYS.map(function (name, i) {
          return '<option value="' + i + '"' + (src.weekday === i ? ' selected' : '') + '>' + esc(name) + '</option>';
        }).join('') + '</select>') +
        field('Время урока (необязательно)', '<input name="lesson_time" type="time" value="' + esc(hhmm(src.lesson_time)) + '">') +
        '<div class="small">Расписание нужно для будущей автоматической расстановки уроков в календаре; сейчас оно только сохраняется.</div>';
    }

    function scheduleBody(fd) {
      const weekday = val(fd, 'weekday');
      return { start_date: val(fd, 'start_date') || null, weekday: weekday === '' ? null : Number(weekday), lesson_time: val(fd, 'lesson_time') || null };
    }

    async function enrollForm() {
      if (cache.enrollments.length) {
        notify('У ученика уже есть курс. Сначала снимите его.', 'warning', 'Курс уже назначен');
        return;
      }
      const courses = await call('/courses');
      if (!courses.length) {
        notify('В каталоге нет курсов. Создайте курс.', 'warning', 'Нечего назначать');
        return;
      }
      modalForm('Назначить курс',
        field('Курс', '<select name="course_id">' + courses.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.title) + ' (' + esc(TYPE[c.course_type] || c.course_type) + ', ' + c.lessons_count + ' ур.)</option>';
        }).join('') + '</select>') + scheduleFields(null),
        async function (fd) {
          const body = Object.assign({ course_id: val(fd, 'course_id') }, scheduleBody(fd));
          await call('/students/' + S.studentId + '/enrollments', send('POST', body));
          notify('Курс назначен');
          await draw(true);
        }, 'Назначить');
    }

    function scheduleForm(enrollment) {
      modalForm('Расписание курса «' + enrollment.course_title + '»',
        scheduleFields(enrollment),
        async function (fd) {
          await call('/enrollments/' + enrollment.id, send('PATCH', scheduleBody(fd)));
          notify('Расписание сохранено');
          await draw(true);
        });
    }

    function noteForm(note) {
      modalForm('Изменить заметку',
        field('Текст', '<textarea name="content" data-required rows="5">' + esc(note.content) + '</textarea>'),
        async function (fd) {
          await call('/notes/' + note.id, send('PATCH', { content: val(fd, 'content') }));
          await draw(true);
        });
    }

    // ------------------------------------------------------------ действия
    async function swap(list, id, dir, patchPath, fieldName) {
      const i = list.findIndex(function (x) { return x.id === id; });
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const a = list[i], b = list[j];
      let orderA = a.sort_order, orderB = b.sort_order;
      if (orderA === orderB) { orderA = i; orderB = j; }
      await call(patchPath(a.id), send('PATCH', { sort_order: orderB }));
      await call(patchPath(b.id), send('PATCH', { sort_order: orderA }));
      await draw(true);
    }

    async function reorder(kind, id, parentId, dir) {
      const c = cache.course;
      const list = kind === 'module' ? c.modules : (c.modules.find(function (m) { return m.id === parentId; }) || { lessons: [] }).lessons;
      const ids = list.map(function (x) { return x.id; });
      const i = ids.indexOf(id), j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      const next = ids.slice();
      const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
      await call(kind === 'module' ? '/courses/' + c.id + '/modules/reorder' : '/modules/' + parentId + '/lessons/reorder', send('POST', { ids: next }));
      await draw(true);
    }

    async function onAction(act, ds) {
      const l = cache.lesson, c = cache.course;
      switch (act) {
        case 'home': return show('home', {});
        case 'tab': S.tab = ds.tab; return show('home', {});
        case 'tab-students': S.tab = 'students'; return show('home', {});
        case 'course-new': return courseForm(null);
        case 'course-open': return show('course', { courseId: ds.id });
        case 'course-edit': return courseForm(c);
        case 'course-delete':
          if (c.students_count > 0) {
            const word = c.students_count + ' ' + plural(c.students_count, 'ученик', 'ученика', 'учеников');
            if (!(await ask('На курсе «' + c.title + '» назначено: ' + word + ', поэтому удалить его нельзя. Отправить курс в архив? Он пропадёт из каталога и перестанет назначаться, а ученики и их прогресс сохранятся.', 'Курс нельзя удалить'))) return;
            await call('/courses/' + c.id, send('PATCH', { is_archived: true }));
            notify('Курс отправлен в архив');
            return show('home', {});
          }
          if (!(await ask('Удалить курс «' + c.title + '» вместе со всеми модулями, уроками и материалами? Это действие нельзя отменить.', 'Удаление курса'))) return;
          await call('/courses/' + c.id, { method: 'DELETE' });
          notify('Курс удалён');
          return show('home', {});
        case 'module-new': return moduleForm(c.id, null);
        case 'module-edit': return moduleForm(c.id, c.modules.find(function (m) { return m.id === ds.id; }));
        case 'module-delete': {
          const m = c.modules.find(function (x) { return x.id === ds.id; });
          if (!(await ask('Удалить модуль «' + m.title + '» и все его уроки?', 'Удаление модуля'))) return;
          await call('/modules/' + m.id, { method: 'DELETE' });
          return draw(true);
        }
        case 'module-up': return reorder('module', ds.id, c.id, -1);
        case 'module-down': return reorder('module', ds.id, c.id, 1);
        case 'lesson-new': return lessonForm(ds.id, null);
        case 'lesson-open': S.studentCtx = null; return show('lesson', { lessonId: ds.id });
        case 'lesson-open-ctx': return show('lesson', { lessonId: ds.id, studentCtx: S.studentId });
        case 'lesson-up': return reorder('lesson', ds.id, ds.parent, -1);
        case 'lesson-down': return reorder('lesson', ds.id, ds.parent, 1);
        case 'lesson-edit': return lessonForm(l.module_id, l);
        case 'lesson-delete':
          if (!(await ask('Удалить урок «' + l.title + '» вместе с материалами и заданиями?', 'Удаление урока'))) return;
          await call('/lessons/' + l.id, { method: 'DELETE' });
          notify('Урок удалён');
          return show('course', { courseId: l.course_id });
        case 'material-new': return materialForm(l.id, null);
        case 'material-edit': return materialForm(l.id, l.materials.find(function (m) { return m.id === ds.id; }));
        case 'material-delete':
          if (!(await ask('Удалить материал?', 'Удаление материала'))) return;
          await call('/materials/' + ds.id, { method: 'DELETE' });
          return draw(true);
        case 'material-up': return swap(l.materials, ds.id, -1, function (id) { return '/materials/' + id; });
        case 'material-down': return swap(l.materials, ds.id, 1, function (id) { return '/materials/' + id; });
        case 'material-embed': {
          const box = document.getElementById('itdlEmbed-' + ds.id);
          const m = l.materials.find(function (x) { return x.id === ds.id; });
          if (!box || !m || !m.embed_url) return;
          if (box.hidden) {
            box.innerHTML = '<iframe src="' + esc(m.embed_url) + '" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>';
            box.hidden = false;
          } else { box.innerHTML = ''; box.hidden = true; }
          return;
        }
        case 'task-new': return taskForm(l.id, null);
        case 'task-edit': return taskForm(l.id, l.tasks.find(function (t) { return t.id === ds.id; }));
        case 'task-delete':
          if (!(await ask('Удалить задание?', 'Удаление задания'))) return;
          await call('/tasks/' + ds.id, { method: 'DELETE' });
          return draw(true);
        case 'task-up': return swap(l.tasks, ds.id, -1, function (id) { return '/tasks/' + id; });
        case 'task-down': return swap(l.tasks, ds.id, 1, function (id) { return '/tasks/' + id; });
        case 'student-open': S.tab = 'students'; return show('student', { studentId: ds.id || S.studentId, studentName: ds.name || S.studentName, studentCtx: null });
        case 'enroll': return enrollForm();
        case 'enr-toggle': S.expanded[ds.id] = !S.expanded[ds.id]; return draw(true);
        case 'enr-schedule': {
          const e = cache.enrollments.find(function (x) { return x.id === ds.id; });
          if (e) scheduleForm(e);
          return;
        }
        case 'enr-status-set': {
          const e = cache.enrollments.find(function (x) { return x.id === ds.id; });
          if (!e) return;
          if (ds.status === 'finished' && !(await ask('Завершить курс «' + e.course_title + '» у этого ученика? Его можно будет возобновить.', 'Завершение курса'))) return;
          await call('/enrollments/' + e.id, send('PATCH', { status: ds.status }));
          return draw(true);
        }
        case 'enr-remove': {
          const e = cache.enrollments.find(function (x) { return x.id === ds.id; });
          if (!(await ask('Снять курс «' + e.course_title + '» с ученика? Отметки прогресса сохранятся и вернутся, если назначить курс снова.', 'Снять курс'))) return;
          await call('/enrollments/' + e.id, { method: 'DELETE' });
          return draw(true);
        }
        case 'note-add': {
          const area = document.getElementById('itdlNoteText');
          const text = area ? area.value.trim() : '';
          if (!text) { notify('Введите текст заметки.', 'warning', 'Пусто'); return; }
          await call('/students/' + S.studentId + '/notes', send('POST', { content: text }));
          return draw(true);
        }
        case 'note-edit': {
          const notes = await call('/students/' + S.studentId + '/notes');
          const n = notes.find(function (x) { return x.id === ds.id; });
          if (n) noteForm(n);
          return;
        }
        case 'note-delete':
          if (!(await ask('Удалить заметку?', 'Удаление заметки'))) return;
          await call('/notes/' + ds.id, { method: 'DELETE' });
          return draw(true);
        default: return;
      }
    }

    async function onChange(kind, ds, el) {
      if (kind === 'archived') { S.showArchived = el.checked; return draw(true); }
      if (kind === 'progress') {
        await call('/students/' + S.studentId + '/lessons/' + ds.lesson + '/progress', send('PUT', { status: el.value }));
        return draw(true);
      }
      if (kind === 'lesson-progress') {
        await call('/students/' + S.studentCtx + '/lessons/' + S.lessonId + '/progress', send('PUT', { status: el.value }));
        notify('Прогресс обновлён');
        return;
      }
    }

    // ------------------------------------------------------------ стили
    function installStyles() {
      if (document.getElementById('itdlStyles')) return;
      const style = document.createElement('style');
      style.id = 'itdlStyles';
      style.textContent = [
        '@media (max-width:760px){.nav button.itdl-nav-desktop{display:none!important}}',
        '#courses .itdl-loading{padding:30px;text-align:center;color:var(--muted)}',
        '#courses .itdl-tabs{display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border)}',
        '#courses .itdl-tab{border:0;background:transparent;padding:10px 14px;font:inherit;font-weight:700;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}',
        '#courses .itdl-tab.active{color:var(--primary);border-bottom-color:var(--primary)}',
        '#courses .itdl-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}',
        '#courses .itdl-check,.modal .itdl-check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}',
        '#courses .itdl-check input,.modal .itdl-check input{width:auto}',
        '#courses .itdl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}',
        '#courses .itdl-tile{cursor:pointer;display:grid;gap:8px;align-content:start;transition:box-shadow .15s}',
        '#courses .itdl-tile:hover{box-shadow:var(--shadow)}',
        '#courses .itdl-tile-title{font-weight:800;font-size:16px}',
        '#courses .itdl-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
        '#courses .itdl-desc{font-size:13px;color:var(--muted);white-space:pre-wrap;margin-top:6px}',
        '#courses .itdl-crumbs{margin-bottom:12px}',
        '#courses .itdl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}',
        '#courses .itdl-title{margin:0 0 6px;font-size:22px}',
        '#courses .itdl-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
        '#courses .itdl-sm{padding:6px 10px!important;font-size:12px!important;min-height:0!important}',
        '#courses .btn[disabled]{opacity:.4;cursor:default}',
        '#courses .itdl-module,#courses .itdl-section{margin-top:12px}',
        '#courses .itdl-subtitle{margin:20px 0 8px;font-weight:800}',
        '#courses .itdl-lessons{display:grid;gap:6px;margin-top:12px}',
        '#courses .itdl-lesson{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);cursor:pointer}',
        '#courses .itdl-lesson:hover{border-color:var(--primary)}',
        '#courses .itdl-num{flex:0 0 26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#eef0f4;font-size:12px;font-weight:700}',
        '#courses .itdl-lt{flex:1;min-width:0;display:grid;gap:2px}',
        '#courses .itdl-item{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--border)}',
        '#courses .itdl-item:first-of-type{margin-top:10px}',
        '#courses .itdl-item-main{flex:1;min-width:220px;display:grid;gap:6px}',
        '#courses .itdl-text{white-space:pre-wrap;font-size:14px;overflow-wrap:anywhere}',
        '#courses .itdl-links{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px}',
        '#courses .itdl-embed{margin-top:6px}',
        '#courses .itdl-embed iframe{width:100%;height:420px;border:1px solid var(--border);border-radius:10px;background:#fff}',
        '#courses .itdl-ctx{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
        '#courses .itdl-select{padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:#fff;font:inherit;font-size:13px}',
        '#courses .itdl-list{display:grid}',
        '#courses .itdl-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 4px;border-top:1px solid var(--border);cursor:pointer}',
        '#courses .itdl-row:first-child{border-top:0}',
        '#courses .itdl-row:hover{background:var(--surface-soft)}',
        '#courses .itdl-progress{height:8px;border-radius:99px;background:#eef0f4;overflow:hidden;margin:12px 0 6px}',
        '#courses .itdl-progress-fill{height:100%;background:var(--primary);border-radius:99px}',
        '#courses .itdl-tree{margin-top:12px;display:grid;gap:10px;border-top:1px solid var(--border);padding-top:12px}',
        '#courses .itdl-tree-lesson{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;flex-wrap:wrap}',
        '#courses .itdl-link{border:0;background:none;padding:0;font:inherit;font-size:14px;color:var(--primary);cursor:pointer;text-align:left}',
        '#courses .itdl-notes{margin-top:12px}'
      ].join('\n');
      document.head.appendChild(style);
    }

    // ------------------------------------------------------------ подключение к приложению (в самом конце)
    installStyles();

    const section = document.createElement('section');
    section.id = 'courses';
    section.className = 'view';
    section.innerHTML = '<div id="itdlRoot"></div>';
    host.appendChild(section);
    root = document.getElementById('itdlRoot');

    root.addEventListener('click', function (event) {
      const el = event.target.closest('[data-act]');
      if (!el || !root.contains(el) || el.disabled) return;
      Promise.resolve().then(function () { return onAction(el.dataset.act, el.dataset, el); }).catch(fail);
    });
    root.addEventListener('change', function (event) {
      const el = event.target.closest('[data-change]');
      if (!el || !root.contains(el)) return;
      Promise.resolve().then(function () { return onChange(el.dataset.change, el.dataset, el); }).catch(function (e) { fail(e); draw(true); });
    });

    PAGE_INFO.courses = ['Курсы', 'Курсы, уроки и прогресс учеников'];
    const originalLoadPage = window.loadPage;
    window.loadPage = async function (page) {
      if (page === 'courses') return draw(false);
      return originalLoadPage.apply(this, arguments);
    };

    const navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.dataset.page = 'courses';
    navButton.className = 'itdl-nav-desktop';
    navButton.textContent = 'Курсы';
    navButton.onclick = function () { window.switchPage('courses'); };
    nav.appendChild(navButton);

    const studentsToolbar = document.querySelector('#students .toolbar');
    if (studentsToolbar) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn';
      open.id = 'itdlOpenCourses';
      open.textContent = 'Курсы';
      open.onclick = function () { window.switchPage('courses'); };
      studentsToolbar.appendChild(open);
    }
  }

  try {
    start();
  } catch (error) {
    console.error('ITDETI LMS: не удалось запуститься, остальной интерфейс не затронут', error);
  }
})();
