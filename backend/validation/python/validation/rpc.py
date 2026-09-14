from __future__ import annotations
import json, sys, traceback
from .cli import handle

if sys.platform == "win32":
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def main() -> None:
    for line in sys.stdin:
        try:
            req = json.loads(line)
            out = handle(req["command"], req.get("payload") or {})
            resp = {"id": req["id"], "ok": True, "result": out}
        except Exception as exc:
            resp = {
                "id": req.get("id") if "req" in locals() else None,
                "ok": False,
                "error": str(exc),
                "trace": traceback.format_exc(limit=3),
            }
        sys.stdout.write(json.dumps(resp, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
