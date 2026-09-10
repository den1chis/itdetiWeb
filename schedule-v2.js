/* ITDETI SCHEDULE V2 — unified add UI + recurring events + safe recurring delete + mobile polish */
(function () {
  const API = window.api;
  const $ = window.$;
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])));
  function localDateTimeValue(date = new Date()) { const pad=n=>String(n).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
  function localDateValue(date = new Date()) { const pad=n=>String(n).padStart(2,'0'); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function refreshSchedule(){return Promise.all([window.loadCalendar?.(),window.loadStudents?.(),window.loadDashboard?.()]);}
  function notify(message,type='success',title='Готово'){window.appNotify?.(message,type,title);}

  function installScheduleAddStyles(){
    if(document.getElementById('itdetiScheduleAddStyles'))return;
    const style=document.createElement('style');style.id='itdetiScheduleAddStyles';
    style.textContent=`
      .itdeti-schedule-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .itdeti-mobile-add{display:none;position:relative;margin-left:auto;flex:0 0 auto;align-self:flex-start}
      .itdeti-mobile-add-toggle{width:42px!important;height:42px!important;border:0!important;border-radius:13px!important;background:#4f46e5!important;color:#fff!important;display:grid!important;place-items:center!important;font-size:27px!important;line-height:1!important;font-weight:400!important;box-shadow:0 6px 16px rgba(79,70,229,.28)!important}
      .itdeti-mobile-add-toggle:active{transform:scale(.96)}
      .itdeti-mobile-add-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:1000;min-width:180px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow)}
      .itdeti-mobile-add-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px 11px;border-radius:8px}
      .itdeti-mobile-add-menu button:hover{background:var(--surface-soft)}
      .itdeti-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .itdeti-choice{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:4px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer}
      .itdeti-choice:hover{background:var(--surface-soft);border-color:var(--primary)}
      .itdeti-choice strong{font-size:14px}.itdeti-choice span{font-size:12px;color:var(--muted)}
      @media(max-width:700px){.itdeti-schedule-actions{display:none!important}.itdeti-mobile-add{display:block}.itdeti-choice-grid{grid-template-columns:1fr}}
      @media(max-width:760px){
        .itdeti-mobile-add{display:block}
        .itdeti-mobile-add-toggle{width:40px!important;height:40px!important;border-radius:12px!important}
        #calendarTitle{margin:0!important;display:flex!important;justify-content:center!important;min-width:0!important;flex:1!important}
        #calendarTitle .calendar-title-wrap{position:relative;display:inline-flex;justify-content:center;max-width:100%}
        #calendarTitle .calendar-month-title{font-size:16px!important;font-weight:800!important;padding:7px 28px 7px 10px!important;position:relative;white-space:nowrap}
        #calendarTitle .calendar-month-title::after{content:'⌄';position:absolute;right:8px;top:50%;transform:translateY(-55%);font-size:18px;font-weight:800;line-height:1;color:var(--muted)}
        .calendar-toolbar{gap:8px!important}
        .calendar-toolbar .view-switcher{width:auto!important;display:grid!important;grid-template-columns:repeat(3,1fr)!important}
        .calendar-toolbar .view-switcher [data-calendar-view="month"]{display:none!important}
        .calendar-toolbar .view-switcher button{min-width:72px}
        .list-calendar{display:grid!important;gap:12px!important}
        .list-day{padding:0!important;border:0!important;background:transparent!important;border-radius:0!important;overflow:visible!important}
        .list-day-header,.list-day-title{padding:0 2px 7px!important;border:0!important;background:transparent!important}
        .calendar-item{position:relative!important;display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;margin:0 0 7px!important;padding:11px 12px!important;border:1px solid rgba(15,23,42,.08)!important;border-radius:14px!important;background:var(--surface)!important;box-shadow:0 3px 12px rgba(15,23,42,.06)!important}
        .calendar-item.calendar-colored{background:var(--item-color)!important;border:0!important;box-shadow:0 4px 12px rgba(15,23,42,.10)!important}
        .calendar-item .small{font-size:11px!important;line-height:1.3!important}
        .day-calendar{max-width:100%!important;display:grid!important;gap:8px!important}
        .day-title{padding:2px 2px 10px!important;margin:0!important;font-size:16px!important;font-weight:800!important}
        .day-calendar .calendar-item{margin-bottom:0!important}
        .day-calendar .empty{padding:20px 14px!important;border:1px dashed var(--border)!important;border-radius:14px!important;background:var(--surface-soft)!important;color:var(--muted)!important;text-align:center!important}
        .calendar-month-picker{left:50%!important;transform:translateX(-50%)!important;width:min(310px,calc(100vw - 24px))!important;padding:12px!important;border-radius:16px!important;box-shadow:0 18px 50px rgba(15,23,42,.18)!important}
      }
    `;
    document.head.appendChild(style);
  }

  function scheduleView(){const heading=[...document.querySelectorAll('h1')].find(x=>x.textContent.trim().toLowerCase()==='расписание');return heading?.closest('.view')||heading?.parentElement?.parentElement||null;}
  function removeOldScheduleButtons(){['addEvent','addLesson','addMasterclass','addRecurringEventV2','addManualLessonV2'].forEach(id=>document.querySelectorAll(`#${id}`).forEach(node=>node.remove()));}

  function ensureMobileDefaultList(){
    const view=scheduleView();
    if(!view)return;
    const mobile=window.matchMedia('(max-width: 760px)').matches;
    if(!mobile){delete view.dataset.itdetiMobileScheduleOpened;return;}
    if(!view.classList.contains('active')){delete view.dataset.itdetiMobileScheduleOpened;return;}
    if(view.dataset.itdetiMobileScheduleOpened==='1')return;
    const listButton=view.querySelector('[data-calendar-view="list"]');
    if(listButton){
      view.dataset.itdetiMobileScheduleOpened='1';
      const isListActive=listButton.classList.contains('active') || listButton.getAttribute('aria-pressed')==='true';
      if(!isListActive)listButton.click();
    }
  }

  function polishMobileListHeaders(){
    if(!window.matchMedia('(max-width: 760px)').matches)return;
    const months={янв:'январь',фев:'февраль',мар:'март',апр:'апрель',май:'май',июн:'июнь',июл:'июль',авг:'август',сен:'сентябрь',сент:'сентябрь',окт:'октябрь',ноя:'ноябрь',дек:'декабрь'};
    const now=new Date();
    document.querySelectorAll('.list-day').forEach(day=>{
      const headers=day.querySelectorAll('.list-day-header,.list-day-title');
      let text='';
      headers.forEach(h=>{text+=` ${h.textContent||''}`;});
      const lower=text.toLowerCase();
      const isToday=lower.includes('сегодня') || new RegExp(`\\b${now.getDate()}\\s*(?:${Object.keys(months).join('|')})\\b`,'i').test(lower) && lower.includes(Object.keys(months).find(k=>months[k]===months[Object.keys(months).find(k=>k===k)]));
      day.classList.toggle('itdeti-today',!!isToday);
      headers.forEach(h=>{
        let html=h.innerHTML;
        Object.entries(months).forEach(([short,full])=>{
          html=html.replace(new RegExp(`\\b${short}\\b`,'gi'),full);
        });
        h.innerHTML=html;
        h.style.color='#111827';
      });
    });
  }

  function addScheduleActions(){
    const view=scheduleView();if(!view)return;
    let desktop=document.getElementById('itdetiScheduleActions');
    if(!desktop){
      const legacy=document.getElementById('addEvent');
      const host=legacy?.parentElement||view.querySelector('.page-header')||view.querySelector('.calendar-toolbar')||view.querySelector('.toolbar');
      if(host){
        desktop=document.createElement('div');desktop.id='itdetiScheduleActions';desktop.className='itdeti-schedule-actions';
        desktop.innerHTML='<button type="button" class="btn" id="itdetiAddLesson">+ Добавить урок</button><button type="button" class="btn" id="itdetiAddEvent">+ Добавить событие</button>';
        host.appendChild(desktop);$('#itdetiAddLesson').onclick=openLessonChooser;$('#itdetiAddEvent').onclick=openEventChooser;
      }
    }
    if(!document.getElementById('itdetiMobileAdd')){
      const header=view.querySelector('.page-header')||view.querySelector('h1')?.parentElement;
      if(header){
        const mobile=document.createElement('div');mobile.id='itdetiMobileAdd';mobile.className='itdeti-mobile-add';
        mobile.innerHTML='<button type="button" class="itdeti-mobile-add-toggle" id="itdetiMobileAddToggle" aria-label="Добавить">+</button><div class="itdeti-mobile-add-menu" id="itdetiMobileAddMenu" style="display:none"><button type="button" id="itdetiMobileAddLesson">Добавить урок</button><button type="button" id="itdetiMobileAddEvent">Добавить событие</button></div>';
        header.appendChild(mobile);
        const toggle=$('#itdetiMobileAddToggle'),menu=$('#itdetiMobileAddMenu');
        toggle.onclick=e=>{e.stopPropagation();menu.style.display=menu.style.display==='none'?'block':'none';};
        $('#itdetiMobileAddLesson').onclick=()=>{menu.style.display='none';openLessonChooser();};
        $('#itdetiMobileAddEvent').onclick=()=>{menu.style.display='none';openEventChooser();};
        document.addEventListener('click',e=>{if(!mobile.contains(e.target))menu.style.display='none';});
      }
    }
    removeOldScheduleButtons();
    ensureMobileDefaultList();
    polishMobileListHeaders();
  }

  function choiceModal(title,choices){return new Promise(resolve=>{const body=`<div class="form"><div style="color:var(--muted);font-size:13px;margin-bottom:2px">Выберите, что добавить:</div><div class="itdeti-choice-grid">${choices.map(x=>`<button class="itdeti-choice" data-choice="${esc(x.id)}"><strong>${esc(x.title)}</strong><span>${esc(x.description)}</span></button>`).join('')}</div><div class="form-actions"><button class="btn" id="itdetiChoiceCancel">Отмена</button></div></div>`;window.openModal(title,body);document.querySelectorAll('.itdeti-choice').forEach(button=>button.onclick=()=>{const value=button.dataset.choice;window.closeModal();resolve(value);});$('#itdetiChoiceCancel').onclick=()=>{window.closeModal();resolve(null);};});}
  async function loadStudentsOrNotify(){try{const students=await API('/students');if(!students.length)notify('Сначала добавьте ученика.','warning','Нет учеников');return students;}catch(e){notify(e.message||'Не удалось загрузить учеников.');return null;}}
  function studentOptions(students){return students.map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)}</option>`).join('');}
  async function openLessonChooser(){const type=await choiceModal('Добавить урок',[{id:'lesson',title:'Полноценный урок',description:'Запланированный урок ученика'},{id:'masterclass',title:'Мастер-класс',description:'Запланированное занятие в формате мастер-класса'},{id:'manual',title:'Проведённый урок',description:'Урок уже состоялся и сразу учитывается в балансе'}]);if(!type)return;if(type==='manual')return openManualLessonForm();return openScheduledLessonForm(type);}
  async function openScheduledLessonForm(kind){const students=await loadStudentsOrNotify();if(!students)return;const now=new Date();now.setMinutes(0,0,0);const masterclass=kind==='masterclass';const body=`<div class="form"><div class="form-group"><label>Ученик</label><select id="slStudent">${studentOptions(students)}</select></div><div class="form-row"><div class="form-group"><label>Дата и время</label><input id="slDateTime" type="datetime-local" value="${localDateTimeValue(now)}"></div><div class="form-group"><label>Длительность, минут</label><input id="slDuration" type="number" min="15" max="480" value="60"></div></div><div class="form-row"><div class="form-group"><label>Тип занятия</label><select id="slType"><option value="regular">Обычный</option><option value="trial">Пробный</option><option value="extra">Дополнительный</option></select></div><div class="form-group"><label>Стоимость</label><input id="slPrice" type="number" min="0" step="0.01" value="${Number(students[0].lesson_price||6000)}"></div></div><div class="form-group"><label>Тема</label><input id="slTopic" placeholder="Например: Python — списки"></div><div class="form-group"><label>Заметка преподавателя</label><textarea id="slNotes" rows="3"></textarea></div><div class="form-actions"><button class="btn" id="slCancel">Отмена</button><button class="btn primary" id="slSave">Добавить ${masterclass?'мастер-класс':'урок'}</button></div></div>`;window.openModal(masterclass?'Новый мастер-класс':'Новый урок',body);$('#slCancel').onclick=window.closeModal;$('#slStudent').onchange=()=>{const s=students.find(x=>String(x.id)===String($('#slStudent').value));if(s)$('#slPrice').value=Number(s.lesson_price||6000);};$('#slSave').onclick=async()=>{const button=$('#slSave');button.disabled=true;try{const student=students.find(x=>String(x.id)===String($('#slStudent').value));if(!student)throw new Error('Выберите ученика.');if(!$('#slDateTime').value)throw new Error('Укажите дату и время.');await API('/lessons',{method:'POST',body:JSON.stringify({student_id:student.id,lesson_kind:masterclass?'masterclass':'lesson',lesson_type:$('#slType').value,start_time:new Date($('#slDateTime').value).toISOString(),duration_minutes:Number($('#slDuration').value),topic:$('#slTopic').value.trim()||null,teacher_notes:$('#slNotes').value.trim()||null,price:Number($('#slPrice').value),color:masterclass?'#7c3aed':'#4f46e5'})});window.closeModal();await refreshSchedule();notify(masterclass?'Мастер-класс добавлен.':'Урок добавлен.');}catch(e){notify(e.message||'Не удалось добавить занятие.');}finally{button.disabled=false;}};}
  async function openManualLessonForm(){const students=await loadStudentsOrNotify();if(!students)return;const now=new Date();now.setMinutes(0,0,0);const body=`<div class="form"><div class="form-group"><label>Ученик</label><select id="mlStudent">${studentOptions(students)}</select></div><div class="form-row"><div class="form-group"><label>Дата и время проведения</label><input id="mlDateTime" type="datetime-local" value="${localDateTimeValue(now)}"></div><div class="form-group"><label>Длительность, минут</label><input id="mlDuration" type="number" min="15" max="480" value="60"></div></div><div class="form-row"><div class="form-group"><label>Тип</label><select id="mlType"><option value="regular">Обычный</option><option value="trial">Пробный</option><option value="extra">Дополнительный</option></select></div><div class="form-group"><label>Стоимость</label><input id="mlPrice" type="number" min="0" step="0.01" value="${Number(students[0].lesson_price||6000)}"></div></div><div class="form-group"><label>Тема</label><input id="mlTopic"></div><div class="form-group"><label>Заметка преподавателя</label><textarea id="mlNotes" rows="3"></textarea></div><div style="font-size:12px;color:var(--muted)">Урок сразу считается проведённым. Для обычного/дополнительного урока стоимость списывается с баланса; пробный — без списания.</div><div class="form-actions"><button class="btn" id="mlCancel">Отмена</button><button class="btn primary" id="mlSave">Добавить проведённый урок</button></div></div>`;window.openModal('Проведённый урок',body);$('#mlCancel').onclick=window.closeModal;$('#mlStudent').onchange=()=>{const s=students.find(x=>String(x.id)===String($('#mlStudent').value));if(s)$('#mlPrice').value=Number(s.lesson_price||6000);};$('#mlSave').onclick=async()=>{const button=$('#mlSave');button.disabled=true;try{const student=students.find(x=>String(x.id)===String($('#mlStudent').value));if(!student)throw new Error('Выберите ученика.');await API('/manual-lessons',{method:'POST',body:JSON.stringify({student_id:student.id,start_time:new Date($('#mlDateTime').value).toISOString(),duration_minutes:Number($('#mlDuration').value),lesson_kind:'lesson',lesson_type:$('#mlType').value,price:Number($('#mlPrice').value),topic:$('#mlTopic').value.trim()||null,teacher_notes:$('#mlNotes').value.trim()||null})});window.closeModal();await refreshSchedule();notify('Проведённый урок добавлен и учтён в балансе.');}catch(e){notify(e.message||'Не удалось добавить проведённый урок.');}finally{button.disabled=false;}};}
  async function openEventChooser(){const type=await choiceModal('Добавить событие',[{id:'personal',title:'Личное',description:'Личное дело или задача'},{id:'meeting',title:'Встреча',description:'Встреча с человеком или командой'},{id:'reminder',title:'Напоминание',description:'Событие, о котором нужно помнить'},{id:'masterclass',title:'Мастер-класс',description:'Событие в формате мастер-класса'},{id:'recurring',title:'Повторяющееся',description:'Событие, которое повторяется по расписанию'}]);if(!type)return;if(type==='recurring')return openRecurringEventForm();return openEventForm(type);}
  async function openEventForm(type){const now=new Date();now.setMinutes(0,0,0);const end=new Date(now.getTime()+60*60000);const body=`<div class="form"><div class="form-group"><label>Название</label><input id="evTitle" placeholder="Например: Встреча с родителем"></div><div class="form-row"><div class="form-group"><label>Начало</label><input id="evStart" type="datetime-local" value="${localDateTimeValue(now)}"></div><div class="form-group"><label>Окончание</label><input id="evEnd" type="datetime-local" value="${localDateTimeValue(end)}"></div></div><div class="form-group"><label>Место</label><input id="evLocation"></div><div class="form-group"><label>Описание</label><textarea id="evNotes" rows="3"></textarea></div><div class="form-group"><label>Цвет</label><input id="evColor" type="color" value="${type==='masterclass'?'#7c3aed':'#64748b'}"></div><div class="form-actions"><button class="btn" id="evCancel">Отмена</button><button class="btn primary" id="evSave">Добавить событие</button></div></div>`;const titles={personal:'Новое личное событие',meeting:'Новая встреча',reminder:'Новое напоминание',masterclass:'Новый мастер-класс'};window.openModal(titles[type]||'Новое событие',body);$('#evCancel').onclick=window.closeModal;$('#evSave').onclick=async()=>{const button=$('#evSave');button.disabled=true;try{if(!$('#evTitle').value.trim())throw new Error('Укажите название события.');const start=new Date($('#evStart').value),end=new Date($('#evEnd').value);if(!$('#evStart').value||!$('#evEnd').value||end<=start)throw new Error('Проверьте дату и время.');await API('/events',{method:'POST',body:JSON.stringify({title:$('#evTitle').value.trim(),event_type:type,start_time:start.toISOString(),end_time:end.toISOString(),location:$('#evLocation').value.trim()||null,notes:$('#evNotes').value.trim()||null,color:$('#evColor').value})});window.closeModal();await refreshSchedule();notify('Событие добавлено.');}catch(e){notify(e.message||'Не удалось добавить событие.');}finally{button.disabled=false;}};}
  async function openRecurringEventForm(){const today=localDateValue();const body=`<div class="form"><div class="form-group"><label>Название</label><input id="revTitle" placeholder="Например: Планёрка"></div><div class="form-row"><div class="form-group"><label>Повторять</label><select id="revFrequency"><option value="weekly">Каждую неделю</option><option value="daily">Каждый день</option></select></div><div class="form-group"><label id="revIntervalLabel">Каждые, недель</label><input id="revInterval" type="number" min="1" max="52" value="1"></div></div><div class="form-row"><div class="form-group"><label>Начинается с</label><input id="revStartDate" type="date" value="${today}"></div><div class="form-group"><label>Заканчивается</label><input id="revEndDate" type="date" value="${today}"></div></div><div class="form-row"><div class="form-group"><label>Время</label><input id="revTime" type="time" value="10:00"></div><div class="form-group"><label>Длительность, минут</label><input id="revDuration" type="number" min="15" max="480" value="60"></div></div><div class="form-row"><div class="form-group"><label>Тип</label><select id="revType"><option value="personal">Личное</option><option value="meeting">Встреча</option><option value="reminder">Напоминание</option><option value="masterclass">Мастер-класс</option></select></div><div class="form-group"><label>Цвет</label><input id="revColor" type="color" value="#64748b"></div></div><div class="form-group"><label>Место</label><input id="revLocation"></div><div class="form-group"><label>Описание</label><textarea id="revNotes" rows="3"></textarea></div><div class="form-actions"><button class="btn" id="revCancel">Отмена</button><button class="btn primary" id="revSave">Создать серию</button></div></div>`;window.openModal('Повторяющееся событие',body);$('#revCancel').onclick=window.closeModal;$('#revFrequency').onchange=()=>{$('#revIntervalLabel').textContent=$('#revFrequency').value==='daily'?'Каждые, дней':'Каждые, недель';};$('#revSave').onclick=async()=>{const button=$('#revSave');button.disabled=true;try{const startDate=$('#revStartDate').value,endDate=$('#revEndDate').value;if(!$('#revTitle').value.trim())throw new Error('Укажите название события.');if(!startDate||!endDate||endDate<startDate)throw new Error('Проверьте период повторения.');await API('/recurring-events',{method:'POST',body:JSON.stringify({title:$('#revTitle').value.trim(),event_type:$('#revType').value,frequency:$('#revFrequency').value,interval:Number($('#revInterval').value),start_date:startDate,end_date:endDate,start_time:$('#revTime').value,duration_minutes:Number($('#revDuration').value),location:$('#revLocation').value.trim()||null,notes:$('#revNotes').value.trim()||null,color:$('#revColor').value})});window.closeModal();await refreshSchedule();notify('Повторяющееся событие создано.');}catch(e){notify(e.message||'Не удалось создать повторяющееся событие.');}finally{button.disabled=false;}};}
  function installRecurringDeleteUI(){if(window.__itdetiRecurringDeleteUIInstalled)return;const editor=window.openEventEditor;if(typeof editor!=='function')return;window.__itdetiRecurringDeleteUIInstalled=true;window.openEventEditor=function(id){const result=editor.apply(this,arguments);const button=document.getElementById('deleteEvent');if(button){button.dataset.itdetiEventId=id?String(id):'';if(!button.__itdetiLegacyDeleteHandler&&typeof button.onclick==='function')button.__itdetiLegacyDeleteHandler=button.onclick;}return result;};document.addEventListener('click',function(event){const button=event.target.closest?.('#deleteEvent');if(!button)return;const eventId=button.dataset.itdetiEventId;if(!eventId)return;event.preventDefault();event.stopImmediatePropagation();const legacyHandler=button.__itdetiLegacyDeleteHandler||button.onclick;(async()=>{try{const item=await API(`/events/${eventId}`);if(!item?.recurring_event_id){if(typeof legacyHandler==='function')await legacyHandler.call(button,event);return;}const choice=await new Promise(resolve=>{const body=`<div class="form" style="gap:10px"><div style="color:var(--muted);font-size:13px">Это событие входит в повторяющуюся серию.</div><div class="form-actions" style="justify-content:stretch;flex-wrap:wrap"><button class="btn" id="itdDeleteOne">Удалить текущее</button><button class="btn" id="itdDeleteSeries">Удалить серию</button><button class="btn" id="itdDeleteCancel">Отмена</button></div></div>`;window.openModal('Удаление события',body);$('#itdDeleteOne').onclick=()=>{window.closeModal();resolve('one');};$('#itdDeleteSeries').onclick=()=>{window.closeModal();resolve('series');};$('#itdDeleteCancel').onclick=()=>{window.closeModal();resolve('cancel');};});if(choice==='one')await API(`/events/${eventId}`,{method:'DELETE'});else if(choice==='series')await API(`/recurring-events/${item.recurring_event_id}/all`,{method:'DELETE'});else return;await refreshSchedule();}catch(error){console.error('ITDETI recurring delete:',error);notify(error?.message||'Не удалось удалить событие.');}})();},true);}
  function patchScheduleStartDate(){const day=document.querySelector('.new-slot-day');if(!day||document.querySelector('.new-slot-start-date-v2'))return;const host=day.closest('.form-group')?.parentElement||day.parentElement;if(!host)return;const wrapper=document.createElement('div');wrapper.className='form-group new-slot-start-date-v2';wrapper.innerHTML='<label>С какого числа действует расписание</label><input class="new-slot-valid-from-v2" type="date">';wrapper.querySelector('input').value=localDateValue();host.appendChild(wrapper);}

  function fixCalendarContrast(){
    const selectors=['#calendar .calendar-event','#calendar .calendar-item','#calendar .agenda-card','#calendar .google-month-event'];
    document.querySelectorAll(selectors.join(',')).forEach(el=>{
      el.style.setProperty('color','#111827','important');
      el.style.setProperty('-webkit-text-fill-color','#111827','important');
      el.querySelectorAll('*').forEach(child=>{
        child.style.setProperty('color','#111827','important');
        child.style.setProperty('-webkit-text-fill-color','#111827','important');
      });
    });
  }

  function scan(){installScheduleAddStyles();addScheduleActions();patchScheduleStartDate();installRecurringDeleteUI();fixCalendarContrast();}
  const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});setTimeout(scan,300);setTimeout(scan,1000);setTimeout(scan,2500);setInterval(scan,1500);
})();