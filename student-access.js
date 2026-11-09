/* ITDETI — блок «Доступ к ученическому сайту» в карточке ученика.
 *
 * Изолированный модуль, как lms.js: подключается одной строкой <script src="student-access.js"> после app.js,
 * оборачивает window.openStudentEditor и дорисовывает блок перед кнопками формы.
 * Ничего не меняет в существующем коде; если сервер не знает маршрутов /students/{id}/access
 * или у пользователя нет прав (роль не admin), блок просто не показывается.
 *
 * Сервер: itdeti, routers/student_access.py (только admin). Пароль приходит в ответе ОДИН раз.
 */
(function () {
  'use strict';

  if (typeof window.openStudentEditor !== 'function' || typeof window.api !== 'function') {
    console.warn('ITDETI student-access: нет openStudentEditor/api, модуль отключён');
    return;
  }

  var original = window.openStudentEditor;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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

  var STYLE_ID = 'student-access-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.sa-box{border:1px solid var(--border,#e6e8ee);border-radius:14px;padding:12px 14px;margin:6px 0 14px;background:var(--surface-soft,#f8f9fc)}' +
      '.sa-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}' +
      '.sa-row input{flex:1 1 160px;min-width:0}' +
      '.sa-muted{color:var(--muted,#697386);font-size:14px}' +
      '.sa-state{font-weight:600}' +
      '.sa-on{color:var(--success,#14803a)}.sa-off{color:var(--danger,#b42318)}' +
      '.sa-secret{margin-top:10px;padding:12px;border-radius:12px;background:var(--warning-bg,#fff7e5);color:#5c3b00}' +
      '.sa-secret code{font-size:20px;font-weight:700;letter-spacing:1px;background:#fff;padding:2px 8px;border-radius:8px}';
    document.head.appendChild(style);
  }

  function secretHtml(creds) {
    return '<div class="sa-secret" id="saSecret">' +
      '<div><b>Запишите сейчас — пароль больше не будет показан.</b></div>' +
      '<div style="margin-top:6px">Логин: <code>' + esc(creds.login) + '</code></div>' +
      '<div style="margin-top:6px">Пароль: <code>' + esc(creds.password) + '</code></div>' +
      '<div class="sa-row"><button type="button" class="btn" id="saCopy">Скопировать</button>' +
      '<button type="button" class="btn" id="saHide">Скрыть</button></div></div>';
  }

  function render(box, studentId, status, creds) {
    var html = '';
    if (!status.exists) {
      html =
        '<div class="sa-state">Доступа нет</div>' +
        '<div class="sa-muted">Логин можно поправить. Пароль (6 цифр) создаётся автоматически.</div>' +
        '<div class="sa-row"><input id="saLogin" placeholder="логин" maxlength="32" autocomplete="off" value="' + esc(status.suggestion || '') + '">' +
        '<button type="button" class="btn" id="saCreate">Создать доступ</button></div>';
    } else {
      var locked = status.locked_until && new Date(status.locked_until) > new Date();
      html =
        '<div class="sa-state">' +
          (status.is_active ? '<span class="sa-on">Доступ включён</span>' : '<span class="sa-off">Доступ выключен</span>') +
          (locked ? ' · <span class="sa-off">вход заблокирован до ' + esc(fmt(status.locked_until)) + '</span>' : '') +
        '</div>' +
        '<div class="sa-muted">Последний вход: ' + esc(fmt(status.last_login_at) || 'ещё не входил') + '</div>' +
        '<div class="sa-row"><input id="saLogin" maxlength="32" autocomplete="off" value="' + esc(status.login) + '">' +
        '<button type="button" class="btn" id="saSaveLogin">Сохранить логин</button></div>' +
        '<div class="sa-row">' +
          '<button type="button" class="btn" id="saReset">Сбросить пароль</button>' +
          '<button type="button" class="btn" id="saToggle" style="color:' + (status.is_active ? '#b42318' : 'inherit') + '">' +
            (status.is_active ? 'Выключить доступ' : 'Включить доступ') + '</button>' +
        '</div>';
    }
    box.innerHTML = '<div class="section-title">Доступ к ученическому сайту</div><div class="sa-box">' + html +
      (creds ? secretHtml(creds) : '') + '</div>';
    bind(box, studentId, status, creds);
  }

  function busy(button, on) {
    if (!button) return;
    button.disabled = on;
  }

  function bind(box, studentId, status, creds) {
    var $ = function (sel) { return box.querySelector(sel); };
    var reload = function (newCreds) { load(box, studentId, newCreds); };

    if (creds) {
      $('#saCopy').onclick = function () {
        var text = 'Логин: ' + creds.login + '\nПароль: ' + creds.password;
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
          .then(function () { notify('Скопировано'); })
          .catch(function () { notify('Не удалось скопировать, перепишите вручную', 'error'); });
      };
      $('#saHide').onclick = function () { var s = $('#saSecret'); if (s) s.remove(); creds = null; };
    }

    if (!status.exists) {
      $('#saCreate').onclick = function () {
        var btn = this;
        busy(btn, true);
        call(studentId, '', { method: 'POST', body: JSON.stringify({ login: $('#saLogin').value.trim() || null }) })
          .then(function (result) { notify('Доступ создан'); reload(result); })
          .catch(function (e) { notify(e.message, 'error'); busy(btn, false); });
      };
      return;
    }

    $('#saSaveLogin').onclick = function () {
      var btn = this;
      var login = $('#saLogin').value.trim();
      if (!login || login === status.login) return;
      busy(btn, true);
      call(studentId, '', { method: 'PATCH', body: JSON.stringify({ login: login }) })
        .then(function () { notify('Логин сохранён'); reload(creds); })
        .catch(function (e) { notify(e.message, 'error'); busy(btn, false); });
    };

    $('#saReset').onclick = function () {
      var btn = this;
      ask('Сбросить пароль? Старый пароль перестанет работать, новый будет показан один раз.').then(function (ok) {
        if (!ok) return;
        busy(btn, true);
        call(studentId, '/reset-password', { method: 'POST' })
          .then(function (result) { notify('Новый пароль создан'); reload(result); })
          .catch(function (e) { notify(e.message, 'error'); busy(btn, false); });
      });
    };

    $('#saToggle').onclick = function () {
      var btn = this;
      var turnOn = !status.is_active;
      (turnOn ? Promise.resolve(true) : ask('Выключить доступ? Ученик сразу перестанет видеть уроки.')).then(function (ok) {
        if (!ok) return;
        busy(btn, true);
        call(studentId, '', { method: 'PATCH', body: JSON.stringify({ is_active: turnOn }) })
          .then(function () { notify(turnOn ? 'Доступ включён' : 'Доступ выключен'); reload(creds); })
          .catch(function (e) { notify(e.message, 'error'); busy(btn, false); });
      });
    };
  }

  function load(box, studentId, creds) {
    call(studentId, '')
      .then(function (status) {
        if (status.exists) return status;
        return call(studentId, '/login-suggestion')
          .then(function (s) { status.suggestion = s.login; return status; })
          .catch(function () { return status; });
      })
      .then(function (status) {
        if (!box.isConnected) return;
        render(box, studentId, status, creds);
      })
      .catch(function (e) {
        // Нет прав (не admin) или сервер ещё без этих маршрутов -> блок не показываем.
        console.warn('ITDETI student-access:', e && e.message);
        box.remove();
      });
  }

  async function openStudentEditorWithAccess(studentId) {
    var result = await original.apply(this, arguments);
    try {
      if (studentId === null || studentId === undefined || String(studentId).trim() === '') return result;
      var form = document.getElementById('studentEditor');
      if (!form || form.querySelector('#studentAccessBlock')) return result;
      ensureStyle();
      var box = document.createElement('div');
      box.id = 'studentAccessBlock';
      box.innerHTML = '<div class="section-title">Доступ к ученическому сайту</div><div class="sa-box sa-muted">Загрузка…</div>';
      var actions = form.querySelector('.form-actions');
      form.insertBefore(box, actions || null);
      load(box, String(studentId).trim());
    } catch (e) {
      console.warn('ITDETI student-access:', e);
    }
    return result;
  }

  window.openStudentEditor = openStudentEditorWithAccess;
})();
