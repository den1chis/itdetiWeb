from pathlib import Path
import re

APP = Path("app.html")
MARK = "ITDETI_FRONTEND_FINAL_V1"


def remove_marked_script(text: str, marker: str) -> str:
    pattern = re.compile(
        r'\n?<script>\s*' + re.escape(marker) + r'.*?</script>\s*',
        re.S,
    )
    return pattern.sub("\n", text)


def remove_crud_v2_duplicate(text: str) -> str:
    marker = "/* ITDETI_CRUD_NOTIFICATIONS_V2 */"
    start = text.find(marker)
    if start < 0:
        return text
    script_start = text.rfind("<script>", 0, start)
    end_marker = "/* ITDETI_WEBVIEW_CONFIRM_V1 */"
    end = text.find(end_marker, start)
    if script_start < 0 or end < 0:
        raise RuntimeError("Cannot locate CRUD V2 duplicate block")
    # Preserve the real helper functions that follow the duplicate IIFE.
    helpers = text[start:end]
    helper_start = helpers.find("async function cleanupStudentBeforeDelete")
    if helper_start < 0:
        raise RuntimeError("CRUD helper functions missing")
    helpers = helpers[helper_start:]
    return text[:script_start] + "<script>\n" + helpers + "\n" + text[end:]


def remove_duplicate_event_colors(text: str) -> str:
    marker = "ITDETI_EVENT_COLOR_DEDUP_V1"
    # Remove the empty marker script; the actual form is cleaned below.
    text = re.sub(r'\n?<script>\s*/\*\s*' + re.escape(marker) + r'\s*\*/\s*</script>\s*', '\n', text)

    block = re.compile(
        r'\s*<div\s+class="form-group"\s*>\s*'
        r'<label>\s*Цвет\s*</label>\s*'
        r'<input\s+id="eventColor"\s+type="color"[^>]*>\s*'
        r'</div>', re.S | re.I)

    # Only touch the event editor function, not lesson color controls.
    m = re.search(r'async function openEventEditor\s*\([^)]*\)\s*\{', text)
    if not m:
        raise RuntimeError("openEventEditor not found")
    depth = 1
    i = m.end()
    quote = None
    esc = False
    while i < len(text):
        c = text[i]
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
        else:
            if c in "'\"`":
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
        i += 1
    fn = text[m.start():i + 1]
    matches = list(block.finditer(fn))
    if len(matches) > 1:
        first = matches[0].group(0)
        fn = block.sub("", fn)
        actions = re.search(r'\s*<div\s+class="form-actions"', fn, re.I)
        if not actions:
            raise RuntimeError("event form actions missing")
        fn = fn[:actions.start()] + "\n\n                " + first.strip() + "\n\n" + fn[actions.start():]
        text = text[:m.start()] + fn + text[i + 1:]
    return text


def remove_old_masterclass_from_creator(text: str) -> str:
    m = re.search(r'function openLessonCreator\s*\([^)]*\)\s*\{', text)
    if not m:
        raise RuntimeError("openLessonCreator not found")
    depth = 1
    i = m.end()
    quote = None
    esc = False
    while i < len(text):
        c = text[i]
        if quote:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == quote: quote = None
        else:
            if c in "'\"`": quote = c
            elif c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0: break
        i += 1
    fn = text[m.start():i + 1]
    fn2 = re.sub(
        r'\s*<option\s+value="masterclass"\s*>\s*Мастер-класс\s*</option>\s*',
        '\n', fn, flags=re.S | re.I,
    )
    return text[:m.start()] + fn2 + text[i + 1:]


def remove_runtime_default_patches(text: str) -> str:
    for marker in [
        "/* ITDETI_SCHEDULE_EVENT_DEFAULTS_V1 */",
        "/* ITDETI_EVENT_DEFAULTS_V2 */",
        "/* ITDETI_EVENT_DEFAULTS_V3 */",
    ]:
        # Each marker is inside a script at the end of app.html. Remove its whole script.
        pos = text.find(marker)
        while pos >= 0:
            start = text.rfind("<script>", 0, pos)
            end = text.find("</script>", pos)
            if start < 0 or end < 0:
                raise RuntimeError(f"Cannot remove runtime patch {marker}")
            text = text[:start] + text[end + len("</script>"):]
            pos = text.find(marker)
    return text


def add_direct_event_defaults(text: str) -> str:
    marker = "ITDETI_EVENT_FORM_DIRECT_DEFAULTS_V1"
    if marker in text:
        return text
    helper = '''\n\n/* ITDETI_EVENT_FORM_DIRECT_DEFAULTS_V1 */\nfunction defaultEventStartValue() {\n    const d = new Date();\n    d.setMinutes(0, 0, 0);\n    d.setHours(d.getHours() + 1);\n    return toLocalInput(d.toISOString());\n}\n\nfunction defaultEventEndValue(item) {\n    if (item?.end_time) return toLocalInput(item.end_time);\n    const start = item?.start_time ? new Date(item.start_time) : new Date();\n    if (!item?.start_time) {\n        start.setMinutes(0, 0, 0);\n        start.setHours(start.getHours() + 1);\n    }\n    return toLocalInput(new Date(start.getTime() + 60 * 60 * 1000).toISOString());\n}\n'''
    pos = text.find('async function openEventEditor')
    if pos < 0:
        raise RuntimeError("openEventEditor not found for defaults")
    text = text[:pos] + helper + "\n" + text[pos:]
    # Exact current template expressions.
    old_start = '''value="${\n                                toLocalInput(\n                                    item?.start_time\n                                )\n                            }"'''
    new_start = '''value="${item?.start_time ? toLocalInput(item.start_time) : defaultEventStartValue()}"'''
    if old_start not in text:
        raise RuntimeError("event start template marker missing")
    text = text.replace(old_start, new_start, 1)
    old_end = '''value="${\n                                toLocalInput(\n                                    item?.end_time\n                                )\n                            }"'''
    new_end = '''value="${defaultEventEndValue(item)}"'''
    if old_end not in text:
        raise RuntimeError("event end template marker missing")
    text = text.replace(old_end, new_end, 1)
    # When the user changes start, move the end only if it still equals the old default.
    needle = '''    $("#saveEvent")\n        .onclick ='''
    inject = '''    const eventStartInput = $("#eventStart");\n    const eventEndInput = $("#eventEnd");\n    if (eventStartInput && eventEndInput) {\n        eventStartInput.addEventListener("change", () => {\n            if (!eventEndInput.dataset.userChanged) {\n                const d = new Date(eventStartInput.value);\n                if (!Number.isNaN(d.getTime())) {\n                    eventEndInput.value = toLocalInput(new Date(d.getTime() + 60 * 60 * 1000).toISOString());\n                }\n            }\n        });\n        eventEndInput.addEventListener("change", () => { eventEndInput.dataset.userChanged = "1"; });\n    }\n\n    $("#saveEvent")\n        .onclick ='''
    if needle not in text:
        raise RuntimeError("saveEvent marker missing")
    text = text.replace(needle, inject, 1)
    return text


def main():
    text = APP.read_text(encoding="utf-8")
    if MARK in text:
        print("Frontend already finalized")
        return
    text = remove_runtime_default_patches(text)
    text = remove_crud_v2_duplicate(text)
    text = remove_duplicate_event_colors(text)
    text = remove_old_masterclass_from_creator(text)
    text = add_direct_event_defaults(text)
    pos = text.lower().rfind("</body>")
    if pos < 0:
        raise RuntimeError("missing </body>")
    text = text[:pos] + f'\n<script>/* {MARK} */</script>\n' + text[pos:]
    APP.write_text(text, encoding="utf-8")
    print("Frontend finalized")


if __name__ == "__main__":
    main()
