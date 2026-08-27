from pathlib import Path
import re

APP = Path("app.html")
CALENDAR_LINK = '<link rel="stylesheet" href="calendar.css">'


def replace_function(text: str, name: str, replacement: str, next_name: str) -> str:
    pattern = rf"function {re.escape(name)}\s*\([^)]*\)\s*\{{.*?(?=function {re.escape(next_name)}\s*\()"
    new, count = re.subn(pattern, replacement.rstrip() + "\n\n", text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Could not replace {name} -> {next_name}")
    return new


def patch_calendar_functions(text: str) -> str:
    week = r'''function renderWeekCalendar(start) {
    const HOURS = Array.from({length: 17}, (_, i) => i + 7);
    let html = `
        <div class="calendar-scroll">
            <div class="week-calendar">
                <div class="time-column">
                    <div class="day-header" style="cursor:default"></div>
                    ${HOURS.map(hour => `<div class="time-label">${pad(hour)}:00</div>`).join("")}
                </div>`;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const date = new Date(start);
        date.setDate(start.getDate() + dayIndex);
        const items = itemsForDate(date);
        const isToday = dateKey(date) === dateKey(new Date());
        html += `
            <div class="day-column">
                <div class="day-header ${isToday ? "today" : ""}"
                     onclick="state.calendar.date=new Date('${dateKey(date)}T12:00:00');state.calendar.view='day';updateCalendarViewButtons();renderCalendar();">
                    <span class="day-number">${date.getDate()}</span>
                    <span class="day-name">${DAYS_SHORT[dayIndex]}</span>
                </div>`;
        HOURS.forEach(() => { html += `<div class="hour-line"></div>`; });

        items.forEach(item => {
            const dt = new Date(item.start_time);
            const end = new Date(item.end_time);
            const minutes = dt.getHours() * 60 + dt.getMinutes() - 7 * 60;
            const duration = Math.max(30, (end - dt) / 60000);
            const top = 42 + minutes * (30 / 60);
            const height = Math.max(22, duration * (30 / 60));
            const color = calendarColor(item);
            html += `
                <div class="calendar-event"
                     style="top:${top}px;height:${height}px;--item-color:${color};"
                     onclick="event.stopPropagation();openCalendarItem('${item.item_id}','${item.item_type}');">
                    <div class="calendar-event-title">${esc(item.item_type === "event" ? item.title : (item.student_name || item.title))}</div>
                    <div class="calendar-event-meta">${dt.toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"})}</div>
                </div>`;
        });
        html += `</div>`;
    }

    html += `</div></div>`;
    $("#calendar").innerHTML = html;
}
'''

    month = r'''function renderMonthCalendar(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
        const d = new Date(year, month, 1 - (firstWeekday - i));
        cells.push({date:d, other:true});
    }
    for (let day = 1; day <= daysInMonth; day++) cells.push({date:new Date(year, month, day), other:false});
    while (cells.length % 7) {
        const last = cells[cells.length - 1].date;
        const d = new Date(last); d.setDate(last.getDate() + 1);
        cells.push({date:d, other:true});
    }

    let html = `<div class="google-month-calendar">
        <div class="google-month-weekdays">${DAYS_SHORT.map(d => `<div>${d}</div>`).join("")}</div>
        <div class="google-month-grid">`;

    cells.forEach(cell => {
        const date = cell.date;
        const items = itemsForDate(date);
        const today = dateKey(date) === dateKey(new Date());
        const classes = `google-month-day ${cell.other ? "other-month" : ""} ${today ? "today" : ""}`;
        const dots = [...new Map(items.map(item => [calendarColor(item), item])).values()].slice(0, 5);
        const visible = items.slice(0, 3);

        html += `<div class="${classes}" onclick="state.calendar.date=new Date('${dateKey(date)}T12:00:00');state.calendar.view='day';updateCalendarViewButtons();renderCalendar();">
            <div class="google-month-number">${date.getDate()}</div>
            <div class="google-month-dots">${dots.map(item => `<span class="google-month-dot" style="background:${calendarColor(item)}"></span>`).join("")}</div>
            <div class="google-month-events">
                ${visible.map(item => {
                    const time = new Date(item.start_time).toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
                    const label = item.item_type === "event" ? item.title : (item.student_name || item.title);
                    return `<div class="google-month-event" style="--item-color:${calendarColor(item)}" onclick="event.stopPropagation();openCalendarItem('${item.item_id}','${item.item_type}');">${time} · ${esc(label)}</div>`;
                }).join("")}
                ${items.length > 3 ? `<div class="google-month-more">ещё ${items.length - 3}</div>` : ""}
            </div>
        </div>`;
    });

    html += `</div></div>`;
    $("#calendar").innerHTML = html;
}
'''

    list_view = r'''function renderListCalendar(start) {
    let html = "";
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const items = itemsForDate(date);
        const isToday = dateKey(date) === dateKey(new Date());
        html += `<details class="list-day" ${isToday ? "open" : ""}>
            <summary style="cursor:pointer;font-weight:800;padding:7px 2px;list-style:none;display:flex;align-items:center;justify-content:space-between;">
                <span>${date.toLocaleDateString("ru-RU", {weekday:"long",day:"numeric",month:"long"})}</span>
                <span style="font-size:11px;color:var(--muted)">${items.length}</span>
            </summary>
            <div style="margin-top:9px">
                ${items.length ? items.map(item => calendarItemHtml(item)).join("") : `<div class="small">Нет записей</div>`}
            </div>
        </details>`;
    }
    $("#calendar").innerHTML = `<div class="list-calendar">${html}</div>`;
}
'''

    day_view = r'''function renderDayCalendar(date) {
    const items = itemsForDate(date);
    $("#calendar").innerHTML = `
        <div class="day-calendar">
            <div class="day-title">${date.toLocaleDateString("ru-RU", {weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            ${items.length ? items.map(item => calendarItemHtml(item)).join("") : `<div class="empty">На этот день записей нет</div>`}
        </div>`;
}

function calendarColor(item) {
    const value = String(item?.color || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    return item?.item_type === "event" ? "#64748b" : item?.lesson_kind === "masterclass" ? "#d97706" : "#4f46e5";
}
'''

    item_html = r'''function calendarItemHtml(item) {
    const color = calendarColor(item);
    const title = item.item_type === "event" ? item.title : (item.student_name || item.title);
    const subtitle = item.item_type === "event" ? (item.location || "") : (item.lesson_kind === "masterclass" ? "Мастер-класс" : "Урок");
    return `
        <div class="calendar-item calendar-colored"
             style="--item-color:${color}"
             onclick="openCalendarItem('${item.item_id}','${item.item_type}')">
            <div>
                <b>${esc(title)}</b>
                <div class="small">${formatDateTime(item.start_time)}${subtitle ? ` · ${esc(subtitle)}` : ""}</div>
            </div>
        </div>`;
}
'''

    text = replace_function(text, "renderWeekCalendar", week, "renderMonthCalendar")
    text = replace_function(text, "renderMonthCalendar", month, "renderListCalendar")
    text = replace_function(text, "renderListCalendar", list_view, "renderDayCalendar")
    text = replace_function(text, "renderDayCalendar", day_view, "getVisibleLessonStatus")
    text = replace_function(text, "getVisibleLessonStatus", "function getVisibleLessonStatus(item) { return item.item_type === \"lesson\" && Date.now() >= new Date(item.end_time).getTime() ? \"Проведено\" : \"Запланировано\"; }", "calendarItemHtml")
    text = replace_function(text, "calendarItemHtml", item_html, "openCalendarItem")
    return text


def patch_calendar_controls(text: str) -> str:
    marker = "/* ITDETI_CALENDAR_CONTROLS_V2 */"
    if marker in text:
        return text

    controls = r'''/* ITDETI_CALENDAR_CONTROLS_V2 */
function calendarMonthLabel(date) {
    return date.toLocaleDateString("ru-RU", {month:"long", year:"numeric"});
}

function calendarRangeLabel() {
    const d = new Date(state.calendar.date);
    if (state.calendar.view === "month") return calendarMonthLabel(d);
    if (state.calendar.view === "day") {
        return d.toLocaleDateString("ru-RU", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
    }
    const start = startOfWeek(d);
    const end = endOfWeek(d);
    return `${start.toLocaleDateString("ru-RU", {day:"numeric", month:"long"})} — ${end.toLocaleDateString("ru-RU", {day:"numeric", month:"long", year:"numeric"})}`;
}

function calendarMove(direction) {
    const d = new Date(state.calendar.date);
    if (state.calendar.view === "month") {
        d.setDate(1);
        d.setMonth(d.getMonth() + direction);
    } else if (state.calendar.view === "day") {
        d.setDate(d.getDate() + direction);
    } else {
        d.setDate(d.getDate() + direction * 7);
    }
    state.calendar.date = d;
    loadCalendar();
}

function updateCalendarViewButtons() {
    document.querySelectorAll("[data-calendar-view]").forEach(button => {
        button.classList.toggle("active", button.dataset.calendarView === state.calendar.view);
    });
}

function calendarPickerDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const count = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let day = 1; day <= count; day++) cells.push(new Date(year, month, day));
    return cells;
}

function renderCalendarHeader() {
    const title = $("#calendarTitle");
    if (!title) return;
    title.innerHTML = `
        <div class="calendar-title-wrap">
            <button type="button" class="calendar-month-title" id="calendarMonthTitle">${calendarRangeLabel()}</button>
            <div class="calendar-month-picker" id="calendarMonthPicker" hidden></div>
        </div>`;
    const button = $("#calendarMonthTitle");
    if (button) button.onclick = event => {
        event.stopPropagation();
        const picker = $("#calendarMonthPicker");
        if (!picker.hidden) {
            picker.hidden = true;
            return;
        }
        renderCalendarMonthPicker();
        picker.hidden = false;
    };
}

function renderCalendarMonthPicker() {
    const picker = $("#calendarMonthPicker");
    if (!picker) return;
    const month = new Date(state.calendar.date);
    month.setDate(1);
    const cells = calendarPickerDays(month);
    const todayKey = dateKey(new Date());
    const monthTitle = calendarMonthLabel(month);
    picker.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <button type="button" class="icon-btn" id="calendarPickerPrev">‹</button>
            <b>${monthTitle}</b>
            <button type="button" class="icon-btn" id="calendarPickerNext">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:10px;color:var(--muted);text-align:center;margin-bottom:3px">
            ${DAYS_SHORT.map(day => `<div>${day}</div>`).join("")}
        </div>
        <div class="calendar-month-picker-grid">
            ${cells.map(date => date ? `<button type="button" class="${dateKey(date) === todayKey ? "today" : ""}" data-picker-date="${dateKey(date)}">${date.getDate()}</button>` : `<span></span>`).join("")}
        </div>
        <button type="button" class="btn" id="calendarPickerToday" style="width:100%;margin-top:8px">Сегодня</button>`;

    $("#calendarPickerPrev").onclick = () => {
        month.setMonth(month.getMonth() - 1);
        state.calendar.date = month;
        renderCalendarMonthPicker();
    };
    $("#calendarPickerNext").onclick = () => {
        month.setMonth(month.getMonth() + 1);
        state.calendar.date = month;
        renderCalendarMonthPicker();
    };
    $("#calendarPickerToday").onclick = () => {
        state.calendar.date = new Date();
        state.calendar.view = "day";
        updateCalendarViewButtons();
        loadCalendar();
    };
    picker.querySelectorAll("[data-picker-date]").forEach(button => {
        button.onclick = () => {
            state.calendar.date = new Date(`${button.dataset.pickerDate}T12:00:00`);
            state.calendar.view = "day";
            updateCalendarViewButtons();
            loadCalendar();
        };
    });
}

function bindCalendarControls() {
    $("#prevPeriod").onclick = () => calendarMove(-1);
    $("#nextPeriod").onclick = () => calendarMove(1);
    $("#todayPeriod").onclick = () => {
        state.calendar.date = new Date();
        loadCalendar();
    };
    document.querySelectorAll("[data-calendar-view]").forEach(button => {
        button.onclick = () => {
            state.calendar.view = button.dataset.calendarView;
            updateCalendarViewButtons();
            loadCalendar();
        };
    });
    document.addEventListener("click", event => {
        const title = $("#calendarTitle");
        if (title && !title.contains(event.target)) {
            const picker = $("#calendarMonthPicker");
            if (picker) picker.hidden = true;
        }
    });
    updateCalendarViewButtons();
}

'''
    text = text.replace('function renderCalendar() {', controls + 'function renderCalendar() {', 1)
    old_title = '''    $("#calendarTitle")
        .textContent =
        `${start.toLocaleDateString("ru-RU", {
            day:"numeric",
            month:"long"
        })} — ${end.toLocaleDateString("ru-RU", {
            day:"numeric",
            month:"long",
            year:"numeric"
        })}`;
'''
    if old_title in text:
        text = text.replace(old_title, '    renderCalendarHeader();\n', 1)
    text = text.replace('async function boot() {', 'bindCalendarControls();\n\nasync function boot() {', 1)
    return text


def patch_dashboard(text: str) -> str:
    start = text.index('$("#dashboardSchedule")')
    end = text.index('const alerts =', start)
    block = r'''$("#dashboardSchedule")
            .innerHTML =
            schedule.length
            ? schedule.map(
                item => `
                    <div
                        class="calendar-item dashboard-calendar-item"
                        style="--item-color:${calendarColor(item)}"
                        onclick="openCalendarItem('${item.item_id}','${item.item_type}')"
                    >
                        <div>
                            <b>${esc(item.title)}</b>
                            <div class="small">
                                ${formatDateTime(item.start_time)}
                                ${item.student_name ? ` · ${esc(item.student_name)}` : ""}
                            </div>
                        </div>
                    </div>`
            ).join("")
            : `<div class="empty">Сегодня ничего нет</div>`;


        '''
    return text[:start] + block + text[end:]


def patch_event_form(text: str) -> str:
    marker = '<div class="form-actions">'
    start = text.index('async function openEventEditor(')
    end = text.index('/* =========================================================\n   ADD LESSON', start)
    segment = text[start:end]
    if 'id=\\"eventColor\\"' not in segment:
        color_block = r'''
                <div class="form-group">
                    <label>Цвет</label>
                    <input id="eventColor" type="color" value="${item?.color || "#64748b"}" style="height:42px;padding:4px">
                </div>


                '''
        segment = segment.replace(marker, color_block + marker, 1)
        segment = segment.replace('                    notes:\n                        $("#eventNotes")\n                            .value\n                            .trim() ||\n                        null\n', '                    notes:\n                        $("#eventNotes")\n                            .value\n                            .trim() ||\n                        null,\n\n                    color:\n                        $("#eventColor")\n                            .value\n', 1)
    return text[:start] + segment + text[end:]


def patch_lesson_editor(text: str) -> str:
    start = text.index('async function openCalendarItem(')
    end = text.index('/* =========================================================\n   PERSONAL EVENT', start)
    segment = text[start:end]
    segment = re.sub(r'''\n\s*<div class="form-group">\s*<label>\s*Статус\s*</label>\s*<select\s+id="editStatus".*?</select>\s*</div>''', '', segment, count=1, flags=re.S)
    if 'id="editColor"' not in segment:
        color_block = r'''
                        <div class="form-group">
                            <label>Цвет</label>
                            <input id="editColor" type="color" value="${item.color || "#4f46e5"}" style="height:42px;padding:4px">
                        </div>
'''
        segment = segment.replace('                    <div class="form-group">\n\n                        <label>\n                            Тема', color_block + '\n                    <div class="form-group">\n\n                        <label>\n                            Тема', 1)
        segment = segment.replace('                                    status:\n                                        $("#editStatus")\n                                            .value,\n\n', '', 1)
        segment = segment.replace('                                    topic:\n                                        $("#editTopic")', '                                    color:\n                                        $("#editColor").value,\n\n                                    topic:\n                                        $("#editTopic")', 1)
    return text[:start] + segment + text[end:]


def patch_lesson_creator(text: str) -> str:
    start = text.index('function openLessonCreator()')
    end = text.index('/* =========================================================\n   FINANCE', start)
    segment = text[start:end]
    if 'id="newLessonColor"' not in segment:
        color_block = r'''
                <div class="form-group">
                    <label>Цвет урока</label>
                    <input id="newLessonColor" type="color" value="#4f46e5" style="height:42px;padding:4px">
                </div>

'''
        segment = segment.replace('                <div\n                    id="weeklySlots"', color_block + '                <div\n                    id="weeklySlots"', 1)
        segment = segment.replace('                                    lesson_kind:\n                                        kind,\n', '                                    lesson_kind:\n                                        kind,\n\n                                    color:\n                                        $("#newLessonColor").value,\n', 1)
    return text[:start] + segment + text[end:]


def patch_head(text: str) -> str:
    if CALENDAR_LINK in text:
        return text
    return text.replace('<link rel="stylesheet" href="mobile.css">', '<link rel="stylesheet" href="mobile.css">\n' + CALENDAR_LINK, 1)


def main():
    text = APP.read_text(encoding="utf-8")
    original = text
    text = patch_head(text)
    text = patch_calendar_functions(text)
    text = patch_calendar_controls(text)
    text = patch_dashboard(text)
    text = patch_event_form(text)
    text = patch_lesson_editor(text)
    text = patch_lesson_creator(text)
    if text != original:
        APP.write_text(text, encoding="utf-8")
        print("Calendar patch applied")
    else:
        print("Calendar patch already applied")


if __name__ == "__main__":
    main()