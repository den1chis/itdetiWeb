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
    # calendarItemHtml is immediately followed by the calendar item editor.
    # Never use document.querySelectorAll as a boundary here: doing so can
    # accidentally consume openCalendarItem and delete the editor function.
    text = replace_function(text, "calendarItemHtml", item_html, "openCalendarItem")
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
    # Remove the old visible status selector completely.
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