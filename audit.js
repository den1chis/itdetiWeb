/* ITDETI — страница «Журнал» (журнал действий, только admin).
 *
 * Изолированный модуль: подключается одной строкой <script src="audit.js"> после app.js, lms.js и tasks.js.
 * Существующий код не переписывает: добавляет раздел #audit, пункт меню (в конец, как «Курсы» и «Задачи»)
 * и оборачивает loadPage. Если роль не admin или что-то не найдено — модуль тихо отключается.
 * Данные: GET /audit (сервер отдаёт их только admin). Всё выводится через textContent.
 */
(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var LABELS = {
    login_success: 'Вход: успешно',
    login_failed: 'Вход: неверный пароль',
    login_locked: 'Вход: блокировка',
    student_password_viewed: 'Ученик: просмотр пароля',
    student_password_reset: 'Ученик: сброс пароля',
    student_access_created: 'Ученик: создан доступ',
    student_access_enabled: 'Ученик: доступ включён',
    student_access_disabled: 'Ученик: доступ выключен',
    student_access_unlocked: 'Ученик: снята блокировка',
    staff_created: 'Сотрудник: создан',
    staff_roles_changed: 'Сотрудник: смена ролей',
    staff_disabled: 'Сотрудник: выключен',
    staff_enabled: 'Сотрудник: включён',
    student_deleted: 'Удаление ученика',
    payment_deleted: 'Удаление платежа',
    expense_deleted: 'Удаление расхода'
  };
  var ROLE_NAMES = { admin: 'админ', teacher: 'преподаватель', methodist: 'методист' };

  var S = { action: '', from: '', to: '', offset: 0, total: 0, actions: Object.keys(LABELS), loading: false };
  var root = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'className') node.className = attrs[key];
      else if (key === 'onclick') node.onclick = attrs[key];
      else if (key === 'onchange') node.onchange = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function label(action) { return LABELS[action] || action; }

  function when(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function roles(list) {
    return (Array.isArray(list) ? list : []).map(function (r) { return ROLE_NAMES[r] || r; }).join(', ') || '—';
  }

  function who(item) {
    if (item.actor_name) return item.actor_name;
    if (item.actor_kind === 'system') return '—';
    if (item.actor_kind === 'student') return 'ученик';
    return item.actor_user_id ? 'пользователь удалён' : '—';
  }

  // «Объект»: на ком/чём выполнено действие. Паролей и токенов в журнале нет (сервер их не пишет).
  function target(item) {
    var d = item.details || {};
    var parts = [];
    if (d.student) parts.push(String(d.student));
    if (d.name) parts.push(String(d.name));
    if (d.email) parts.push(String(d.email));
    if (d.login) parts.push('логин ' + d.login);
    if (d.amount) parts.push(Number(d.amount).toLocaleString('ru-RU') + ' ₸');
    if (d.category) parts.push('категория ' + d.category);
    if (item.action === 'staff_roles_changed') parts.push(roles(d.before) + ' → ' + roles(d.after));
    else if (d.roles) parts.push(roles(d.roles));
    if (item.action === 'login_locked') {
      parts.push((d.scope === 'email' ? 'для всех новых адресов' : 'для этого адреса') + (d.minutes ? ', ' + d.minutes + ' мин' : ''));
    }
    return parts.join(' · ') || '—';
  }

  function query() {
    var params = ['limit=' + PAGE_SIZE, 'offset=' + S.offset];
    if (S.action) params.push('action=' + encodeURIComponent(S.action));
    if (S.from) params.push('date_from=' + encodeURIComponent(S.from));
    if (S.to) params.push('date_to=' + encodeURIComponent(S.to));
    return '/audit?' + params.join('&');
  }

  function toolbar() {
    var select = el('select', { id: 'auditAction', 'aria-label': 'Тип действия', onchange: function () { S.action = this.value; S.offset = 0; load(); } });
    select.appendChild(el('option', { value: '', text: 'Все действия' }));
    S.actions.forEach(function (action) {
      var option = el('option', { value: action, text: label(action) });
      if (action === S.action) option.selected = true;
      select.appendChild(option);
    });
    var from = el('input', { type: 'date', id: 'auditFrom', 'aria-label': 'Дата с', title: 'Дата с', value: S.from, onchange: function () { S.from = this.value; S.offset = 0; load(); } });
    var to = el('input', { type: 'date', id: 'auditTo', 'aria-label': 'Дата по', title: 'Дата по', value: S.to, onchange: function () { S.to = this.value; S.offset = 0; load(); } });
    var reset = el('button', { type: 'button', className: 'btn', text: 'Сбросить', onclick: function () { S.action = ''; S.from = ''; S.to = ''; S.offset = 0; load(); } });
    return el('div', { className: 'toolbar itda-toolbar' }, [select, from, to, reset]);
  }

  function table(items) {
    var head = el('tr', {}, ['Дата', 'Кто', 'Действие', 'Объект', 'IP'].map(function (name) { return el('th', { text: name }); }));
    var body = el('tbody');
    items.forEach(function (item) {
      body.appendChild(el('tr', {}, [
        el('td', { className: 'itda-nowrap', text: when(item.created_at) }),
        el('td', { text: who(item) }),
        el('td', { text: label(item.action) }),
        el('td', { className: 'itda-target', text: target(item) }),
        el('td', { className: 'itda-ip', text: item.ip || '—' })
      ]));
    });
    return el('div', { className: 'table-wrap' }, [el('table', {}, [el('thead', {}, [head]), body])]);
  }

  function pager(count) {
    var first = S.total ? S.offset + 1 : 0;
    var last = S.offset + count;
    var prev = el('button', { type: 'button', className: 'btn', text: '← Новее', onclick: function () { S.offset = Math.max(0, S.offset - PAGE_SIZE); load(); } });
    var next = el('button', { type: 'button', className: 'btn', text: 'Старше →', onclick: function () { S.offset += PAGE_SIZE; load(); } });
    prev.disabled = S.offset <= 0;
    next.disabled = last >= S.total;
    return el('div', { className: 'itda-pager' }, [prev, el('span', { className: 'itda-muted', text: first + '–' + last + ' из ' + S.total }), next]);
  }

  function draw(content) {
    if (!root) return;
    root.textContent = '';
    root.appendChild(toolbar());
    root.appendChild(el('div', { className: 'card card-padding' }, content));
  }

  async function load() {
    if (S.loading) return;
    S.loading = true;
    draw([el('div', { className: 'empty', text: 'Загрузка…' })]);
    try {
      var page = await window.api(query());
      S.total = Number(page.total) || 0;
      if (Array.isArray(page.actions) && page.actions.length) S.actions = page.actions;
      var items = Array.isArray(page.items) ? page.items : [];
      if (!items.length && S.offset > 0 && S.total > 0) {   // страница «уехала» (записей стало меньше)
        S.offset = Math.max(0, Math.floor((S.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        S.loading = false;
        return load();
      }
      draw(items.length
        ? [table(items), pager(items.length)]
        : [el('div', { className: 'empty', text: 'Записей нет' })]);
    } catch (error) {
      draw([el('div', { className: 'empty', text: 'Не удалось загрузить журнал: ' + ((error && error.message) || 'ошибка') })]);
    } finally {
      S.loading = false;
    }
  }

  function installStyles() {
    if (document.getElementById('itdaStyles')) return;
    var style = document.createElement('style');
    style.id = 'itdaStyles';
    style.textContent = [
      '@media (max-width:760px){.nav button.itda-nav-desktop{display:none!important}}',
      '#audit .itda-toolbar select,#audit .itda-toolbar input{padding:9px 10px;border:1px solid var(--border,#e6e8ee);border-radius:10px;background:#fff;font:inherit}',
      '#audit .itda-nowrap{white-space:nowrap}',
      '#audit .itda-target{overflow-wrap:anywhere}',
      '#audit .itda-ip{font-size:12px;color:var(--muted,#697386);overflow-wrap:anywhere}',
      '#audit .itda-pager{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}',
      '#audit .itda-muted{color:var(--muted,#697386);font-size:13px}',
      '#audit .btn[disabled]{opacity:.4;cursor:default}'
    ].join('\n');
    document.head.appendChild(style);
  }

  async function start() {
    var required = ['api', 'switchPage', 'loadPage'];
    for (var i = 0; i < required.length; i++) {
      if (typeof window[required[i]] !== 'function') {
        console.warn('ITDETI AUDIT: не найдена базовая функция ' + required[i] + ', модуль отключён');
        return;
      }
    }
    var nav = document.querySelector('.nav');
    var notificationsView = document.getElementById('notifications');
    var host = notificationsView && notificationsView.parentElement;
    if (!nav || !host || document.getElementById('audit') || typeof PAGE_INFO === 'undefined') return;

    // Только admin: остальным раздел не показывается (и сервер им его не отдаёт).
    var me;
    try { me = await window.api('/auth/me'); } catch (_) { return; }
    if (!me || me.role !== 'admin') return;
    if (document.getElementById('audit')) return;

    installStyles();
    var section = document.createElement('section');
    section.id = 'audit';
    section.className = 'view';
    root = document.createElement('div');
    root.id = 'itdaRoot';
    section.appendChild(root);
    host.appendChild(section);

    PAGE_INFO.audit = ['Журнал', 'Входы, доступы учеников, сотрудники и удаления'];
    var originalLoadPage = window.loadPage;
    window.loadPage = async function (page) {
      if (page === 'audit') { S.offset = 0; return load(); }
      return originalLoadPage.apply(this, arguments);
    };

    // Пункт меню — строго в конец: значки нижнего меню телефона привязаны к позиции кнопок (mobile.css).
    var navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.dataset.page = 'audit';
    navButton.className = 'itda-nav-desktop';
    navButton.textContent = 'Журнал';
    navButton.onclick = function () { window.switchPage('audit'); };
    nav.appendChild(navButton);
  }

  try {
    start().catch(function (error) { console.warn('ITDETI AUDIT: модуль отключён', error && error.message); });
  } catch (error) {
    console.warn('ITDETI AUDIT: модуль отключён', error && error.message);
  }
})();
