"""Enche legado.carga_fase2d no ERP com os lotes gerados por gerar_carga_manutencao.py.

Uso: python3 scripts/migracao-gestao-obras/carregar_staging_fase2d.py

Roda cada _retrato/staging_NN.sql pelo `supabase db query --linked` (a mesma API de SQL do
MCP), no projeto linkado deste repositório, que é o ERP (vsesgvqjgqpapoxhnbqx). Só escreve
no staging do schema legado: nada que o app leia. Confere o projeto antes de começar.
"""
import glob
import os
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'vsesgvqjgqpapoxhnbqx'

ref = open(os.path.join(RAIZ, 'supabase/.temp/project-ref')).read().strip()
if ref != ERP:
    sys.exit(f'projeto linkado é {ref}, não o ERP: parei')

subprocess.run(['supabase', 'db', 'query', '--linked', 'delete from legado.carga_fase2d'],
               cwd=RAIZ, check=True, capture_output=True)
for arquivo in sorted(glob.glob(os.path.join(D, '_retrato', 'staging_*.sql'))):
    r = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', arquivo], cwd=RAIZ, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'{os.path.basename(arquivo)} falhou: {r.stderr[-500:]}')
    print(f'{os.path.basename(arquivo)} ok')
