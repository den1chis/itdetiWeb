from pathlib import Path

APP = Path("app.html")
MARKER = "/* ITDETI_SCHEDULE_EVENT_DEFAULTS_V1 */"

SCRIPT = r'''/* ITDETI_SCHEDULE_EVENT_DEFAULTS_V1 */
(function installScheduleEventDefaults() {
    if (window.__itdetiScheduleEventDefaultsInstalled) return;
    window.__itdetiScheduleEventDefaultsInstalled = true;

    function visible(el) {
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && el.offsetParent !== null;
    }

    function isMasterclassPayload(payload) {
        const kind = String(payload?.lesson_kind || payload?.lessonKind || "").toLowerCase();
        return kind === "masterclass" || kind.includes("master");
    }

    function plusHour(value) {
        if (!value) return value;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        return d.toISOString();
    }

    function normalizeDateTimePayload(payload) {
        if (!payload || typeof payload !== "object") return payload;

        // Master-class created from the student's schedule is a ONE-TIME lesson.
        // Keep the existing schedule API, but constrain its validity to the selected date.
        if (isMasterclassPayload(payload) && payload.valid_from) {
            payload.valid_until = payload.valid_from;
            if ("frequency" in payload) payload.frequency = 1;
            if ("times_per_week" in payload) payload.times_per_week = 1;
            if ("weeks" in payload) payload.weeks = 1;
        }

        // Event duration defaults to one hour when an end was not explicitly supplied.
        if (payload.start_time && (!payload.end_time || payload.end_time === payload.start_time)) {
            const start = new Date(payload.start_time);
            if (!Number.isNaN(start.getTime())) {
                payload.end_time = new Date(start.getTime() + 60 * 60 * 1000).toISOString();
            }
        }
        return payload;
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
        try {
            const url = typeof input === "string" ? input : (input?.url || "");
            const method = String(init?.method || input?.method || "GET").toUpperCase();
            if (method === "POST" && init?.body && typeof init.body === "string") {
                const contentType = String(init?.headers?.["Content-Type"] || init?.headers?.["content-type"] || "application/json");
                if (contentType.includes("application/json")) {
                    const body = JSON.parse(init.body);
                    const normalized = normalizeDateTimePayload(body);
                    if (url.includes("/schedule") || url.includes("/events")) {
                        init = {...init, body: JSON.stringify(normalized)};
                    }
                }
            }
        } catch (_) {
            // Never break the original request because of this UI compatibility layer.
        }
        return nativeFetch(input, init);
    };

    function removeDuplicateColorControls(root) {
        if (!root) return;
        const candidates = Array.from(root.querySelectorAll('input[type="color"]')).filter(visible);
        if (candidates.length > 1) {
            candidates.slice(1).forEach(input => {
                const group = input.closest(".form-group, .form-row, .field, .form-item") || input.parentElement;
                if (group && group !== root) group.remove(); else input.remove();
            });
        }

        // Also handle duplicated custom "Цвет" blocks that do not use <input type=color>.
        const labels = Array.from(root.querySelectorAll("label"))
            .filter(label => label.textContent.trim().toLowerCase() === "цвет" && visible(label));
        if (labels.length > 1) {
            labels.slice(1).forEach(label => {
                const group = label.closest(".form-group, .form-row, .field, .form-item") || label.parentElement;
                if (group && group !== root) group.remove();
            });
        }
    }

    function updateMasterclassFields(root) {
        if (!root) return;
        const selects = Array.from(root.querySelectorAll("select"));
        const master = selects.find(select => {
            const option = select.options?.[select.selectedIndex];
            return option && /мастер[- ]?класс/i.test(option.textContent || "");
        });
        if (!master) return;

        const frequencyWords = /раз.*недел|недел.*раз|частот|колич.*раз|frequency|times.?per.?week/i;
        Array.from(root.querySelectorAll("label, span, div")).forEach(label => {
            if (!frequencyWords.test(label.textContent || "")) return;
            const group = label.closest(".form-group, .form-row, .field, .form-item") || label.parentElement;
            if (!group || group === root) return;
            const controls = group.querySelectorAll("input, select");
            if (!controls.length) return;
            group.style.display = "none";
            controls.forEach(control => {
                control.value = "1";
                control.disabled = true;
            });
        });
    }

    function scan() {
        const modals = Array.from(document.querySelectorAll('[role="dialog"], .modal, .modal-overlay, .dialog'))
            .filter(visible);
        modals.forEach(modal => {
            removeDuplicateColorControls(modal);
            updateMasterclassFields(modal);
        });
    }

    new MutationObserver(scan).observe(document.body, {childList:true, subtree:true});
    document.addEventListener("change", scan, true);
    setTimeout(scan, 0);
    setTimeout(scan, 300);
    setTimeout(scan, 1000);
})();
'''


def main():
    text = APP.read_text(encoding="utf-8")
    if MARKER in text:
        return
    pos = text.lower().rfind("</body>")
    if pos < 0:
        raise RuntimeError("Could not find </body> in app.html")
    injection = "\n<script>\n" + SCRIPT + "\n</script>\n"
    APP.write_text(text[:pos] + injection + text[pos:], encoding="utf-8")
    print("Schedule/event defaults patch applied")


if __name__ == "__main__":
    main()
