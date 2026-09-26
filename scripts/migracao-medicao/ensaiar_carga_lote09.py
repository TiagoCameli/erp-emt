"""Ensaio da carga do Lote 09 (Medição de Contratos, Fase 2) contra o ERP, sem gravar nada.

Uso:
  python3 scripts/migracao-medicao/ensaiar_carga_lote09.py

Lê supabase/migrations/20260926205029_mc_fase2_carga_l09.sql (Task 3) e
supabase/rollbacks/mc_fase2_carga_l09_rollback.sql. O staging (legado.carga_mc_l09) já foi
enchido em produção por carregar_staging_lote09.py (Task 2): este script só lê.

Três rodadas, cada uma UM statement (`do $ctl$ ... end $ctl$;`) que termina em
`raise exception`, então tudo que a rodada faz, inclusive a carga e o desfazer, aborta
junto: nada é gravado em nenhuma delas.
  1. ENSAIO: app.carga_ensaio = 'sim' + a carga inteira com a conferência; tem que sair
     "ENSAIO OK, nada gravado" com todos os números.
  2. CONTROLE: o acumulado esperado do grupo 01 alterado em R$ 0,01 em legado.carga_mc_l09
     (a alteração aborta junto com o resto), depois a carga (não ensaio); tem que ser
     recusada com "Carga não bate com a origem".
  3. ROLLBACK: a carga de verdade (não ensaio) + o rollback, no mesmo bloco; conta as
     linhas mc_* do contrato L09-BR364 (têm que estar todas zeradas) e termina em
     `raise exception 'ROLLBACK OK %'` com as contagens.
Depois das 3, uma conferência só de leitura (fora de transação que aborta, consultas
simples): nenhum contrato L09-BR364, os gatilhos trg_mc_% do módulo ligados, staging
intacto (contagens por seção e o grupo 01 sem a alteração da rodada 2).

Roda no projeto linkado por `supabase db query --linked` (como carregar_staging_lote09.py):
recusa qualquer ref que não seja o ERP vsesgvqjgqpapoxhnbqx, sem tocar em nada. Grava a
saída completa em _retrato/ensaio.txt. Sai com código diferente de zero se qualquer
rodada, ou a conferência final, desviar do esperado.
"""
import json
import os
import re
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
RETRATO = os.path.join(D, '_retrato')
ERP = 'vsesgvqjgqpapoxhnbqx'
CARGA = os.path.join(RAIZ, 'supabase/migrations/20260926205029_mc_fase2_carga_l09.sql')
ROLLBACK = os.path.join(RAIZ, 'supabase/rollbacks/mc_fase2_carga_l09_rollback.sql')

# Todas as tabelas mc_* com contrato_id (mc_contratos entra à parte, pelo id). mc_indices e
# mc_indice_valores são globais (sem contrato_id): não entram aqui.
TABELAS_MC_CONTRATO = [
    'mc_aditivos', 'mc_ajustes', 'mc_aprovacoes_item', 'mc_contrato_usuarios', 'mc_item_indices',
    'mc_itens', 'mc_lancamentos', 'mc_medicao_eventos', 'mc_medicao_revisoes', 'mc_medicoes',
    'mc_planilha_itens', 'mc_planilha_versoes', 'mc_reajuste_aplicado', 'mc_reajuste_aplicado_itens',
    'mc_reajuste_config', 'mc_revisao_itens',
]


def parar(msg):
    sys.exit(msg)


ref_path = os.path.join(RAIZ, 'supabase', '.temp', 'project-ref')
if not os.path.exists(ref_path):
    parar('CLI não linkado nesta máquina: parei sem tocar em nada')
ref = open(ref_path).read().strip()
if ref != ERP:
    parar(f'projeto linkado é {ref}, não o ERP ({ERP}): parei sem tocar em nada')

if not os.path.exists(CARGA):
    parar(f'não achei {CARGA}')
if not os.path.exists(ROLLBACK):
    parar(f'não achei {ROLLBACK}')
carga = open(CARGA, encoding='utf-8').read()
rollback = open(ROLLBACK, encoding='utf-8').read()
for nome, texto in (('carga', carga), ('rollback', rollback)):
    for delim in ('$q1$', '$q2$', '$ctl$'):
        if delim in texto:
            parar(f'delimitador de ensaio {delim} dentro do SQL de {nome}: escolher outro')

os.makedirs(RETRATO, exist_ok=True)
saida_completa = []


def registrar(titulo, texto):
    saida_completa.append(f'{"=" * 78}\n{titulo}\n{"=" * 78}\n{texto}\n')


def rodar(nome, corpo):
    """Roda UM bloco do $ctl$ ... end $ctl$; via `supabase db query --linked -f`. corpo já é
    o texto entre 'begin' e 'end' do bloco (a rodada sempre termina em raise, então volta erro
    400 do CLI: extraímos a mensagem P0001)."""
    sql = f'do $ctl$\n{corpo}\n$ctl$;\n'
    arquivo = os.path.join(RETRATO, f'ensaio_{nome}.sql')
    open(arquivo, 'w', encoding='utf-8').write(sql)
    r = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', arquivo], cwd=RAIZ, capture_output=True, text=True)
    bruta = r.stdout + r.stderr
    limpa = bruta.replace('\\\\\\"', '"').replace('\\"', '"')
    achado = re.search(r'ERROR:\s+P0001: (.*?)\\n', limpa) or re.search(r'ERROR:\s+(.*?)(?:\\n|$)', limpa)
    mensagem = achado.group(1).rstrip('\\ ') if achado else limpa.strip()
    registrar(f'Rodada {nome} (comando)', sql)
    registrar(f'Rodada {nome} (saída bruta do CLI)', bruta)
    registrar(f'Rodada {nome} (mensagem extraída)', mensagem)
    return mensagem


def consulta(sql):
    """SELECT só de leitura, fora das rodadas que abortam, via `supabase db query --linked` inline."""
    r = subprocess.run(['supabase', 'db', 'query', '--linked', sql], cwd=RAIZ, capture_output=True, text=True)
    bruta = r.stdout + r.stderr
    registrar('Conferência final (consulta)', sql)
    registrar('Conferência final (saída)', bruta)
    i = r.stdout.find('{')
    if r.returncode != 0 or i < 0:
        parar(f'conferência final falhou: {bruta[-800:]}')
    return json.loads(r.stdout[i:])['rows']


ok = True

# ---------------------------------------------------------------- 1. ENSAIO
m1 = rodar('ensaio', (
    "begin\n"
    "  perform set_config('app.carga_ensaio', 'sim', true);\n"
    f"  execute $q1${carga}$q1$;\n"
    "end"))
print('1. ENSAIO:', m1[:2000])
ok1 = m1.startswith('ENSAIO OK, nada gravado')
ok &= ok1

# ---------------------------------------------------------------- 2. CONTROLE
m2 = rodar('controle', (
    "begin\n"
    "  update legado.carga_mc_l09 set dados = jsonb_set(dados, '{0,grupos,01,acumulado}',\n"
    "    to_jsonb(((dados #>> '{0,grupos,01,acumulado}')::numeric + 0.01)::text))\n"
    "   where secao = 'esperado';\n"
    "  perform set_config('app.carga_ensaio', 'nao', true);\n"
    f"  execute $q1${carga}$q1$;\n"
    "end"))
print('2. CONTROLE (grupo 01 com R$ 0,01 a mais no acumulado esperado):', m2[:600])
ok2 = m2.startswith('Carga não bate com a origem') and 'grupo 01' in m2
ok &= ok2

# ---------------------------------------------------------------- 3. ROLLBACK
contagem_sql = ', '.join(f"'{t}', (select count(*) from public.{t} where contrato_id = v_contrato)" for t in TABELAS_MC_CONTRATO)
m3 = rodar('rollback', (
    "declare\n  v_contrato uuid;\n  r jsonb;\n"
    "begin\n"
    "  perform set_config('app.carga_ensaio', 'nao', true);\n"
    f"  execute $q1${carga}$q1$;\n"
    "  select id into v_contrato from public.mc_contratos where codigo = 'L09-BR364';\n"
    "  if v_contrato is null then\n"
    "    raise exception 'Carga não criou o contrato L09-BR364: parei antes do rollback';\n"
    "  end if;\n"
    f"  execute $q2${rollback}$q2$;\n"
    "  r := jsonb_build_object('mc_contratos', (select count(*) from public.mc_contratos where id = v_contrato))\n"
    f"       || jsonb_build_object({contagem_sql});\n"
    "  raise exception 'ROLLBACK OK %', r;\n"
    "end"))
print('3. ROLLBACK:', m3[:1500])
ok3 = m3.startswith('ROLLBACK OK')
contagens = {}
if ok3:
    try:
        contagens = json.loads(m3[len('ROLLBACK OK '):])
        ok3 = len(contagens) == len(TABELAS_MC_CONTRATO) + 1 and all(v == 0 for v in contagens.values())
    except (ValueError, IndexError):
        ok3 = False
if not ok3:
    print('   contagens não zeradas ou mensagem inesperada:', contagens)
ok &= ok3

# ---------------------------------------------------------------- conferência final (leitura)
rows = consulta("select count(*) as n from public.mc_contratos where codigo = 'L09-BR364';")
sem_contrato = rows[0]['n'] == 0
print('4. Sem contrato L09-BR364 depois das 3 rodadas:', sem_contrato)
ok &= sem_contrato

rows = consulta("select tgname, tgenabled from pg_trigger where tgname like 'trg_mc_%' and not tgisinternal order by 1;")
desligados = [x['tgname'] for x in rows if x['tgenabled'] != 'O']
gatilhos_ok = len(rows) > 0 and not desligados
print('5. Gatilhos trg_mc_% ligados:', gatilhos_ok, ('' if gatilhos_ok else f'(desligados: {desligados})'))
ok &= gatilhos_ok

rows = consulta(
    "select secao, count(*) as partes, sum(jsonb_array_length(dados)) as itens from legado.carga_mc_l09 group by secao order by secao;")
staging_esperado = {'contrato': (1, 1), 'esperado': (1, 1), 'linhas': (2, 265), 'medicoes': (1, 10), 'quantidades': (4, 2450)}
staging_visto = {r['secao']: (r['partes'], r['itens']) for r in rows}
staging_ok = staging_visto == staging_esperado
print('6. Staging intacto (partes, itens por seção):', staging_ok, staging_visto)
ok &= staging_ok

rows = consulta("select dados #>> '{0,grupos,01,acumulado}' as v from legado.carga_mc_l09 where secao = 'esperado';")
grupo01_ok = rows[0]['v'] == '117937.01'
print('7. Grupo 01 do esperado sem a alteração da rodada 2:', grupo01_ok, rows[0]['v'])
ok &= grupo01_ok

resumo = 'ENSAIO COMPLETO OK' if ok else 'ENSAIO FALHOU'
print(resumo)
registrar('Resumo', (
    f'1. ENSAIO: {"OK" if ok1 else "FALHOU"}\n'
    f'2. CONTROLE: {"OK" if ok2 else "FALHOU"}\n'
    f'3. ROLLBACK: {"OK" if ok3 else "FALHOU"} contagens={contagens}\n'
    f'4. sem contrato: {sem_contrato}\n'
    f'5. gatilhos ligados: {gatilhos_ok}\n'
    f'6. staging intacto: {staging_ok} {staging_visto}\n'
    f'7. grupo 01 do esperado intacto: {grupo01_ok}\n'
    f'{resumo}\n'))
open(os.path.join(RETRATO, 'ensaio.txt'), 'w', encoding='utf-8').write('\n'.join(saida_completa))

sys.exit(0 if ok else 1)
