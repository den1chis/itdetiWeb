/* ITDETI SCHEDULE V2 — recurring events + manual historical lessons */
(function () {
  const API = window.api;
  const $ = window.$;
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  function localDateTimeValue(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function localDateValue(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }

  function addButtons() {
    const addEvent = document.getElementById('addEvent');
    if (!addEvent || document.getElementById('addRecurringEventV2')) return;
    const parent = addEvent.parentElement;
    if (!parent) return;
    const recurring = document.createElement('button');
    recurring.id = 'addRecurringEventV2'; recurring.className = 'btn'; recurring.textContent = '+ Повторяющееся событие'; recurring.onclick = openRecurringEvent;
    parent.insertBefore(recurring, addEvent.nextSibling);
    const manual = document.createElement('button');
    manual.id = 'addManualLessonV2'; manual.className = 'btn'; manual.textContent = '+ Проведённый урок'; manual.onclick = openManualLesson;
    parent.insertBefore(manual, recurring.nextSibling);
  }

  async function openRecurringEvent() {
    const today = localDateValue();
    const body = `<div class="form">
      <div class="form-group"><label>Название</label><input id="revTitle" placeholder="Например: Планёрка"></div>
      <div class="form-row"><div class="form-group"><label>Повторять</label><select id="revFrequency"><option value="weekly">Каждую неделю</option><option value="daily">Каждый день</option></select></div><div class="form-group"><label id="revIntervalLabel">Каждые, недель</label><input id="revInterval" type="number" min="1" max="52" value="1"></div></div>
      <div class="form-row"><div class="form-group"><label>Начинается с</label><input id="revStartDate" type="date" value="${today}"></div><div class="form-group"><label>Заканчивается</label><input id="revEndDate" type="date" value="${today}"></div></div>
      <div class="form-row"><div class="form-group"><label>Время</label><input id="revTime" type="time" value="10:00"></div><div class="form-group"><label>Длительность, минут</label><input id="revDuration" type="number" min="15" max="480" value="60"></div></div>
      <div class="form-row"><div class="form-group"><label>Тип</label><select id="revType"><option value="personal">Личное</option><option value="meeting">Встреча</option><option value="reminder">Напоминание</option><option value="masterclass">Мастер-класс</option></select></div><div class="form-group"><label>Цвет</label><input id="revColor" type="color" value="#64748b"></div></div>
      <div class="form-group"><label>Место</label><input id="revLocation"></div><div class="form-group"><label>Описание</label><textarea id="revNotes" rows="3"></textarea></div>
      <div class="form-actions"><button class="btn" id="revCancel">Отмена</button><button class="btn primary" id="revSave">Создать серию</button></div>
    </div>`;
    window.openModal('Повторяющееся событие', body);
    $('#revCancel').onclick = window.closeModal;
    $('#revFrequency').onchange = () => { $('#revIntervalLabel').textContent = $('#revFrequency').value === 'daily' ? 'Каждые, дней' : 'Каждые, недель'; };
    $('#revSave').onclick = async () => {
      const button = $('#revSave'); button.disabled = true;
      try {
        const startDate = $('#revStartDate').value, endDate = $('#revEndDate').value;
        if (!$('#revTitle').value.trim()) throw new Error('Укажите название события.');
        if (!startDate || !endDate || endDate < startDate) throw new Error('Проверьте период повторения.');
        await API('/recurring-events', {method:'POST', body:JSON.stringify({title:$('#revTitle').value.trim(),event_type:$('#revType').value,frequency:$('#revFrequency').value,interval:Number($('#revInterval').value),start_date:startDate,end_date:endDate,start_time:$('#revTime').value,duration_minutes:Number($('#revDuration').value),location:$('#revLocation').value.trim()||null,notes:$('#revNotes').value.trim()||null,color:$('#revColor').value})});
        window.closeModal(); await window.loadCalendar?.(); window.appNotify?.('Повторяющееся событие создано.','success','Готово');
      } catch(e) { window.appNotify?.(e.message || 'Не удалось создать событие.'); } finally { button.disabled = false; }
    };
  }

  async function openManualLesson() {
    let students; try { students = await API('/students'); } catch(e) { window.appNotify?.(e.message); return; }
    if (!students.length) { window.appNotify?.('Сначала добавьте ученика.'); return; }
    const now = new Date(); now.setMinutes(0,0,0);
    const body = `<div class="form">
      <div class="form-group"><label>Ученик</label><select id="mlStudent">${students.map(s=>`<option value="${s.id}">${esc(s.full_name)}</option>`).join('')}</select></div>
      <div class="form-row"><div class="form-group"><label>Дата и время проведения</label><input id="mlDateTime" type="datetime-local" value="${localDateTimeValue(now)}"></div><div class="form-group"><label>Длительность, минут</label><input id="mlDuration" type="number" min="15" max="480" value="60"></div></div>
      <div class="form-row"><div class="form-group"><label>Тип</label><select id="mlType"><option value="regular">Обычный</option><option value="trial">Пробный</option><option value="extra">Дополнительный</option></select></div><div class="form-group"><label>Стоимость</label><input id="mlPrice" type="number" min="0" step="0.01" value="${Number(students[0].lesson_price || 6000)}"></div></div>
      <div class="form-group"><label>Тема</label><input id="mlTopic"></div><div class="form-group"><label>Заметка</label><textarea id="mlNotes" rows="3"></textarea></div>
      <div style="font-size:12px;color:var(--muted)">Урок сразу считается проведённым и списывает стоимость с баланса. В регулярное расписание он не добавляется.</div>
      <div class="form-actions"><button class="btn" id="mlCancel">Отмена</button><button class="btn primary" id="mlSave">Добавить проведённый урок</button></div>
    </div>`;
    window.openModal('Проведённый урок задним числом', body); $('#mlCancel').onclick = window.closeModal;
    $('#mlStudent').onchange = () => { const s=students.find(x=>x.id===$('#mlStudent').value); if(s) $('#mlPrice').value=Number(s.lesson_price||6000); };
    $('#mlSave').onclick = async () => {
      const button=$('#mlSave'); button.disabled=true;
      try { const student=students.find(x=>x.id===$('#mlStudent').value); if(!student) throw new Error('Выберите ученика.');
        await API('/manual-lessons',{method:'POST',body:JSON.stringify({student_id:student.id,start_time:new Date($('#mlDateTime').value).toISOString(),duration_minutes:Number($('#mlDuration').value),lesson_type:$('#mlType').value,price:Number($('#mlPrice').value),topic:$('#mlTopic').value.trim()||null,teacher_notes:$('#mlNotes').value.trim()||null})});
        window.closeModal(); await window.loadCalendar?.(); await window.loadStudents?.(); await window.loadDashboard?.(); window.appNotify?.('Проведённый урок добавлен и списан с баланса.','success','Готово');
      } catch(e) { window.appNotify?.(e.message || 'Не удалось добавить проведённый урок.'); } finally { button.disabled=false; }
    };
  }

  function installRecurringDeleteUI() {
    if (window.__itdetiRecurringDeleteUIInstalled) return;
    const editor = window.openEventEditor;
    if (typeof editor !== 'function') return;

    window.__itdetiRecurringDeleteUIInstalled = true;
    window.openEventEditor = function(id) {
      const result = editor.apply(this, arguments);
      const button = document.getElementById('deleteEvent');
      if (button) {
        button.dataset.itdetiEventId = id ? String(id) : '';
        // Save the original inline/button handler once. Recurring events will
        // never call it; ordinary events will continue using it unchanged.
        if (!button.__itdetiLegacyDeleteHandler && typeof button.onclick === 'function') {
          button.__itdetiLegacyDeleteHandler = button.onclick;
        }
      }
      return result;
    };

    document.addEventListener('click', function(event) {
      const button = event.target.closest?.('#deleteEvent');
      if (!button) return;
      const eventId = button.dataset.itdetiEventId;
      if (!eventId) return;

      // IMPORTANT: stop the old handler synchronously. The previous version
      // waited for the API request first, so the legacy confirm() appeared.
      event.preventDefault();
      event.stopImmediatePropagation();

      const legacyHandler = button.__itdetiLegacyDeleteHandler || button.onclick;

      (async () => {
        try {
          // API() already attaches the current authorization token.
          const item = await API(`/events/${eventId}`);

          if (!item?.recurring_event_id) {
            // This is a normal event. Re-run only its original handler because
            // propagation was stopped above to prevent duplicate execution.
            if (typeof legacyHandler === 'function') {
              await legacyHandler.call(button, event);
            } else {
              window.appNotify?.('Не удалось передать обычное удаление стандартному обработчику.');
            }
            return;
          }

          const choice = await new Promise(resolve => {
            const body = `<div class="form" style="gap:10px">
              <div style="color:var(--muted);font-size:13px">Это событие входит в повторяющуюся серию.</div>
              <div class="form-actions" style="justify-content:stretch;flex-wrap:wrap">
                <button class="btn" id="itdDeleteOne">Удалить текущее</button>
                <button class="btn" id="itdDeleteSeries">Удалить серию</button>
                <button class="btn" id="itdDeleteCancel">Отмена</button>
              </div>
            </div>`;
            window.openModal('Удаление события', body);
            $('#itdDeleteOne').onclick = () => { window.closeModal(); resolve('one'); };
            $('#itdDeleteSeries').onclick = () => { window.closeModal(); resolve('series'); };
            $('#itdDeleteCancel').onclick = () => { window.closeModal(); resolve('cancel'); };
          });

          if (choice === 'one') {
            await API(`/events/${eventId}`, {method:'DELETE'});
          } else if (choice === 'series') {
            await API(`/recurring-events/${item.recurring_event_id}/all`, {method:'DELETE'});
          } else {
            return;
          }

          window.closeModal?.();
          await window.loadCalendar?.();
          await window.loadDashboard?.();
        } catch (error) {
          console.error('ITDETI recurring delete:', error);
          window.appNotify?.(error?.message || 'Не удалось удалить событие.');
        }
      })();
    }, true);
  }

  function patchScheduleStartDate() {
    const day = document.querySelector('.new-slot-day');
    if (!day || document.querySelector('.new-slot-start-date-v2')) return;
    const host = day.closest('.form-group')?.parentElement || day.parentElement;
    if (!host) return;
    const wrapper=document.createElement('div'); wrapper.className='form-group new-slot-start-date-v2';
    wrapper.innerHTML='<label>С какого числа действует расписание</label><input class="new-slot-valid-from-v2" type="date">';
    wrapper.querySelector('input').value=localDateValue(); host.appendChild(wrapper);
  }

  function scan() {
    addButtons();
    patchScheduleStartDate();
    installRecurringDeleteUI();
  }
  const observer=new MutationObserver(scan); observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,300); setTimeout(scan,1000); setTimeout(scan,2500); setInterval(installRecurringDeleteUI,1000);
})();