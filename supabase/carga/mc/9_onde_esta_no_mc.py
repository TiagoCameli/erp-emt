# -*- coding: utf-8 -*-
"""Para cada um dos 59 da planilha, onde o Mais Controle lanca o valor.

Sai um arquivo numero§texto, onde o texto e o rateio COMPLETO do documento no
MC -- inclusive as fatias que caem fora da manutencao, que e justamente o que
interessa ver.
"""
import openpyxl, re, datetime, io, unicodedata
from collections import defaultdict

EXPORTS = ['/Users/tiagocameli/Downloads/Lancamentos-2026-08-30.xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (1).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (2).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (3).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-31 (1).xlsx']
BASE = '/Users/tiagocameli/.claude/jobs/87cb0088/tmp/'
PARADAS = {'REFERENTE', 'PARA', 'PAGAMENTO', 'COMPRA', 'PECAS', 'MANUTENCAO',
           'EQUIPAMENTOS', 'EQUIPAMENTO', 'DOS', 'DAS', 'MES'}
# os que eu casei e REJEITEI depois de olhar, com o motivo
REJEITADOS = {
    '1519': 'casou por cnpj+texto mas o MC vale R$ 469,90 e o lançamento R$ 965,41',
    '3137': 'casou por cnpj+texto mas o MC vale R$ 2.297,77 e o lançamento R$ 1.582,70',
    '1536': 'o documento do MC com esse valor fala de pá carregadeira, e está a 45 dias de distância',
    '1891': 'o documento do MC com esse valor fala de serviço elétrico em caminhão, não de câmara de ar',
    '2048': 'mesma data e valor, mas o MC fala de passagem CZS x Marechal Thaumaturgo',
    '5951': 'o MC com esse valor é gasolina da BROS 160, e o lançamento é um "caixa do dia"',
}


def sem_acento(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def fichas(s):
    t = re.sub(r'[^A-Z0-9]+', ' ', sem_acento(s).upper())
    return {p for p in t.split() if (len(p) > 3 or p.isdigit()) and p not in PARADAS}


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


brutos = defaultdict(lambda: {'partes': [], 'dt': None, 'desc': '', 'cnpj': ''})
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
        base = str(d.get('Índice') or '').strip().split('.')[0]
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

mc = {}
for v in brutos.values():
    total = round(sum(x for _, _, x in v['partes']), 2)
    ag = defaultdict(float)
    for c, e, x in v['partes']:
        ag[(c, e)] += x
    fatias = tuple(sorted(((c, e, round(x, 2)) for (c, e), x in ag.items()), key=lambda t: -t[2]))
    ass = (v['dt'], total, ' '.join(sorted(fichas(v['desc']))), v['cnpj'], fatias)
    if ass not in mc:
        mc[ass] = {'dt': v['dt'], 'total': total, 'desc': v['desc'], 'cnpj': v['cnpj'],
                   'fatias': fatias}
DOCS = list(mc.values())
por_dt_val, por_cnpj_val, por_val = defaultdict(list), defaultdict(list), defaultdict(list)
for d in DOCS:
    por_dt_val[(d['dt'], d['total'])].append(d)
    por_val[d['total']].append(d)
    if d['cnpj']:
        por_cnpj_val[(d['cnpj'], d['total'])].append(d)

erp = []
for linha in io.open(BASE + 'duvidas.txt', encoding='utf-8').read().split('\n'):
    if not linha.strip():
        continue
    p = linha.split('§')
    erp.append({'num': p[0].replace('LAN-2026-', ''), 'dt': p[1],
                'val': round(float(p[3]), 2), 'desc': p[5]})

# o CNPJ nao esta no duvidas.txt; recupero do erp_raiz.txt, que tem
cnpj = {}
for linha in io.open(BASE + 'erp_raiz.txt', encoding='utf-8').read().split('\n'):
    if not linha.strip():
        continue
    p = linha.split('|')
    cnpj[p[0]] = p[3]

achados, chave = {}, {}
for l in erp:
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) == 1:
        achados[l['num']] = c[0]
        chave[l['num']] = 'data + valor'
for l in erp:
    if l['num'] in achados:
        continue
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) > 1:
        fl = fichas(l['desc'])
        pt = sorted(((len(fl & fichas(d['desc'])), d) for d in c), key=lambda t: -t[0])
        if pt[0][0] >= 2 and (len(pt) == 1 or pt[0][0] > pt[1][0]):
            achados[l['num']] = pt[0][1]
            chave[l['num']] = 'data + valor, desempate por texto'
for l in erp:
    if l['num'] in achados:
        continue
    cn = cnpj.get(l['num'], '')
    if not cn:
        continue
    c = sorted(por_cnpj_val.get((cn, l['val']), []), key=lambda d: dias(l['dt'], d['dt']))
    if c and dias(l['dt'], c[0]['dt']) <= 45:
        achados[l['num']] = c[0]
        chave[l['num']] = 'cnpj + valor'
for l in erp:
    if l['num'] in achados:
        continue
    c = [d for d in por_val.get(l['val'], []) if dias(l['dt'], d['dt']) <= 45]
    if len(c) == 1:
        achados[l['num']] = c[0]
        chave[l['num']] = 'valor único, data a %d dias' % dias(l['dt'], c[0]['dt'])


def rotulo(c, e):
    if e in ('', '-', 'None'):
        return '%s (sem etapa)' % c
    return '%s > %s' % (c, e)


saida, achou, rej, faltou = [], 0, 0, 0
for l in erp:
    d = achados.get(l['num'])
    if l['num'] in REJEITADOS:
        rej += 1
        texto = 'CASOU MAS EU REJEITEI: %s' % REJEITADOS[l['num']]
        if d:
            texto += ' — o documento que casou está em ' + ' | '.join(
                '%s R$ %.2f' % (rotulo(c, e), x) for c, e, x in d['fatias'])
    elif d is None:
        faltou += 1
        texto = 'O MC NÃO TEM esse documento (procurei por data+valor, cnpj+valor e valor único em 5 exports)'
    else:
        achou += 1
        texto = ' | '.join('%s R$ %.2f' % (rotulo(c, e), x) for c, e, x in d['fatias'])
        if abs(d['total'] - l['val']) > 0.005:
            texto = '[MC total R$ %.2f, lanç. R$ %.2f] %s' % (d['total'], l['val'], texto)
        texto = '(casou por %s)  %s' % (chave[l['num']], texto)
    saida.append('%s§%s' % (l['num'], texto))

io.open(BASE + 'mc_dos_59.txt', 'w', encoding='utf-8').write('\n'.join(saida) + '\n')
print('achou %d | rejeitei %d | o MC nao tem %d  (de %d)' % (achou, rej, faltou, len(erp)))
print('gravei mc_dos_59.txt')
print()
for s in saida:
    n, t = s.split('§', 1)
    print('%s  %s' % (n, t[:150]))
