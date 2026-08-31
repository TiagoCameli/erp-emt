# -*- coding: utf-8 -*-
"""Mapa completo codigo do MC -> etapa do erp-emt, com as respostas do Tiago."""
import json, re
from collections import Counter, defaultdict

docs = json.load(open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/mc_final.json'))

# --- as sete respostas do Tiago, mais o que ja era univoco ---
COD = {
 # escavadeira 320C: mesma ordem
 '0001':'Escavadeira 320C - 01','0002':'Escavadeira 320C - 02','0003':'Escavadeira 320C - 03',
 # retro: 06 -> 01, 07 -> 02
 '0006':'Retroescavadeira 416E - 01','0007':'Retroescavadeira 416E - 02',
 # motoniveladora: 010 -> 01, 011 -> 02
 '0010':'Motoniveladora 12H - 01','0011':'Motoniveladora 12H - 02',
 # rolo CP56: 012 -> 01, 013 -> 02
 '0012':'Rolo CP56 - 01','0013':'Rolo Pé de Carneiro CP56 - 02',
 # cacambas: 106 -> CB-01, 107 -> CB-02, e assim por diante
 '0106':'Caminhão Caçamba 2423 K/36 MZO-5897 - 01',
 '0107':'Caminhão Caçamba 2423 K/36 MZO-8547 - 02',
 '0108':'Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',
 '0109':'Caminhão Caçamba 2425/48 NAB-4679 - 04',
 '0110':'Caminhão Caçamba 2425/48 NAB-4669 - 05',
 '0111':'Caminhão Caçamba 2425/48 NAB-4619 - 06',
 # cavalo XF530
 '0114':'Caminhão Cavalo XF 530 FTT SQS7E01 - 02',
 # os que ja eram univocos
 '0008':'Pá Carregadeira 924K - 01','0009':'Pá Carregadeira W20 - 02',
 '0014':'Rolo de Pneu CW34 - 01','0015':'Trator de Esteira D6NXL - 01',
 '0017':'Rolo Pé de Carneiro CA260 - 03','0018':'Bobcat MC110C - 01',
 '0019':'Manipulador Telescópio 540-170 - 01','0029':'Escavadeira PC200 - 05',
 '0101':'Caminhão Pipa 2626 NCP-4846 - 01','0102':'Caminhão Munck L 1620 MZO-4396 - 01',
 '0103':'Caminhão Betoneira MZO-9678 - 01','0104':'Carga Semi-Reboque SRCT3E QLU-2791 - 01',
 '0105':'Caminhão Cavalo 2644 S/33 MZO-2987 - 01','0112':'Caminhão Pipa L1318/50 MZO-4486 - 02',
 '0113':'Meloza 1517 MZO-3926 - 01','0201':'Saveiro RBMBVD QWP-6B51 - 02',
 '0205':'Hilux SQR1C93 - 07','0206':'Tracker QWM-9H99 - 03','0207':'Hilux CDSRVA4FD QWQ-1D76 - 05',
 '0304':'PALIO - NAF 3863',
 # da Colorado
 '0027':'@COLORADO','0028':'@COLORADO',
}
ERP = sorted({v for v in COD.values() if not v.startswith('@')})

def ch(s): return re.sub(r'[^a-z0-9]','',str(s).lower())
NOME_ERP = {ch(e): e for e in ERP}
EXTRA = ['Assoprador','Bobcat S450 - 02','CAMINHÃO BOIADEIRO/MIILHO - L1620',
 'Caminhão Cavalo XF 530 FTT SQU9C94 - 03','Caminhão Cavalo XF 530 FTT SQU9D04 - 04',
 'Caminhão Cavalo XF 530 FTT SQU9D14 - 05','Caminhão DAF - Nissey CF - 310',
 'Caminhão Espargidor - 01','Carga Semi-Reboque SR/GUERRA BASC B2D095 - 02',
 'Carga Semi-Reboque SR/GUERRA BASC B2T093 - 03','Escavadeira 315CL - 04',
 'Escavadeira EC55BPRO - 06','Espargidor QWN-7424','Hilux CDLOWA4SD SQQ-8F87 - 06',
 'Hilux CDSRXA4FD QLY-7H84 - 04','Hilux CHLSTM4FD QWQ-3H97 - 01','Laboratório',
 'Pá Carregadeira Komatsu 150','Pulverizador','Rolo Chapa CB10 - 01',
 'SAVEIRO CS RB MF QWQ2I35 - 09','SAVEIRO CS RB MF QWQ2I65 - 08','Trator Agrale 21',
 'Trator de Esteira D6G - 03','Trator de Esteira D6M - 02','Vibro Acabadora AF4500 - 01']
for e in EXTRA: NOME_ERP[ch(e)] = e
for a, b in [('Rolo Pé de Carneiro CP56 - 01','Rolo CP56 - 01'),('Palio Fiat - NAF 3863','PALIO - NAF 3863'),
             ('Saveiro CS RB MF - QWQ2I65','SAVEIRO CS RB MF QWQ2I65 - 08'),
             ('Saveiro CS RB MF - QWQ2I35','SAVEIRO CS RB MF QWQ2I35 - 09'),
             ('Caminhão Boiadeiro MZO7876','CAMINHÃO BOIADEIRO/MIILHO - L1620')]:
    NOME_ERP[ch(a)] = b

def destino(e):
    """-> nome da etapa no erp-emt, '@COLORADO', '@OFICINA' ou None."""
    e = (e or '').strip()
    if not e or e == '-': return None
    base = re.sub(r'\s*-\s*(Manutenção|Administrativo|Adiministrativo|ADMINISTRATIVO)(\s*-\s*UN)?\s*$','',e).strip()
    if ch(base) in NOME_ERP: return NOME_ERP[ch(base)]
    if 'oficina' in e.lower(): return '@OFICINA'
    if re.search(r'colorado', e, re.I): return '@COLORADO'
    m = re.match(r'^(\d{3,4})\b', e)
    if m and m.group(1) in COD: return COD[m.group(1)]
    # terceiro padrao: numero no meio, "Caminhao Cacamba 111 - Pecas"
    n = re.search(r'\b(\d{2,3})\b', e)
    if n:
        c = n.group(1).zfill(4) if len(n.group(1)) == 3 else None
        if c and c in COD: return COD[c]
        c2 = ('0' + n.group(1)).zfill(4)
        if c2 in COD: return COD[c2]
    return None

resolvidos = Counter()
sem = Counter()
for d in docs:
    for e, v in d['etapas']:
        alvo = destino(e)
        if alvo: resolvidos[alvo] += 1
        else: sem[e or '(vazio)'] += 1

print('linhas de etapa resolvidas:', sum(resolvidos.values()))
print('nao resolvidas:', sum(sem.values()))
print('\n--- top nao resolvidas ---')
for e, n in sem.most_common(22): print('  %4d  %s' % (n, e[:66]))

# documentos com TODAS as etapas resolvidas
ok = [d for d in docs if all(destino(e) for e, _ in d['etapas']) and d['etapas']]
uma = [d for d in ok if len({destino(e) for e, _ in d['etapas']}) == 1]
print('\ndocumentos com tudo resolvido: %d (de %d)' % (len(ok), len(docs)))
print('  desses, com UM destino so: %d' % len(uma))
json.dump([{'dt': d['dt'], 'total': d['total'],
            'destinos': sorted({destino(e) for e, _ in d['etapas']}),
            'partes': [[destino(e), v] for e, v in d['etapas']]} for d in ok],
          open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/mc_resolvido.json','w'), ensure_ascii=False)
print('gravado mc_resolvido.json')
