"""Prova da carga do Combustível e do Frete DEPOIS de aplicada: origem x ERP lado a lado.

Uso: python3 scripts/migracao-gestao-obras/provar_carga_fase34.py

Só lê. A origem é o retrato congelado (_retrato/esperado34.json, gerado por
gerar_carga_fase34.py do mesmo retrato que foi carregado); o ERP é lido agora pelo
`supabase db query --linked` (confere que é o ERP). Imprime cada número dos dois lados e
termina com PROVA OK só se todos baterem: saldo de cada transportadora na 4a casa (Areacre +
Areacre - Josias somados), nível, valor em estoque e preço PEPS da última saída de cada tanque,
fretes, saídas e pagamentos por mês, e as contagens. Os números da carga em si já foram
conferidos dentro da migration (ela aborta se não bater); esta prova repete a leitura depois do
commit, com o banco como ficou, e é a que se mostra ao Tiago.
"""
import collections
import json
import os
import re
import subprocess
import sys
from decimal import Decimal

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'vsesgvqjgqpapoxhnbqx'
if open(os.path.join(RAIZ, 'supabase/.temp/project-ref')).read().strip() != ERP:
    sys.exit('projeto linkado não é o ERP: parei')
E = json.load(open(os.path.join(D, '_retrato', 'esperado34.json')))

SQL = r"""
select jsonb_build_object(
  'saldo', (select jsonb_object_agg(transportadora_id, s) from (
     select transportadora_id, sum(case when tipo in ('credito_frete','credito_abastecimento_transterra','ajuste_manual_credito')
            then valor else -valor end) s from public.transportadora_movimentos group by 1) x),
  'depara', (select jsonb_object_agg(gestao_obras_id, fornecedor_id) from legado.de_para_fornecedores),
  'tanque', (select jsonb_object_agg(t.id, jsonb_build_object('nivel', t.nivel_atual_litros,
     've', round(coalesce((select sum((l.litros - coalesce((select sum(c.litros) from public.combustivel_camadas c where c.fonte_id = l.id), 0))
                  * l.valor_total / l.litros) from (select id, litros, valor_total from public.combustivel_entradas
                  where tanque_id = t.id and excluido_em is null union all select id, litros, valor_total
                  from public.combustivel_transferencias where tanque_destino_id = t.id and excluido_em is null) l), 0), 4)))
     from public.tanques t),
  'ultimo', (select jsonb_object_agg(saida_id, p) from (select saida_id, round(sum(litros * preco) / sum(litros), 4) p
     from public.combustivel_camadas group by saida_id) x),
  'mes', (select jsonb_object_agg(k, v) from (
     select 'fretes|' || to_char(data, 'YYYY-MM') k, jsonb_build_array(count(*), sum(valor_total)::text, sum(valor_material)::text) v
       from public.fretes where excluido_em is null group by 1
     union all select 'saidas|' || to_char(data at time zone 'America/Rio_Branco', 'YYYY-MM'),
       jsonb_build_array(count(*), sum(valor_total)::text, sum(litros)::text) from public.combustivel_saidas where excluido_em is null group by 1
     union all select 'pagamentos|' || to_char(data, 'YYYY-MM'), jsonb_build_array(count(*), sum(valor)::text, sum(quantidade_combustivel)::text)
       from public.frete_pagamentos where excluido_em is null group by 1) x),
  'conta', jsonb_build_object(
     'fretes', (select count(*) from public.fretes where excluido_em is null),
     'fretes_excluidos', (select count(*) from public.fretes where excluido_em is not null),
     'frete_pagamentos', (select count(*) from public.frete_pagamentos where excluido_em is null),
     'frete_pagamentos_excluidos', (select count(*) from public.frete_pagamentos where excluido_em is not null),
     'pedidos_material', (select count(*) from public.pedidos_material where excluido_em is null),
     'pedidos_material_excluidos', (select count(*) from public.pedidos_material where excluido_em is not null),
     'combustivel_entradas', (select count(*) from public.combustivel_entradas where excluido_em is null),
     'combustivel_entradas_excluidos', (select count(*) from public.combustivel_entradas where excluido_em is not null),
     'combustivel_saidas', (select count(*) from public.combustivel_saidas where excluido_em is null),
     'combustivel_saidas_excluidos', (select count(*) from public.combustivel_saidas where excluido_em is not null),
     'combustivel_transferencias', (select count(*) from public.combustivel_transferencias where excluido_em is null),
     'combustivel_transferencias_excluidos', (select count(*) from public.combustivel_transferencias where excluido_em is not null),
     'combustivel_esvaziamentos', (select count(*) from public.combustivel_esvaziamentos),
     'tanques', (select count(*) from public.tanques),
     'abastecimento_alocacoes', (select count(*) from public.abastecimento_alocacoes),
     'pedido_material_itens', (select count(*) from public.pedido_material_itens),
     'localidades', (select count(*) from public.localidades),
     'frete_ajustes', (select count(*) from public.frete_ajustes where status = 'aprovado'),
     'combustivel_anomalias_conferidas', (select count(*) from public.combustivel_anomalias_conferidas),
     'frete_anomalias_conferidas', (select count(*) from public.frete_anomalias_conferidas),
     'combustivel_camadas', (select count(*) from public.combustivel_camadas),
     'combustivel_sem_suprimento', (select count(*) from public.combustivel_sem_suprimento),
     'anexos', (select count(*) from public.anexo_vinculos where entidade_tipo in ('frete','frete_chegada','frete_pagamento',
        'pedido_material','combustivel_entrada','combustivel_saida','combustivel_transferencia'))))
"""


def erp():
    arq = os.path.join(D, '_retrato', 'prova34.sql')
    open(arq, 'w').write(SQL)
    r = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', arq], cwd=RAIZ, capture_output=True, text=True)
    m = re.search(r'\{.*\}', r.stdout, re.S)
    if r.returncode != 0 or not m:
        sys.exit(f'leitura do ERP falhou: {(r.stdout + r.stderr)[-500:]}')
    linhas = json.loads(m.group(0), parse_float=Decimal)['rows']  # numeric exato
    return next(iter(linhas[0].values()))


import hashlib  # noqa: E402
import uuid  # noqa: E402


def uid(t, c):
    return str(uuid.UUID(hashlib.md5(f'gestao_obras:{t}:{c}'.encode()).hexdigest()))


B = erp()
ok = True


def linha(rotulo, origem, destino):
    global ok
    igual = origem == destino
    ok &= igual
    print(f'{"ok " if igual else "DIF"} {rotulo:<48} origem {str(origem):>22}   ERP {str(destino):>22}')


print('\n== Saldo por transportadora (conta corrente, 4 casas)')
esp = collections.defaultdict(Decimal)
nomes = collections.defaultdict(list)
for s in E['esperado_saldo']:
    f = B['depara'][s['g']]
    esp[f] += Decimal(s['s'])
    nomes[f].append(s['nome'])
for f in sorted(set(esp) | set(B['saldo'] or {})):
    linha(' + '.join(nomes.get(f, [f])), esp.get(f, Decimal(0)), Decimal(str((B['saldo'] or {}).get(f, 0))))

print('\n== Tanques: nível (L) | valor em estoque (R$) | PEPS da última saída (R$/L)')
for t in E['esperado_tanque']:
    b = B['tanque'][uid('depositos', t['g'])]
    linha(f'{t["nome"]} nível', Decimal(t['nivel']), Decimal(str(b['nivel'])))
    linha(f'{t["nome"]} estoque', Decimal(t['ve']), Decimal(str(b['ve'])))
    if t['us']:
        linha(f'{t["nome"]} PEPS última saída', Decimal(t['up']), Decimal(str(B['ultimo'].get(uid('saidas_combustivel', t['us'])))))

print('\n== Por mês (quantidade, valor, litros/material)')
for m in E['esperado_mes']:
    b = B['mes'].get(f'{m["t"]}|{m["m"]}', [0, 0, 0])
    linha(f'{m["t"]} {m["m"]}', (m['n'], Decimal(m['v']), Decimal(m['x'])), (b[0], Decimal(str(b[1])), Decimal(str(b[2]))))

print('\n== Contagens')
for e in E['esperado']:
    if e['chave'] in B['conta']:
        linha(e['chave'], e['n'], B['conta'][e['chave']])

print('\nPROVA OK' if ok else '\nPROVA FALHOU')
sys.exit(0 if ok else 1)
