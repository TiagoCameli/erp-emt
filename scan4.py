import re, os, collections

ROOT = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo/src/modules/cadastros"
BASE = "/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/excluir-obras-centros-custo"

ACC = re.compile(r"[À-ÿ]")
STR = re.compile(r"""('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")|(`(?:[^`\\\n]|\\.)*`)""")
SKIPRE = re.compile(
    r"^@/|^\./|^\.\./|^use |^http"
    r"|\bpx-|\bpy-|\btext-|\bflex\b|\bgrid\b|\bgap-|\bmt-|\bmb-|rounded|border-|bg-|font-|w-\[|h-\[|shrink|tabular-nums|truncate|items-|justify-|space-|overflow-"
)
pt_hint = re.compile(r"(?i)(?<![0-9A-Za-zÀ-ÿ_])(de|da|do|para|com|em|no|na|os|as|um|uma|que|ou|sem|por|ao|nos|nas|dos|das|se|foi|ser|tem|pode|use|informe|selecione|nenhum|nenhuma|todos|todas|este|esta|esse|essa|ja|nao|mais|antes|depois|voce)(?![0-9A-Za-zÀ-ÿ_])")

vocab = collections.defaultdict(list)
for dirpath, dirs, files in os.walk(ROOT):
    for f in sorted(files):
        if not f.endswith((".ts", ".tsx")):
            continue
        p = os.path.join(dirpath, f)
        rel = os.path.relpath(p, BASE)
        src = open(p, encoding="utf-8").read()
        for i, raw in enumerate(src.split("\n"), 1):
            ls = raw.strip()
            if ls.startswith("//") or ls.startswith("*") or ls.startswith("/*"):
                continue
            texts = []
            for m in STR.finditer(raw):
                inner = m.group(0)[1:-1]
                if len(inner) < 5 or SKIPRE.search(inner):
                    continue
                texts.append(inner)
            for m in re.finditer(r">([^<>{}\n]{4,})<", raw):
                texts.append(m.group(1))
            for t in texts:
                # must look like prose: has a space and a pt stopword
                if " " not in t or not pt_hint.search(t):
                    continue
                for w in re.findall(r"[A-Za-zÀ-ÿ]{3,}", t):
                    if ACC.search(w):
                        continue
                    vocab[w.lower()].append("%s:%d" % (rel, i))

for w in sorted(vocab):
    locs = vocab[w]
    print("%-22s %3d  %s" % (w, len(locs), locs[0] if len(locs) > 3 else " ".join(locs)))
