"""Gera a migration da carga de de-para da Fase 1 (cadastros) a partir dos CSVs.

Uso: python3 scripts/migracao-gestao-obras/gerar_carga_fase1.py

Lê os CSVs desta pasta (revisados pelo Tiago) e o retrato dos equipamentos da origem,
e escreve supabase/migrations/20260922210000_fase1_carga_de_para.sql.

Travas:
- Fornecedor com confiança baixa ou média precisa estar em APROVADOS_PELO_TIAGO, senão
  a migration gerada começa com um raise e não aplica.
- Fornecedor sem erp_fornecedor_id só passa se o método for CRIAR.
- Dois equipamentos da origem que viram um só no ERP (fusão) com valores diferentes
  são impressos; o gerador escolhe o não nulo e, para status, o de quem ficou (o ERP).
"""
import csv
import json
import os
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
SAIDA = os.path.join(RAIZ, 'supabase/migrations/20260922210000_fase1_carga_de_para.sql')

# gestao_obras_id dos fornecedores de confiança baixa/média que o Tiago aprovou, com
# o erp_fornecedor_id que ele escolheu (None = aprovar o que está no CSV).
APROVADOS_PELO_TIAGO = {
    # 22/09/2026, Tiago: "a EMT correta é a EMT Construtora Ltda". Os dois cadastros da
    # própria EMT na origem apontam para ele; "EMT" e "E M T CONSTRUTORA LTDA" do ERP ficam
    # como estão.
    'mrcb97s0buj3b': '199e9f13-5e76-4c07-b54e-27fdf857f39c',  # EMT
    'mrcb984g7ciwc': '199e9f13-5e76-4c07-b54e-27fdf857f39c',  # E M T CONSTRUTORA LTDA
    # 22/09/2026, Tiago: CASAS DAS MÁQUINAS é a "Casa da máquina" do CSV.
    'mrjfx4i9y8g98': None,
}


def ler(nome):
    return list(csv.DictReader(open(os.path.join(D, nome), encoding='utf-8'), delimiter=';'))


def q(valor):
    """Literal SQL de texto (ou null)."""
    if valor is None or valor == '':
        return 'null'
    return "'" + str(valor).replace("'", "''") + "'"


fornecedores = ler('fornecedores-de-para.csv')
equipamentos = ler('equipamentos-de-para.csv')
obras = ler('obras-de-para.csv')
insumos = ler('insumos-combustivel-de-para.csv')
usuarios = ler('usuarios-de-para.csv')
origem_equip = {e['id']: e for e in json.load(open(os.path.join(D, 'equipamentos-origem-2026-09-22.json')))}

pendencias = []
for f in fornecedores:
    gid = f['gestao_obras_id']
    if gid in APROVADOS_PELO_TIAGO:
        if APROVADOS_PELO_TIAGO[gid]:
            f['erp_fornecedor_id'] = APROVADOS_PELO_TIAGO[gid]
        f['confianca'] = 'aprovado_tiago'
    if f['metodo'] == 'CRIAR':
        continue
    if not f['erp_fornecedor_id']:
        pendencias.append(f"fornecedor {f['nome_gestao_obras']} ({gid}) sem par no ERP")
    elif f['confianca'] in ('baixa', 'media') and gid not in APROVADOS_PELO_TIAGO:
        pendencias.append(f"fornecedor {f['nome_gestao_obras']} ({gid}) -> {f['erp_razao_social']}: confianca {f['confianca']}, falta o ok do Tiago")

# Equipamento: agrupa por ERP para achar fusões.
por_erp = {}
for e in equipamentos:
    por_erp.setdefault(e['erp_equipamento_id'], []).append(e['gestao_obras_id'])
faltam_origem = [e['gestao_obras_id'] for e in equipamentos if e['gestao_obras_id'] not in origem_equip]
if faltam_origem:
    sys.exit(f'equipamentos do de-para sem retrato da origem: {faltam_origem}')

dados_equip = {}
for erp_id, gids in por_erp.items():
    linhas = [origem_equip[g] for g in gids]
    def primeiro(chave):
        vals = [l[chave] for l in linhas if l[chave] not in (None, '', 0)]
        if len(set(map(str, vals))) > 1:
            print(f'FUSAO com valores diferentes em {chave}: {gids} -> {vals}; ficou o primeiro')
        return vals[0] if vals else None
    status = [l['status'] for l in linhas]
    if len(set(status)) > 1:
        print(f'FUSAO com status diferentes: {gids} -> {status}; ficou ativa (o equipamento que sobrou esta em uso)')
        st = 'ativa'
    else:
        st = status[0]
    dados_equip[erp_id] = dict(status=st, mi=primeiro('mi'), ns=primeiro('ns'), da=primeiro('da'), dv=primeiro('dv'))

o = []
o.append("""-- Carga dos de-paras da Fase 1: cadastros do Gestão Obras → ERP.
-- GERADO por scripts/migracao-gestao-obras/gerar_carga_fase1.py a partir dos CSVs revisados.
-- Não editar à mão: mudar o CSV (ou APROVADOS_PELO_TIAGO no gerador) e gerar de novo.
--
-- O que faz:
--   1. schema `legado` (sem grant nenhum para o app) com as tabelas de de-para: id da
--      origem (texto) → id do ERP (uuid). Serve à carga das Fases 2 a 4 e à conferência.
--   2. cria os dois fornecedores que não existem: EMT TRANSPORTES e JOHN DEERE (o Tiago
--      confirmou em 22/09 que John Deere NÃO é a JD COMERCIO E IMPORTACAO).
--   3. marca transportadora e dono de tanque nos fornecedores do ERP (tabela 6.1). Areacre
--      e Areacre - Josias são um fornecedor só: as marcas somam.
--   4. cria o insumo ARLA 32 - LITRO (decisão 6: o tanque conta litro).
--   5. copia situação, medição inicial, série e datas dos equipamentos. Medição inicial 0
--      na origem é o padrão do campo, não uma leitura: vira nulo.
--
-- Não cria lançamento, parcela nem rateio. Não mexe em permissão.
""")

if pendencias:
    o.append('-- ============================================================================\n')
    o.append('-- PENDÊNCIAS: enquanto houver, esta migration recusa aplicar.\n')
    o.append('-- ============================================================================\n')
    corpo = '\\n'.join(p.replace("'", "''") for p in pendencias)
    o.append(f"do $pendente$ begin raise exception E'Carga da Fase 1 com pendencias do Tiago:\\n{corpo}'; end $pendente$;\n\n")

o.append("""create schema if not exists legado;
revoke all on schema legado from public, anon, authenticated;
comment on schema legado is 'De-para dos ids do Gestão Obras. Só para carga e conferência; apagar depois da Fase 5.';

create table if not exists legado.de_para_fornecedores (
  gestao_obras_id text primary key,
  nome_origem text not null,
  fornecedor_id uuid not null references public.fornecedores(id),
  metodo text not null,
  confianca text not null
);
create table if not exists legado.de_para_equipamentos (
  gestao_obras_id text primary key,
  equipamento_id uuid not null references public.equipamentos(id)
);
create table if not exists legado.de_para_obras (
  gestao_obras_id text primary key,
  nome_origem text not null,
  obra_id uuid references public.obras(id),
  centro_custo_id uuid not null references public.centros_custo(id)
);
create table if not exists legado.de_para_insumos (
  gestao_obras_id text primary key,
  nome_origem text not null,
  insumo_id uuid not null references public.insumos(id)
);
create table if not exists legado.de_para_usuarios (
  gestao_obras_id text primary key,
  nome_origem text not null,
  usuario_id uuid references public.usuarios(id),
  acao text not null check (acao in ('CASAR', 'CONVIDAR'))
);

do $rls$
declare t text;
begin
  foreach t in array array['de_para_fornecedores','de_para_equipamentos','de_para_obras','de_para_insumos','de_para_usuarios'] loop
    execute format('alter table legado.%I enable row level security', t);
    execute format('revoke all on legado.%I from public, anon, authenticated', t);
  end loop;
end $rls$;

""")

# 2. fornecedores novos
o.append('-- 2. Fornecedores novos\n')
for f in fornecedores:
    if f['metodo'] != 'CRIAR':
        continue
    cnpj = ''.join(ch for ch in f['cnpj_gestao_obras'] if ch.isdigit())
    o.append(
        "insert into public.fornecedores (tipo, razao_social, cnpj_cpf, eh_transportadora, eh_dona_de_tanque, ativo)\n"
        f"select 'pj', {q(f['nome_gestao_obras'])}, {q(cnpj)}, {str(f['eh_transportadora'] == 'true').lower()}, {str(f['eh_dona_de_tanque'] == 'true').lower()}, true\n"
        f"where not exists (select 1 from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome({q(f['nome_gestao_obras'])}));\n")
o.append('\n')

# 1b. de-para fornecedores
o.append('-- 1b. De-para de fornecedores (CRIAR resolve pelo nome do que acabou de ser criado)\n')
linhas = []
for f in fornecedores:
    if f['metodo'] == 'CRIAR':
        alvo = f"(select id from public.fornecedores where public.fn_chave_nome(razao_social) = public.fn_chave_nome({q(f['nome_gestao_obras'])}))"
    elif f['erp_fornecedor_id']:
        alvo = f"{q(f['erp_fornecedor_id'])}::uuid"
    else:
        continue
    linhas.append(f"  ({q(f['gestao_obras_id'])}, {q(f['nome_gestao_obras'])}, {alvo}, {q(f['metodo'])}, {q(f['confianca'])})")
o.append('insert into legado.de_para_fornecedores (gestao_obras_id, nome_origem, fornecedor_id, metodo, confianca) values\n' + ',\n'.join(linhas) + '\non conflict (gestao_obras_id) do nothing;\n\n')

# 3. marcas
o.append('-- 3. Transportadora e dono de tanque (soma das marcas quando dois da origem viram um)\n')
marcas = {}
for f in fornecedores:
    if f['metodo'] == 'CRIAR' or not f['erp_fornecedor_id']:
        continue
    t, d = f['eh_transportadora'] == 'true', f['eh_dona_de_tanque'] == 'true'
    atual = marcas.get(f['erp_fornecedor_id'], [False, False])
    marcas[f['erp_fornecedor_id']] = [atual[0] or t, atual[1] or d]
vals = [f"  ({q(k)}::uuid, {str(t).lower()}, {str(d).lower()})" for k, (t, d) in sorted(marcas.items()) if t or d]
o.append('update public.fornecedores f set eh_transportadora = f.eh_transportadora or v.t, eh_dona_de_tanque = f.eh_dona_de_tanque or v.d\nfrom (values\n' + ',\n'.join(vals) + '\n) v(id, t, d) where f.id = v.id;\n\n')

# 4. Arla litro
o.append("""-- 4. Insumo Arla em litro, com as mesmas categorias do galão 1335M186
insert into public.insumos (nome, categoria_id, categoria_financeira_id, unidade_id, descricao, ativo)
select 'ARLA 32 - LITRO', g.categoria_id, g.categoria_financeira_id,
       (select id from public.unidades_medida where sigla = 'L'),
       'Arla a granel, em litro. O galão de 20 L (1335M186) converte na entrada do tanque.', true
from public.insumos g
where g.codigo = '1335M186'
  and not exists (select 1 from public.insumos where public.fn_chave_nome(nome) = public.fn_chave_nome('ARLA 32 - LITRO'));

""")

o.append('-- 1c. De-para de insumos de combustível\n')
linhas = []
for i in insumos:
    if i['erp_insumo_id'] == 'CRIAR_ARLA_LITRO':
        alvo = "(select id from public.insumos where public.fn_chave_nome(nome) = public.fn_chave_nome('ARLA 32 - LITRO'))"
    else:
        alvo = f"{q(i['erp_insumo_id'])}::uuid"
    linhas.append(f"  ({q(i['gestao_obras_id'])}, {q(i['nome_gestao_obras'])}, {alvo})")
o.append('insert into legado.de_para_insumos values\n' + ',\n'.join(linhas) + '\non conflict do nothing;\n\n')

o.append('-- 1d. De-para de obras (009 e 010 → a obra única; Empresa EMT → Escritório Central)\n')
linhas = []
for ob in obras:
    obra = f"{q(ob['erp_obra_id'])}::uuid" if ob['erp_obra_id'] else 'null::uuid'
    linhas.append(f"  ({q(ob['gestao_obras_id'])}, {q(ob['nome_gestao_obras'])}, {obra}, {q(ob['erp_centro_custo_raiz_id'])}::uuid)")
o.append('insert into legado.de_para_obras values\n' + ',\n'.join(linhas) + '\non conflict do nothing;\n\n')

o.append('-- 1e. De-para de usuários (CONVIDAR fica sem usuario_id até o convite ser aceito). Sem email:\n-- o repositório é público, e o email do convite se lê da origem na hora de convidar.\n')
linhas = []
for u in usuarios:
    uid = f"{q(u['erp_usuario_id'])}::uuid" if u['erp_usuario_id'] else 'null::uuid'
    linhas.append(f"  ({q(u['gestao_obras_id'])}, {q(u['nome_gestao_obras'])}, {uid}, {q(u['acao'])})")
o.append('insert into legado.de_para_usuarios values\n' + ',\n'.join(linhas) + '\non conflict do nothing;\n\n')

o.append('-- 1f. De-para de equipamentos (equipamentos-de-para.csv, feito em 22/09)\n')
linhas = [f"  ({q(e['gestao_obras_id'])}, {q(e['erp_equipamento_id'])}::uuid)" for e in equipamentos]
o.append('insert into legado.de_para_equipamentos values\n' + ',\n'.join(linhas) + '\non conflict do nothing;\n\n')

o.append('-- 5. Dados de cadastro dos equipamentos, vindos da origem (só o que a origem tem; não apaga o que o ERP já tem)\n')
linhas = []
for erp_id, dd in sorted(dados_equip.items()):
    mi = 'null::numeric' if dd['mi'] in (None, 0) else repr(dd['mi'])
    linhas.append(f"  ({q(erp_id)}::uuid, {q(dd['status'])}, {mi}, {q(dd['ns'])}, {q(dd['da'])}::date, {q(dd['dv'])}::date)")
o.append('update public.equipamentos e set status = v.status, medicao_inicial = coalesce(e.medicao_inicial, v.mi),\n'
         '  numero_serie = coalesce(e.numero_serie, v.ns), data_aquisicao = coalesce(e.data_aquisicao, v.da),\n'
         '  data_venda = coalesce(e.data_venda, v.dv)\nfrom (values\n' + ',\n'.join(linhas) + '\n) v(id, status, mi, ns, da, dv) where e.id = v.id;\n\n')

n_forn = sum(1 for f in fornecedores if f['metodo'] == 'CRIAR' or f['erp_fornecedor_id'])
o.append(f"""-- Conferência: a carga só fica se os números fecharem.
do $confere$
declare v int;
begin
  select count(*) into v from legado.de_para_fornecedores;
  if v <> {n_forn} then raise exception 'de_para_fornecedores: % linhas, esperado {n_forn}', v; end if;
  select count(*) into v from legado.de_para_equipamentos;
  if v <> {len(equipamentos)} then raise exception 'de_para_equipamentos: % linhas, esperado {len(equipamentos)}', v; end if;
  select count(*) into v from legado.de_para_obras;
  if v <> {len(obras)} then raise exception 'de_para_obras: % linhas, esperado {len(obras)}', v; end if;
  select count(*) into v from legado.de_para_insumos;
  if v <> {len(insumos)} then raise exception 'de_para_insumos: % linhas, esperado {len(insumos)}', v; end if;
  select count(*) into v from legado.de_para_usuarios;
  if v <> {len(usuarios)} then raise exception 'de_para_usuarios: % linhas, esperado {len(usuarios)}', v; end if;
  select count(*) into v from public.fornecedores where eh_transportadora;
  raise notice 'transportadoras no ERP: %', v;
end $confere$;
""")

open(SAIDA, 'w', encoding='utf-8').write(''.join(o))
print('escrito', SAIDA)
print('pendencias:', len(pendencias))
for p in pendencias:
    print('  -', p)
