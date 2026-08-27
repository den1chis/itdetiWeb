import re
import sys
import traceback
from pathlib import Path

# When this file is executed as `python3 tools/run_calendar_patch.py`, Python puts
# the `tools` directory (not the repository root) on sys.path. Add the root so
# `from tools import patch_calendar` works in GitHub Actions as well as locally.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools import patch_calendar


def replace_function(text: str, name: str, replacement: str, next_name: str) -> str:
    if next_name == "document.querySelectorAll":
        pattern = rf"function {re.escape(name)}\s*\([^)]*\)\s*\{{.*?(?=document\.querySelectorAll\s*\()"
    else:
        pattern = rf"function {re.escape(name)}\s*\([^)]*\)\s*\{{.*?(?=function {re.escape(next_name)}\s*\()"
    new, count = re.subn(pattern, replacement.rstrip() + "\n\n", text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Could not replace {name} -> {next_name}")
    return new


patch_calendar.replace_function = replace_function

try:
    patch_calendar.main()
except Exception:
    Path = __import__("pathlib").Path
    Path("patch-error.txt").write_text(traceback.format_exc(), encoding="utf-8")
    print(traceback.format_exc())
    raise
