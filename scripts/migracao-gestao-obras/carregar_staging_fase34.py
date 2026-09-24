"""Enche legado.carga_fase34 no ERP com os lotes gerados por gerar_carga_fase34.py.

Uso:
  python3 scripts/migracao-gestao-obras/carregar_staging_fase34.py            # depois do preparo aplicado
  python3 scripts/migracao-gestao-obras/carregar_staging_fase34.py --via-2d   # ensaio antes do preparo
  python3 scripts/migracao-gestao-obras/carregar_staging_fase34.py --limpar-2d

Roda cada _retrato/staging34_NNN.sql pelo `supabase db query --linked` (a mesma API de SQL do
MCP), no projeto linkado deste repositório, que é o ERP (vsesgvqjgqpapoxhnbqx). Só escreve no
staging do schema legado: nada que o app leia. Confere o projeto antes de começar.

--via-2d: enquanto o preparo (20260925120000) não está aplicado, a tabela carga_fase34 não
existe, e o ensaio num arquivo só passa do limite da API de SQL (413 acima de ~1 MB; o staging
tem uns 5 MB). Então os lotes vão para o staging da 2d (legado.carga_fase2d, mesmo formato),
com o nome da tabela prefixado por 'f34:', que nenhuma leitura da 2d enxerga; o ensaio copia
de lá para uma carga_fase34 criada dentro do bloco que aborta. --limpar-2d apaga essas linhas.
"""
import glob
import os
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'vsesgvqjgqpapoxhnbqx'
VIA_2D = '--via-2d' in sys.argv

ref = open(os.path.join(RAIZ, 'supabase/.temp/project-ref')).read().strip()
if ref != ERP:
    sys.exit(f'projeto linkado é {ref}, não o ERP: parei')


def query(sql=None, arquivo=None):
    cmd = ['supabase', 'db', 'query', '--linked'] + (['-f', arquivo] if arquivo else [sql])
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True)
    if r.returncode != 0 or '"error"' in r.stdout:
        sys.exit(f'{arquivo or sql[:60]} falhou: {(r.stdout + r.stderr)[-600:]}')


if VIA_2D or '--limpar-2d' in sys.argv:
    query("delete from legado.carga_fase2d where tabela like 'f34:%'")
    if '--limpar-2d' in sys.argv:
        print('linhas f34: apagadas de legado.carga_fase2d')
        sys.exit(0)
else:
    query('delete from legado.carga_fase34')

lotes = sorted(glob.glob(os.path.join(D, '_retrato', 'staging34_*.sql')))
if not lotes:
    sys.exit('sem lotes: rodar gerar_carga_fase34.py')
# Vários lotes por chamada, abaixo do limite da API (~1 MB por requisição: 413 acima disso).
POR_CHAMADA = 700_000
grupos, atual = [], ''
for arquivo in lotes:
    texto = open(arquivo).read()
    if VIA_2D:
        texto = texto.replace("insert into legado.carga_fase34 (tabela, parte, dados) values ('",
                              "insert into legado.carga_fase2d (tabela, parte, dados) values ('f34:")
    if atual and len(atual.encode()) + len(texto.encode()) > POR_CHAMADA:
        grupos.append(atual)
        atual = ''
    atual += texto
grupos.append(atual)
for i, texto in enumerate(grupos, 1):
    arquivo = os.path.join(D, '_retrato', f'staging34_chamada_{i:02d}.sql.tmp')
    open(arquivo, 'w').write(texto)
    query(arquivo=arquivo)
    print(f'chamada {i}/{len(grupos)} ok ({len(texto.encode()) // 1024} KB)', flush=True)
