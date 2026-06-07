import json, sys, time, io

FN = r"C:\Users\AlexClarkEpsis\.claude\projects\C--Development\02ec9b43-dc48-4009-a9d4-34c8fe503cc4.jsonl"
BASELINE_ASK = 2  # questions already seen and reported

out = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

def load():
    ds = []
    try:
        data = open(FN, encoding="utf-8", errors="replace").read().splitlines()
    except Exception as e:
        return None
    for l in data:
        l = l.strip()
        if not l:
            continue
        try:
            ds.append(json.loads(l))
        except Exception:
            pass
    return ds

def asks(ds):
    res = []
    for d in ds:
        m = d.get("message")
        if not isinstance(m, dict):
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "AskUserQuestion":
                res.append(b.get("input", {}))
    return res

def last_text(ds):
    t = ""
    for d in ds:
        m = d.get("message")
        if not isinstance(m, dict) or m.get("role") != "assistant":
            continue
        c = m.get("content")
        if not isinstance(c, list):
            continue
        for b in c:
            if isinstance(b, dict) and b.get("type") == "text" and b.get("text", "").strip():
                t = b["text"]
    return t

MAX_ITERS = 110          # ~ 110 * 25s ≈ 46 min, then exit to re-sync
for i in range(MAX_ITERS):
    ds = load()
    if ds is None:
        out.write("WATCH: transcript unreadable\n"); out.flush(); break
    a = asks(ds)
    if len(a) > BASELINE_ASK:
        out.write("WATCH: NEW_QUESTION (total now %d)\n" % len(a))
        for inp in a[BASELINE_ASK:]:
            for q in inp.get("questions", []):
                out.write("Q: " + str(q.get("question")) + "\n")
                for o in q.get("options", []):
                    out.write("  - " + str(o.get("label")) + ": " + str(o.get("description", "")) + "\n")
                out.write("\n")
        out.flush()
        break
    time.sleep(25)
else:
    out.write("WATCH: no new question after timeout; last activity:\n")
    out.write(last_text(load())[:300] + "\n")
    out.flush()
