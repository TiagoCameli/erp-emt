# -*- coding: utf-8 -*-
"""Confere contra o Mais Controle cada lancamento que eu dividi por palpite hoje.

O palpite foi meio a meio / partes iguais. O MC tem o rateio real. Se os dois
discordarem, quem manda e o MC.
"""
import openpyxl, re, datetime
from collections import defaultdict

ARQS = ['/Users/tiagocameli/Downloads/Lancamentos-2026-08-30.xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (1).xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (2).xlsx',
        '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (3).xlsx']

# (data_compra, valor TOTAL do lancamento no erp) -> numero
ALVOS = {
    ('2026-04-10', 160.00): 'LAN-2026-4929',
    ('2026-04-22', 163.50): 'LAN-2026-3215',
    ('2026-04-30', 1902.00): 'LAN-2026-4849',
    ('2026-06-10', 567.00): 'LAN-2026-1997',
    ('2026-04-08', 4000.00): 'LAN-2026-2492',
    ('2026-07-11', 2300.00): 'LAN-2026-4949',
    ('2025-07-23', 1000.00): 'LAN-2026-3501',
    ('2026-05-28', 150.00): 'LAN-2026-2549',
    ('2026-05-08', 8500.00): 'LAN-2026-4560',
    ('2026-04-25', 4205.92): 'LAN-2026-1925',
}


def data_iso(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(v or '').strip())
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else None


docs = defaultdict(lambda: {'partes': [], 'desc': '', 'dt': None})
for caminho in ARQS:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    dados = list(wb['Lançamentos'].values)
    cab = [str(c).strip() for c in dados[0]]
    for l in dados[1:]:
        d = dict(zip(cab, l))
        idx = str(d.get('Índice') or '').strip()
        base = idx.split('.')[0] if idx else ''
        try:
            val = round(float(d.get('Valor')), 2)
        except (TypeError, ValueError):
            continue
        k = (caminho, base)
        docs[k]['partes'].append((str(d.get('Centro de Custo') or '').strip(),
                                  str(d.get('Etapa / Item') or '').strip(), val))
        docs[k]['desc'] = str(d.get('Descrição') or '')
        docs[k]['dt'] = data_iso(d.get('Competência'))

    wb.close()

achados = defaultdict(set)
for v in docs.values():
    total = round(sum(x for _, _, x in v['partes']), 2)
    num = ALVOS.get((v['dt'], total))
    if not num:
        continue
    achados[num].add(tuple(sorted(v['partes'])))

for (dt, val), num in sorted(ALVOS.items(), key=lambda t: t[1]):
    versoes = achados.get(num)
    if not versoes:
        print('%s  %s  R$ %8.2f  -> o MC nao tem esse par data+valor' % (num, dt, val))
        continue
    if len(versoes) > 1:
        print('%s  %s  R$ %8.2f  -> AMBIGUO: %d documentos diferentes batem' % (num, dt, val, len(versoes)))
    for partes in versoes:
        print('%s  %s  R$ %8.2f' % (num, dt, val))
        agrupado = defaultdict(float)
        for cc, et, x in partes:
            agrupado[(cc, et)] += x
        for (cc, et), x in sorted(agrupado.items(), key=lambda t: -t[1]):
            print('    R$ %8.2f  %-34s | %s' % (x, cc[:34], et[:46]))
    print()
