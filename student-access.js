/* ITDETI — блок «Доступ к ученическому сайту».
 *
 * Изолированный модуль: подключается одной строкой <script src="student-access.js"> после app.js и lms.js.
 * Даёт точку подключения window.StudentAccess:
 *   StudentAccess.mount(container, studentId)  — нарисовать блок в контейнере;
 *   StudentAccess.clearSecrets()               — убрать показанные пароли из DOM (вызывается при уходе с карточки).
 * Где показывается: «Курсы → Ученики → карточка ученика» (lms.js). В старой карточке ученика
 * (вкладка «Ученики», форма с ценой и расписанием) блока больше нет.
 *
 * Только admin: роль берётся из /auth/me; для остальных блок не показывается. Защита — на сервере
 * (itdeti, routers/student_access.py), здесь только удобство.
 *
 * Пароль: скрыт; «Показать» запрашивает GET /students/{id}/access/password. Пароль выводится только через
 * textContent, не пишется в console, URL и localStorage; «Скрыть» и уход с карточки удаляют его из DOM.
 */
(function () {
  'use strict';

  if (typeof window.api !== 'function') {
    console.warn('ITDETI student-access: нет api, модуль отключён');
    return;
  }

  // ------------------------------------------------------------ утилиты
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'className') node.className = attrs[key];
      else if (key === 'onclick') node.onclick = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }
  function button(text, onclick, extraClass) {
    return el('button', { type: 'button', className: 'btn itdl-sm' + (extraClass ? ' ' + extraClass : ''), text: text, onclick: onclick });
  }
  function notify(message, type) {
    if (window.appNotify) window.appNotify(message, type || 'success');
  }
  function ask(message) {
    if (window.appConfirm) return window.appConfirm(message, 'Подтверждение', true);
    return Promise.resolve(window.confirm(message));
  }
  function fmt(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function call(studentId, path, options) {
    return window.api('/students/' + encodeURIComponent(studentId) + '/access' + (path || ''), options);
  }
  // window.api бросает Error, где message — строка detail или JSON объекта detail.
  function errorCode(error) {
    var message = (error && error.message) || '';
    try { var detail = JSON.parse(message); return (detail && detail.code) || ''; } catch (_) { return ''; }
  }
  function errorText(error) {
    var code = errorCode(error);
    if (code === 'password_not_stored') return 'Пароль недоступен для просмотра, сбросьте';
    if (code === 'password_view_disabled') return 'Просмотр пароля отключён на сервере';
    var message = (error && error.message) || 'Ошибка';
    try { var detail = JSON.parse(message); if (detail && detail.message) return detail.message; } catch (_) { /* строка */ }
    return message;
  }
  function busy(btn, on) { if (btn) btn.disabled = on; }

  // ------------------------------------------------------------ роль (только admin)
  var rolePromise = null;
  function isAdmin() {
    if (!rolePromise) {
      rolePromise = window.api('/auth/me')
        .then(function (me) { return !!me && me.role === 'admin'; })
        .catch(function () { rolePromise = null; return false; });
    }
    return rolePromise;
  }

  // ------------------------------------------------------------ стили (поверх стилей карточки)
  var STYLE_ID = 'student-access-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.sa-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}' +
      '.sa-row input{flex:1 1 160px;min-width:0}' +
      '.sa-muted{color:var(--muted,#697386);font-size:13px;margin-top:4px}' +
      '.sa-state{font-weight:700;margin-top:10px}' +
      '.sa-on{color:var(--success,#14803a)}.sa-off{color:var(--danger,#b42318)}' +
      '.sa-pass{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}' +
      '.sa-pass code{font-size:18px;font-weight:700;letter-spacing:1px;background:var(--surface-soft,#f4f5f8);border:1px solid var(--border,#e6e8ee);padding:4px 10px;border-radius:8px}' +
      '.sa-dots{letter-spacing:3px;color:var(--muted,#697386)}' +
      '.sa-error{margin-top:8px;color:var(--danger,#b42318);font-size:13px}';
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------ показанные пароли
  var secrets = [];  // элементы с открытым паролем (чтобы убрать их из DOM)
  function clearSecrets() {
    secrets.forEach(function (node) { node.textContent = ''; if (node.parentNode) node.parentNode.removeChild(node); });
    secrets = [];
  }

  // Строка пароля: скрыт (••••••) или открыт (code + «Копировать» + «Скрыть»).
  function passwordRow(studentId, box, opened) {
    var row = el('div', { className: 'sa-pass' });
    var error = el('div', { className: 'sa-error' });
    error.hidden = true;

    function showHidden() {
      clearSecrets();
      row.textContent = '';
      row.appendChild(el('span', { text: 'Пароль: ' }));
      row.appendChild(el('span', { className: 'sa-dots', text: '••••••' }));
      row.appendChild(button('Показать', function () {
        var btn = this;
        busy(btn, true);
        error.hidden = true;
        call(studentId, '/password')
          .then(function (data) { if (box.isConnected) showOpen(data.password); })
          .catch(function (e) { error.textContent = errorText(e); error.hidden = false; busy(btn, false); });
      }));
    }

    function showOpen(password) {
      clearSecrets();
      row.textContent = '';
      var code = el('code', { text: password });
      secrets.push(code);
      row.appendChild(el('span', { text: 'Пароль: ' }));
      row.appendChild(code);
      row.appendChild(button('Копировать', function () {
        var text = code.textContent;
        (navigator.clipboard && text ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(function () { notify('Скопировано'); })
          .catch(function () { notify('Не удалось скопировать, перепишите вручную', 'error'); });
      }));
      row.appendChild(button('Скрыть', showHidden));
    }

    if (opened) showOpen(opened); else showHidden();
    return [row, error];
  }

  // ------------------------------------------------------------ отрисовка
  function render(box, studentId, status, justCreated) {
    clearSecrets();
    box.textContent = '';
    box.appendChild(el('div', { className: 'itdl-subtitle', style: 'margin-top:0', text: 'Доступ к ученическому сайту' }));

    if (!status.exists) {
      var input = el('input', { maxlength: '32', autocomplete: 'off', placeholder: 'логин', spellcheck: 'false' });
      input.value = status.suggestion || '';
      box.appendChild(el('div', { className: 'sa-state', text: 'Доступа нет' }));
      box.appendChild(el('div', { className: 'sa-muted', text: 'Логин можно поправить. Пароль (6 цифр) создаётся автоматически.' }));
      box.appendChild(el('div', { className: 'sa-row' }, [input, button('Создать доступ', function () {
        var btn = this;
        busy(btn, true);
        call(studentId, '', { method: 'POST', body: JSON.stringify({ login: input.value.trim() || null }) })
          .then(function (result) { notify('Доступ создан'); load(box, studentId, result.password); })
          .catch(function (e) { notify(errorText(e), 'error'); busy(btn, false); });
      }, 'primary')]));
      return;
    }

    var now = new Date();
    var locked = status.locked_until && new Date(status.locked_until) > now;
    var state = el('div', { className: 'sa-state' }, [
      el('span', { className: status.is_active ? 'sa-on' : 'sa-off', text: status.is_active ? 'Доступ включён' : 'Доступ выключен' }),
      locked ? el('span', { className: 'sa-off', text: ' · вход заблокирован до ' + fmt(status.locked_until) }) : null
    ]);
    box.appendChild(state);
    box.appendChild(el('div', { className: 'sa-muted', text: 'Последний вход: ' + (fmt(status.last_login_at) || 'ещё не входил') }));
    if (!locked && status.failed_attempts > 0) {
      box.appendChild(el('div', { className: 'sa-muted', text: 'Неверных попыток входа подряд: ' + status.failed_attempts }));
    }

    var loginInput = el('input', { maxlength: '32', autocomplete: 'off', spellcheck: 'false' });
    loginInput.value = status.login || '';
    box.appendChild(el('div', { className: 'sa-row' }, [el('span', { text: 'Логин:' }), loginInput, button('Сохранить логин', function () {
      var btn = this;
      var login = loginInput.value.trim();
      if (!login || login === status.login) return;
      busy(btn, true);
      call(studentId, '', { method: 'PATCH', body: JSON.stringify({ login: login }) })
        .then(function () { notify('Логин сохранён'); load(box, studentId); })
        .catch(function (e) { notify(errorText(e), 'error'); busy(btn, false); });
    })]));

    passwordRow(studentId, box, justCreated).forEach(function (node) { box.appendChild(node); });

    var actions = el('div', { className: 'sa-row' });
    actions.appendChild(button('Сбросить пароль', function () {
      var btn = this;
      ask('Сбросить пароль? Старый пароль перестанет работать.').then(function (ok) {
        if (!ok) return;
        busy(btn, true);
        call(studentId, '/reset-password', { method: 'POST' })
          .then(function (result) { notify('Новый пароль создан'); load(box, studentId, result.password); })
          .catch(function (e) { notify(errorText(e), 'error'); busy(btn, false); });
      });
    }));
    if (locked || status.failed_attempts > 0) {
      actions.appendChild(button('Снять блокировку', function () {
        var btn = this;
        busy(btn, true);
        call(studentId, '/unlock', { method: 'POST' })
          .then(function () { notify('Блокировка снята'); load(box, studentId); })
          .catch(function (e) { notify(errorText(e), 'error'); busy(btn, false); });
      }));
    }
    var toggle = button(status.is_active ? 'Выключить доступ' : 'Включить доступ', function () {
      var btn = this;
      var turnOn = !status.is_active;
      (turnOn ? Promise.resolve(true) : ask('Выключить доступ? Ученик сразу перестанет видеть уроки.')).then(function (ok) {
        if (!ok) return;
        busy(btn, true);
        call(studentId, '', { method: 'PATCH', body: JSON.stringify({ is_active: turnOn }) })
          .then(function () { notify(turnOn ? 'Доступ включён' : 'Доступ выключен'); load(box, studentId); })
          .catch(function (e) { notify(errorText(e), 'error'); busy(btn, false); });
      });
    });
    if (status.is_active) toggle.style.color = 'var(--danger,#b42318)';
    actions.appendChild(toggle);
    box.appendChild(actions);
  }

  // justCreated — пароль из ответа «создать» / «сбросить»: показывается сразу, открытым.
  function load(box, studentId, justCreated) {
    return call(studentId, '')
      .then(function (status) {
        if (status.exists) return status;
        return call(studentId, '/login-suggestion')
          .then(function (s) { status.suggestion = s.login; return status; })
          .catch(function () { return status; });
      })
      .then(function (status) {
        if (box.isConnected) render(box, studentId, status, justCreated);
      })
      .catch(function (e) {
        // Сервер ещё без этих маршрутов или нет прав -> блок не показываем, остальная карточка работает.
        console.warn('ITDETI student-access: блок не загружен (' + ((e && e.message) || 'ошибка') + ')');
        if (box.parentNode) box.parentNode.removeChild(box);
      });
  }

  function mount(container, studentId) {
    try {
      if (!container || studentId == null || String(studentId).trim() === '') return;
      var sid = String(studentId).trim();
      ensureStyle();
      clearSecrets();
      container.textContent = '';
      var box = el('div', { className: 'card card-padding itdl-module', 'data-student-access': sid });
      box.appendChild(el('div', { className: 'sa-muted', text: 'Доступ к ученическому сайту: загрузка…' }));
      container.appendChild(box);
      isAdmin().then(function (admin) {
        if (!box.isConnected) return;
        if (!admin) { container.textContent = ''; return; }
        load(box, sid);
      });
    } catch (e) {
      console.warn('ITDETI student-access: блок не подключён', e && e.message);
    }
  }

  window.StudentAccess = { mount: mount, clearSecrets: clearSecrets };
})();
