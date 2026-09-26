"""Enche legado.carga_mc_l09 no ERP com o staging gerado por gerar_carga_lote09.py.

Uso:
  python3 scripts/migracao-medicao/carregar_staging_lote09.py

Lê `_retrato/staging_l09.json` e `_retrato/esperado_l09.json` (Task 1), monta lotes de
~35 KB por seção (`contrato`, `linhas`, `medicoes`, `quantidades`, `esperado`) como
arquivos `_retrato/staging_l09_NNN.sql` e apaga-e-regrava `legado.carga_mc_l09` (a Task 3
lê daqui pela função `legado.fn_staging_mc_l09`; nada aqui é lido pelo app).

Caminho principal (como `carregar_staging_fase34.py`): `supabase db query --linked`, no
projeto linkado deste repositório, que precisa ser o ERP (vsesgvqjgqpapoxhnbqx); qualquer
outro ref e o script para sem tocar em nada. Se o CLI não estiver linkado (ou não estiver
logado) nesta máquina, o script só gera os arquivos `.sql` em `_retrato/` e para: quem
estiver rodando aplica cada lote, na ordem dos arquivos, pelo MCP
(`mcp__plugin_supabase_supabase__execute_sql`, uma chamada por lote, o conteúdo do
arquivo como `query`), e confere as contagens do mesmo jeito. Ver
`scripts/migracao-medicao/README.md`.
"""
import glob
import json
import os
import subprocess
import sys

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
RETRATO = os.path.join(D, '_retrato')
ERP = 'vsesgvqjgqpapoxhnbqx'
LOTE_BYTES = 35_000


def montar_partes():
    """Lê o staging e o esperado e devolve [(secao, parte, [registros])], cada uma com
    até ~LOTE_BYTES de JSON. `contrato` e `esperado` são objetos únicos: entram como
    lista de um elemento, para que legado.fn_staging_mc_l09(secao) devolva uma linha."""
    staging = json.load(open(os.path.join(RETRATO, 'staging_l09.json'), encoding='utf-8'))
    esperado = json.load(open(os.path.join(RETRATO, 'esperado_l09.json'), encoding='utf-8'))
    secoes = {
        'contrato': [staging['contrato']],
        'linhas': staging['linhas'],
        'medicoes': staging['medicoes'],
        'quantidades': staging['quantidades'],
        'esperado': [esperado],
    }
    partes = []
    for secao, registros in secoes.items():
        atual, n = [], 1
        for r in registros:
            atual.append(r)
            if len(json.dumps(atual, ensure_ascii=False, separators=(',', ':'))) > LOTE_BYTES:
                atual.pop()
                partes.append((secao, n, atual))
                atual, n = [r], n + 1
        partes.append((secao, n, atual))
    return partes


def gerar_lotes():
    for f in glob.glob(os.path.join(RETRATO, 'staging_l09_*.sql')):
        os.remove(f)
    lotes, atual, tamanho = [], [], 0
    for secao, n, regs in montar_partes():
        corpo = json.dumps(regs, ensure_ascii=False, separators=(',', ':'))
        if '$j$' in corpo:
            sys.exit(f'{secao} parte {n}: dado contém o delimitador $j$')
        sql = (f"insert into legado.carga_mc_l09 (secao, parte, dados) values ('{secao}', {n}, $j${corpo}$j$::jsonb)\n"
               f"on conflict (secao, parte) do update set dados = excluded.dados;\n")
        if atual and tamanho + len(sql) > LOTE_BYTES:
            lotes.append(atual)
            atual, tamanho = [], 0
        atual.append(sql)
        tamanho += len(sql)
    if atual:
        lotes.append(atual)
    arquivos = []
    for i, lote in enumerate(lotes, 1):
        arquivo = os.path.join(RETRATO, f'staging_l09_{i:03d}.sql')
        open(arquivo, 'w', encoding='utf-8').write(''.join(lote))
        arquivos.append(arquivo)
    return arquivos


def cli_disponivel():
    """True se o CLI estiver linkado no ERP nesta máquina. Recusa (e para) se estiver
    linkado em outro projeto. False (sem parar) se não houver link: cabe ao MCP."""
    caminho = os.path.join(RAIZ, 'supabase', '.temp', 'project-ref')
    if not os.path.exists(caminho):
        return False
    ref = open(caminho).read().strip()
    if ref != ERP:
        sys.exit(f'projeto linkado é {ref}, não o ERP ({ERP}): parei sem tocar em nada')
    return True


def query(sql=None, arquivo=None):
    cmd = ['supabase', 'db', 'query', '--linked'] + (['-f', arquivo] if arquivo else [sql])
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True)
    if r.returncode != 0 or '"error"' in r.stdout:
        sys.exit(f'{arquivo or sql[:60]} falhou: {(r.stdout + r.stderr)[-800:]}')


def main():
    os.makedirs(RETRATO, exist_ok=True)
    arquivos = gerar_lotes()
    total_kb = sum(os.path.getsize(a) for a in arquivos) // 1024
    print(f'{len(arquivos)} lote(s) gerados em _retrato/ (~{total_kb} KB no total)')

    if not cli_disponivel():
        print('supabase CLI não está linkado (nem logado) nesta máquina: parei aqui.')
        print('Aplique cada _retrato/staging_l09_NNN.sql pelo MCP execute_sql')
        print('(mcp__plugin_supabase_supabase__execute_sql), um por chamada, na ordem dos')
        print('arquivos, e confira as contagens pelo próprio MCP.')
        return

    query('delete from legado.carga_mc_l09')
    for arquivo in arquivos:
        query(arquivo=arquivo)
        print(f'{os.path.basename(arquivo)} ok ({os.path.getsize(arquivo) // 1024} KB)', flush=True)
    print('carga do staging concluída via supabase db query --linked')


if __name__ == '__main__':
    main()
