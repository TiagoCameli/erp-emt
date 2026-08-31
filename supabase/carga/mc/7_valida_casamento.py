# -*- coding: utf-8 -*-
"""Valida os casamentos do fundo.py e levanta o mapa de etapas do MC.

Tres provas que o fundo.py nao fazia:
  1. sobreposicao de texto entre a descricao do ERP e a do MC (falso positivo
     por coincidencia de data+valor tem sobreposicao zero);
  2. nenhum documento do MC pode ser reivindicado por DOIS lancamentos do ERP;
  3. o total do documento do MC tem que fechar com o valor do lancamento.
"""
import openpyxl, re, datetime, io, unicodedata
from collections import defaultdict, Counter

EXPORTS = ['/Users/tiagocameli/Downloads/Lancamentos-2026-08-30.xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (1).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (2).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (3).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-31 (1).xlsx']
ERP = '/Users/tiagocameli/.claude/jobs/87cb0088/tmp/erp_raiz.txt'
CENTROS_MANUT = {'000 - Manutenção Equipamentos EMT', '0.2 - Equipamentos EMT 2026',
                 '009.1 - Manutenção Equipamentos BR-364 (Lote 9)'}
PARADAS = {'REFERENTE', 'PARA', 'PAGAMENTO', 'COMPRA', 'PECAS', 'PEÇAS', 'MANUTENCAO',
           'MANUTENÇÃO', 'EQUIPAMENTOS', 'EQUIPAMENTO', 'DOS', 'DAS', 'MES', 'MÊS'}


def sem_acento(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def fichas(s):
    """Palavras significativas: >3 letras, fora da lista de paradas, mais numeros."""
    t = re.sub(r'[^A-Z0-9]+', ' ', sem_acento(s).upper())
    saida = set()
    for p in t.split():
        if p in PARADAS:
            continue
        if len(p) > 3 or p.isdigit():
            saida.add(p)
    return saida


def data_iso(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(v or '').strip())
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else None


def dias(a, b):
    if not (a and b):
        return 9999
    fa = datetime.date(*map(int, a.split('-')))
    fb = datetime.date(*map(int, b.split('-')))
    return abs((fa - fb).days)


# ---------------------------------------------------------------- MC
brutos = defaultdict(lambda: {'partes': [], 'dt': None, 'desc': '', 'cnpj': '', 'pago': ''})
for caminho in EXPORTS:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    if 'Lançamentos' not in wb.sheetnames:
        wb.close()
        continue
    dados = list(wb['Lançamentos'].values)
    wb.close()
    cab = [str(c).strip() for c in dados[0]]
    for l in dados[1:]:
        d = dict(zip(cab, l))
        idx = str(d.get('Índice') or '').strip()
        base = idx.split('.')[0] if idx else ''
        try:
            val = round(float(d.get('Valor')), 2)
        except (TypeError, ValueError):
            continue
        r = brutos[(caminho, base)]
        r['partes'].append((str(d.get('Centro de Custo') or '').strip(),
                            str(d.get('Etapa / Item') or '').strip(), val))
        r['dt'] = data_iso(d.get('Competência'))
        r['desc'] = str(d.get('Descrição') or '')
        cn = re.sub(r'\D', '', str(d.get('CNPJ / CPF') or ''))
        if cn:
            r['cnpj'] = cn
        r['pago'] = str(d.get('Pago a') or '').strip()

mc = {}
for v in brutos.values():
    total = round(sum(x for _, _, x in v['partes']), 2)
    ag = defaultdict(float)
    for c, e, x in v['partes']:
        ag[(c, e)] += x
    fatias = tuple(sorted((c, e, round(x, 2)) for (c, e), x in ag.items()))
    ass = (v['dt'], total, ' '.join(sorted(fichas(v['desc']))), v['cnpj'], fatias)
    if ass in mc:
        continue
    mc[ass] = {'dt': v['dt'], 'total': total, 'desc': v['desc'], 'cnpj': v['cnpj'],
               'pago': v['pago'], 'fatias': fatias, 'id': len(mc)}
DOCS = list(mc.values())

por_dt_val = defaultdict(list)
por_cnpj_val = defaultdict(list)
por_val = defaultdict(list)
por_cnpj = defaultdict(list)
for d in DOCS:
    por_dt_val[(d['dt'], d['total'])].append(d)
    por_val[d['total']].append(d)
    if d['cnpj']:
        por_cnpj_val[(d['cnpj'], d['total'])].append(d)
        por_cnpj[d['cnpj']].append(d)

# ---------------------------------------------------------------- ERP
erp = []
for linha in io.open(ERP, encoding='utf-8').read().split('\n'):
    if not linha.strip():
        continue
    p = linha.split('|')
    erp.append({'num': p[0], 'dt': p[1], 'val': round(float(p[2]), 2),
                'cnpj': p[3], 'forn': p[4], 'doc': p[5], 'desc': p[6]})

achados, motivo = {}, {}


def registra(num, doc, chave):
    if num in achados:
        return
    achados[num] = doc
    motivo[num] = chave


for l in erp:
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) == 1:
        registra(l['num'], c[0], 'data+valor')
for l in erp:
    if l['num'] in achados:
        continue
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) > 1:
        fl = fichas(l['desc'])
        pt = sorted(((len(fl & fichas(d['desc'])), d) for d in c), key=lambda t: -t[0])
        if pt[0][0] >= 2 and (len(pt) == 1 or pt[0][0] > pt[1][0]):
            registra(l['num'], pt[0][1], 'data+valor+texto')
for l in erp:
    if l['num'] in achados or not l['cnpj']:
        continue
    c = por_cnpj_val.get((l['cnpj'], l['val']), [])
    if len(c) == 1:
        registra(l['num'], c[0], 'cnpj+valor')
for l in erp:
    if l['num'] in achados or not l['cnpj']:
        continue
    c = sorted(por_cnpj_val.get((l['cnpj'], l['val']), []), key=lambda d: dias(l['dt'], d['dt']))
    if c and dias(l['dt'], c[0]['dt']) <= 45:
        registra(l['num'], c[0], 'cnpj+valor+data proxima')
for l in erp:
    if l['num'] in achados:
        continue
    c = [d for d in por_val.get(l['val'], []) if dias(l['dt'], d['dt']) <= 45]
    if len(c) == 1:
        registra(l['num'], c[0], 'valor unico + data proxima')
for l in erp:
    if l['num'] in achados or not l['cnpj']:
        continue
    fl = fichas(l['desc'])
    if len(fl) < 3:
        continue
    cand = []
    for d in por_cnpj.get(l['cnpj'], []):
        fd = fichas(d['desc'])
        inter = len(fl & fd)
        if inter >= max(3, int(0.6 * len(fl))) and dias(l['dt'], d['dt']) <= 45:
            cand.append((inter, d))
    cand.sort(key=lambda t: -t[0])
    if cand and (len(cand) == 1 or cand[0][0] > cand[1][0]):
        registra(l['num'], cand[0][1], 'cnpj+texto (valor difere)')

# ---------------------------------------------------------------- as tres provas
print('=' * 96)
print('PROVA 1: sobreposicao de texto entre a nota do ERP e a do MC')
print('=' * 96)
zero, um, bom = [], [], 0
for l in erp:
    if l['num'] not in achados:
        continue
    d = achados[l['num']]
    n = len(fichas(l['desc']) & fichas(d['desc']))
    if n == 0:
        zero.append((l, d))
    elif n == 1:
        um.append((l, d))
    else:
        bom += 1
print('   2+ palavras em comum : %d  (confio)' % bom)
print('   1 palavra em comum   : %d  (olhar)' % len(um))
print('   0 palavra em comum   : %d  (suspeito)' % len(zero))
print()
for rot, lista in (('ZERO palavra em comum', zero), ('UMA palavra em comum', um)):
    if not lista:
        continue
    print('   --- %s ---' % rot)
    for l, d in sorted(lista, key=lambda t: -t[0]['val']):
        print('   %s %s R$ %9.2f [%s]' % (l['num'], l['dt'], l['val'], motivo[l['num']]))
        print('      ERP: %s' % l['desc'][:78])
        print('      MC : %s | %s' % (d['dt'], d['desc'][:70]))
    print()

print('=' * 96)
print('PROVA 2: um documento do MC nao pode servir a dois lancamentos do ERP')
print('=' * 96)
quem = defaultdict(list)
for num, d in achados.items():
    quem[d['id']].append(num)
dobrados = {k: v for k, v in quem.items() if len(v) > 1}
print('   documentos reivindicados por mais de um lancamento: %d' % len(dobrados))
for k, v in dobrados.items():
    d = next(x for x in DOCS if x['id'] == k)
    print('   MC %s R$ %.2f "%s"' % (d['dt'], d['total'], d['desc'][:52]))
    for num in v:
        l = next(x for x in erp if x['num'] == num)
        print('      <- %s %s R$ %.2f %s' % (num, l['dt'], l['val'], l['desc'][:46]))
print()

print('=' * 96)
print('PROVA 3: o total do documento do MC fecha com o valor do lancamento?')
print('=' * 96)
difere = [(l, achados[l['num']]) for l in erp if l['num'] in achados
          and abs(achados[l['num']]['total'] - l['val']) > 0.005]
print('   documentos com total diferente: %d' % len(difere))
for l, d in difere:
    print('   %s ERP R$ %.2f vs MC R$ %.2f [%s] %s' % (l['num'], l['val'], d['total'],
                                                       motivo[l['num']], l['desc'][:40]))
print()

print('=' * 96)
print('MAPA: etapas do MC que aparecem nos achados, e quanto vale cada uma')
print('=' * 96)
etapas = defaultdict(lambda: [0, 0.0])
for l in erp:
    if l['num'] not in achados:
        continue
    for c, e, x in achados[l['num']]['fatias']:
        chave = (c, e if e not in ('', '-') else '(sem etapa)')
        etapas[chave][0] += 1
        etapas[chave][1] += x
for (c, e), (n, v) in sorted(etapas.items(), key=lambda t: -t[1][1]):
    marca = '   ' if c in CENTROS_MANUT else '>> '
    print('%s%-46s %-44s %3d  R$ %10.2f' % (marca, c[:46], e[:44], n, v))
