"""Ensaio da carga do Combustível e do Frete (Fases 3 e 4) contra o ERP, sem gravar nada.

Uso:
  python3 scripts/migracao-gestao-obras/ensaiar_carga_fase34.py            # tudo num arquivo só
  python3 scripts/migracao-gestao-obras/ensaiar_carga_fase34.py --staging  # staging já no banco
  python3 scripts/migracao-gestao-obras/ensaiar_carga_fase34.py --via-2d   # lotes no staging da 2d

Um arquivo só passa de ~1 MB e a API recusa (413): o staging tem ~5 MB. Antes do preparo
aplicado, use --via-2d (ver carregar_staging_fase34.py). Sem --staging (antes de o preparo 20260925120000 estar aplicado): cada rodada é UM statement
(um DO block) que cria o staging, enche com os lotes de _retrato/staging34_*.sql, roda a carga
e termina em raise, então nada persiste nem o staging. Com --staging: lê o staging que o
carregar_staging_fase34.py encheu.

Três rodadas, como na 2d:
  1. ENSAIO: carga inteira com a conferência; tem que sair "ENSAIO OK".
  2. CONTROLE: o saldo esperado de uma transportadora errado em R$ 0,0001; a carga tem que RECUSAR.
  3. ROLLBACK: carga de verdade + rollback, tudo dentro do bloco que aborta; tem que voltar a zero.
Roda no projeto linkado (confere que é o ERP). Grava o relatório em _retrato/ensaio34_*.txt.
"""
import glob
import json
import os
import re
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'vsesgvqjgqpapoxhnbqx'
PREPARO = os.path.join(RAIZ, 'supabase/migrations/20260925120000_fase34_preparo_carga.sql')
CARGA = glob.glob(os.path.join(RAIZ, 'supabase/migrations/*20260925130000_fase34_carga_combustivel_frete.sql'))[0]
ROLLBACK = os.path.join(RAIZ, 'supabase/rollbacks/20260925130000_fase34_carga_combustivel_frete_rollback.sql')
NO_BANCO = '--staging' in sys.argv
VIA_2D = '--via-2d' in sys.argv  # lotes em legado.carga_fase2d com prefixo 'f34:' (carregar_staging_fase34.py --via-2d)
SO = [a for a in sys.argv[1:] if a in ('ensaio', 'controle', 'rollback')] or ['ensaio', 'controle', 'rollback']

if open(os.path.join(RAIZ, 'supabase/.temp/project-ref')).read().strip() != ERP:
    sys.exit('projeto linkado não é o ERP: parei')
preparo, carga, rollback = open(PREPARO).read(), open(CARGA).read(), open(ROLLBACK).read()
lotes = [open(f).read() for f in sorted(glob.glob(os.path.join(D, '_retrato', 'staging34_*.sql')))]
if not NO_BANCO and not lotes:
    sys.exit('sem lotes: rodar gerar_carga_fase34.py')
for t in [preparo, carga, rollback] + lotes:
    if any(m in t for m in ('$q1$', '$q2$', '$qp$', '$qs$', '$ctl$')):
        sys.exit('delimitador de ensaio dentro do SQL')


def rodar(nome, corpo):
    sql = 'do $ctl$\ndeclare r jsonb;\nbegin\n'
    if VIA_2D:
        sql += f'  execute $qp${preparo}$qp$;\n  delete from legado.carga_fase34;\n'
        sql += ("  insert into legado.carga_fase34 (tabela, parte, dados)\n"
                "  select substr(tabela, 5), parte, dados from legado.carga_fase2d where tabela like 'f34:%';\n")
    elif not NO_BANCO:
        sql += f'  execute $qp${preparo}$qp$;\n  delete from legado.carga_fase34;\n'
        sql += ''.join(f'  execute $qs${lote}$qs$;\n' for lote in lotes)
    sql += corpo + '\nend $ctl$;\n'
    arquivo = os.path.join(D, '_retrato', f'ensaio34_{nome}.sql')
    open(arquivo, 'w').write(sql)
    print(f'{nome}: {len(sql) / 1e6:.1f} MB', flush=True)
    r = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', arquivo], cwd=RAIZ, capture_output=True, text=True)
    saida = (r.stdout + r.stderr)
    open(os.path.join(D, '_retrato', f'ensaio34_{nome}.txt'), 'w').write(saida)
    limpa = saida.replace('\\\\\\"', '"').replace('\\"', '"')
    achado = re.search(r'ERROR:\s+P0001: (.*?)\\n', limpa) or re.search(r'ERROR:\s+(.*?)(?:\\n|$)', limpa)
    return achado.group(1).rstrip('\\ ') if achado else limpa[-800:]


ok = True
if 'ensaio' in SO:
    m = rodar('ensaio', f"  perform set_config('app.carga_ensaio', 'sim', true);\n  execute $q1${carga}$q1$;")
    print('1. ENSAIO:', m[:3000])
    ok &= m.startswith('ENSAIO OK')

if 'controle' in SO:
    m = rodar('controle', (
        "  update legado.carga_fase34 set dados = (select jsonb_agg(case when e ->> 'nome' = 'Areacre'\n"
        "    then jsonb_set(e, '{s}', to_jsonb(((e ->> 's')::numeric - 0.0001)::text)) else e end) from jsonb_array_elements(dados) e)\n"
        "  where tabela = 'esperado_saldo';\n"
        f"  perform set_config('app.carga_ensaio', 'sim', true);\n  execute $q1${carga}$q1$;"))
    print('2. CONTROLE (Areacre R$ 0,0001 a menos):', m[:600])
    ok &= m.startswith('Carga não bate') and 'saldo Areacre' in m

if 'rollback' in SO:
    contagem = ", ".join(f"'{t}', (select count(*) from public.{t})" for t in (
        'fretes', 'frete_pagamentos', 'pedidos_material', 'pedido_material_itens', 'frete_ajustes', 'transportadora_movimentos',
        'tanques', 'combustivel_entradas', 'combustivel_saidas', 'abastecimento_alocacoes', 'combustivel_transferencias',
        'combustivel_esvaziamentos', 'combustivel_camadas', 'combustivel_sem_suprimento', 'localidades',
        'combustivel_anomalias_conferidas', 'frete_anomalias_conferidas'))
    m = rodar('rollback', (
        f"  perform set_config('app.carga_ensaio', 'nao', true);\n  execute $q1${carga}$q1$;\n"
        "  r := jsonb_build_object('fretes_depois_da_carga', (select count(*) from public.fretes));\n"
        f"  execute $q2${rollback}$q2$;\n"
        f"  r := r || jsonb_build_object({contagem},\n"
        "    'anexos', (select count(*) from public.anexo_vinculos where entidade_tipo in ('frete', 'frete_chegada', 'frete_pagamento',\n"
        "       'pedido_material', 'combustivel_entrada', 'combustivel_saida', 'combustivel_transferencia')),\n"
        "    'insumos_novos', (select count(*) from public.insumos where descricao like 'Criado na migração do Frete%'),\n"
        "    'painel', (select cardinality(fornecedor_ids) from public.frete_painel_config));\n"
        "  raise exception 'ROLLBACK %', r;"))
    print('3. ROLLBACK:', m[:1500])
    try:
        r = json.loads(m.split(' ', 1)[1])
        ok &= r.pop('fretes_depois_da_carga') > 0 and all(v == 0 for v in r.values())
    except (ValueError, IndexError, KeyError, AttributeError):
        ok = False

print('ENSAIO COMPLETO OK' if ok else 'ENSAIO FALHOU')
sys.exit(0 if ok else 1)
