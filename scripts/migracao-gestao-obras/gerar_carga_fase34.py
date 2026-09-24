"""Prepara a carga do Combustível e do Frete (Fases 3 e 4, virada no mesmo dia).

Uso:
  python3 scripts/migracao-gestao-obras/extrair_combustivel_frete.py  # lê a origem (retrato)
  python3 scripts/migracao-gestao-obras/gerar_carga_fase34.py         # prepara a carga

Entrada: _retrato/combustivel_frete.json, os CSVs de de-para desta pasta e as DECISÕES abaixo.
Saída (em _retrato/, fora do git: o repositório é público):
  staging34_NN.sql  lotes de ~35 KB que enchem legado.carga_fase34
  anexos34.json     o que enviar_anexos_fase34.py sobe para o bucket antes da carga
  esperado34.json   os números da origem, para o provar_carga_fase34.py

A migration 20260925130000_fase34_carga_combustivel_frete NÃO tem dado: lê o staging, grava,
refaz PEPS, nível e conta corrente pelas funções do ERP e confere contra os números da
origem que este script tira do retrato (tabelas 'esperado*'). Um número diferente e ela
aborta inteira.

Os números da origem são os que o app antigo mostra (plano, seção 9): o saldo da view
transportadora_saldos, o nível do tanque (depositos.nivel_atual_litros) e as camadas do PEPS
do banco (consumos_lote). Este script também refaz cada um por conta própria a partir das
linhas; se a conta dele discordar da origem, para e mostra (a origem se contradiz, e isso é
decisão do Tiago, não do script).

Travas (param em vez de inventar):
- movimento da conta corrente que a regeneração do ERP não reproduz (lista id e valor);
- valor com mais casas do que a coluna do ERP guarda;
- origem/destino de frete sem localidade de mesmo nome; fornecedor, equipamento, obra ou
  insumo sem de-para; material de frete sem decisão;
- anexo com URL desconhecida ou que não foi baixado.

Ids do ERP derivados do id da origem (legado.fn_uid, md5): rodar de novo não duplica.
"""
import collections
import csv
import datetime
import hashlib
import json
import os
import re
import sys
import uuid
from decimal import ROUND_HALF_UP, Decimal

D = os.path.dirname(os.path.abspath(__file__))
RETRATO = os.path.join(D, '_retrato')
sys.path.insert(0, D)
from extrair_combustivel_frete import caminho_do_anexo  # noqa: E402

LOTE_BYTES = 35_000
ANEXOS_PARCIAIS = '--anexos-parciais' in sys.argv  # só para desenvolvimento: anexo faltando vira aviso

# ---------------------------------------------------------------------------
# Decisões
# ---------------------------------------------------------------------------

# Material do frete e do pedido de pedreira (6 insumos da origem, todos em tonelada). DECIDIDO
# pelo Tiago em 24/09: os 4 casamentos abaixo, e "Brita 1" e "Pó de Pedra" CRIADOS em tonelada
# (não o PÓ DE BRITA 1335M139). O insumo novo nasce dentro da carga, com id legado.fn_uid e a
# categoria, a categoria financeira e a unidade (t) do BGS 1335M390. Código fica vazio: no ERP o
# código do insumo é texto livre e opcional (Cadastros > Insumos e a importação gravam nulo quando
# não vem), sem sequência, como os 160 insumos criados na carga da Manutenção.
MATERIAL = {
    'mlqoy19lz5dvy': ('casar', 'e0eb5c0b-969d-4700-9473-94b28b9d36e6'),  # BGS -> 1335M390 BGS (t), OC da Britam
    'mlqoz1x43p318': ('casar', '07c7266e-3620-4bc0-98a9-a4eb8798958b'),  # Brita 0 -> 1335M280 BRITA 0" (t), OC do Vale do Abunã
    'mlqoxomxuyr79': ('casar', 'd9a13fb6-c942-4802-8b5f-30e4ef590cd5'),  # Brita 4 -> 1335M349 BRITA 4 ( RACHINHA) (t), OC da Britam
    'mlqpyhsmnm9nk': ('casar', '52039dc3-03bd-4d66-8cd9-e4e76ae5807c'),  # Rachão -> 1335M348 RACHÃO (PEDRA DE MÃ0) (t), OC da Britam
    'mlqoyarjku6bg': ('criar', 'BRITA 1'),       # sem par em t: só BRITA 5/8 (t, OC de outra loja) e BRITA 1 5/8 (m3)
    'mlqozz4ko14ks': ('criar', 'PÓ DE PEDRA'),   # PÓ DE BRITA (1335M139, t) existe, sem OC que prove ser o mesmo
}
# Insumo novo de material copia categoria, categoria financeira e unidade (t) deste.
MATERIAL_MODELO = 'e0eb5c0b-969d-4700-9473-94b28b9d36e6'

# Pedreira da localidade (FASE4-FRETE.md): o saldo na pedreira passa a casar por FK.
PEDREIRA = {'Pedreira Britam': 'mlqw3xx5ruc6d', 'Pedreira Formate': 'mlqw42sq4lzm9', 'Vale do Abunã': 'mrc6gh9nrm1tq'}

MOTIVO_EXCLUSAO = 'Excluído no Gestão Obras'
TIPO_MEDICAO = {'horimetro': 'horimetro', 'odometro': 'km', 'km': 'km'}
MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
        '.heic': 'image/heic', '.gif': 'image/gif', '.pdf': 'application/pdf'}
CREDITOS = ('credito_frete', 'credito_abastecimento_transterra', 'ajuste_manual_credito')

# Casas que a coluna do ERP guarda (None = sem limite).
CASAS = {
    ('entradas_combustivel', 'quantidade_litros'): 4, ('entradas_combustivel', 'valor_total'): None,
    ('saidas_combustivel', 'litros'): 4, ('saidas_combustivel', 'valor_total'): 4,
    ('saidas_combustivel', 'preco_unitario'): 4, ('saidas_combustivel', 'preco_combustivel'): 4,
    ('saidas_combustivel', 'preco_combustivel_areacre'): 4, ('saidas_combustivel', 'taxa_litro'): 4,
    ('saidas_combustivel', 'preco_medio_tanque_snapshot'): 4, ('saidas_combustivel', 'medicao_no_abastecimento'): 4,
    ('transferencias_combustivel', 'quantidade_litros'): 4, ('transferencias_combustivel', 'valor_total'): None,
    ('esvaziamentos_tanque', 'litros_descartados'): 4, ('esvaziamentos_tanque', 'valor_perda'): 4,
    ('depositos', 'capacidade_litros'): 4,
    ('fretes', 'peso_toneladas'): 4, ('fretes', 'km_rodados'): 4, ('fretes', 'valor_tkm'): 4,
    ('fretes', 'valor_total'): None, ('fretes', 'valor_material'): None,
    ('pagamentos_frete', 'valor'): 4, ('pagamentos_frete', 'quantidade_combustivel'): 4,
    ('transportadora_movimentos', 'valor'): 4,
}

# ---------------------------------------------------------------------------


def uid(tabela, chave):
    """Mesmo cálculo de legado.fn_uid no banco: md5 do texto, como uuid."""
    return str(uuid.UUID(hashlib.md5(f'gestao_obras:{tabela}:{chave}'.encode()).hexdigest()))


def dec(v):
    return None if v is None or v == '' else Decimal(str(v))


def txt(v):
    """Número exato como texto (o JSON do retrato já traz o numeric como texto)."""
    d = dec(v)
    return None if d is None else format(d, 'f')


def q4(v):
    return dec(v).quantize(Decimal('0.0001'), ROUND_HALF_UP)


def texto(v):
    if not isinstance(v, str):
        return v
    return v.strip() or None


def ler_csv(nome):
    return list(csv.DictReader(open(os.path.join(D, nome), encoding='utf-8'), delimiter=';'))


R = json.load(open(os.environ.get('RETRATO_JSON', os.path.join(RETRATO, 'combustivel_frete.json')), encoding='utf-8'))
erros, avisos = [], []

u_csv = ler_csv('usuarios-de-para.csv')
USUARIO = {u['nome_gestao_obras']: u['erp_usuario_id'] for u in u_csv if u['erp_usuario_id']}
USUARIO.update({u['gestao_obras_id']: u['erp_usuario_id'] for u in u_csv if u['erp_usuario_id']})
sem_autor = collections.Counter()


def autor(v):
    v = (v or '').strip()
    if not v:
        return None
    if v not in USUARIO:
        # email, backfill ou funcionário sem conta no ERP: fica sem autor (e não vai para o log)
        sem_autor['email' if '@' in v else v] += 1
    return USUARIO.get(v)


# Casas: parar se a coluna do ERP guardaria menos do que a origem tem.
for (t, c), casas in CASAS.items():
    if casas is None:
        continue
    for linha in R[t]:
        v = dec(linha.get(c))
        if v is not None and v != v.quantize(Decimal(1).scaleb(-casas)):
            erros.append(f'{t}.{c} = {v} ({linha["id"]}) tem mais de {casas} casas')
for p in R['pedidos_material']:
    for it in p['itens']:
        if dec(it['quantidade']) != dec(it['quantidade']).quantize(Decimal('0.000001')):
            erros.append(f'pedido {p["id"]}: quantidade {it["quantidade"]} com mais de 6 casas')
        if dec(it['valor_unitario']) != q4(it['valor_unitario']):
            erros.append(f'pedido {p["id"]}: valor_unitario {it["valor_unitario"]} com mais de 4 casas')
        if dec(it['quantidade']) <= 0 or dec(it['valor_unitario']) <= 0:
            erros.append(f'pedido {p["id"]}: item com quantidade ou preço zero (o ERP exige > 0)')

# ---------------------------------------------------------------------------
# Índices
# ---------------------------------------------------------------------------
DEP = {d['id']: d for d in R['depositos']}
ENT = {e['id']: e for e in R['entradas_combustivel']}
SAI = {s['id']: s for s in R['saidas_combustivel']}
TRF = {t['id']: t for t in R['transferencias_combustivel']}
FRE = {f['id']: f for f in R['fretes']}
PAG = {p['id']: p for p in R['pagamentos_frete']}
ETAPA = {e['id']: e for e in R['etapas_obra']}
LOC = {l['nome']: l for l in R['localidades']}
FORN_NOME = collections.defaultdict(list)
for f in R['fornecedores']:
    FORN_NOME[f['nome'].strip()].append(f['id'])
viva = lambda linha: not linha.get('deleted_at')  # noqa: E731


def excl(linha):
    """(excluido_em, motivo) da linha excluída na origem."""
    if linha.get('deleted_at'):
        return linha['deleted_at'], MOTIVO_EXCLUSAO
    return None, None


# ---------------------------------------------------------------------------
# Conta corrente: a regeneração do ERP reproduz cada movimento vivo da origem?
# ---------------------------------------------------------------------------
def origem_viva(m):
    t = {'fretes': FRE, 'pagamentos_frete': PAG, 'saidas_combustivel': SAI}.get(m['origem_tabela'])
    return t is None or m['origem_id'] not in t or viva(t[m['origem_id']])


MOV = [m for m in R['transportadora_movimentos'] if viva(m) and origem_viva(m)]
regenerado = {}
for f in FRE.values():
    if viva(f) and dec(f['valor_total']) > 0:
        regenerado[('fretes', f['id'], 'credito_frete')] = (f['transportadora_id'], q4(f['valor_total']))
for p in PAG.values():
    if viva(p):
        regenerado[('pagamentos_frete', p['id'], 'debito_pagamento_frete')] = (p['transportadora_id'], q4(p['valor']))
for s in SAI.values():
    if not viva(s) or s['tipo_consumidor'] != 'carreta_transportadora' or not s['tanque_id']:
        continue
    dono = DEP[s['tanque_id']]['transportadora_proprietaria_id']
    if dono:
        preco = dec(s['preco_combustivel_areacre']) if s['preco_combustivel_areacre'] is not None else (dec(s['preco_combustivel']) or 0)
        regenerado[('saidas_combustivel', s['id'], 'credito_abastecimento_transterra')] = (
            dono, q4(dec(s['litros']) * (preco + (dec(s['taxa_litro']) or 0))))
        regenerado[('saidas_combustivel', s['id'], 'debito_abastecimento_transterra')] = (s['transportadora_id'], q4(s['valor_total']))
    else:
        regenerado[('saidas_combustivel', s['id'], 'debito_abastecimento_emt')] = (s['transportadora_id'], q4(s['valor_total']))
    if dec(s['valor_total']) <= 0:
        erros.append(f'saída de carreta {s["id"]} com valor 0: o ERP recusa movimento de valor zero')

AJUSTES = [m for m in MOV if m['tipo'] in ('ajuste_manual_credito', 'ajuste_manual_debito')]
na_origem = collections.defaultdict(list)
for m in MOV:
    if m not in AJUSTES:
        na_origem[(m['origem_tabela'], m['origem_id'], m['tipo'])].append((m['transportadora_id'], q4(m['valor']), m['id']))
divergencias = []
for k, v in sorted(na_origem.items()):
    if len(v) > 1:
        divergencias.append(f'{k}: {len(v)} movimentos vivos na origem para a mesma linha ({[x[2] for x in v]})')
    elif k not in regenerado:
        divergencias.append(f'{k}: movimento {v[0][2]} de {v[0][1]} na origem; a carga não gera')
    elif regenerado[k] != v[0][:2]:
        divergencias.append(f'{k}: origem {v[0][:2]} (mov {v[0][2]}), carga gera {regenerado[k]}')
for k, v in sorted(regenerado.items()):
    if k not in na_origem:
        divergencias.append(f'{k}: a carga gera {v}; a origem não tem movimento')
for a in AJUSTES:
    if a['origem_tabela'] not in ('ajuste_manual', 'pagamentos_frete'):
        divergencias.append(f'ajuste {a["id"]} com origem {a["origem_tabela"]}: sem regra')
if divergencias:
    erros += ['conta corrente: ' + d for d in divergencias]

# Saldo: o da view (tela) tem que ser o da soma dos movimentos vivos.
saldo_mov = collections.defaultdict(Decimal)
for m in MOV:
    saldo_mov[m['transportadora_id']] += dec(m['valor']) * (1 if m['tipo'] in CREDITOS else -1)
for v in R['transportadora_saldos']:
    if dec(v['saldo']) != saldo_mov.get(v['transportadora_id'], Decimal(0)):
        erros.append(f'saldo da view difere da soma dos movimentos: {v["nome"]} {v["saldo"]} x {saldo_mov[v["transportadora_id"]]}')
for t, s in saldo_mov.items():
    if s != 0 and t not in {v['transportadora_id'] for v in R['transportadora_saldos']}:
        erros.append(f'fornecedor {t} com saldo {s} fora da view (sem marca de transportadora na origem)')

# ---------------------------------------------------------------------------
# Registros do staging (ids da origem; o SQL resolve de-para e fn_uid)
# ---------------------------------------------------------------------------
S = {}

S['material_map'], S['material_novo'] = [], []
usados = {f['insumo_id'] for f in FRE.values()} | {it['insumo_id'] for p in R['pedidos_material'] for it in p['itens']}
ins_origem = {i['id']: i for i in R['insumos']}
for g in sorted(usados):
    if g not in MATERIAL:
        erros.append(f'material sem decisão: {g} {ins_origem.get(g, {}).get("nome")}')
        continue
    acao, alvo = MATERIAL[g]
    if acao == 'casar':
        S['material_map'].append({'g': g, 'nome': ins_origem[g]['nome'], 'i': alvo})
    else:
        novo = uid('insumos', f'material:{g}')
        S['material_novo'].append({'id': novo, 'nome': alvo, 'modelo': MATERIAL_MODELO})
        S['material_map'].append({'g': g, 'nome': ins_origem[g]['nome'], 'i': novo})

S['localidade'] = []
for l in R['localidades']:
    S['localidade'].append({'g': l['id'], 'nome': l['nome'].strip(), 'end': texto(l.get('endereco')), 'at': bool(l['ativo']),
                            'f': PEDREIRA.get(l['nome'].strip())})
for f in FRE.values():
    for c in ('origem', 'destino'):
        if f[c] not in LOC:
            erros.append(f'frete {f["id"]}: {c} {f[c]!r} sem localidade de mesmo nome')

S['tanque'] = [{'g': d['id'], 'nome': d['nome'].strip(), 'ap': texto(d.get('apelido')), 'cap': txt(d['capacidade_litros']),
                'ext': bool(d['eh_externo']), 'dono': d['transportadora_proprietaria_id'], 'at': bool(d['ativo']) and viva(d),
                'c': d['created_at'], 'u': autor(d.get('created_by') or d.get('criado_por'))} for d in R['depositos']]
for d in R['depositos']:
    if bool(d['eh_externo']) != bool(d['transportadora_proprietaria_id']):
        erros.append(f'tanque {d["nome"]}: externo sem dono ou dono sem externo (o ERP exige os dois juntos)')
    if d.get('foto_urls') or d.get('arquivo_urls'):
        erros.append(f'tanque {d["nome"]} tem anexo: o ERP não tem entidade de anexo para tanque')

S['entrada'] = []
for e in R['entradas_combustivel']:
    cand = FORN_NOME.get((e['fornecedor'] or '').strip(), [])
    if e['fornecedor'] and not cand:
        erros.append(f'entrada {e["id"]}: fornecedor {e["fornecedor"]!r} sem cadastro de mesmo nome na origem')
    ex, mot = excl(e)
    S['entrada'].append({'g': e['id'], 't': e['deposito_id'], 'i': e['tipo_combustivel'], 'l': txt(e['quantidade_litros']),
                         'vt': txt(e['valor_total']), 'fs': cand, 'nf': texto(e.get('nota_fiscal')), 'o': texto(e.get('observacoes')),
                         'dh': e['data_hora'], 'c': e['created_at'], 'u': autor(e.get('created_by') or e.get('criado_por')),
                         'ex': ex, 'm': mot})

S['transferencia'] = []
for t in R['transferencias_combustivel']:
    ex, mot = excl(t)
    S['transferencia'].append({'g': t['id'], 'o': t['deposito_origem_id'], 'd': t['deposito_destino_id'], 'i': t['tipo_combustivel'],
                               'l': txt(t['quantidade_litros']), 'vt': txt(t['valor_total']), 'dh': t['data_hora'],
                               'ob': texto(t.get('observacoes')), 'c': t['created_at'],
                               'u': autor(t.get('created_by') or t.get('criado_por')), 'ex': ex, 'm': mot})

S['esvaziamento'] = [{'g': e['id'], 't': e['deposito_id'], 'l': txt(e['litros_descartados']), 'mo': e['motivo'].strip() or 'Sem motivo',
                      'vp': txt(e['valor_perda'] or 0), 'dh': e['data_hora'], 'c': e['created_at'], 'u': autor(e.get('criado_por'))}
                     for e in R['esvaziamentos_tanque']]
# A data do esvaziamento da origem é o relógio UTC (a tela grava toISOString), não o de Rio
# Branco como as outras. A carga segue a regra do plano (relógio = Rio Branco), que reproduz
# as comparações da origem; o horário exibido fica 5 h à frente. Conferido aqui:
for e in R['esvaziamentos_tanque']:
    dh = datetime.datetime.fromisoformat(e['data_hora'][:19])
    cr = datetime.datetime.fromisoformat(e['created_at'][:19])
    if abs((dh - cr).total_seconds()) > 5:
        avisos.append(f'esvaziamento {e["id"]}: data {e["data_hora"]} longe do created_at {e["created_at"]}')

S['saida'], S['alocacao'] = [], []
aloc_sem_etapa, aloc_da_saida = 0, 0
for s in R['saidas_combustivel']:
    ex, mot = excl(s)
    tm = s.get('tipo_medicao_snapshot')
    if tm and tm not in TIPO_MEDICAO:
        erros.append(f'saída {s["id"]}: tipo de medição {tm!r} sem par')
    S['saida'].append({
        'g': s['id'], 'or': s['origem'], 'tc': s['tipo_consumidor'], 't': s['tanque_id'], 'eq': s['equipamento_id'],
        'tr': s['transportadora_id'], 'pl': texto(s.get('placa')), 'mo': texto(s.get('motorista')), 'i': s['tipo_combustivel'],
        'l': txt(s['litros']), 'pc': txt(s['preco_combustivel']), 'pp': txt(s['preco_combustivel_areacre']),
        'tx': txt(s['taxa_litro'] or 0), 'pu': txt(s['preco_unitario'] or 0), 'pm': txt(s['preco_medio_tanque_snapshot']),
        'vt': txt(s['valor_total'] or 0), 'pg': bool(s['pago']), 'pe': s.get('pago_em'),
        'me': txt(s.get('medicao_no_abastecimento')), 'tm': TIPO_MEDICAO.get(tm) if tm else None,
        'd': s['data'], 'ob': texto(s.get('observacoes')), 'c': s['created_at'], 'up': s.get('updated_at'),
        'u': autor(s.get('created_by')), 'ex': ex, 'm': mot})
    alocs = s.get('alocacoes') or []
    if not alocs and s.get('obra_id'):
        # saída antiga sem alocação: a obra da própria saída, 100% (é a obra que a origem mostra)
        alocs = [{'etapaId': None, 'percentual': 100}]
        aloc_da_saida += 1
    for i, a in enumerate(alocs):
        etapa = ETAPA.get(a.get('etapaId'))
        obra = etapa['obra_id'] if etapa else s.get('obra_id')
        if a.get('etapaId') and not etapa:
            aloc_sem_etapa += 1
        if not obra:
            erros.append(f'saída {s["id"]}: alocação sem obra')
            continue
        nome_etapa = etapa['nome'] if etapa else (f'etapa excluída no Gestão Obras ({a["etapaId"]})' if a.get('etapaId') else None)
        S['alocacao'].append({'k': f'{s["id"]}:{i}', 's': s['id'], 'ob': obra, 'p': txt(a['percentual']), 'l': txt(s['litros']),
                              'et': nome_etapa})
    if sum(dec(a['percentual']) for a in alocs) not in (Decimal(100), Decimal(0)):
        erros.append(f'saída {s["id"]}: alocações não somam 100%')

# Desempate do PEPS. A origem e o ERP ordenam as saídas do tanque por (data, created_at, id). Com
# data e created_at iguais (carga antiga em lote), o desempate é o id: na origem o texto dela, no
# ERP o uuid derivado (md5), que ordena diferente. Onde isso muda o custo, a conferência acusa.
# Padrão (aceito pelo lead em 24/09): soma 0, 1, 2... microssegundos ao created_at das empatadas,
# na ordem do id da origem, para o ERP consumir as camadas exatamente na mesma ordem.
# --peps-estrito desliga (created_at como na origem; o ensaio então acusa 3 saídas do Meloza
# Colorado de 11/04/2026 com a divisão de custo trocada).
DESEMPATAR = '--peps-estrito' not in sys.argv
empates = collections.defaultdict(list)
for s in S['saida']:
    if s['or'] == 'tanque' and not s['ex']:
        empates[(s['t'], s['d'], s['c'])].append(s)
desempatadas = 0
for grupo in empates.values():
    if len(grupo) < 2:
        continue
    pela_origem = sorted(grupo, key=lambda s: s['g'])
    if pela_origem == sorted(grupo, key=lambda s: uid('saidas_combustivel', s['g'])):
        continue
    if DESEMPATAR:
        iso = re.sub(r'\.(\d{1,6})(?=[+-])', lambda m: '.' + m.group(1).ljust(6, '0'), grupo[0]['c'].replace('Z', '+00:00'))
        base = datetime.datetime.fromisoformat(iso)
        for n, s in enumerate(pela_origem):
            s['c'] = (base + datetime.timedelta(microseconds=n)).isoformat()
    desempatadas += len(grupo)
print(f'PEPS: {desempatadas} saídas em grupos empatados que o uuid ordena diferente da origem'
      + (' (desempatadas por microssegundo no created_at)' if DESEMPATAR else ''))

S['frete'] = []
for f in R['fretes']:
    ex, mot = excl(f)
    S['frete'].append({
        'g': f['id'], 'tp': f['tipo'], 'd': f['data'], 'dc': texto(f.get('data_chegada')), 'ob': f['obra_id'],
        'o': LOC[f['origem']]['id'], 'de': LOC[f['destino']]['id'], 'tr': f['transportadora_id'],
        'mo': texto(f.get('motorista')) or 'Não informado no Gestão Obras', 'pl': texto(f.get('placa_carreta')),
        'i': f['insumo_id'], 'pe': txt(f['peso_toneladas']), 'km': txt(f['km_rodados']), 'tkm': txt(f['valor_tkm']),
        'vt': txt(f['valor_total']), 'vm': txt(f['valor_material'] or 0), 'nf': texto(f.get('nota_fiscal')),
        'nf2': texto(f.get('nota_fiscal2')), 'obs': texto(f.get('observacoes')), 'c': f['created_at'],
        'up': f.get('updated_at'), 'u': autor(f.get('created_by') or f.get('criado_por')), 'ex': ex, 'm': mot})

S['pagamento'] = []
for p in R['pagamentos_frete']:
    ex, mot = excl(p)
    if not re.fullmatch(r'\d{4}-\d{2}', p['mes_referencia'] or ''):
        erros.append(f'pagamento {p["id"]}: mês de referência {p["mes_referencia"]!r} fora do formato')
    S['pagamento'].append({
        'g': p['id'], 'd': p['data'], 'tr': p['transportadora_id'], 'mes': p['mes_referencia'] + '-01', 'v': txt(p['valor']),
        'met': p['metodo'], 'qc': txt(p['quantidade_combustivel'] or 0), 'resp': texto(p.get('responsavel')) or 'Não informado',
        'nf': texto(p.get('nota_fiscal')), 'pp': texto(p.get('pago_por')) or 'Não informado', 'obs': texto(p.get('observacoes')),
        'c': p['created_at'], 'up': p.get('updated_at'), 'u': autor(p.get('created_by') or p.get('criado_por')), 'ex': ex, 'm': mot})

S['pedido'] = []
for p in R['pedidos_material']:
    ex, mot = excl(p)
    S['pedido'].append({'g': p['id'], 'd': p['data'], 'f': p['fornecedor_id'], 'obs': texto(p.get('observacoes')), 'c': p['created_at'],
                        'up': p.get('updated_at'), 'u': autor(p.get('created_by') or p.get('criado_por')), 'ex': ex, 'm': mot,
                        'it': [{'i': it['insumo_id'], 'q': txt(it['quantidade']), 'vu': txt(it['valor_unitario'])} for it in p['itens']]})

# Ajustes (decisão do Tiago, 24/09): os 14 manuais e os 12 "pagamento estendido em nome de
# Areacre" viram frete_ajustes aprovados, soltos, com o mesmo valor, data, mês e descrição.
S['ajuste'] = [{'k': a['id'], 'tr': a['transportadora_id'], 'sn': 'credito' if a['tipo'] == 'ajuste_manual_credito' else 'debito',
                'v': txt(a['valor']), 'd': a['data'], 'mes': a['mes_referencia'], 'ob': a.get('obra_id'),
                'ds': texto(a.get('descricao')) or 'Ajuste do Gestão Obras', 'c': a['created_at'], 'u': autor(a.get('created_by'))}
               for a in AJUSTES]

cfg = R['frete_dashboard_cards_config'][0] if R['frete_dashboard_cards_config'] else {'fornecedor_ids': [], 'updated_por': None}
S['painel'] = [{'fs': cfg['fornecedor_ids'], 'u': autor(cfg.get('updated_por')), 'em': cfg.get('updated_at')}]


def chave_anomalia(k):
    """Chave da origem -> chave do ERP (detect.ts do ERP: D1..D3-<saída>, D4-<saídas ordenadas>, D5-<equipamento>)."""
    det, resto = k.split('-', 1)
    if det in ('D1', 'D2', 'D3'):
        if resto not in SAI:
            return None
        return f'{det}-{uid("saidas_combustivel", resto)}'
    if det == 'D4':
        ids = resto.split('-')
        if any(i not in SAI for i in ids):
            return None
        return 'D4-' + '-'.join(sorted(uid('saidas_combustivel', i) for i in ids))
    if det == 'D5':
        return ('D5', resto)  # o SQL resolve pelo de-para de equipamentos
    return None


S['anomalia_comb'] = []
for a in R['anomalias_checks']:
    ch = chave_anomalia(a['id'])
    if ch is None:
        erros.append(f'anomalia conferida {a["id"]}: chave sem par no ERP')
        continue
    S['anomalia_comb'].append({'k': ch if isinstance(ch, str) else None, 'eq': ch[1] if isinstance(ch, tuple) else None,
                               'm': texto(a.get('motivo')), 'em': a['checked_at'], 'u': autor(a.get('checked_by'))})
# Frete: chave do detector do ERP (src/modules/frete/anomalias/detect.ts): F1, F2, F5 e F6 são
# `<Fn>-<id do frete no ERP>`. F3 (pedreira-material) e F4 (nf / carga) têm outro formato: sem
# regra aqui, param (não há nenhum na origem em 24/09).
S['anomalia_frete'] = []
for a in R['anomalias_frete_checks']:
    det, resto = a['id'].split('-', 1)
    if det not in ('F1', 'F2', 'F5', 'F6') or resto not in FRE:
        erros.append(f'anomalia de frete conferida {a["id"]}: chave sem conversão para o ERP')
        continue
    S['anomalia_frete'].append({'k': f'{det}-{uid("fretes", resto)}', 'm': texto(a.get('motivo')), 'em': a['checked_at'],
                                'u': autor(a.get('checked_by'))})

# ---------------------------------------------------------------------------
# Anexos
# ---------------------------------------------------------------------------
ENTIDADE = {('fretes', 'foto_chegada_url'): 'frete_chegada', ('fretes', 'foto_urls'): 'frete', ('fretes', 'arquivo_urls'): 'frete',
            ('pagamentos_frete', 'foto_urls'): 'frete_pagamento', ('pagamentos_frete', 'arquivo_urls'): 'frete_pagamento',
            ('pedidos_material', 'foto_urls'): 'pedido_material', ('pedidos_material', 'arquivo_urls'): 'pedido_material',
            ('entradas_combustivel', 'foto_urls'): 'combustivel_entrada', ('entradas_combustivel', 'arquivo_urls'): 'combustivel_entrada',
            ('saidas_combustivel', 'foto_urls'): 'combustivel_saida', ('saidas_combustivel', 'arquivo_urls'): 'combustivel_saida',
            ('transferencias_combustivel', 'foto_urls'): 'combustivel_transferencia',
            ('transferencias_combustivel', 'arquivo_urls'): 'combustivel_transferencia'}
# O ERP guarda um arquivo por conteúdo (índice único arquivos_hash_tamanho_unico): a mesma foto
# anexada duas vezes vira UM arquivo com dois vínculos. O hash de cada arquivo local fica em
# cache (_retrato/hash34.json), porque são milhares de fotos.
CACHE = os.path.join(RETRATO, 'hash34.json')
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
# Exceção documentada (docs/VIRADA-COMBUSTIVEL-FRETE.md): a URL está na saída, mas o objeto não
# existe no Storage da origem (400 ao baixar, 24/09). Não entra; qualquer outro faltando para.
ANEXO_INEXISTENTE_NA_ORIGEM = {'abastecimento-fotos/saida/novo/1781379711805-image.jpg'}  # saída mqcri8m8l33uz
inexistentes = []
S['arquivo'], S['vinculo'], manifesto, faltando = [], [], [], []
por_conteudo, vistos, repetidos = {}, set(), []
anexos_por = collections.Counter()
for (t, c), entidade in ENTIDADE.items():
    for linha in R[t]:
        v = linha.get(c)
        for i, url in enumerate(v if isinstance(v, list) else ([v] if v else [])):
            if not url:
                continue
            alvo = caminho_do_anexo(url)
            if not alvo:
                erros.append(f'anexo com URL desconhecida: {t} {linha["id"]} {c}[{i}]')
                continue
            local = os.path.join(RETRATO, 'arquivos', alvo[0], alvo[1])
            if f'{alvo[0]}/{alvo[1]}' in ANEXO_INEXISTENTE_NA_ORIGEM:
                inexistentes.append(f'{t} {linha["id"]} {c}[{i}]')
                continue
            if not os.path.exists(local) or os.path.getsize(local) == 0:
                faltando.append(f'{t} {linha["id"]} {alvo[0]}/{alvo[1]}')
                continue
            nome = re.sub(r'^\d+-', '', os.path.basename(alvo[1]))
            ext = os.path.splitext(nome)[1].lower()
            if ext not in MIME:
                erros.append(f'anexo sem tipo conhecido: {t} {linha["id"]} {nome}')
                continue
            est = os.stat(local)
            ck = f'{local}|{est.st_size}|{int(est.st_mtime)}'
            if ck not in cache:
                cache[ck] = hashlib.sha256(open(local, 'rb').read()).hexdigest()
            h, b = cache[ck], est.st_size
            chave = f'{t}:{linha["id"]}:{c}:{i}'
            if (h, b) not in por_conteudo:
                path = f'arquivos/2026/09/{uid("arquivos", chave)}{ext}'
                por_conteudo[(h, b)] = chave
                manifesto.append({'local': local, 'path': path, 'mime': MIME[ext]})
                S['arquivo'].append({'k': chave, 'path': path, 'nome': nome, 'mime': MIME[ext], 'b': b, 'h': h, 'c': linha.get('created_at')})
            # A mesma foto duas vezes no mesmo frete (duas URLs, mesmo conteúdo) é um vínculo só no
            # ERP (anexo_vinculos_unico): conta à parte, para o relatório.
            if (h, b, entidade, linha['id']) in vistos:
                repetidos.append(f'{t} {linha["id"]} {c}[{i}]')
                continue
            vistos.add((h, b, entidade, linha['id']))
            S['vinculo'].append({'k': chave, 'h': h, 'b': b, 'et': entidade, 'tb': t, 'g': linha['id'],
                                 'nome': nome, 'c': linha.get('created_at')})
            anexos_por[(entidade, 'viva' if viva(linha) else 'excluida')] += 1
json.dump(cache, open(CACHE, 'w'))
if faltando:
    msg = f'{len(faltando)} anexos não baixados (rodar extrair_combustivel_frete.py de novo): ' + '; '.join(faltando[:5])
    (avisos if ANEXOS_PARCIAIS else erros).append(msg)

# ---------------------------------------------------------------------------
# Números da origem (plano, seção 9)
# ---------------------------------------------------------------------------
esperado = []


def conta(chave, linhas):
    esperado.append({'chave': chave, 'n': sum(1 for x in linhas if viva(x))})
    esperado.append({'chave': chave + '_excluidos', 'n': sum(1 for x in linhas if not viva(x))})


conta('combustivel_entradas', R['entradas_combustivel'])
conta('combustivel_saidas', R['saidas_combustivel'])
conta('combustivel_transferencias', R['transferencias_combustivel'])
conta('fretes', R['fretes'])
conta('frete_pagamentos', R['pagamentos_frete'])
conta('pedidos_material', R['pedidos_material'])
esperado += [
    {'chave': 'tanques', 'n': len(R['depositos'])},
    {'chave': 'combustivel_esvaziamentos', 'n': len(R['esvaziamentos_tanque'])},
    {'chave': 'abastecimento_alocacoes', 'n': len(S['alocacao'])},
    {'chave': 'pedido_material_itens', 'n': sum(len(p['itens']) for p in R['pedidos_material'])},
    {'chave': 'localidades', 'n': len(R['localidades'])},
    {'chave': 'frete_ajustes', 'n': len(AJUSTES), 'v': txt(sum(dec(a['valor']) * (1 if a['tipo'] == 'ajuste_manual_credito' else -1) for a in AJUSTES))},
    {'chave': 'combustivel_anomalias_conferidas', 'n': len(R['anomalias_checks'])},
    {'chave': 'frete_anomalias_conferidas', 'n': len(R['anomalias_frete_checks'])},
    {'chave': 'painel_fornecedores', 'n': len(set(cfg['fornecedor_ids']))},
    # PEPS: camadas do banco da origem (consumos_lote) e as saídas sem suprimento
    {'chave': 'combustivel_camadas', 'n': len(R['consumos_lote']),
     'v': txt(sum(dec(c['litros']) * dec(c['preco_lote']) for c in R['consumos_lote']))},
    {'chave': 'combustivel_sem_suprimento', 'n': len(R['saidas_sem_suprimento']),
     'v': txt(sum(dec(x['litros_sem_suprimento']) for x in R['saidas_sem_suprimento']))},
    {'chave': 'anexos', 'n': len(S['vinculo'])},
    {'chave': 'arquivos', 'n': len(S['arquivo'])},
]
for entidade in sorted({e for e, _ in anexos_por}):
    esperado.append({'chave': f'anexos:{entidade}', 'n': anexos_por[(entidade, 'viva')] + anexos_por[(entidade, 'excluida')]})
# Movimentos por tipo (conta corrente da origem, vivos)
por_tipo = collections.defaultdict(lambda: [0, Decimal(0)])
for m in MOV:
    por_tipo[m['tipo']][0] += 1
    por_tipo[m['tipo']][1] += dec(m['valor'])
for tipo, (n, v) in sorted(por_tipo.items()):
    esperado.append({'chave': f'movimentos:{tipo}', 'n': n, 'v': txt(v)})

meses = collections.defaultdict(lambda: [0, Decimal(0), Decimal(0)])
for f in FRE.values():
    if viva(f):
        x = meses[('fretes', f['data'][:7])]
        x[0] += 1; x[1] += dec(f['valor_total']); x[2] += dec(f['valor_material'] or 0)  # noqa: E702
for s in SAI.values():
    if viva(s):
        x = meses[('saidas', s['data'][:7])]
        x[0] += 1; x[1] += dec(s['valor_total']); x[2] += dec(s['litros'])  # noqa: E702
for p in PAG.values():
    if viva(p):
        x = meses[('pagamentos', p['data'][:7])]
        x[0] += 1; x[1] += dec(p['valor']); x[2] += dec(p['quantidade_combustivel'] or 0)  # noqa: E702
S['esperado_mes'] = [{'t': t, 'm': m, 'n': n, 'v': txt(v), 'x': txt(x)} for (t, m), (n, v, x) in sorted(meses.items())]

# Saldo por fornecedor do ERP: a view da origem, somada pelo de-para (Areacre + Areacre - Josias).
S['esperado_saldo'] = [{'g': v['transportadora_id'], 'nome': v['nome'], 's': txt(v['saldo']),
                        'cf': txt(v['credito_frete_total']), 'pf': txt(v['pago_frete_total']), 'dc': txt(v['debito_combustivel_total']),
                        'n': v['qtd_movimentos']} for v in R['transportadora_saldos']]

# Tanque: nível (cache da origem), combustível atual, valor em estoque pelas camadas da origem e
# o preço PEPS da última saída que consumiu camada.
consumido = collections.defaultdict(Decimal)
camadas_da_saida = collections.defaultdict(list)
for c in R['consumos_lote']:
    consumido[c['fonte_id']] += dec(c['litros'])
    camadas_da_saida[c['consumo_id']].append(c)
S['esperado_tanque'] = []
for d in R['depositos']:
    if d['eh_externo']:
        S['esperado_tanque'].append({'g': d['id'], 'nome': d['nome'], 'nivel': txt(d['nivel_atual_litros']), 'ci': None,
                                     've': '0', 'us': None, 'up': None})
        continue
    lotes = [(e['id'], dec(e['quantidade_litros']), dec(e['valor_total'])) for e in ENT.values() if e['deposito_id'] == d['id'] and viva(e)]
    lotes += [(t['id'], dec(t['quantidade_litros']), dec(t['valor_total'])) for t in TRF.values() if t['deposito_destino_id'] == d['id'] and viva(t)]
    ve = sum(((l - consumido[i]) * (v / l) for i, l, v in lotes if l > 0), Decimal(0))
    saidas = sorted((s for s in SAI.values() if s['tanque_id'] == d['id'] and s['origem'] == 'tanque' and viva(s) and camadas_da_saida[s['id']]),
                    key=lambda s: (s['data'], s['created_at'], s['id']))
    ult = saidas[-1] if saidas else None
    up = None
    if ult:
        cs = camadas_da_saida[ult['id']]
        up = sum(dec(c['litros']) * dec(c['preco_lote']) for c in cs) / sum(dec(c['litros']) for c in cs)
    # conta própria do nível, igual a recalcular_nivel_deposito da origem
    nivel = (sum(l for _, l, _ in lotes)
             - sum(dec(s['litros']) for s in SAI.values() if s['tanque_id'] == d['id'] and viva(s))
             - sum(dec(t['quantidade_litros']) for t in TRF.values() if t['deposito_origem_id'] == d['id'] and viva(t))
             - sum(dec(e['litros_descartados']) for e in R['esvaziamentos_tanque'] if e['deposito_id'] == d['id']))
    if max(nivel, Decimal(0)) != dec(d['nivel_atual_litros']):
        avisos.append(f'tanque {d["nome"]}: nível da origem {d["nivel_atual_litros"]}, a soma das linhas dá {nivel}')
    S['esperado_tanque'].append({'g': d['id'], 'nome': d['nome'], 'nivel': txt(d['nivel_atual_litros']), 'ci': d['combustivel_atual_id'],
                                 've': txt(q4(ve)), 'us': ult['id'] if ult else None, 'up': txt(q4(up)) if up is not None else None})

# Custo por saída (as regravadas pelo PEPS do ERP têm que dar o que a origem gravou)
S['esperado_camada_saida'] = [{'s': sid, 'l': txt(sum(dec(c['litros']) for c in cs)),
                               'v': txt(q4(sum(dec(c['litros']) * dec(c['preco_lote']) for c in cs)))}
                              for sid, cs in sorted(camadas_da_saida.items())]
S['esperado'] = esperado

# ---------------------------------------------------------------------------
# Relatório e lotes
# ---------------------------------------------------------------------------
print(f'tanques {len(S["tanque"])} | entradas {len(S["entrada"])} | saídas {len(S["saida"])} (alocações {len(S["alocacao"])}, '
      f'{aloc_da_saida} vindas da obra da saída, {aloc_sem_etapa} com etapa excluída na origem) | transferências '
      f'{len(S["transferencia"])} | esvaziamentos {len(S["esvaziamento"])}')
print(f'fretes {len(S["frete"])} | pagamentos {len(S["pagamento"])} | pedidos {len(S["pedido"])} | ajustes {len(S["ajuste"])} | '
      f'localidades {len(S["localidade"])} | anomalias {len(S["anomalia_comb"])} + {len(S["anomalia_frete"])}')
print(f'movimentos vivos na origem {len(MOV)}; a regeneração reproduz {len(MOV) - len(AJUSTES) - len([d for d in divergencias])} '
      f'e os {len(AJUSTES)} ajustes viram frete_ajustes; divergências: {len(divergencias)}')
print(f'anexos {len(S["vinculo"])} vínculos, {len(S["arquivo"])} arquivos distintos ({dict(anexos_por)}) | '
      f'{sum(a["b"] for a in S["arquivo"]) / 1e9:.2f} GB a subir, maior {max((a["b"] for a in S["arquivo"]), default=0) / 1e6:.1f} MB')
if inexistentes:
    print(f'aviso: {len(inexistentes)} anexo(s) inexistente(s) no Storage da origem ficam de fora (exceção documentada): {inexistentes}')
if repetidos:
    print(f'aviso: {len(repetidos)} anexos repetidos na mesma linha (mesmo conteúdo) viram um vínculo só: {repetidos[:6]}')
if sem_autor:
    print(f'aviso: autores sem usuário no ERP (ficam sem autor): {dict(sem_autor)}')
for a in avisos:
    print('aviso:', a)
if erros:
    print(f'\nPAREI: {len(erros)} problemas')
    for e in erros[:60]:
        print('  ', e)
    sys.exit(1)

for antigo in os.listdir(RETRATO):
    if antigo.startswith('staging34_') and antigo.endswith('.sql'):
        os.remove(os.path.join(RETRATO, antigo))

partes = []
for tabela, registros in S.items():
    atual, n = [], 1
    for r in registros:
        atual.append(r)
        if len(json.dumps(atual, ensure_ascii=False, separators=(',', ':'))) > LOTE_BYTES:
            atual.pop()
            partes.append((tabela, n, atual))
            atual, n = [r], n + 1
    partes.append((tabela, n, atual))
contagem_partes = {}
for tabela, n, _ in partes:
    contagem_partes[tabela] = max(contagem_partes.get(tabela, 0), n)
partes.append(('manifesto', 1, [contagem_partes]))

lotes, atual, tamanho = [], [], 0
for tabela, n, regs in partes:
    corpo = json.dumps(regs, ensure_ascii=False, separators=(',', ':'))
    if '$j$' in corpo:
        sys.exit('o dado contém o delimitador $j$')
    sql = (f"insert into legado.carga_fase34 (tabela, parte, dados) values ('{tabela}', {n}, $j${corpo}$j$::jsonb)\n"
           f"on conflict (tabela, parte) do update set dados = excluded.dados;\n")
    if atual and tamanho + len(sql) > LOTE_BYTES:
        lotes.append(atual)
        atual, tamanho = [], 0
    atual.append(sql)
    tamanho += len(sql)
lotes.append(atual)
for i, lote in enumerate(lotes, 1):
    open(os.path.join(RETRATO, f'staging34_{i:03d}.sql'), 'w', encoding='utf-8').write(''.join(lote))
json.dump(manifesto, open(os.path.join(RETRATO, 'anexos34.json'), 'w'), indent=1)
json.dump({k: S[k] for k in S if k.startswith('esperado')}, open(os.path.join(RETRATO, 'esperado34.json'), 'w'),
          ensure_ascii=False, indent=1)
print(f'staging: {len(lotes)} lotes, {sum(len("".join(l)) for l in lotes) // 1024} KB')
