# -*- coding: utf-8 -*-
import openpyxl, re, unicodedata, datetime, json
from collections import defaultdict, Counter

ARQS = ['/Users/tiagocameli/Downloads/Lancamentos-2026-08-30.xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (1).xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (2).xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (3).xlsx']

# Centros do MC que viram a raiz "Manutencao/Documentacao de Equipamentos" no erp-emt.
# O mapeamento de 0.2 foi confirmado em 19/19 documentos na carga de agosto.
CENTROS_MANUT = {'000 - Manutenção Equipamentos EMT', '0.2 - Equipamentos EMT 2026',
                 '009.1 - Manutenção Equipamentos BR-364 (Lote 9)'}

def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^A-Za-z0-9]', '', s).upper()

def data_iso(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(v or '').strip())
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else None

docs = defaultdict(lambda: {'partes': [], 'desc': '', 'dt': None, 'centro': '', 'forn': ''})
for caminho in ARQS:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    dados = list(wb['Lançamentos'].values)
    cab = [str(c).strip() for c in dados[0]]
    for l in dados[1:]:
        d = dict(zip(cab, l))
        centro = str(d.get('Centro de Custo') or '').strip()
        if centro not in CENTROS_MANUT:
            continue
        idx = str(d.get('Índice') or '').strip()
        base = idx.split('.')[0] if idx else ''
        dt = data_iso(d.get('Competência'))
        try: val = round(float(d.get('Valor')), 2)
        except (TypeError, ValueError): continue
        k = (caminho, base)
        docs[k]['partes'].append((str(d.get('Etapa / Item') or '').strip(), val))
        docs[k]['desc'] = norm(d.get('Descrição'))
        docs[k]['dt'] = dt
        docs[k]['centro'] = centro
        docs[k]['forn'] = str(d.get('Pago a') or '').strip()
    wb.close()

saida = []
for k, v in docs.items():
    total = round(sum(x for _, x in v['partes']), 2)
    etapas = defaultdict(float)
    for e, x in v['partes']:
        etapas[e] += x
    saida.append({'dt': v['dt'], 'total': total, 'desc': v['desc'][:60], 'centro': v['centro'],
                  'etapas': sorted(((e, round(x, 2)) for e, x in etapas.items()), key=lambda t: -t[1])})

print('documentos da Manutencao:', len(saida))
print('com mais de uma etapa:', sum(1 for d in saida if len(d['etapas']) > 1))
c = Counter((d['dt'], d['total']) for d in saida)
print('(data,total) unicas: %d | ambiguas: %d' % (sum(1 for k, n in c.items() if n == 1),
                                                  sum(1 for k, n in c.items() if n > 1)))
meses = Counter((d['dt'] or '?')[:7] for d in saida)
print('por mes:', ' '.join('%s:%d' % (m, meses[m]) for m in sorted(meses)))

json.dump(saida, open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/mc_docs5.json', 'w'), ensure_ascii=False)
print('gravado mc_docs5.json')
