"""Prepara a carga da Manutenção (Fase 2d) a partir do retrato da origem.

Uso:
  python3 scripts/migracao-gestao-obras/extrair_manutencao.py      # lê a origem (retrato)
  python3 scripts/migracao-gestao-obras/gerar_carga_manutencao.py  # prepara a carga

Entrada: _retrato/manutencao.json, os CSVs de de-para desta pasta e as DECISÕES abaixo.
Saída (em _retrato/, fora do git: o repositório é público):
  staging_NN.sql  lotes de ~35 KB que enchem legado.carga_fase2d (rodar pelo execute_sql)
  anexos.json     o que enviar_anexos_fase2d.py sobe para o bucket antes da carga

A migration 20260923170000_fase2d_carga_manutencao NÃO tem dado: ela lê o staging, grava e
confere contra os números da origem que este script calcula do retrato (tabela 'esperado'),
independentes do SQL que está sendo conferido. Um número diferente e ela aborta inteira.

Travas deste script:
- Peça usada na origem sem decisão (fora do CSV e das decisões) para aqui.
- Casar com insumo do ERP de unidade diferente para aqui, a não ser que esteja em
  UNIDADE_EQUIVALENTE: inventar conversão erraria saldo e custo.
- Prestador sem par de confiança certa/alta e sem decisão para aqui.

Ids do ERP derivados do id da origem (legado.fn_uid, md5), então rodar de novo não duplica.
"""
import csv
import datetime
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import uuid
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

D = os.path.dirname(os.path.abspath(__file__))
RETRATO = os.path.join(D, '_retrato')
FUSO = ZoneInfo('America/Rio_Branco')
LOTE_BYTES = 35_000

# ---------------------------------------------------------------------------
# Decisões (23/09/2026). O Tiago disse "pode seguir, não precisa esperar"; a regra está em
# docs/decisoes.md: casa só quando é a MESMA peça e a unidade é compatível. Na dúvida cria,
# porque casar errado corrompe custo e saldo, e duplicata se funde depois.
# ---------------------------------------------------------------------------

# Nome na origem -> insumo do ERP (conferido ativo e único em 23/09).
CASAR = {
    'Arla 20 L': 'ee40e2b3-0bbc-4279-8825-1ac76b382235',  # balde de 20 L = galão de 20 L (1335M186)
    'BORDA CORTANTE RETRO 16 FUROS 3/4': '985f3acf-0fc3-41a8-bcb7-89db812169bc',
    'BUCHA BARRA ESTABILIZADORA': 'e8e9d284-5efd-49d1-bd8a-dce1a3aafb78',
    'CILINDRO AUXILIAR EMBREAGEM': '5f4cd5b9-68c7-4830-ac56-744f5e1c3173',
    'DENTE AM AÇO FUNDIDO': 'c8270e4e-cb4b-4e60-b140-dc1e890eb8c7',  # AM x EM, erro de digitação
    'DIAFRAGMA CUICA': '066f8e6e-7533-4f9a-a0b5-d09dcc2e9bf4',
    'ELEMENTO DO FILTRO D': 'eb6b6c17-2795-4f22-8d17-0ff890c259c0',
    'FILTRO COMBUSTÍVEL 1R-0751': '92f9fa58-1fcc-4a2f-8877-e128dec9bffa',
    'FILTRO DE DIESEL': '901170bf-8eb0-4c11-9fea-08c22cf752a1',
    'FILTRO DE OLEO': '527df413-7376-41d3-afd8-284015e5c71e',  # o ERP tem dois iguais: o de menor código (454)
    'FILTRO ÓLEO': '527df413-7376-41d3-afd8-284015e5c71e',
    'FILTRO TRANSMISSÃO': 'ec1e7793-8c34-43f8-9f86-d7003d54b7ba',
    'JUNTA DE ALUMINIO': 'aa24e2f1-049a-413a-aa0b-2d7814538431',
    'JUNTA TAMPA VALVULA D6N 3681A065': 'e8f493c7-49b7-4048-b98f-ece60bd7229a',
    'MOLA 1ADT MB ATEGO': 'aa96b2e5-a047-4cb9-911c-69f6e4dffb54',
    'MOLA 2A DT MB ATEGO': '48b6ad14-0fe2-4f28-97d7-52b897ceb244',
    'MOTOR DE PARTIDA 12V 10D MF292': 'c817e23f-9017-4337-be50-133a69b7e56d',
    'OLEO URSA 15W40 TDS PREMIUM CI4': '9410718e-09c5-48f5-b32e-63491816f19d',
    'PNEU 295/80R 22.5 LISO 18PR 152/149L TL T203 SUPERCAR': '0ba06b75-4b44-4031-87eb-acc452dc8484',
    'REPARO ALAVANCA': '65efc0f4-89f7-49c3-8ac6-3b6e37cf9591',
    'REPARO CILINDRO DIREÇÃO E BASCULHANTE LAMINA 12H': '91d1ae20-274f-4590-a751-4058fa142928',
    'REPARO DE PARTIDA': 'a6e3f788-28fe-4e06-bef4-07a206463a7d',
    'ROLAMENTO NACHI': 'f37e2e8d-97e5-44d1-bed8-af038860b804',  # o ERP tem dois iguais: o de menor código (929)
    'TERMINAL CAMBIO LADO DIREITO': '3ddb412a-9dd8-428a-9bf2-c02e527c6c89',
    'TERMINAL DE BATERIA': 'a7624459-b4d8-4961-a803-13b0b744d978',
    'TERMINAL DIREÇÃO LADO DIREITO': 'be720733-41e9-4802-aa31-d96d0879f9e0',
    'TRAVA PINO PATIM FREIO': '0fe98b1e-8420-4494-b8e9-3b6594caad8c',
    'VALVULA DE TRANSFERENCIA': '6b9b287d-2a2c-4691-b528-03d4d4b6af47',
}

# Casamento do CSV que vira CRIAR: unidade da origem é outra (L x un, L x BD), sem conversão.
CRIAR_EM_VEZ_DE_CASAR = {
    'ÓLEO 15W40', 'ÓLEO 50', 'ÓLEO 90', 'OLEO MOTOR COM DPF T', 'PLUS 50 II 15W40 20L',
}

# Casa mesmo com a sigla diferente: é a mesma quantidade (1 balde de 20 L = 1 galão de 20 L).
UNIDADE_EQUIVALENTE = {('BD', 'un')}

# Peças que apareceram na origem depois do CSV de 22/09. ('casar', id) com nome e unidade
# iguais no ERP; ('criar', categoria) sem par.
NOVAS = {
    'mue7yhgtpz5da': ('casar', '00820bc3-5461-4eb2-8402-01d9d0738219'),  # LAMINA 174M BOBCAT
    'mue7ymt154gs6': ('casar', '6bdcea04-4df2-45c0-90d9-58909c2c07a4'),  # PARAFUSO 32 BD
    'mue7yst46zdz8': ('casar', '45d66a56-d616-42ae-8164-0c2c041d9532'),  # PORCA 10 BD
    'mue7wilgkwbfp': ('criar', 'Peças e componentes'),  # BORDA CORTANTE LE
    'mue7wm8ea2y9s': ('criar', 'Peças e componentes'),  # BORDA CORTANTE LD
    'mue9ixwjqhou1': ('criar', 'Filtros'),  # ELEMENTO FILTRO COMBUSTIVEL DIESEL (o 451 é "DO FILTRO DIESEL")
}

# Prestador (texto livre) -> fornecedor do ERP. None = criar com o nome da origem.
PRESTADOR_DECIDIDO = {
    # único Wanderson do ERP, com 14 lançamentos de serviço elétrico; as linhas daqui são de elétrica
    'WANDERSON JUNIOR': 'cdeb92c2-909c-cd69-4350-3684dc5d28ee',
    'WANDERSON ELETRICISTA DE OLEO.': 'cdeb92c2-909c-cd69-4350-3684dc5d28ee',
    'AUTO ELETRICA AMILTON': None,  # os candidatos por nome não são auto elétrica
    'NEGUINHO RADIADORES E AUTO ELETRICA': None,  # não dá para afirmar que é o Guga/Gugu
    'OFICINA - DOLAR': None,  # apareceu em 23/09 (OS-2026-0180); nenhum Dolar/Dollar no ERP
    'BORRACHARIA': 'NAO_IDENTIFICADO',  # texto genérico, nenhum candidato com evidência
    'OFICINA': 'NAO_IDENTIFICADO',
}
NAO_IDENTIFICADO = 'NÃO IDENTIFICADO (MIGRAÇÃO GESTÃO OBRAS)'

SILO = 'mpah58owqqm1a'
CENTRAL = 'mp8hueeq1ppr2'
MEDICAO_DE_TESTE = 'med-abast-test-pr2-trigger'
ROTULO_FILTRO = {'ar': 'Ar', 'oleo': 'Óleo', 'separador': 'Separador', 'hidraulico': 'Hidráulico',
                 'combustivel': 'Combustível', 'transmissao': 'Transmissão', 'diesel': 'Diesel'}
TIPO_DOCUMENTO = {'crlv': 'CRLV', 'nf_aquisicao': 'Nota fiscal de aquisição'}

UN_ERP = {'un': '421fc312-4370-4b60-8b90-9921e7d95ed7', 'L': '5b6b6100-7491-46de-b8d3-66b90866bd17',
          'kg': '70d3b3d4-acd6-4bb2-b2ba-ce176d8ccf2e', 'm': '34bb4405-8b6e-4e39-af44-6400401d03a3',
          'BD': 'cf086c1a-9aa7-446a-9eac-280371b18c47'}
CATEGORIA_ERP = {
    'Peças e componentes': 'e76e41de-fa80-40c7-baac-55f4ccc63969',
    'Filtros': 'e80966e7-4c2f-451e-8338-1f18941908e6',
    'Lubrificantes e graxas': '5447243d-db98-42bb-830f-e01de263c028',
    'Elétrica': '94bb72cf-bfff-49fd-801c-11adf1b738a9',
    'Hidráulica': '4689e313-b772-410e-b1ac-2b6d5b374789',
    'Pneus e câmaras': '7ecac09c-63e8-4ef1-bee5-cb51185bd535',
    'Ferramentas e consumíveis': 'c66a98eb-3609-406c-b6b5-b182c187d056',
    'Limpeza e escritório': 'af269b16-864a-41e2-a46b-2c0ca464ce22',
    'Aço, ferragens e fixação': 'd169d622-40ef-417e-93b1-29a38e6eee6f',
    'Combustível': 'ae987733-00f0-4f8a-b2f4-057af6c2e535',
    'Cimento, agregados e concreto': '0e9878dc-d660-41d5-b532-83188895cd9c',
    'Manutenção e serviços': '396a3248-6f30-42fe-a4c3-2429b91d987b',
    'EPI e sinalização': '267ad236-8bc6-4db4-9014-1f938a6f43bc',
    'Pintura e acabamento': 'ffd25ec4-9b03-40d3-b352-705ab305f74f',
}

# ---------------------------------------------------------------------------


def uid(tabela, chave):
    """Mesmo cálculo de legado.fn_uid no banco: md5 do texto, como uuid."""
    return str(uuid.UUID(hashlib.md5(f'gestao_obras:{tabela}:{chave}'.encode()).hexdigest()))


def n4(valor):
    if valor is None or valor == '':
        return None
    return str(Decimal(str(valor)).quantize(Decimal('0.0001'), ROUND_HALF_UP))


def texto(valor):
    if not isinstance(valor, str):
        return valor
    return valor.strip() or None


def instante(valor):
    """timestamptz do PostgREST. O Python 3.9 só aceita fração de 3 ou 6 dígitos: completa."""
    iso = valor.replace('Z', '+00:00')
    iso = re.sub(r'\.(\d{1,6})(?=[+-])', lambda m: '.' + m.group(1).ljust(6, '0'), iso)
    return datetime.datetime.fromisoformat(iso)


def dia(valor):
    """Data em Rio Branco de um timestamptz da origem."""
    return instante(valor).astimezone(FUSO).date().isoformat() if valor else None


def chave_nome(nome):
    sem_acento = ''.join(c for c in unicodedata.normalize('NFD', nome) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', sem_acento.upper())).strip()


def unidade(texto_origem):
    mapa = {'un': 'un', 'und': 'un', 'unidade': 'un', 'l': 'L', 'litro': 'L', 'lt': 'L', 'bd': 'BD',
            'balde': 'BD', 'kg': 'kg', 'm': 'm'}
    u = (texto_origem or '').strip().lower()
    if u not in mapa:
        sys.exit(f'unidade da origem sem par no ERP: {texto_origem!r}')
    return mapa[u]


def ler_csv(nome):
    return list(csv.DictReader(open(os.path.join(D, nome), encoding='utf-8'), delimiter=';'))


R = json.load(open(os.path.join(RETRATO, 'manutencao.json'), encoding='utf-8'))
usuarios = {u['nome_gestao_obras']: u['erp_usuario_id'] for u in ler_csv('usuarios-de-para.csv') if u['erp_usuario_id']}
pecas_csv = {p['gestao_obras_id']: p for p in ler_csv('pecas-de-para.csv')}
prestadores_csv = {p['prestador_texto']: p for p in ler_csv('prestadores-de-para.csv')}
ins_origem = {i['id']: i for i in R['insumos']}
autores_sem_par = set()


def autor(nome):
    nome = (nome or '').strip()
    if nome and nome not in usuarios:
        autores_sem_par.add(nome)
    return usuarios.get(nome)


# ---------------------------------------------------------------------------
# Recorte: o que entra
# ---------------------------------------------------------------------------
os_vivas = [o for o in R['ordens_servico'] if not o['deleted_at']]
ids_os = {o['id'] for o in os_vivas}
pecas = [p for p in R['os_pecas'] if p['os_id'] in ids_os]
oleos = [p for p in R['os_oleos'] if p['os_id'] in ids_os]
terceiros = [p for p in R['os_terceiros'] if p['os_id'] in ids_os]
entradas = [e for e in R['entradas_material'] if not e['deletado_em']]
docs = [d for d in R['documentos_equipamento'] if not d['deleted_at'] and (d.get('foto_urls') or d.get('arquivo_urls'))]
depositos_usados = {e['deposito_material_id'] for e in entradas} | {p['deposito_id'] for p in pecas + oleos}
if depositos_usados - {CENTRAL, SILO}:
    sys.exit(f'depósito sem decisão: {depositos_usados - {CENTRAL, SILO}}')
if any(m['id'] != MEDICAO_DE_TESTE for m in R['medicoes_equipamento'] if not m['deleted_at']):
    sys.exit('apareceu medição real na origem: decidir a carga dela')
if R['saidas_material'] or R['transferencias_material']:
    sys.exit('apareceu saída avulsa ou transferência de material na origem: decidir a carga delas')

# ---------------------------------------------------------------------------
# Peças: casar ou criar
# ---------------------------------------------------------------------------
usados = {p['insumo_id'] for p in pecas + oleos} | {e['insumo_id'] for e in entradas}
insumo_de = {}   # gestao_obras_id -> uuid do insumo no ERP
criar = {}       # chave nome|unidade -> insumo a criar
faltam = []
for gid in sorted(usados):
    origem = ins_origem.get(gid) or sys.exit(f'insumo {gid} usado e ausente no retrato')
    nome = origem['nome'].strip()
    un = unidade(origem['unidade'])
    linha = pecas_csv.get(gid)
    decisao = NOVAS.get(gid)
    if linha is None and decisao is None:
        faltam.append(f'{gid} {nome} ({origem["unidade"]})')
        continue
    if nome in CASAR:
        insumo_de[gid] = CASAR[nome]
        continue
    if decisao and decisao[0] == 'casar':
        insumo_de[gid] = decisao[1]
        continue
    if linha and linha['erp_insumo_id'] and linha['metodo'] != 'CRIAR' and nome not in CRIAR_EM_VEZ_DE_CASAR:
        un_erp = linha['erp_unidade'].strip()
        if un_erp.lower() != un.lower() and (un, un_erp) not in UNIDADE_EQUIVALENTE:
            sys.exit(f'casamento com unidade diferente sem decisão: {nome} ({un}) -> {linha["erp_nome"]} ({un_erp})')
        insumo_de[gid] = linha['erp_insumo_id']
        continue
    # criar: uma peça por nome+unidade (dois cadastros iguais na origem viram um)
    chave = f'{chave_nome(nome)}|{un}'
    sugestao = re.search(r'sugestao: categoria ([^(|]+)', (linha or {}).get('observacao', '') or '')
    categoria = decisao[1] if decisao else (sugestao.group(1).strip() if sugestao else None)
    if any(p['insumo_id'] == gid for p in oleos) or origem.get('tipo_oleo_id'):
        categoria = 'Lubrificantes e graxas'
    if categoria not in CATEGORIA_ERP:
        categoria = 'Peças e componentes'
    criar.setdefault(chave, {'id': uid('insumos', chave), 'nome': nome, 'un': UN_ERP[un], 'sigla': un,
                             'cat': CATEGORIA_ERP[categoria]})
    insumo_de[gid] = criar[chave]['id']

if faltam:
    print('Peças sem decisão (preencher NOVAS e rodar de novo):')
    for f in faltam:
        print('  ', f)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Prestadores
# ---------------------------------------------------------------------------
fornecedores_novos = {}
fornecedor_de = {}
for t in terceiros:
    nome = t['prestador'].strip()
    if nome in PRESTADOR_DECIDIDO:
        alvo = PRESTADOR_DECIDIDO[nome]
        if alvo is None:
            fornecedores_novos[nome] = uid('fornecedores', chave_nome(nome))
            fornecedor_de[nome] = fornecedores_novos[nome]
        elif alvo == 'NAO_IDENTIFICADO':
            fornecedores_novos[NAO_IDENTIFICADO] = uid('fornecedores', 'NAO_IDENTIFICADO')
            fornecedor_de[nome] = fornecedores_novos[NAO_IDENTIFICADO]
        else:
            fornecedor_de[nome] = alvo
        continue
    linha = prestadores_csv.get(nome)
    if not linha or not linha['erp_fornecedor_id'] or linha['confianca'] not in ('certa', 'alta'):
        sys.exit(f'prestador sem decisão: {nome!r}')
    fornecedor_de[nome] = linha['erp_fornecedor_id']

# ---------------------------------------------------------------------------
# Registros do staging
# ---------------------------------------------------------------------------
S = {}
S['fornecedor_novo'] = [{'id': fid, 'nome': nome} for nome, fid in sorted(fornecedores_novos.items())]
S['insumo_novo'] = [{'id': c['id'], 'nome': c['nome'], 'sigla': c['sigla'], 'un': c['un'], 'cat': c['cat']}
                    for _, c in sorted(criar.items())]
S['insumo_map'] = [{'g': gid, 'nome': ins_origem[gid]['nome'], 'i': iid} for gid, iid in sorted(insumo_de.items())]
S['tipo_oleo'] = [{'g': t['id'], 'nome': t['nome'].strip(), 'ap': t['aplicacao'], 'im': t['intervalo_meses'],
                   'at': bool(t['ativo']), 'c': t['created_at'], 'u': autor(t.get('created_by'))} for t in R['tipos_oleo']]

por_erp = {}
for gid, iid in insumo_de.items():
    por_erp.setdefault(iid, []).append(ins_origem[gid])
S['item'] = []
for iid, origens in sorted(por_erp.items()):
    S['item'].append({
        'i': iid,
        'to': next((x['tipo_oleo_id'] for x in origens if x.get('tipo_oleo_id')), None),
        'min': n4(max((float(x['estoque_minimo']) for x in origens if x.get('estoque_minimo') is not None), default=None)),
        'max': n4(max((float(x['estoque_maximo']) for x in origens if x.get('estoque_maximo') is not None), default=None)),
        'eq': sorted({e for x in origens for e in (x.get('equipamentos_compativeis') or [])}),
    })

S['entrada'] = []
for e in sorted(entradas, key=lambda x: x['data_hora']):
    # a data da origem vem 5 h à frente em 313 entradas; nenhuma muda de dia (conferido aqui)
    if dia(e['data_hora']) != dia((instante(e['data_hora']) - datetime.timedelta(hours=5)).isoformat()) and \
            dia(e['data_hora']) != e['data_hora'][:10]:
        sys.exit(f'entrada que muda de dia com a correção de 5 h: {e["id"]}')
    obs = texto(e.get('observacoes'))
    if e['deposito_material_id'] == SILO:
        obs = ' '.join(x for x in [obs, 'Entrada do Depósito Central (Silo) no Gestão Obras.'] if x)
    S['entrada'].append({'g': e['id'], 'i': insumo_de[e['insumo_id']], 'f': e['fornecedor_id'], 'nf': texto(e.get('nota_fiscal')),
                         'd': dia(e['data_hora']), 'q': n4(e['quantidade']), 'vu': n4(e['valor_unitario']),
                         'vt': n4(e['valor_total']), 'o': obs, 'c': e['criado_em'], 'u': autor(e.get('criado_por'))})

S['os'] = []
for x in sorted(os_vivas, key=lambda y: y['numero']):
    if x['status'] not in ('aberta', 'em_execucao', 'concluida', 'cancelada'):
        sys.exit(f'status de OS sem par: {x["numero"]} {x["status"]}')
    solucao, defeito = texto(x.get('solucao_aplicada')), texto(x.get('defeito_reportado'))
    notas = [texto(x.get('observacoes')), texto(x.get('recomendacoes'))]
    if x.get('sintomas'):
        notas.append('Sintomas: ' + ', '.join(x['sintomas']))
    if x.get('sistemas_afetados'):
        notas.append('Sistemas afetados: ' + ', '.join(x['sistemas_afetados']))
    if x.get('origem') and x['origem'] != 'manual':
        notas.append(f'Origem no Gestão Obras: {x["origem"]}.')
    conclusao = dia(x.get('data_conclusao')) or (dia(x.get('updated_at')) if x['status'] == 'concluida' else None)
    S['os'].append({
        'g': x['id'], 'n': x['numero'], 'eq': x['equipamento_id'], 't': x['tipo'], 'p': x['prioridade'] or 'media',
        's': x['status'], 'ds': solucao or defeito or 'Sem descrição no Gestão Obras',
        'df': defeito if solucao else None, 'ca': texto(x.get('causa_raiz')),
        'ob': '\n'.join(n for n in notas if n) or None,
        'da': dia(x['data_abertura']) or dia(x['created_at']), 'di': dia(x.get('data_inicio_execucao')), 'dc': conclusao,
        'ma': n4(x.get('medicao_abertura')), 'mc': n4(x.get('medicao_conclusao')),
        'mcanc': 'Cancelada no Gestão Obras' if x['status'] == 'cancelada' else None,
        'c': x['created_at'], 'up': x.get('updated_at') or x['created_at'], 'u': autor(x.get('created_by')),
    })

S['peca'] = []
for p in pecas:
    obs = texto(p.get('observacoes'))
    if p['deposito_id'] == SILO:
        obs = ' '.join(x for x in [obs, 'Saiu do Depósito Central (Silo) no Gestão Obras.'] if x)
    S['peca'].append({'g': p['id'], 'os': p['os_id'], 'i': insumo_de[p['insumo_id']], 'q': n4(p['quantidade']),
                      'cu': n4(p['custo_unitario']), 'ct': n4(p['custo_total']), 'o': obs, 'c': p['created_at'],
                      'u': autor(p.get('created_by'))})
S['oleo'] = []
for p in oleos:
    if p['unidade'] not in ('L', 'kg'):
        sys.exit(f'unidade de óleo sem par: {p["id"]} {p["unidade"]}')
    S['oleo'].append({'g': p['id'], 'os': p['os_id'], 'to': p['tipo_oleo_id'], 'i': insumo_de[p['insumo_id']],
                      'q': n4(p['quantidade']), 'un': p['unidade'], 'vu': n4(p['valor_unitario']), 'vt': n4(p['valor_total']),
                      'c': p['created_at'], 'u': autor(p.get('created_by'))})
S['terceiro'] = []
for t in terceiros:
    nome = t['prestador'].strip()
    desc = texto(t.get('descricao')) or 'Serviço de terceiro'
    if PRESTADOR_DECIDIDO.get(nome) == 'NAO_IDENTIFICADO':
        desc = f'Prestador no Gestão Obras: {nome}. {desc}'
    S['terceiro'].append({'g': t['id'], 'os': t['os_id'], 'f': fornecedor_de[nome], 'ds': desc, 'v': n4(t['valor']),
                          'nf': texto(t.get('nota_fiscal')), 'c': t['created_at'], 'u': autor(t.get('created_by'))})

COLS_FICHA = ['capacidade_tanque_l', 'capacidade_oleo_motor_l', 'tipo_oleo_motor', 'capacidade_oleo_hidraulico_l',
              'tipo_oleo_hidraulico', 'capacidade_oleo_transmissao_l', 'tipo_oleo_transmissao',
              'capacidade_oleo_diferencial_l', 'capacidade_arrefecedor_l', 'pneu_medida', 'pneu_qtd',
              'bateria_especificacao', 'bateria_qtd', 'consumo_esperado_l_h', 'consumo_esperado_km_l',
              'garantia_fim_data', 'garantia_fim_medicao', 'observacoes_tecnicas']
S['ficha'] = []
for e in R['especificacoes_equipamento']:
    filtros = e.get('filtros') or {}
    if isinstance(filtros, dict):
        filtros = [{'tipo': ROTULO_FILTRO.get(k, k), 'codigo': str(v).strip()} for k, v in filtros.items() if str(v or '').strip()]
    registro = {'eq': e['equipamento_id'], 'c': e['created_at'], 'filtros': filtros or None}
    for c in COLS_FICHA:
        v = e.get(c)
        registro[c] = texto(v) if isinstance(v, str) else v
    S['ficha'].append(registro)

S['documento'], S['arquivo'], manifesto = [], [], []
for doc in docs:
    urls = (doc.get('foto_urls') or []) + (doc.get('arquivo_urls') or [])
    partes = []
    if texto(doc.get('numero')):
        partes.append(f'nº {doc["numero"].strip()}')
    if doc.get('emissao'):
        partes.append('emissão ' + datetime.date.fromisoformat(doc['emissao']).strftime('%d/%m/%Y'))
    if doc.get('valor') and float(doc['valor']) > 0:
        partes.append('R$ ' + f'{float(doc["valor"]):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'))
    primeiro_path = None
    for i, url in enumerate(urls):
        achado = re.search(r'/storage/v1/object/(?:sign|public)/([^/]+)/([^?]+)', url)
        bucket, caminho = achado.group(1), urllib.parse.unquote(achado.group(2))
        local = os.path.join(RETRATO, 'arquivos', bucket, caminho)
        binario = open(local, 'rb').read()
        nome_original = re.sub(r'^\d+-', '', os.path.basename(caminho))
        ext = os.path.splitext(nome_original)[1].lower()
        mime = {'.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png'}.get(ext)
        if not mime:
            sys.exit(f'extensão de anexo sem tipo: {nome_original}')
        chave = f'{doc["id"]}:{i}'
        path = f'arquivos/2026/09/{uid("arquivos", chave)}{ext}'
        primeiro_path = primeiro_path or path
        manifesto.append({'local': local, 'path': path, 'mime': mime})
        S['arquivo'].append({'k': chave, 'doc': doc['id'], 'path': path, 'nome': nome_original, 'mime': mime,
                             'b': len(binario), 'h': hashlib.sha256(binario).hexdigest(), 'c': doc['created_at']})
    S['documento'].append({'g': doc['id'], 'eq': doc['equipamento_id'], 't': TIPO_DOCUMENTO.get(doc['tipo'], doc['tipo']),
                           'ds': ', '.join(partes) or None, 'v': doc.get('vencimento'), 'p': primeiro_path, 'c': doc['created_at']})

S['historico'] = [{'g': h['id'], 'eq': h['equipamento_id'], 'de': h['status_de'], 'para': h['status_para'],
                   'm': texto(h.get('motivo')) or 'Alterado no Gestão Obras', 'c': h['created_at'], 'u': autor(h.get('created_by'))}
                  for h in R['historico_status_equipamento']]

numeros = [int(x['numero'].split('-')[-1]) for x in R['ordens_servico'] if x['numero'].startswith('OS-2026-')]
S['sequencia'] = [{'tipo': 'OS', 'ano': 2026, 'proximo': max(numeros) + 1}]

# Números da origem, contados do retrato (seção 9 do plano): a migration confere contra eles.
por_status = {}
for x in os_vivas:
    s = por_status.setdefault(x['status'], [0, Decimal(0)])
    s[0] += 1
    s[1] += Decimal(str(x['custo_total'] or 0))
saldo = {}
for e in entradas:
    saldo[insumo_de[e['insumo_id']]] = saldo.get(insumo_de[e['insumo_id']], Decimal(0)) + Decimal(str(e['quantidade']))
for p in pecas + oleos:
    saldo[insumo_de[p['insumo_id']]] = saldo.get(insumo_de[p['insumo_id']], Decimal(0)) - Decimal(str(p['quantidade']))
# O esperado é o saldo que o app antigo mostra (v_saldo_estoque, Central + Silo, que viram um
# depósito só). A soma acima é a mesma regra escrita aqui; se as duas discordarem, para.
saldo_app = {}
for v in R['v_saldo_estoque']:
    if v['deposito_id'] in (CENTRAL, SILO) and v['insumo_id'] in insumo_de:
        alvo = insumo_de[v['insumo_id']]
        saldo_app[alvo] = saldo_app.get(alvo, Decimal(0)) + Decimal(str(v['saldo']))
divergem = {i for i in set(saldo) | set(saldo_app)
            if saldo.get(i, Decimal(0)) != saldo_app.get(i, Decimal(0)) and i in saldo_app}
if divergem:
    sys.exit(f'saldo do app antigo diverge da soma em {len(divergem)} peças: {sorted(divergem)[:5]}')
sem_view = [i for i in saldo if i not in saldo_app]
if sem_view:
    print(f'aviso: {len(sem_view)} peças fora da v_saldo_estoque (insumo inativo na origem); esperado pela soma')
saldo = {i: saldo_app.get(i, v) for i, v in saldo.items()}
S['esperado'] = [
    {'chave': 'ordens_servico', 'n': len(os_vivas)}, {'chave': 'os_pecas', 'n': len(pecas)},
    {'chave': 'os_oleos', 'n': len(oleos)}, {'chave': 'os_terceiros', 'n': len(terceiros)},
    {'chave': 'almoxarifado_entradas', 'n': len(entradas)}, {'chave': 'tipos_oleo', 'n': len(R['tipos_oleo'])},
    {'chave': 'equipamento_especificacoes', 'n': len(R['especificacoes_equipamento'])},
    {'chave': 'equipamento_documentos', 'n': len(docs)}, {'chave': 'anexo_vinculos', 'n': len(manifesto)},
    {'chave': 'equipamento_status_historico', 'n': len(R['historico_status_equipamento'])},
] + [{'chave': f'os_{st}', 'n': n, 'v': str(custo)} for st, (n, custo) in sorted(por_status.items())]
S['saldo_esperado'] = [{'i': iid, 's': str(v)} for iid, v in sorted(saldo.items())]

if autores_sem_par:
    print(f'aviso: autores sem usuário no ERP (ficam sem autor): {sorted(autores_sem_par)}')

# ---------------------------------------------------------------------------
# Lotes do staging
# ---------------------------------------------------------------------------
for antigo in os.listdir(RETRATO):
    if antigo.startswith('staging_') and antigo.endswith('.sql'):
        os.remove(os.path.join(RETRATO, antigo))

partes = []   # (tabela, parte, json)
for tabela, registros in S.items():
    atual, n = [], 1
    for r in registros:
        atual.append(r)
        if len(json.dumps(atual, ensure_ascii=False, separators=(',', ':'))) > LOTE_BYTES:
            atual.pop()
            partes.append((tabela, n, atual))
            atual, n = [r], n + 1
    partes.append((tabela, n, atual))
manifesto_partes = {}
for tabela, n, _ in partes:
    manifesto_partes[tabela] = max(manifesto_partes.get(tabela, 0), n)
partes.append(('manifesto', 1, [manifesto_partes]))

lotes, atual, tamanho = [], [], 0
for tabela, n, regs in partes:
    corpo = json.dumps(regs, ensure_ascii=False, separators=(',', ':'))
    if '$j$' in corpo:
        sys.exit('o dado contém o delimitador $j$')
    sql = (f"insert into legado.carga_fase2d (tabela, parte, dados) values ('{tabela}', {n}, $j${corpo}$j$::jsonb)\n"
           f"on conflict (tabela, parte) do update set dados = excluded.dados;\n")
    if atual and tamanho + len(sql) > LOTE_BYTES:
        lotes.append(atual)
        atual, tamanho = [], 0
    atual.append(sql)
    tamanho += len(sql)
lotes.append(atual)
for i, lote in enumerate(lotes, 1):
    open(os.path.join(RETRATO, f'staging_{i:02d}.sql'), 'w', encoding='utf-8').write(''.join(lote))

json.dump(manifesto, open(os.path.join(RETRATO, 'anexos.json'), 'w'), indent=1)
print(f'OS {len(os_vivas)} | peças {len(pecas)} | óleos {len(oleos)} | terceiros {len(terceiros)} | entradas {len(entradas)}')
print(f'insumos: {len(insumo_de) - sum(1 for v in insumo_de.values() if v in {c["id"] for c in criar.values()})} casados, '
      f'{len(criar)} a criar | fornecedores novos {len(fornecedores_novos)} | anexos {len(manifesto)}')
print(f'OS por status: { {k: (v[0], str(v[1])) for k, v in por_status.items()} }')
print(f'staging: {len(lotes)} lotes, {sum(len("".join(l)) for l in lotes) // 1024} KB')
