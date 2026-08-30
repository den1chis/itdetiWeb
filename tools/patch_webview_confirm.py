from pathlib import Path
import re

APP = Path("app.html")
MARKER = "ITDETI_WEBVIEW_CONFIRM_V1"

CONFIRM_RUNTIME = r'''/* ITDETI_WEBVIEW_CONFIRM_V1 */
(function () {
    if (window.appConfirm) return;

    const style = document.createElement("style");
    style.textContent = `
        .itd-confirm-overlay {
            position:fixed; inset:0; z-index:99999;
            display:flex; align-items:center; justify-content:center;
            padding:18px; background:rgba(15,23,42,.48);
            backdrop-filter:blur(3px);
        }
        .itd-confirm-dialog {
            width:min(420px, 100%); background:#fff; color:#172033;
            border-radius:16px; box-shadow:0 20px 60px rgba(15,23,42,.25);
            padding:20px;
        }
        .itd-confirm-title { font-size:18px; font-weight:800; margin-bottom:8px; }
        .itd-confirm-message { color:#697386; font-size:14px; line-height:1.45; white-space:pre-wrap; }
        .itd-confirm-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
        .itd-confirm-actions button {
            border:1px solid #e6e8ee; background:#fff; color:#172033;
            border-radius:9px; padding:10px 14px; font-weight:700;
        }
        .itd-confirm-actions .danger { background:#b42318; border-color:#b42318; color:#fff; }
        @media(max-width:600px) {
            .itd-confirm-overlay { align-items:flex-end; padding:10px; }
            .itd-confirm-dialog { border-radius:18px; padding:18px; margin-bottom:env(safe-area-inset-bottom); }
            .itd-confirm-actions button { min-height:44px; flex:1; }
        }
    `;
    document.head.appendChild(style);

    window.appConfirm = function (message, title = "Подтверждение", danger = true) {
        return new Promise(resolve => {
            const old = document.querySelector(".itd-confirm-overlay");
            if (old) old.remove();
            const overlay = document.createElement("div");
            overlay.className = "itd-confirm-overlay";
            overlay.innerHTML = `
                <div class="itd-confirm-dialog" role="dialog" aria-modal="true">
                    <div class="itd-confirm-title"></div>
                    <div class="itd-confirm-message"></div>
                    <div class="itd-confirm-actions">
                        <button type="button" class="cancel">Отмена</button>
                        <button type="button" class="${danger ? "danger" : ""}">Подтвердить</button>
                    </div>
                </div>`;
            overlay.querySelector(".itd-confirm-title").textContent = title;
            overlay.querySelector(".itd-confirm-message").textContent = message;
            document.body.appendChild(overlay);

            let done = false;
            const finish = value => {
                if (done) return;
                done = true;
                overlay.remove();
                resolve(value);
            };
            overlay.querySelector(".cancel").onclick = () => finish(false);
            overlay.querySelector(".danger").onclick = () => finish(true);
            if (!danger) overlay.querySelector(".itd-confirm-actions button:last-child").onclick = () => finish(true);
            overlay.addEventListener("click", e => { if (e.target === overlay) finish(false); });
            const onKey = e => {
                if (e.key === "Escape") finish(false);
                if (e.key === "Enter") finish(true);
            };
            document.addEventListener("keydown", onKey, {once:true});
            setTimeout(() => overlay.querySelector(".cancel").focus(), 0);
        });
    };
})();
'''


def function_ranges(text):
    """Return (start, end, prefix_start) for ordinary JS function declarations.
    This deliberately handles the app's simple function declarations without trying to be a JS parser.
    """
    rx = re.compile(r"(?m)^(?P<indent>\s*)(?P<async>async\s+)?function\s+(?P<name>[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{")
    matches = list(rx.finditer(text))
    out = []
    for i, m in enumerate(matches):
        body_start = m.end()
        next_start = matches[i+1].start() if i+1 < len(matches) else len(text)
        # Function bodies in this project do not contain top-level function declarations in the middle.
        # Find the matching closing brace from the declaration using brace counting while respecting strings.
        depth = 1
        j = body_start
        quote = None
        escape = False
        while j < len(text) and j < next_start:
            ch = text[j]
            if quote:
                if escape: escape = False
                elif ch == "\\": escape = True
                elif ch == quote: quote = None
            else:
                if ch in "'\"`": quote = ch
                elif ch == "{": depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        out.append((m.start(), j + 1, m))
                        break
            j += 1
    return out


def main():
    text = APP.read_text(encoding="utf-8")
    if MARKER not in text:
        marker = "<script>"
        pos = text.find(marker)
        if pos < 0:
            raise RuntimeError("Could not find script tag")
        text = text[:pos + len(marker)] + "\n" + CONFIRM_RUNTIME + text[pos + len(marker):]

    # Convert every function declaration that contains a native confirm call to async,
    # then await the WebView-safe dialog. Calls inside callbacks/arrow functions are
    # handled by the surrounding named function in this app.
    replacements = []
    for start, end, m in function_ranges(text):
        body = text[m.end():end]
        if re.search(r"\b(?:window\.)?confirm\s*\(", body):
            if not m.group("async"):
                replacements.append((m.start(), m.end(), text[m.start():m.end()].replace("function ", "async function ", 1)))

    for a, b, value in reversed(replacements):
        text = text[:a] + value + text[b:]

    text = re.sub(r"\bwindow\.confirm\s*\(", "await appConfirm(", text)
    text = re.sub(r"(?<![\w.])confirm\s*\(", "await appConfirm(", text)

    APP.write_text(text, encoding="utf-8")
    print(f"WebView confirm patch applied; async functions changed: {len(replacements)}")


if __name__ == "__main__":
    main()
