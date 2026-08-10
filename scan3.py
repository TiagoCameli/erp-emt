import re, os

ROOT = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo/src/modules/cadastros"
BASE = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo"

ACC = re.compile(r"[À-ÿ]")
STR = re.compile(r"""('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")""")
# skip obvious non-prose
SKIPRE = re.compile(
    r"^@/|^\./|^\.\./|^use |^http"
    r"|[{}<>|]"
    r"|\bpx-|\bpy-|\btext-|\bflex\b|\bgrid\b|\bgap-|\bmt-|\bmb-|rounded|border|bg-|font-|w-\[|h-\[|shrink|tabular-nums|truncate|items-|justify-"
)

pt_hint = re.compile(r"(?i)\b(de|da|do|para|com|em|no|na|os|as|um|uma|que|ou|e|sem|por|ao|nos|nas|dos|das|se|foi|ser|tem|pode|use|informe|selecione|nenhum|nenhuma|todos|todas)\b")

rows = []
for dirpath, dirs, files in os.walk(ROOT):
    for f in sorted(files):
        if not f.endswith((".ts", ".tsx")):
            continue
        if f.endswith(".test.ts") or f.endswith(".test.tsx"):
            continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, BASE)
        src = open(p, encoding="utf-8").read()
        lines = src.split("\n")
        # strip block comments and line comments crudely, per line
        for i, raw in enumerate(lines, 1):
            l = raw
            ls = l.strip()
            if ls.startswith("//") or ls.startswith("*") or ls.startswith("/*"):
                continue
            for m in STR.finditer(l):
                inner = m.group(0)[1:-1]
                if len(inner) < 6:
                    continue
                if ACC.search(inner):
                    continue
                if SKIPRE.search(inner):
                    continue
                if " " not in inner:
                    continue
                if not pt_hint.search(inner):
                    continue
                rows.append((rel, i, inner, ls[:160]))
            # JSX text nodes
            for m in re.finditer(r">([^<>{}\n]{6,})<", l):
                t = m.group(1).strip()
                if not t or ACC.search(t) or " " not in t:
                    continue
                if not pt_hint.search(t):
                    continue
                rows.append((rel, i, "JSX:" + t, ls[:160]))

print("candidates:", len(rows))
for r in rows:
    print("%s:%d  >>%s<<   | %s" % (r[0], r[1], r[2], r[3]))
