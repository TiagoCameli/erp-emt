"""Prova da carga da Manutenção (Fase 2d) contra o staging, sem gravar nada no ERP.

Uso: python3 scripts/migracao-gestao-obras/provar_carga_fase2d.py

Três rodadas, cada uma num statement só que termina em raise (atômico mesmo que a API não
abra transação):
  1. ENSAIO: a carga inteira com a conferência; tem que sair "ENSAIO OK".
  2. CONTROLE: o esperado da origem errado em 1 centavo; a carga tem que RECUSAR.
  3. ROLLBACK: carga de verdade + rollback; tudo tem que voltar a zero.
Roda no projeto linkado (confere que é o ERP). Precisa do staging cheio
(carregar_staging_fase2d.py).
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
CARGA = glob.glob(os.path.join(RAIZ, 'supabase/migrations/*20260923170000_fase2d_carga_manutencao.sql'))[0]
ROLLBACK = os.path.join(RAIZ, 'supabase/rollbacks/20260923170000_fase2d_carga_manutencao_rollback.sql')

if open(os.path.join(RAIZ, 'supabase/.temp/project-ref')).read().strip() != ERP:
    sys.exit('projeto linkado não é o ERP: parei')
carga, rollback = open(CARGA).read(), open(ROLLBACK).read()
for t in (carga, rollback):
    if any(m in t for m in ('$q1$', '$q2$', '$ctl$')):
        sys.exit('delimitador de prova dentro da carga')


def rodar(nome, sql):
    arquivo = os.path.join(D, '_retrato', f'prova_{nome}.sql')
    open(arquivo, 'w').write(sql)
    r = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', arquivo], cwd=RAIZ, capture_output=True, text=True)
    saida = (r.stdout + r.stderr).replace('\\\\\\"', '"').replace('\\"', '"')
    achado = re.search(r'ERROR:\s+P0001: (.*?)\\n', saida)
    return achado.group(1).rstrip('\\ ') if achado else saida[-400:]


def bloco(corpo):
    return f'do $ctl$\ndeclare r jsonb;\nbegin\n{corpo}\nend $ctl$;\n'


ok = True
m = rodar('ensaio', bloco(f"  perform set_config('app.carga_ensaio', 'sim', true);\n  execute $q1${carga}$q1$;"))
print('1. ENSAIO:', m)
ok &= m.startswith('ENSAIO OK')

m = rodar('controle', bloco(
    "  update legado.carga_fase2d set dados = (select jsonb_agg(case when e ->> 'chave' = 'os_concluida'\n"
    "    then jsonb_set(e, '{v}', to_jsonb(((e ->> 'v')::numeric - 0.01)::text)) else e end) from jsonb_array_elements(dados) e)\n"
    "  where tabela = 'esperado';\n"
    f"  perform set_config('app.carga_ensaio', 'sim', true);\n  execute $q1${carga}$q1$;"))
print('2. CONTROLE (1 centavo a menos):', m)
ok &= m.startswith('Carga não bate')

contagem = ", ".join(f"'{t}', (select count(*) from public.{t})" for t in (
    'ordens_servico', 'almoxarifado_entradas', 'almoxarifado_saidas', 'almoxarifado_saldos', 'almoxarifado_itens',
    'almoxarifado_depositos', 'tipos_oleo', 'equipamento_especificacoes', 'equipamento_documentos'))
m = rodar('rollback', bloco(
    f"  perform set_config('app.carga_ensaio', 'nao', true);\n  execute $q1${carga}$q1$;\n"
    "  r := jsonb_build_object('os_depois_da_carga', (select count(*) from public.ordens_servico));\n"
    f"  execute $q2${rollback}$q2$;\n"
    f"  r := r || jsonb_build_object({contagem},\n"
    "    'insumos_novos', (select count(*) from public.insumos where descricao like 'Criado na migração do almoxarifado%'));\n"
    "  raise exception 'ROLLBACK %', r;"))
print('3. ROLLBACK:', m)
try:
    r = json.loads(m.split(' ', 1)[1])
    ok &= r.pop('os_depois_da_carga') > 0 and all(v == 0 for v in r.values())
except (ValueError, IndexError, KeyError):
    ok = False

print('PROVA OK' if ok else 'PROVA FALHOU')
sys.exit(0 if ok else 1)
