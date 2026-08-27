from pathlib import Path
import re

APP = Path("app.html")


AGENDA_FUNCTION = r'''function renderListCalendar(start) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        days.push(date);
    }

    let html = `<div class="agenda-calendar" id="agendaCalendar">`;

    days.forEach(date => {
        const items = itemsForDate(date);
        const isToday = dateKey(date) === dateKey(new Date());
        const weekday = date.toLocaleDateString("ru-RU", { weekday: "short" }).replace('.', '');
        const dateText = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace('.', '');

        html += `
            <section class="agenda-day ${isToday ? "today" : ""}" data-agenda-date="${dateKey(date)}">
                <div class="agenda-date ${isToday ? "today" : ""}">
                    <span class="weekday">${weekday}</span>
                    <span class="date">${dateText}</span>
                    ${isToday ? `<span class="agenda-today-badge">Сегодня</span>` : ""}
                </div>
                <div class="agenda-events">
                    ${items.length ? items.map(item => {
                        const startTime = new Date(item.start_time);
                        const endTime = new Date(item.end_time);
                        const time = startTime.toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"});
                        const end = endTime.toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"});
                        const title = item.item_type === "event" ? item.title : (item.student_name || item.title || "Занятие");
                        const meta = item.item_type === "event"
                            ? (item.location || item.event_type || "")
                            : (item.lesson_kind === "masterclass" ? "Мастер-класс" : (item.course || "Урок"));
                        const color = calendarColor(item);
                        return `
                            <div class="agenda-row" data-agenda-item="${esc(item.item_id)}">
                                <div class="agenda-time">
                                    <span>${time}</span>
                                </div>
                                <button type="button"
                                        class="agenda-card"
                                        style="--item-color:${color}"
                                        onclick="openCalendarItem('${item.item_id}','${item.item_type}')">
                                    <div class="agenda-card-title">${esc(title)}</div>
                                    <div class="agenda-card-meta">${esc(meta)}${meta ? " · " : ""}${time}–${end}</div>
                                </button>
                            </div>`;
                    }).join("") : `<div class="agenda-empty">Нет событий</div>`}
                </div>
            </section>`;
    });

    html += `</div>`;
    $("#calendar").innerHTML = html;

    // On mobile, open the agenda at today; if there is a current/future item,
    // scroll a little further so the first useful entry is immediately visible.
    const container = $("#agendaCalendar");
    const today = container?.querySelector(".agenda-day.today");
    if (today) {
        requestAnimationFrame(() => today.scrollIntoView({block: "start", behavior: "auto"}));
    }
}
'''


def main():
    text = APP.read_text(encoding="utf-8")
    pattern = r"function renderListCalendar\s*\([^)]*\)\s*\{.*?(?=function renderDayCalendar\s*\()"
    new_text, count = re.subn(pattern, AGENDA_FUNCTION.rstrip() + "\n\n", text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("Could not replace renderListCalendar -> renderDayCalendar")
    if new_text != text:
        APP.write_text(new_text, encoding="utf-8")
        print("Vertical Google-style agenda applied")
    else:
        print("Vertical agenda already applied")


if __name__ == "__main__":
    main()
