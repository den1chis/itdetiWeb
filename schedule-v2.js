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
      } catch(e) { window.appNotify?.(e.message || 'Не удалось добавить урок.'); } finally { button.disabled=false; }
    };
  }

  function installScheduleDateBridge() {
    if (window.__itdetiScheduleFetchPatched) return;
    window.__itdetiScheduleFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init = {}) {
      try {
        const rawUrl = typeof input === 'string' ? input : input?.url || '';
        const requestMethod = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
        const parsedUrl = rawUrl ? new URL(rawUrl, window.location.href) : null;
        const pathname = parsedUrl?.pathname || rawUrl;

        if (requestMethod === 'POST' && /\/students\/[^/]+\/schedule\/?$/.test(pathname) && init.body) {
          const selected = document.querySelector('.new-slot-valid-from-v2');
          if (selected?.value) {
            const payload = JSON.parse(init.body);
            payload.valid_from = selected.value;
            init = {...init, body: JSON.stringify(payload)};
          }
        }

        // The standard event dialog already asks for confirmation before calling DELETE.
        // Here we add the recurring-series choice after that confirmation.
        if (requestMethod === 'DELETE' && /\/events\/[^/]+\/?$/.test(pathname) && !init.__itdetiRecurringDeleteHandled) {
          const match = pathname.match(/\/events\/([^/]+)\/?$/);
          const eventId = match?.[1];
          if (eventId) {
            const headers = init.headers || {};
            try {
              const listUrl = new URL('/events?include_cancelled=true', parsedUrl?.origin || window.location.origin).toString();
              const metaResponse = await originalFetch(listUrl, {method:'GET', headers});
              if (metaResponse.ok) {
                const events = await metaResponse.json();
                const event = (events || []).find(x => String(x.id) === String(eventId));
                if (event?.recurring_event_id) {
                  const deleteOnly = window.appConfirm
                    ? await window.appConfirm('Это событие входит в повторяющуюся серию. Удалить только выбранное событие?')
                    : window.confirm('Это событие входит в повторяющуюся серию. Удалить только выбранное событие?');
                  if (deleteOnly) {
                    return originalFetch(input, {...init, __itdetiRecurringDeleteHandled:true});
                  }

                  const deleteAll = window.appConfirm
                    ? await window.appConfirm('Удалить всю повторяющуюся серию? Все её созданные события будут скрыты из календаря.')
                    : window.confirm('Удалить всю повторяющуюся серию? Все её созданные события будут скрыты из календаря.');
                  if (!deleteAll) return new Response(null, {status: 204});

                  const seriesUrl = new URL(`/recurring-events/${event.recurring_event_id}/all`, parsedUrl?.origin || window.location.origin).toString();
                  const seriesResponse = await originalFetch(seriesUrl, {method:'DELETE', headers});
                  if (!seriesResponse.ok) return seriesResponse;
                  return new Response(null, {status: 204});
                }
              }
            } catch (_) {
              // If metadata lookup fails, fall back to the original deletion.
            }
          }
        }
      } catch (_) {}
      return originalFetch(input, init);
    };
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

  function scan() { addButtons(); patchScheduleStartDate(); installScheduleDateBridge(); }
  const observer=new MutationObserver(scan); observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,300); setTimeout(scan,1000); setTimeout(scan,2500);
})();
