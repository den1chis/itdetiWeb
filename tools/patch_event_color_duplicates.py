from pathlib import Path
import re

APP = Path("app.html")
MARK = "ITDETI_EVENT_COLOR_DEDUP_V1"


def function_span(text, name):
    m = re.search(rf'(?m)^(?P<prefix>\s*)(?P<async>async\s+)?function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{', text)
    if not m:
        raise RuntimeError(f"missing {name}")
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
                if depth == 0: return m.start(), i + 1
        i += 1
    raise RuntimeError(f"unclosed {name}")


def dedupe_color_blocks(text):
    a, b = function_span(text, "openEventEditor")
    fn = text[a:b]
    pattern = re.compile(
        r'''\s*<div\s+class="form-group"\s*>\s*<label>\s*Цвет\s*</label>\s*<input\s+id="eventColor"\s+type="color"[^>]*>\s*</div>''',
        re.S | re.I,
    )
    matches = list(pattern.finditer(fn))
    if len(matches) <= 1:
        return text
    first = matches[0].group(0)
    # Replace all duplicate blocks with a single canonical block.
    fn2 = pattern.sub("", fn)
    marker = re.search(r'\s*<div\s+class="form-actions"', fn2, re.I)
    if not marker:
        raise RuntimeError("event form actions marker missing")
    block = '\n\n                <div class="form-group">\n                    <label>Цвет</label>\n                    <input id="eventColor" type="color" value="${item?.color || "#64748b"}" style="height:42px;padding:4px">\n                </div>\n\n'
    fn2 = fn2[:marker.start()] + block + fn2[marker.start():]
    return text[:a] + fn2 + text[b:]


def main():
    text = APP.read_text(encoding="utf-8")
    if MARK in text:
        print("Event color dedupe already applied")
        return
    text = dedupe_color_blocks(text)
    pos = text.lower().rfind("</body>")
    if pos < 0: raise RuntimeError("missing </body>")
    text = text[:pos] + f'\n<script>/* {MARK} */</script>\n' + text[pos:]
    APP.write_text(text, encoding="utf-8")
    print("Event color duplicates removed")

if __name__ == "__main__": main()
