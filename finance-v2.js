/* ITDETI_FINANCE_V2 */
(function () {
  const API = window.api;
  const $ = window.$;
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const money = window.money || (v => `${Number(v || 0).toLocaleString('ru-RU')} ₸`);
  const CATEGORY_LABELS = {
    rent:'Аренда', tax:'Налог', utilities:'Коммуналка / связь', advertising:'Реклама', equipment:'Оборудование',
    materials:'Материалы', bank_fee:'Банковские комиссии', transport:'Транспорт', salary:'Зарплата',
    car:'Машина', food:'Продукты', other:'Прочее'
  };
  const METHOD_LABELS = {kaspi:'Kaspi', cash:'Наличные', transfer:'Перевод', other:'Другое'};
  const MONTHS_RU = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

  function currentPeriod() {
    const now = new Date();
    return { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}` };
  }

  if (!window.appValidate) {
    window.appValidate = function (fields = []) {
      let valid = true;
      let firstInvalid = null;
      for (const item of fields) {
        const el = item?.el;
        const label = item?.label || 'Поле';
        if (!el) continue;
        el.style.borderColor = '';
        el.style.boxShadow = '';
        const raw = String(el.value ?? '').trim();
        const isNumber = el.type === 'number';
        const numberValue = isNumber ? Number(raw) : null;
        const invalid = !raw || (isNumber && (!Number.isFinite(numberValue) || numberValue <= 0));
        if (invalid) {
          valid = false;
          if (!firstInvalid) firstInvalid = el;
          el.style.borderColor = 'var(--danger)';
          el.style.boxShadow = '0 0 0 2px rgba(180,35,24,.08)';
          el.setAttribute('aria-invalid', 'true');
          el.title = `${label}: заполните корректно`;
        } else {
          el.removeAttribute('aria-invalid');
          el.removeAttribute('title');
        }
      }
      if (!valid) {
        const item = fields.find(x => x?.el === firstInvalid);
        window.appNotify?.(`${item?.label || 'Обязательное поле'} заполнено некорректно.`, 'warning', 'Проверьте данные');
        firstInvalid?.focus();
      }
      return valid;
    };
  }

  if (!window.appNotify) {
    window.appNotify = function (message, type = 'error', title = '') {
      const node = document.createElement('div');
      node.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2000;max-width:360px;background:#fff;border:1px solid #e6e8ee;border-radius:12px;box-shadow:0 12px 35px rgba(20,30,60,.16);padding:12px 14px;font-size:13px';
      node.innerHTML = `<b>${esc(title || (type === 'success' ? 'Готово' : type === 'warning' ? 'Внимание' : 'Ошибка'))}</b><div style="margin-top:4px">${esc(message)}</div>`;
      document.body.appendChild(node);
      setTimeout(() => node.remove(), 3500);
    };
  }

  function normalizeFinanceTableHeader() {
    const body = $('#transactions');
    const table = body?.closest('table');
    const row = table?.querySelector('thead tr');
    if (!row) return;
    row.innerHTML = '<th>Тип</th><th>Сумма</th><th>Дата</th><th>Ученик / категория</th><th>Способ</th><th>Действия</th>';
  }

  async function getRecurringExpenseRecords() {
    const { month } = currentPeriod();
    try { return await API(`/finance/expenses?month=${month}`); } catch (_) { return []; }
  }

  async function getRecurringIncomeRecords() {
    try { return await API('/finance/recurring-income-records'); } catch (_) { return []; }
  }

  function addActions(row, item) {
    row.querySelector('[data-fin-edit]')?.addEventListener('click', () => openEdit(item));
    row.querySelector('[data-fin-cancel]')?.addEventListener('click', async () => {
      let message;
      let endpoint;
      if (item.source_type === 'recurring_income') {
        message = 'Отменить получение регулярного дохода?';
        endpoint = `/finance/recurring-income-records/${item.id}`;
      } else if (item.operation_type === 'income') {
        message = 'Отменить это поступление? Баланс ученика будет уменьшен на эту сумму.';
        endpoint = `/finance/payments/${item.id}`;
      } else {
        message = 'Отменить этот расход?';
        endpoint = `/finance/expenses/${item.id}`;
      }
      const confirmed = window.appConfirm ? await window.appConfirm(message) : confirm(message);
      if (!confirmed) return;
      try {
        await API(endpoint, {method:'DELETE'});
        await window.loadFinance();
        await window.loadStudents?.();
        await window.loadDashboard?.();
      } catch (e) { window.appNotify(e.message); }
    });
  }

  async function openEdit(item) {
    if (item.source_type === 'recurring_income') {
      return openRecurringIncomeRecordEdit(item);
    }

    const isIncome = item.operation_type === 'income';
    let current;
    try {
      current = isIncome
        ? (await API('/finance/payments?include_cancelled=true')).find(x => x.id === item.id)
        : (await API('/finance/expenses?include_cancelled=true')).find(x => x.id === item.id);
      if (!current) throw new Error('Операция не найдена');
    } catch (e) { window.appNotify(e.message); return; }

    const dateValue = isIncome ? new Date(current.recorded_at).toISOString().slice(0,16) : current.expense_date;
    const body = `
      <div class="form">
        ${isIncome ? `<div class="form-group"><label>Ученик</label><input value="${esc(item.student_name || '')}" disabled></div>` : ''}
        <div class="form-row">
          <div class="form-group"><label>Сумма</label><input id="finEditAmount" type="number" min="0.01" step="0.01" value="${current.amount}"></div>
          <div class="form-group"><label>Способ</label><select id="finEditMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${current.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></div>
        </div>
        ${!isIncome ? `<div class="form-row"><div class="form-group"><label>Категория</label><select id="finEditCategory">${Object.entries(CATEGORY_LABELS).map(([v,l])=>`<option value="${v}" ${current.category===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="form-group"><label>Дата</label><input id="finEditDate" type="date" value="${dateValue}"></div></div>` : `<div class="form-group"><label>Дата и время</label><input id="finEditDate" type="datetime-local" value="${dateValue}"></div>`}
        <div class="form-group"><label>${isIncome?'Комментарий':'Описание'}</label><input id="finEditDescription" value="${esc(isIncome ? (current.comment || '') : (current.description || ''))}"></div>
        <div class="form-actions"><button type="button" class="btn" id="finEditCancel">Отмена</button><button type="button" class="btn primary" id="finEditSave">Сохранить</button></div>
      </div>`;
    window.openModal(isIncome ? 'Редактирование оплаты' : 'Редактирование расхода', body);
    $('#finEditCancel').onclick = window.closeModal;
    $('#finEditSave').onclick = async () => {
      const b = $('#finEditSave'); b.disabled = true;
      try {
        const payload = {amount:Number($('#finEditAmount').value), payment_method:$('#finEditMethod').value, [isIncome?'comment':'description']:$('#finEditDescription').value.trim() || null, [isIncome?'recorded_at':'expense_date']:isIncome ? new Date($('#finEditDate').value).toISOString() : $('#finEditDate').value};
        if (!isIncome) payload.category = $('#finEditCategory').value;
        await API(isIncome ? `/finance/payments/${current.id}` : `/finance/expenses/${current.id}`, {method:'PATCH', body:JSON.stringify(payload)});
        window.closeModal(); await window.loadFinance(); await window.loadStudents?.(); await window.loadDashboard?.();
      } catch (e) { window.appNotify(e.message); } finally { b.disabled = false; }
    };
  }

  async function openRecurringIncomeRecordEdit(item) {
    let current;
    try {
      current = (await API('/finance/recurring-income-records?include_cancelled=true')).find(x => x.id === item.id);
      if (!current) throw new Error('Поступление не найдено');
    } catch (e) { window.appNotify(e.message); return; }
    const body = `<div class="form">
      <div class="form-group"><label>Сумма</label><input id="riEditAmount" type="number" min="0.01" step="0.01" value="${current.amount}"></div>
      <div class="form-row"><div class="form-group"><label>Способ</label><select id="riEditMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${current.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="form-group"><label>Дата получения</label><input id="riEditDate" type="date" value="${current.received_date}"></div></div>
      <div class="form-group"><label>Комментарий</label><input id="riEditComment" value="${esc(current.comment || '')}"></div>
      <div class="form-actions"><button class="btn" id="riEditCancel">Отмена</button><button class="btn primary" id="riEditSave">Сохранить</button></div>
    </div>`;
    window.openModal('Редактирование регулярного дохода', body);
    $('#riEditCancel').onclick = window.closeModal;
    $('#riEditSave').onclick = async () => {
      const b = $('#riEditSave'); b.disabled = true;
      try {
        await API(`/finance/recurring-income-records/${current.id}`, {method:'PATCH', body:JSON.stringify({amount:Number($('#riEditAmount').value),payment_method:$('#riEditMethod').value,received_date:$('#riEditDate').value,comment:$('#riEditComment').value.trim() || null})});
        window.closeModal(); await window.loadFinance(); await window.loadDashboard?.();
      } catch (e) { window.appNotify(e.message); } finally { b.disabled = false; }
    };
  }

  async function recordRecurringExpense(id) {
    const button = document.querySelector(`[data-rec-record="${id}"]`);
    if (button) button.disabled = true;
    try {
      await API(`/finance/recurring-expenses/${id}/record`, {method:'POST'});
      window.appNotify('Расход проведён и включён в финансовый результат текущего месяца.', 'success', 'Готово');
      await window.loadFinance();
      await window.loadDashboard?.();
    } catch (e) {
      window.appNotify(e.message, 'warning', 'Расход не проведён');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function recordRecurringIncome(item) {
    const body = `<div class="form">
      <div class="form-group"><label>Доход</label><input value="${esc(item.name)}" disabled></div>
      <div class="form-row"><div class="form-group"><label>Плановая сумма</label><input value="${money(item.amount)}" disabled></div><div class="form-group"><label>Фактически получил</label><input id="riAmount" type="number" min="0.01" step="0.01" value="${item.amount}"></div></div>
      <div class="form-row"><div class="form-group"><label>Дата получения</label><input id="riDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-group"><label>Способ</label><select id="riMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${item.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <div class="form-group"><label>Комментарий</label><input id="riComment" value="${esc(item.description || '')}" placeholder="Например: зарплата за сентябрь"></div>
      <div class="form-actions"><button class="btn" id="riCancel">Отмена</button><button class="btn primary" id="riSave">Подтвердить получение</button></div>
    </div>`;
    window.openModal('Подтвердить получение дохода', body);
    $('#riCancel').onclick = window.closeModal;
    $('#riSave').onclick = async () => {
      const b = $('#riSave'); b.disabled = true;
      try {
        await API(`/finance/recurring-incomes/${item.id}/record`, {method:'POST', body:JSON.stringify({amount:Number($('#riAmount').value),received_date:$('#riDate').value,payment_method:$('#riMethod').value,comment:$('#riComment').value.trim() || null})});
        window.closeModal();
        window.appNotify('Доход добавлен в финансовый результат текущего месяца.', 'success', 'Готово');
        await window.loadFinance();
        await window.loadDashboard?.();
      } catch (e) { window.appNotify(e.message, 'warning', 'Доход не записан'); } finally { b.disabled = false; }
    };
  }

  async function loadFinanceV2() {
    try {
      normalizeFinanceTableHeader();
      const [summary, transactions, recurringExpenses, recurringIncomes, currentExpenseRecords, incomeRecords] = await Promise.all([
        API('/finance/summary'),
        API('/finance/transactions?limit=100'),
        API('/finance/recurring-expenses'),
        API('/finance/recurring-incomes'),
        getRecurringExpenseRecords(),
        getRecurringIncomeRecords()
      ]);

      const expenseRecordIds = new Set(currentExpenseRecords.filter(x => x.recurring_expense_id && !x.is_cancelled).map(x => x.recurring_expense_id));
      const incomeRecordIds = new Set(incomeRecords.filter(x => !x.is_cancelled).map(x => x.recurring_income_id));
      const period = currentPeriod();

      $('#financeStats').innerHTML = `
        <div class="card stat"><div class="stat-label">Доходы месяца</div><div class="money-large">${money(summary.total_income)}</div></div>
        <div class="card stat"><div class="stat-label">От учеников</div><div class="money-large">${money(summary.income_from_students)}</div></div>
        <div class="card stat"><div class="stat-label">Регулярные доходы</div><div class="money-large">${money(summary.recurring_income_total)}</div></div>
        <div class="card stat"><div class="stat-label">Расходы месяца</div><div class="money-large">${money(summary.expenses_total)}</div></div>
        <div class="card stat"><div class="stat-label">Результат месяца</div><div class="money-large">${money(summary.net_profit)}</div></div>
        <div class="card stat"><div class="stat-label">На балансах учеников</div><div class="money-large">${money(summary.student_balances_total)}</div></div>
        <div class="card stat"><div class="stat-label">План регулярных доходов</div><div class="money-large">${money(summary.planned_recurring_income)}</div></div>
        <div class="card stat"><div class="stat-label">План регулярных расходов</div><div class="money-large">${money(summary.planned_recurring_expenses)}</div></div>`;

      $('#transactions').innerHTML = transactions.length ? transactions.map(item => `
        <tr class="${item.is_cancelled ? 'cancelled' : ''}">
          <td><span class="pill ${item.operation_type==='income'?'success':'danger'}">${item.operation_type==='income'?'Поступление':'Расход'}</span></td>
          <td>${item.operation_type==='income'?'+':'−'}${money(item.amount)}</td>
          <td>${window.formatDateTime(item.date)}</td>
          <td>${esc(item.student_name || CATEGORY_LABELS[item.category] || item.description || 'Регулярный доход')}</td>
          <td>${METHOD_LABELS[item.payment_method] || '—'}</td>
          <td><button class="btn" data-fin-edit>Изменить</button> <button class="btn" data-fin-cancel>Отменить</button></td>
        </tr>`).join('') : `<tr><td colspan="6" class="empty">Операций пока нет</td></tr>`;
      [...$('#transactions').querySelectorAll('tr')].forEach((row, i) => { if (transactions[i]) addActions(row, transactions[i]); });

      $('#expenseCategories').innerHTML = Object.entries(summary.expenses_by_category || {}).map(([c,a]) => `<div class="calendar-item" style="cursor:default"><span>${esc(CATEGORY_LABELS[c] || c)}</span><b>${money(a)}</b></div>`).join('') || '<div class="empty">Расходов нет</div>';

      let expensePanel = document.getElementById('recurringExpensesPanel');
      if (!expensePanel) {
        expensePanel = document.createElement('div'); expensePanel.id='recurringExpensesPanel'; expensePanel.className='card card-padding'; expensePanel.style.marginTop='14px';
        document.getElementById('finance').appendChild(expensePanel);
      }
      expensePanel.innerHTML = `<div class="section-title">Регулярные расходы — ${period.label}</div><div class="toolbar"><button class="btn primary" id="addRecurringExpense">+ Регулярный расход</button></div>` + (recurringExpenses.length ? recurringExpenses.map(r => {
        const recorded = expenseRecordIds.has(r.id);
        return `<div class="calendar-item"><div><b>${esc(r.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(CATEGORY_LABELS[r.category]||r.category)} · ${r.day_of_month}-го числа · ${METHOD_LABELS[r.payment_method]||r.payment_method}</div></div><b>${money(r.amount)}</b>${r.is_active ? `<button class="btn ${recorded?'':'primary'}" data-rec-record="${r.id}" ${recorded?'disabled':''}>${recorded?'✓ Проведено':'Провести'}</button>` : '<button class="btn" disabled>Неактивен</button>'}<button class="btn" data-rec-edit="${r.id}">Изменить</button></div>`;
      }).join('') : '<div class="empty">Регулярных расходов пока нет</div>');
      $('#addRecurringExpense').onclick = () => openRecurring();
      expensePanel.querySelectorAll('[data-rec-record]').forEach(b => b.onclick = () => recordRecurringExpense(b.dataset.recRecord));
      expensePanel.querySelectorAll('[data-rec-edit]').forEach(b => b.onclick = () => openRecurring(recurringExpenses.find(r => r.id === b.dataset.recEdit)));

      let incomePanel = document.getElementById('recurringIncomesPanel');
      if (!incomePanel) {
        incomePanel = document.createElement('div'); incomePanel.id='recurringIncomesPanel'; incomePanel.className='card card-padding'; incomePanel.style.marginTop='14px';
        document.getElementById('finance').appendChild(incomePanel);
      }
      incomePanel.innerHTML = `<div class="section-title">Регулярные доходы — ${period.label}</div><div class="toolbar"><button class="btn primary" id="addRecurringIncome">+ Регулярный доход</button></div>` + (recurringIncomes.length ? recurringIncomes.map(r => {
        const received = incomeRecordIds.has(r.id);
        return `<div class="calendar-item"><div><b>${esc(r.name)}</b><div style="font-size:12px;color:var(--muted)">${r.day_of_month}-го числа · ${METHOD_LABELS[r.payment_method]||r.payment_method}</div></div><b>${money(r.amount)}</b>${r.is_active ? `<button class="btn ${received?'':'primary'}" data-ri-record="${r.id}" ${received?'disabled':''}>${received?'✓ Получено':'Получено'}</button>` : '<button class="btn" disabled>Неактивен</button>'}<button class="btn" data-ri-edit="${r.id}">Изменить</button></div>`;
      }).join('') : '<div class="empty">Регулярных доходов пока нет</div>');
      $('#addRecurringIncome').onclick = () => openRecurringIncome();
      incomePanel.querySelectorAll('[data-ri-record]').forEach(b => b.onclick = () => recordRecurringIncome(recurringIncomes.find(r => r.id === b.dataset.riRecord)));
      incomePanel.querySelectorAll('[data-ri-edit]').forEach(b => b.onclick = () => openRecurringIncome(recurringIncomes.find(r => r.id === b.dataset.riEdit)));
    } catch (e) {
      $('#transactions').innerHTML = `<tr><td colspan="6" class="empty">${esc(e.message)}</td></tr>`;
    }
  }

  async function openRecurring(item=null) {
    const body = `<div class="form">
      <div class="form-group"><label>Название</label><input id="recName" value="${esc(item?.name||'')}" placeholder="Например: Аренда кабинета"></div>
      <div class="form-row"><div class="form-group"><label>Категория</label><select id="recCategory">${Object.entries(CATEGORY_LABELS).filter(([v])=>!['car','food'].includes(v)).map(([v,l])=>`<option value="${v}" ${item?.category===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="form-group"><label>Сумма</label><input id="recAmount" type="number" min="0.01" step="0.01" value="${item?.amount||''}"></div></div>
      <div class="form-row"><div class="form-group"><label>День месяца</label><input id="recDay" type="number" min="1" max="31" value="${item?.day_of_month||1}"></div><div class="form-group"><label>Способ оплаты</label><select id="recMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${item?.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <div class="form-group"><label>Описание</label><input id="recDescription" value="${esc(item?.description||'')}"></div>
      ${item ? `<div class="form-group"><label><input id="recActive" type="checkbox" ${item.is_active?'checked':''}> Активен</label></div>`:''}
      <div class="form-actions"><button class="btn" id="recCancel">Отмена</button><button class="btn primary" id="recSave">Сохранить</button></div>
    </div>`;
    window.openModal(item?'Редактирование регулярного расхода':'Новый регулярный расход',body);
    $('#recCancel').onclick=window.closeModal;
    $('#recSave').onclick=async()=>{const b=$('#recSave');b.disabled=true;try{const payload={name:$('#recName').value.trim(),category:$('#recCategory').value,amount:Number($('#recAmount').value),day_of_month:Number($('#recDay').value),payment_method:$('#recMethod').value,description:$('#recDescription').value.trim()||null,is_active:item?$('#recActive').checked:true};await API(item?`/finance/recurring-expenses/${item.id}`:'/finance/recurring-expenses',{method:item?'PATCH':'POST',body:JSON.stringify(payload)});window.closeModal();await window.loadFinance();}catch(e){window.appNotify(e.message)}finally{b.disabled=false}};
  }

  async function openRecurringIncome(item=null) {
    const body = `<div class="form">
      <div class="form-group"><label>Название</label><input id="riName" value="${esc(item?.name||'')}" placeholder="Например: Зарплата в школе"></div>
      <div class="form-row"><div class="form-group"><label>Плановая сумма</label><input id="riTemplateAmount" type="number" min="0.01" step="0.01" value="${item?.amount||''}"></div><div class="form-group"><label>День месяца</label><input id="riDay" type="number" min="1" max="31" value="${item?.day_of_month||1}"></div></div>
      <div class="form-row"><div class="form-group"><label>Способ получения</label><select id="riTemplateMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${item?.payment_method===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="form-group"><label>Описание</label><input id="riDescription" value="${esc(item?.description||'')}"></div></div>
      ${item ? `<div class="form-group"><label><input id="riActive" type="checkbox" ${item.is_active?'checked':''}> Активен</label></div>`:''}
      <div class="form-actions"><button class="btn" id="riTemplateCancel">Отмена</button><button class="btn primary" id="riTemplateSave">Сохранить</button></div>
    </div>`;
    window.openModal(item?'Редактирование регулярного дохода':'Новый регулярный доход',body);
    $('#riTemplateCancel').onclick=window.closeModal;
    $('#riTemplateSave').onclick=async()=>{const b=$('#riTemplateSave');b.disabled=true;try{const payload={name:$('#riName').value.trim(),amount:Number($('#riTemplateAmount').value),day_of_month:Number($('#riDay').value),payment_method:$('#riTemplateMethod').value,description:$('#riDescription').value.trim()||null,is_active:item?$('#riActive').checked:true};await API(item?`/finance/recurring-incomes/${item.id}`:'/finance/recurring-incomes',{method:item?'PATCH':'POST',body:JSON.stringify(payload)});window.closeModal();await window.loadFinance();}catch(e){window.appNotify(e.message)}finally{b.disabled=false}};
  }

  window.loadFinance = loadFinanceV2;
  const oldAddPayment = document.getElementById('addPayment');
  if (oldAddPayment) oldAddPayment.onclick = async () => {
    const students = await API('/students');
    window.openModal('Добавить оплату', `<div class="form"><div class="form-group"><label>Ученик</label><select id="paymentStudent">${students.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${esc(x.full_name)}</option>`).join('')}</select></div><div class="form-row"><div class="form-group"><label>Сумма</label><input id="paymentAmount" type="number" min="0.01" step="0.01"></div><div class="form-group"><label>Способ</label><select id="paymentMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}" ${v==='kaspi'?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="form-group"><label>Комментарий</label><input id="paymentComment"></div><div class="form-actions"><button class="btn" id="payCancel">Отмена</button><button class="btn primary" id="savePaymentV2">Сохранить</button></div></div>`);
    $('#payCancel').onclick=window.closeModal; $('#savePaymentV2').onclick=async()=>{const b=$('#savePaymentV2');b.disabled=true;try{await API('/finance/payments',{method:'POST',body:JSON.stringify({student_id:$('#paymentStudent').value,amount:Number($('#paymentAmount').value),payment_method:$('#paymentMethod').value,request_id:crypto.randomUUID(),comment:$('#paymentComment').value.trim()||null})});window.closeModal();await window.loadFinance();await window.loadStudents();await window.loadDashboard();}catch(e){window.appNotify(e.message)}finally{b.disabled=false}};
  };
  const oldAddExpense = document.getElementById('addExpense');
  if (oldAddExpense) oldAddExpense.onclick = () => {
    window.openModal('Добавить расход', `<div class="form"><div class="form-row"><div class="form-group"><label>Категория</label><select id="expenseCategory">${Object.entries(CATEGORY_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="form-group"><label>Сумма</label><input id="expenseAmount" type="number" min="0.01" step="0.01"></div></div><div class="form-row"><div class="form-group"><label>Способ</label><select id="expenseMethod">${Object.entries(METHOD_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="form-group"><label>Дата</label><input id="expenseDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div><div class="form-group"><label>Описание</label><input id="expenseDescription"></div><div class="form-actions"><button class="btn" id="expCancel">Отмена</button><button class="btn primary" id="saveExpenseV2">Сохранить</button></div></div>`);
    $('#expCancel').onclick=window.closeModal;
    $('#saveExpenseV2').onclick=async()=>{const b=$('#saveExpenseV2');b.disabled=true;try{await API('/finance/expenses',{method:'POST',body:JSON.stringify({category:$('#expenseCategory').value,amount:Number($('#expenseAmount').value),payment_method:$('#expenseMethod').value,expense_date:$('#expenseDate').value,description:$('#expenseDescription').value.trim()||null})});window.closeModal();await window.loadFinance();await window.loadDashboard();}catch(e){window.appNotify(e.message)}finally{b.disabled=false}};
  };

  if (window.state?.page === 'finance') loadFinanceV2();
})();
