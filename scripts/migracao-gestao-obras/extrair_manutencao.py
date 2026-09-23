"""Retrato da Manutenção do Gestão Obras, para a carga da Fase 2d.

Uso: python3 scripts/migracao-gestao-obras/extrair_manutencao.py

Só LÊ a origem (GET no PostgREST e no Storage), com a chave de serviço do .env.local do
Gestão Obras, fora do app (plano, seção 8). Grava em _retrato/ (fora do git: o repositório
é público):
  _retrato/manutencao.json   as tabelas, inteiras
  _retrato/arquivos/<path>   os anexos dos documentos de equipamento

Rodar de novo no dia da virada, com a origem congelada: a carga é gerada deste retrato.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

D = os.path.dirname(os.path.abspath(__file__))
RETRATO = os.path.join(D, '_retrato')
ORIGEM = 'https://gunyitwrbxbmnezokgjq.supabase.co'
ENV_ORIGEM = '/Users/tiagocameli/projects/Gestao_Obras/.env.local'

TABELAS = [
    'ordens_servico', 'os_pecas', 'os_oleos', 'os_terceiros', 'tipos_oleo',
    'depositos_material', 'entradas_material', 'insumos', 'unidades_medida',
    'especificacoes_equipamento', 'documentos_equipamento',
    'historico_status_equipamento', 'medicoes_equipamento',
    # saídas avulsas e transferências entram no saldo da origem; a carga precisa saber se há
    'saidas_material', 'transferencias_material',
    # o saldo como o app antigo mostra (plano 9.1: conferir pela função do app, não por uma soma nova)
    'v_saldo_estoque',
]
PAGINA = 1000
# Tabela sem coluna id ordena pela chave dela.
ORDEM = {'especificacoes_equipamento': 'equipamento_id', 'v_saldo_estoque': 'insumo_id,deposito_id'}


def chave():
    for linha in open(ENV_ORIGEM, encoding='utf-8'):
        if linha.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            return linha.split('=', 1)[1].strip().strip('"')
    sys.exit('SUPABASE_SERVICE_ROLE_KEY ausente no .env.local do Gestão Obras')


def get(url, k, extra=None):
    cab = {'apikey': k, 'Authorization': f'Bearer {k}'}
    cab.update(extra or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=60) as r:
        return r.read(), r.headers


def tabela(nome, k):
    linhas, de = [], 0
    while True:
        corpo, _ = get(f'{ORIGEM}/rest/v1/{nome}?select=*&order={ORDEM.get(nome, "id")}', k,
                       {'Range-Unit': 'items', 'Range': f'{de}-{de + PAGINA - 1}'})
        lote = json.loads(corpo)
        linhas += lote
        if len(lote) < PAGINA:
            return linhas
        de += PAGINA


# URL assinada do anexo: .../object/sign/<bucket>/<path>?token=...
URL_ANEXO = re.compile(r'/storage/v1/object/(?:sign|public)/([^/]+)/([^?]+)')


def main():
    k = chave()
    os.makedirs(os.path.join(RETRATO, 'arquivos'), exist_ok=True)
    retrato = {}
    for nome in TABELAS:
        retrato[nome] = tabela(nome, k)
        print(f'{nome}: {len(retrato[nome])}')

    baixados = 0
    for doc in retrato['documentos_equipamento']:
        for url in (doc.get('foto_urls') or []) + (doc.get('arquivo_urls') or []):
            achado = URL_ANEXO.search(url)
            if not achado:
                sys.exit(f'anexo com URL desconhecida no documento {doc["id"]}')
            bucket, caminho = achado.group(1), urllib.parse.unquote(achado.group(2))
            corpo, _ = get(f'{ORIGEM}/storage/v1/object/{bucket}/{urllib.parse.quote(caminho)}', k)
            destino = os.path.join(RETRATO, 'arquivos', bucket, caminho)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            open(destino, 'wb').write(corpo)
            baixados += 1
    print(f'anexos baixados: {baixados}')

    json.dump(retrato, open(os.path.join(RETRATO, 'manutencao.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
