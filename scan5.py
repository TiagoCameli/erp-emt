import re, os, collections

ROOT = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo/src/modules/cadastros"
BASE = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo"

ACC = re.compile(r"[À-ÿ]")
STR = re.compile(r"""('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")""")

vocab = collections.defaultdict(list)
for dirpath, dirs, files in os.walk(ROOT):
    for f in sorted(files):
        if not f.endswith((".ts", ".tsx")):
            continue
        if ".test." in f:
            continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, BASE)
        src = open(p, encoding="utf-8").read()
        for i, raw in enumerate(src.split("\n"), 1):
            ls = raw.strip()
            if ls.startswith("//") or ls.startswith("*") or ls.startswith("/*"):
                continue
            for m in STR.finditer(raw):
                inner = m.group(0)[1:-1].strip()
                if ACC.search(inner):
                    continue
                # single token only, letters, length 3..30
                if not re.fullmatch(r"[A-Za-z][A-Za-z]{2,29}", inner):
                    continue
                vocab[inner].append("%s:%d" % (rel, i))
            for m in re.finditer(r">([^<>{}\n]+)<", raw):
                t = m.group(1).strip()
                if not t or ACC.search(t):
                    continue
                if not re.fullmatch(r"[A-Za-z][A-Za-z]{2,29}", t):
                    continue
                vocab[t].append("%s:%d" % (rel, i))

for w in sorted(vocab, key=lambda s: s.lower()):
    locs = vocab[w]
    print("%-24s %3d  %s" % (w, len(locs), locs[0] if len(locs) > 2 else " ".join(locs)))
