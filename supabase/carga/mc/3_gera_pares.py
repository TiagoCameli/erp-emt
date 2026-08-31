# -*- coding: utf-8 -*-
import json
from collections import Counter

docs = json.load(open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/mc_resolvido.json'))
uma = [d for d in docs if len(d['destinos']) == 1]

# uma chave (dt,total) so pode ter UM destino, senao e ambigua e fica de fora
por = {}
conflito = set()
for d in uma:
    k = (d['dt'], round(d['total'], 2))
    alvo = d['destinos'][0]
    if k in por and por[k] != alvo:
        conflito.add(k)
    por[k] = alvo
for k in conflito:
    por.pop(k, None)
print('documentos com destino unico:', len(uma))
print('chaves (data,valor) usaveis:', len(por), '| descartadas por conflito:', len(conflito))

destinos = sorted(set(por.values()))
idx = {d: i + 1 for i, d in enumerate(destinos)}
print('destinos distintos:', len(destinos))

def esc(s): return "'" + str(s).replace("'", "''") + "'"

legenda = ',\n'.join('(%d,%s)' % (i, esc(d)) for d, i in sorted(idx.items(), key=lambda kv: kv[1]))
pares = ','.join("('%s',%.2f,%d)" % (k[0], k[1], idx[v]) for k, v in sorted(por.items()))

open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/legenda.sql','w').write(legenda)
open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/pares.sql','w').write(pares)
print('legenda:', len(legenda), 'chars | pares:', len(pares), 'chars')
print('\ndestinos:')
for d, i in sorted(idx.items(), key=lambda kv: kv[1]):
    print('  %2d  %s' % (i, d))
