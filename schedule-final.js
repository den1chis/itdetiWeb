/* ITDETI SCHEDULE FINAL UI LAYER
   This file is the single final presentation/behavior layer for the calendar.
   It intentionally overrides the older calendar presentation without changing
   the backend or the desktop schedule data model.
*/
(function () {
    const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
    const $ = window.$;

    function time(value) {
        return new Date(value).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function fullDate(value) {
        return new Date(value).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function monthLong(date) {
        return date.toLocaleDateString('ru-RU', { month: 'long' }).toLowerCase();
    }

    function forceMobileListOnOpen() {
        if (!isMobile() || !window.state?.calendar || !window.state?.page) return;
        if (window.state.page !== 'schedule') return;
        if (window.state.calendar.view === 'month' || !window.state.calendar.view) {
            window.state.calendar.view = 'list';
            window.updateCalendarViewButtons?.();
            window.loadCalendar?.();
        }
    }

    function installNavigationPatch() {
        if (window.__itdetiFinalNavigationPatch) return;
        if (typeof window.switchPage !== 'function') return;
        window.__itdetiFinalNavigationPatch = true;
        const original = window.switchPage;
        window.switchPage = function (page) {
            if (page === 'schedule' && isMobile() && window.state?.calendar) {
                window.state.calendar.view = 'list';
            }
            return original.apply(this, arguments);
        };
    }

    function renderFinalListCalendar(start) {
        if (!window.state?.calendar || typeof window.itemsForDate !== 'function') return;

        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            days.push(date);
        }

        let html = '<div class="agenda-calendar" id="agendaCalendar">';
        const todayKey = window.dateKey(new Date());

        days.forEach(date => {
            const items = window.itemsForDate(date);
            const key = window.dateKey(date);
            const isToday = key === todayKey;
            const weekday = date.toLocaleDateString('ru-RU', { weekday: 'long' }).toLowerCase();
            const dateText = `${date.getDate()} ${monthLong(date)}`;

            html += `
                <section class="agenda-day ${isToday ? 'today' : ''}" data-agenda-date="${key}">
                    <div class="agenda-date ${isToday ? 'today' : ''}">
                        <span class="weekday">${weekday}</span>
                        <span class="date">${dateText}</span>
                        ${isToday ? '<span class="agenda-today-badge">сегодня</span>' : ''}
                    </div>
                    <div class="agenda-events">
                        ${items.length ? items.map(item => {
                            const startTime = new Date(item.start_time);
                            const endTime = new Date(item.end_time);
                            const startText = time(startTime);
                            const endText = time(endTime);
                            const title = item.item_type === 'event'
                                ? item.title
                                : (item.student_name || item.title || 'Занятие');
                            const meta = item.item_type === 'event'
                                ? (item.location || item.event_type || '')
                                : (item.lesson_kind === 'masterclass' ? 'Мастер-класс' : (item.course || 'Урок'));
                            const color = window.calendarColor(item);
                            return `
                                <div class="agenda-row" data-agenda-item="${window.esc(item.item_id)}">
                                    <div class="agenda-time">
                                        <span>${startText}</span>
                                    </div>
                                    <button type="button"
                                            class="agenda-card"
                                            style="--item-color:${color}"
                                            onclick="openCalendarItem('${item.item_id}','${item.item_type}')">
                                        <div class="agenda-card-title">${window.esc(title)}</div>
                                        <div class="agenda-card-meta">${window.esc(meta)}${meta ? ' · ' : ''}${startText}–${endText}</div>
                                    </button>
                                </div>`;
                        }).join('') : '<div class="agenda-empty">Нет событий</div>'}
                    </div>
                </section>`;
        });

        html += '</div>';
        $('#calendar').innerHTML = html;
    }

    function renderFinalDayCalendar(date) {
        const items = window.itemsForDate(date);
        const dateTitle = date.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).toLowerCase();

        $('#calendar').innerHTML = `
            <div class="day-calendar">
                <div class="day-title">${dateTitle}</div>
                ${items.length ? items.map(item => finalDayItem(item)).join('') : '<div class="empty">На этот день записей нет</div>'}
            </div>`;
    }

    function finalDayItem(item) {
        const color = window.calendarColor(item);
        const title = item.item_type === 'event'
            ? item.title
            : (item.student_name || item.title || 'Занятие');
        const subtitle = item.item_type === 'event'
            ? (item.location || item.event_type || '')
            : (item.lesson_kind === 'masterclass' ? 'Мастер-класс' : (item.course || 'Урок'));
        const start = new Date(item.start_time);
        const end = new Date(item.end_time);
        const dateText = fullDate(start);
        const range = `${time(start)}–${time(end)}`;

        return `
            <div class="calendar-item calendar-colored final-day-item"
                 style="--item-color:${color}"
                 onclick="openCalendarItem('${item.item_id}','${item.item_type}')">
                <div class="final-day-item-main">
                    <b class="final-day-item-title">${window.esc(title)}</b>
                    <div class="small final-day-item-meta">${dateText} · ${range}${subtitle ? ` · ${window.esc(subtitle)}` : ''}</div>
                </div>
            </div>`;
    }

    function installCalendarRenderPatch() {
        if (window.__itdetiFinalCalendarRenderPatch) return;
        if (typeof window.renderListCalendar !== 'function' || typeof window.renderDayCalendar !== 'function') return;

        window.__itdetiFinalCalendarRenderPatch = true;
        window.renderListCalendar = renderFinalListCalendar;
        window.renderDayCalendar = renderFinalDayCalendar;
    }

    function installFinalStyles() {
        if (document.getElementById('itdetiFinalScheduleStyles')) return;
        const style = document.createElement('style');
        style.id = 'itdetiFinalScheduleStyles';
        style.textContent = `
            /* One final calendar appearance. */
            .calendar-month-title::after { content:none!important; }
            .calendar-month-title::before {
                content:''!important;
                display:inline-block!important;
                width:7px!important;
                height:7px!important;
                margin-left:9px!important;
                margin-bottom:3px!important;
                border-right:2px solid #111827!important;
                border-bottom:2px solid #111827!important;
                transform:rotate(45deg)!important;
            }

            .calendar-event,
            .calendar-event *,
            .agenda-card,
            .agenda-card *,
            .calendar-item,
            .calendar-item *,
            .day-title,
            .agenda-date,
            .agenda-date * {
                color:#111827!important;
                -webkit-text-fill-color:#111827!important;
            }

            .agenda-card {
                min-width:0!important;
                width:100%!important;
                display:block!important;
                text-align:left!important;
                padding:12px 15px!important;
                border:0!important;
                border-radius:28px!important;
                background:var(--item-color)!important;
                box-shadow:0 4px 14px rgba(15,23,42,.09)!important;
                overflow:hidden!important;
            }
            .agenda-card-title {
                display:block!important;
                min-width:0!important;
                white-space:nowrap!important;
                overflow:hidden!important;
                text-overflow:ellipsis!important;
                font-size:14px!important;
                font-weight:800!important;
            }
            .agenda-card-meta {
                margin-top:4px!important;
                white-space:nowrap!important;
                overflow:hidden!important;
                text-overflow:ellipsis!important;
                font-size:11px!important;
                font-weight:600!important;
            }
            .agenda-row {
                grid-template-columns:54px minmax(0,1fr)!important;
                gap:10px!important;
                min-width:0!important;
                margin:0 0 8px!important;
            }
            .agenda-time {
                color:#111827!important;
                -webkit-text-fill-color:#111827!important;
                font-weight:700!important;
                white-space:nowrap!important;
                padding-top:13px!important;
            }
            .agenda-date {
                border:0!important;
                padding:5px 6px 9px!important;
                margin-bottom:5px!important;
                display:flex!important;
                align-items:center!important;
                gap:7px!important;
                text-transform:lowercase!important;
            }
            .agenda-date .weekday { font-size:12px!important;font-weight:700!important; }
            .agenda-date .date { font-size:17px!important;font-weight:850!important; }
            .agenda-today-badge {
                display:inline-flex!important;
                align-items:center!important;
                padding:4px 9px!important;
                margin-left:2px!important;
                border-radius:999px!important;
                background:#2563eb!important;
                color:#fff!important;
                -webkit-text-fill-color:#fff!important;
                font-size:10px!important;
                font-weight:800!important;
                text-transform:lowercase!important;
            }
            .agenda-day.today .agenda-date {
                background:rgba(37,99,235,.09)!important;
                border-radius:18px!important;
                padding-left:10px!important;
            }

            .calendar-item.final-day-item {
                display:block!important;
                width:100%!important;
                min-width:0!important;
                margin:0 0 8px!important;
                padding:14px 16px!important;
                border:0!important;
                border-radius:28px!important;
                background:var(--item-color)!important;
                box-shadow:0 4px 14px rgba(15,23,42,.09)!important;
                overflow:hidden!important;
            }
            .final-day-item-main { min-width:0!important;width:100%!important; }
            .final-day-item-title {
                display:block!important;
                width:100%!important;
                min-width:0!important;
                white-space:nowrap!important;
                overflow:hidden!important;
                text-overflow:ellipsis!important;
                font-size:15px!important;
                line-height:20px!important;
            }
            .final-day-item-meta {
                display:block!important;
                width:100%!important;
                margin-top:4px!important;
                white-space:nowrap!important;
                overflow:hidden!important;
                text-overflow:ellipsis!important;
                font-size:11px!important;
                line-height:15px!important;
            }

            .day-title {
                text-transform:lowercase!important;
                color:#111827!important;
                -webkit-text-fill-color:#111827!important;
            }

            @media(max-width:760px) {
                .calendar-title .calendar-month-title,
                #calendarTitle .calendar-month-title {
                    font-size:18px!important;
                    color:#111827!important;
                    -webkit-text-fill-color:#111827!important;
                    padding-right:2px!important;
                    padding-left:0!important;
                }
                .calendar-month-title::before {
                    margin-left:10px!important;
                }
                .calendar-title .calendar-month-title::after,
                #calendarTitle .calendar-month-title::after { content:none!important; }

                .agenda-calendar { display:grid!important;gap:12px!important; }
                .agenda-day { margin:0!important; }
                .agenda-card { border-radius:28px!important; }
                .agenda-card-title { font-size:14px!important; }
                .agenda-card-meta { font-size:11px!important; }
                .calendar-item.final-day-item { border-radius:28px!important; }
                .final-day-item-title { font-size:15px!important; }
            }
        `;
        document.head.appendChild(style);
    }

    function scan() {
        installNavigationPatch();
        installCalendarRenderPatch();
        installFinalStyles();
        if (isMobile() && window.state?.page === 'schedule') {
            const view = document.getElementById('schedule');
            if (view?.classList.contains('active') && window.state.calendar.view === 'month') {
                window.state.calendar.view = 'list';
                window.updateCalendarViewButtons?.();
                window.loadCalendar?.();
            }
        }
    }

    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList:true, subtree:true });
    setTimeout(scan, 0);
    setTimeout(scan, 100);
    setTimeout(scan, 500);
    setTimeout(scan, 1200);
})();
