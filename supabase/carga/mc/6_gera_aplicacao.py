# -*- coding: utf-8 -*-
"""Gera o SQL que aplica o rateio do MC nos lancamentos que fecham com o mapa.

O SQL sai como UM statement por natureza (CTE que atualiza e insere junto),
porque trg_valida_soma_do_rateio dispara AFTER ROW: um UPDATE que muda a linha
da raiz e um INSERT separado das outras fatias abortaria no fim do primeiro.

A ultima fatia de cada lancamento e o RESTO, nunca outro round.
"""
import openpyxl, re, datetime, io, unicodedata, sys
from collections import defaultdict
sys.path.insert(0, '/Users/tiagocameli/.claude/jobs/87cb0088/tmp')
from mapa import resolve

EXPORTS = ['/Users/tiagocameli/Downloads/Lancamentos-2026-08-30.xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (1).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (2).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-30 (3).xlsx',
           '/Users/tiagocameli/Downloads/Lancamentos-2026-08-31 (1).xlsx']
BASE = '/Users/tiagocameli/.claude/jobs/87cb0088/tmp/'
CENTROS_MANUT = {'000 - Manutenção Equipamentos EMT', '0.2 - Equipamentos EMT 2026',
                 '009.1 - Manutenção Equipamentos BR-364 (Lote 9)'}
REJEITADOS = {'1519', '3137', '1536', '1891', '2048', '5951'}
PARADAS = {'REFERENTE', 'PARA', 'PAGAMENTO', 'COMPRA', 'PECAS', 'MANUTENCAO',
           'EQUIPAMENTOS', 'EQUIPAMENTO', 'DOS', 'DAS', 'MES'}

FORA_ID = {
    '<AMAZONIA>': ('df5637cd-0c9d-45de-b06f-26cd31a0d666', 'Manutenção de Equipamentos da Amazônia'),
    '<COLORADO>': ('891f3c63-f7e5-49fb-a97c-9c99deeadc2b', '002 - Equipamentos Colorado 2026'),
    '<BR364>': ('fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0', '009 - Manutenção da Rodovia BR-364 Lote 09 & 10'),
    '<CARRETAS>': ('af45def4-f5c9-4713-be2c-05ebd6b150d2', 'Caminhão Cavalo XF 530 FTT SQS7E01 - 02'),
}
IDS = {}
for linha in """4dc8c2f6-608e-46c2-8dae-52ae885b2b0b|Assoprador
2c218b6b-19a5-43e0-b9c7-2ee818d6cc92|Bobcat MC110C - 01
15e2dd98-5927-4644-8b68-78918869c6ce|Bobcat S450 - 02
56067493-d147-4e9a-9cd5-8c77c7f3e9c2|Caminhão Betoneira MZO-9678 - 01
6d348bb6-9e19-4b25-8203-dfe1351c73d5|CAMINHÃO BOIADEIRO/MIILHO - L1620
10b2d20c-a31e-42cb-ae3d-7b68a7b41c44|Caminhão Caçamba 2423 K/36 MZO-5897 - 01
3363f638-7733-4ea8-9e91-31e010b793f5|Caminhão Caçamba 2423 K/36 MZO-8547 - 02
85186912-2b85-4f39-8fde-03653ce9b7eb|Caminhão Caçamba 2423 K/36 MZO-8F87 - 03
5d318cd1-2ab6-476b-8855-4604afdb0648|Caminhão Caçamba 2425/48 NAB-4619 - 06
aed7508e-980a-45c1-8e81-b9f8069f04de|Caminhão Caçamba 2425/48 NAB-4669 - 05
3969995c-17d4-464e-919e-e7d6f04ac9bf|Caminhão Caçamba 2425/48 NAB-4679 - 04
e2a026bd-a760-49e6-a061-eb50a091a815|Caminhão Cavalo 2644 S/33 MZO-2987 - 01
f2f63859-28b6-414a-a6e4-3bdd8282eced|Caminhão DAF - Nissey CF - 310
46ee6071-c883-4630-809c-8ca598c77048|Caminhão Espargidor - 01
f814cb00-a3cd-4bae-a8b7-dc400cd52e20|Caminhão Munck L 1620 MZO-4396 - 01
dd85e0ef-6025-4822-99b1-cb76209e0655|Caminhão Pipa 2626 NCP-4846 - 01
78f2c7a0-07f3-4867-a33e-9514e889c789|Caminhão Pipa L1318/50 MZO-4486 - 02
9043d5e9-7690-4e95-9783-5a8e6c4ccf2b|Carga Semi-Reboque SR/GUERRA BASC B2D095 - 02
555cf03d-8d1a-4511-8926-bcc6751fd396|Carga Semi-Reboque SR/GUERRA BASC B2T093 - 03
efc93ad0-89fb-4ae9-b2e5-8234e518e869|Carga Semi-Reboque SRCT3E QLU-2791 - 01
dd025ab8-5cb7-4979-b986-858759978d65|Escavadeira 315CL - 04
9887b0ad-6976-4a53-a9ea-8b8e075036fd|Escavadeira 320C - 01
ca178d7a-9a96-4ea8-89ef-0afc529861f4|Escavadeira 320C - 02
384bf96d-3ce6-4ae3-acdf-cb478e049148|Escavadeira 320C - 03
e6766e6c-e69b-4cd5-bd82-0a172f3bc758|Escavadeira EC55BPRO - 06
267aec2a-39d4-455a-948b-d374fa9c133f|Escavadeira PC200 - 05
46f6d369-8578-4da0-a44d-5302f46f4622|Espargidor QWN-7424
dc1171b4-78ba-460b-b671-4c921aaa0659|Hilux CDLOWA4SD SQQ-8F87 - 06
3c796648-b3c6-4c1c-9889-cf670fe86dee|Hilux CDSRVA4FD QWQ-1D76 - 05
9e9421a8-adc9-4e9c-850d-f6e2b236d8c9|Hilux CDSRXA4FD QLY-7H84 - 04
921b9b30-4ba0-4ee8-93b9-7308307fc8d1|Hilux CHLSTM4FD QWQ-3H97 - 01
6ee59564-7bfe-4731-8671-d2a8354038e8|Hilux SQR1C93 - 07
81081000-4c66-441d-933c-0d98f7598c79|Laboratório
65e52b5f-f73b-4a91-a7b1-f8bcb468f625|Manipulador Telescópio 540-170 - 01
afd2f665-0090-4224-b89d-c61ed3c035bb|Meloza 1517 MZO-3926 - 01
057cfab1-5866-416d-8bd8-f4a474b4e4a1|Motoniveladora 12H - 01
8ca85387-84cb-43c1-8efc-9ed2fcc5cd38|Motoniveladora 12H - 02
17e1ae32-6aae-4902-98e7-8736a76d1a78|Oficina
5a96c3dd-098f-4200-920f-eeb14e172431|Pá Carregadeira 924K - 01
853f38bc-d6a4-4da3-b887-c12d1258d9be|Pá Carregadeira Komatsu 150
76f89bbf-89f3-4bab-8d5a-eeb1fe4a7a33|Pá Carregadeira W20 - 02
69b1a57e-e65e-490d-b170-11033b324501|PALIO - NAF 3863
a5af7702-2a63-45de-86d4-7995d060fee9|Retroescavadeira 416E - 01
a1b86608-7314-4126-b6c5-3dd3118a278e|Retroescavadeira 416E - 02
a28f35d9-552c-4c39-a20e-1ae840621ed8|Rolo Chapa CB10 - 01
516ed0a3-c5b5-4868-b421-179a64fc36bb|Rolo CP56 - 01
169c784b-b0ed-4a04-b13e-4a414b3514be|Rolo de Pneu CW34 - 01
34c46ddd-52cb-474e-b7d1-3599f6e2f1ac|Rolo Pé de Carneiro CA260 - 03
1082490f-394b-4cfc-993e-41dd1d48e4a4|Rolo Pé de Carneiro CP56 - 02
bb6d309d-6921-4170-9890-abf1c583f635|SAVEIRO CS RB MF QWQ2I35 - 09
0f1d3d07-dccd-41c0-80cf-5fec3b151444|SAVEIRO CS RB MF QWQ2I65 - 08
90fa1568-7075-4e9d-a830-89ea4aaad554|Saveiro RBMBVD QWP-6B51 - 02
e842df8f-66d2-423c-8d5f-131263a5c638|Tracker QWM-9H99 - 03
9fd97b1e-d6b4-4e07-a809-5e826dd98b5c|Trator Agrale 21
5d88db63-5cfb-4fea-b086-0b50941e64b4|Trator de Esteira D6G - 03
1e83bab6-6944-4a18-9ffb-43829a715557|Trator de Esteira D6M - 02
89c0e402-44b5-4c6e-9fab-e0599ff8faff|Trator de Esteira D6NXL - 01
a4caefbd-3337-4ad2-9ff7-1aa79c00f8f3|Vibro Acabadora AF4500 - 01""".split('\n'):
    i, n = linha.split('|')
    IDS[n] = i


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
    fatias = tuple(sorted((c, e, round(x, 2)) for (c, e), x in ag.items()))
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

erp = {}
for linha in io.open(BASE + 'erp_raiz.txt', encoding='utf-8').read().split('\n'):
    if not linha.strip():
        continue
    p = linha.split('|')
    erp[p[0]] = {'num': p[0], 'dt': p[1], 'val': round(float(p[2]), 2),
                 'cnpj': p[3], 'forn': p[4], 'desc': p[6]}
for linha in io.open(BASE + 'erp_fatias.txt', encoding='utf-8').read().split('\n'):
    if not linha.strip():
        continue
    p = linha.split('|')
    erp[p[0]]['raiz'] = round(float(p[1]), 2)

achados = {}
for l in erp.values():
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) == 1:
        achados[l['num']] = c[0]
for l in erp.values():
    if l['num'] in achados:
        continue
    c = por_dt_val.get((l['dt'], l['val']), [])
    if len(c) > 1:
        fl = fichas(l['desc'])
        pt = sorted(((len(fl & fichas(d['desc'])), d) for d in c), key=lambda t: -t[0])
        if pt[0][0] >= 2 and (len(pt) == 1 or pt[0][0] > pt[1][0]):
            achados[l['num']] = pt[0][1]
for l in erp.values():
    if l['num'] in achados or not l['cnpj']:
        continue
    c = sorted(por_cnpj_val.get((l['cnpj'], l['val']), []), key=lambda d: dias(l['dt'], d['dt']))
    if c and dias(l['dt'], c[0]['dt']) <= 45:
        achados[l['num']] = c[0]
for l in erp.values():
    if l['num'] in achados:
        continue
    c = [d for d in por_val.get(l['val'], []) if dias(l['dt'], d['dt']) <= 45]
    if len(c) == 1:
        achados[l['num']] = c[0]
for n in REJEITADOS:
    achados.pop(n, None)

plano, travados = [], defaultdict(lambda: [0, 0.0])
for l in sorted(erp.values(), key=lambda x: x['num']):
    d = achados.get(l['num'])
    if d is None:
        continue
    M = round(sum(x for c, _, x in d['fatias'] if c in CENTROS_MANUT), 2)
    if abs(l['raiz'] - M) > 0.02:
        continue
    partes = [(e, x) for c, e, x in d['fatias'] if c in CENTROS_MANUT]
    if not any(e not in ('', '-') for e, _ in partes):
        continue
    dest, falha = [], False
    for e, x in partes:
        alvo, como = resolve(e)
        if alvo is None:
            travados[(e, como)][0] += 1
            travados[(e, como)][1] += x
            falha = True
        else:
            dest.append((alvo, round(x, 2)))
    if falha:
        continue
    # agrega fatias que caem no mesmo destino
    ag = defaultdict(float)
    for a, x in dest:
        ag[a] += x
    # fatia de R$ 0,00 no MC nao gera linha: rateio zerado e lixo no relatorio
    dest = sorted(((a, x) for a, x in ag.items() if round(x, 2) != 0.0), key=lambda t: -t[1])
    # a ultima fatia e o RESTO, para fechar exato com a fatia da raiz
    vals = [round(x, 2) for _, x in dest]
    vals[-1] = round(l['raiz'] - sum(vals[:-1]), 2)
    plano.append((l['num'], l['raiz'], [(a, v) for (a, _), v in zip(dest, vals)]))

# --------------------------------------------------------------- conferencia
soma_plano = sum(r for _, r, _ in plano)
por_destino = defaultdict(lambda: [0, 0.0])
for _, _, dest in plano:
    for a, v in dest:
        por_destino[a][0] += 1
        por_destino[a][1] += v
novas = sum(len(d) - 1 for _, _, d in plano)
sai_da_subarvore = sum(v for a, (_, v) in
                       ((a, t) for a, t in por_destino.items()) if a in FORA_ID)

print('lancamentos no plano : %d' % len(plano))
print('valor que sai da raiz: R$ %.2f' % soma_plano)
print('linhas novas         : %d' % novas)
print('destinos distintos   : %d' % len(por_destino))
print()
print('sai da subarvore da Manutencao (dona declarada):')
for a in FORA_ID:
    if a in por_destino:
        print('   %-46s %3d  R$ %10.2f' % (FORA_ID[a][1][:46], por_destino[a][0], por_destino[a][1]))
print()
print('AINDA TRAVADO (fica na raiz):')
tt = 0.0
for (e, m), (n, v) in sorted(travados.items(), key=lambda t: -t[1][1]):
    print('   %-52s %-40s %2d  R$ %9.2f' % (e[:52], m[:40], n, v))
    tt += v
print('   soma travada: R$ %.2f' % tt)

# --------------------------------------------------------------- o SQL
codigo, prox = {}, 0
for a in por_destino:
    codigo[a] = 'd%02d' % prox
    prox += 1
linhas_lk = []
for a, c in sorted(codigo.items(), key=lambda t: t[1]):
    uid = FORA_ID[a][0] if a in FORA_ID else IDS[a]
    linhas_lk.append("('%s','%s')" % (c, uid))
linhas_pl = []
for num, _, dest in plano:
    for i, (a, v) in enumerate(dest, 1):
        linhas_pl.append("('%s',%d,'%s',%.2f)" % (num, i, codigo[a], v))

AMAZ = FORA_ID['<AMAZONIA>'][0]
COL = FORA_ID['<COLORADO>'][0]
BR = FORA_ID['<BR364>'][0]
CAR = FORA_ID['<CARRETAS>'][0]
esperado = {}
for a, (n, v) in por_destino.items():
    if a in FORA_ID:
        esperado[FORA_ID[a][0]] = round(esperado.get(FORA_ID[a][0], 0.0) + v, 2)
sai_sub = round(sum(esperado.values()), 2)

sql = []
sql.append('with lk(cod, centro) as (values')
sql.append('  ' + ',\n  '.join(linhas_lk))
sql.append('), pl(num, ordem, cod, valor) as (values')
sql.append('  ' + ',\n  '.join(linhas_pl))
sql.append('), m as (')
sql.append('  select pl.num, pl.ordem, lk.centro::uuid as centro, pl.valor::numeric as valor')
sql.append('  from pl join lk on lk.cod = pl.cod')
sql.append('), upd as (')
sql.append('  update public.lancamento_rateios r')
sql.append('     set centro_custo_id = m.centro, valor = m.valor')
sql.append('    from public.lancamentos l, m')
sql.append("   where l.id = r.lancamento_id and l.numero = 'LAN-2026-' || m.num")
sql.append("     and r.centro_custo_id = 'fbd2556a-3e96-474b-818f-ff536a288dff'")
sql.append('     and m.ordem = 1')
sql.append('  returning r.lancamento_id, r.categoria_id, r.created_by, m.num')
sql.append(')')
sql.append('insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)')
sql.append('select u.lancamento_id, m.centro, m.valor, u.categoria_id, u.created_by')
sql.append('from upd u join m on m.num = u.num and m.ordem > 1;')
corpo = '\n'.join(sql)

bloco = []
bloco.append('do $aplica$')
bloco.append('declare')
bloco.append("  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';")
bloco.append("  AMAZ uuid := '%s';" % AMAZ)
bloco.append("  COL uuid := '%s';" % COL)
bloco.append("  BR uuid := '%s';" % BR)
bloco.append('  v_lin_a int; v_lin_d int; v_div int; v_orfa int;')
bloco.append('  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;')
bloco.append('  v_amz_a numeric; v_amz_d numeric; v_col_a numeric; v_col_d numeric;')
bloco.append('  v_br_a numeric; v_br_d numeric; v_tipo_a jsonb; v_tipo_d jsonb;')
bloco.append('begin')
bloco.append('  select count(*) into v_lin_a from public.lancamento_rateios;')
bloco.append('  select jsonb_object_agg(tipo,total) into v_tipo_a')
bloco.append("  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;")
for var, cid in (('v_raiz_a', 'MANUT'), ('v_amz_a', 'AMAZ'), ('v_col_a', 'COL'), ('v_br_a', 'BR')):
    bloco.append('  select coalesce(sum(r.valor),0) into %s from public.lancamento_rateios r' % var)
    bloco.append("  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=%s;" % cid)
bloco.append('  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r')
bloco.append("  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'")
bloco.append('  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;')
bloco.append('')
bloco.append('  -- UM statement: o CTE atualiza a linha da raiz e insere as outras fatias')
bloco.append('  -- junto, porque trg_valida_soma_do_rateio dispara AFTER ROW.')
bloco.append('  execute $sql$')
bloco.append(corpo)
bloco.append('  $sql$;')
bloco.append('')
bloco.append('  select count(*) into v_lin_d from public.lancamento_rateios;')
bloco.append('  select jsonb_object_agg(tipo,total) into v_tipo_d')
bloco.append("  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;")
for var, cid in (('v_raiz_d', 'MANUT'), ('v_amz_d', 'AMAZ'), ('v_col_d', 'COL'), ('v_br_d', 'BR')):
    bloco.append('  select coalesce(sum(r.valor),0) into %s from public.lancamento_rateios r' % var)
    bloco.append("  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=%s;" % cid)
bloco.append('  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r')
bloco.append("  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'")
bloco.append('  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;')
bloco.append('  select count(*) into v_div from (select l.id from public.lancamentos l')
bloco.append("    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'")
bloco.append('    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;')
bloco.append('  select count(*) into v_orfa from public.lancamento_rateios r')
bloco.append('  where r.categoria_id is null and r.created_at > now() - interval \'5 minutes\';')
bloco.append('')
bloco.append('  if v_lin_d - v_lin_a <> %d then raise exception \'Nasceram %% linhas em vez de %d.\', v_lin_d-v_lin_a; end if;' % (novas, novas))
bloco.append('  if v_orfa > 0 then raise exception \'%% fatia(s) nasceram sem categoria.\', v_orfa; end if;')
bloco.append('  if v_div > 0 then raise exception \'%% lancamento(s) com rateio fora do valor.\', v_div; end if;')
bloco.append('  if v_tipo_a <> v_tipo_d then raise exception \'DRE por tipo mudou.\'; end if;')
bloco.append('  if round(v_amz_d - v_amz_a, 2) <> %.2f then' % esperado.get(AMAZ, 0.0))
bloco.append('    raise exception \'Amazonia subiu R$ %% em vez de %.2f.\', v_amz_d-v_amz_a; end if;' % esperado.get(AMAZ, 0.0))
bloco.append('  if round(v_col_d - v_col_a, 2) <> %.2f then' % esperado.get(COL, 0.0))
bloco.append('    raise exception \'Colorado subiu R$ %% em vez de %.2f.\', v_col_d-v_col_a; end if;' % esperado.get(COL, 0.0))
bloco.append('  if round(v_br_d - v_br_a, 2) <> %.2f then' % esperado.get(BR, 0.0))
bloco.append('    raise exception \'BR-364 subiu R$ %% em vez de %.2f.\', v_br_d-v_br_a; end if;' % esperado.get(BR, 0.0))
bloco.append('  -- a raiz cai TUDO; a subarvore cai so o que tem dona declarada fora dela')
bloco.append('  if round(v_raiz_a - v_raiz_d, 2) <> %.2f then' % soma_plano)
bloco.append('    raise exception \'A raiz caiu R$ %% em vez de %.2f.\', v_raiz_a-v_raiz_d; end if;' % soma_plano)
bloco.append('  if round(v_sub_a - v_sub_d, 2) <> %.2f then' % sai_sub)
bloco.append('    raise exception \'A subarvore caiu R$ %% em vez de %.2f.\', v_sub_a-v_sub_d; end if;' % sai_sub)
bloco.append('')
bloco.append('  raise notice \'OK. Raiz R$ %% -> R$ %%. %d linhas novas.\', v_raiz_a, v_raiz_d;' % novas)
bloco.append('end $aplica$;')
io.open(BASE + 'aplica.sql', 'w', encoding='utf-8').write('\n'.join(bloco))
print()
print('gravei aplica.sql (%d bytes, %d linhas de plano)' % (len('\n'.join(sql)), len(linhas_pl)))
