"""Retrato do Combustível e do Frete do Gestão Obras, para a carga das Fases 3 e 4.

Uso: python3 scripts/migracao-gestao-obras/extrair_combustivel_frete.py [--sem-anexos]

Só LÊ a origem (GET no PostgREST e no Storage), com a chave de serviço do .env.local do
Gestão Obras, fora do app (plano, seção 8). Grava em _retrato/ (fora do git: o repositório
é público):
  _retrato/combustivel_frete.json   as tabelas, inteiras, e os números da própria origem
  _retrato/arquivos/<bucket>/<path> os anexos (fretes, pagamentos, entradas, saídas...)

Os números da origem para a conferência (plano, seção 9) vêm do que o app antigo lê, não de
uma soma nova: a view transportadora_saldos (tela da conta corrente), o nível do tanque
(depositos.nivel_atual_litros, mantido pelo banco) e as camadas do PEPS do banco
(consumos_lote), de onde saem o valor em estoque e o preço PEPS da última saída.

Rodar de novo no dia da virada, com a origem congelada: a carga é gerada deste retrato.
Anexo já baixado (mesmo path e tamanho > 0) não é baixado de novo.
"""
import concurrent.futures
import decimal
import http.client
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

# tabela -> colunas (None = todas). Cadastros só com o que a carga usa: a origem guarda
# telefone e email de fornecedor, que não precisam sair de lá.
TABELAS = {
    # Combustível
    'depositos': None, 'entradas_combustivel': None, 'saidas_combustivel': None,
    'transferencias_combustivel': None, 'esvaziamentos_tanque': None, 'consumos_lote': None,
    'saidas_sem_suprimento': None, 'anomalias_checks': None,
    # Frete
    'fretes': None, 'pagamentos_frete': None, 'transportadora_movimentos': None,
    'pedidos_material': None, 'localidades': None, 'frete_dashboard_cards_config': None,
    'anomalias_frete_checks': None,
    # O saldo como a tela da conta corrente mostra (plano 9.1)
    'transportadora_saldos': None,
    # Cadastros de apoio (para casar texto e etapa)
    'etapas_obra': 'id,nome,obra_id',
    'fornecedores': 'id,nome,eh_transportadora,eh_dona_de_tanque,taxa_litro_padrao,ativo',
    'insumos': 'id,nome,tipo,unidade,categoria,ativo',
    'obras': 'id,nome',
}
PAGINA = 1000
ORDEM = {'transportadora_saldos': 'transportadora_id', 'frete_dashboard_cards_config': 'id'}
URL_ANEXO = re.compile(r'/storage/v1/object/(?:sign|public|authenticated)/([^/]+)/([^?]+)')
BUCKET_PADRAO = 'abastecimento-fotos'

# tabela -> colunas de anexo (lista de URL ou URL solta)
ANEXOS = {
    'depositos': ['foto_urls', 'arquivo_urls'],
    'entradas_combustivel': ['foto_urls', 'arquivo_urls'],
    'saidas_combustivel': ['foto_urls', 'arquivo_urls'],
    'transferencias_combustivel': ['foto_urls', 'arquivo_urls'],
    'fretes': ['foto_chegada_url', 'foto_urls', 'arquivo_urls'],
    'pagamentos_frete': ['foto_urls', 'arquivo_urls'],
    'pedidos_material': ['foto_urls', 'arquivo_urls'],
}


def chave():
    for linha in open(ENV_ORIGEM, encoding='utf-8'):
        if linha.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            return linha.split('=', 1)[1].strip().strip('"')
    sys.exit('SUPABASE_SERVICE_ROLE_KEY ausente no .env.local do Gestão Obras')


def get(url, k, extra=None):
    cab = {'apikey': k, 'Authorization': f'Bearer {k}'}
    cab.update(extra or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=120) as r:
        return r.read()


def tabela(nome, k):
    linhas, de = [], 0
    cols = TABELAS[nome] or '*'
    while True:
        for tentativa in range(4):
            try:
                corpo = get(f'{ORIGEM}/rest/v1/{nome}?select={cols}&order={ORDEM.get(nome, "id")}', k,
                            {'Range-Unit': 'items', 'Range': f'{de}-{de + PAGINA - 1}'})
                break
            except (OSError, http.client.HTTPException):  # timeout: tenta de novo; na quarta, deixa estourar
                if tentativa == 3:
                    raise
        lote = json.loads(corpo, parse_float=decimal.Decimal)  # numeric sem perder casa
        linhas += lote
        if len(lote) < PAGINA:
            return linhas
        de += PAGINA


def caminho_do_anexo(url):
    """(bucket, path) de uma URL assinada/pública, sem o ?token. Path solto vai no bucket padrão."""
    achado = URL_ANEXO.search(url)
    if achado:
        return achado.group(1), urllib.parse.unquote(achado.group(2))
    if not url.startswith('http'):
        return BUCKET_PADRAO, url.lstrip('/')
    return None


def urls_da_linha(linha, colunas):
    for c in colunas:
        v = linha.get(c)
        if not v:
            continue
        for i, url in enumerate(v if isinstance(v, list) else [v]):
            if url:
                yield c, i, url


def main():
    k = chave()
    os.makedirs(os.path.join(RETRATO, 'arquivos'), exist_ok=True)
    retrato = {}
    for nome in TABELAS:
        retrato[nome] = tabela(nome, k)
        print(f'{nome}: {len(retrato[nome])}')

    pendentes, desconhecidas = [], []
    for t, colunas in ANEXOS.items():
        for linha in retrato[t]:
            for c, i, url in urls_da_linha(linha, colunas):
                alvo = caminho_do_anexo(url)
                if not alvo:
                    desconhecidas.append(f'{t} {linha["id"]} {c}[{i}]')
                    continue
                pendentes.append(alvo)
    if desconhecidas:
        sys.exit('anexo com URL desconhecida (decidir antes de seguir):\n  ' + '\n  '.join(desconhecidas))

    def baixar(alvo):
        bucket, caminho = alvo
        destino = os.path.join(RETRATO, 'arquivos', bucket, caminho)
        if os.path.exists(destino) and os.path.getsize(destino) > 0:
            return 'ja'
        erro = None
        for _ in range(4):
            try:
                corpo = get(f'{ORIGEM}/storage/v1/object/{bucket}/{urllib.parse.quote(caminho)}', k)
                break
            except urllib.error.HTTPError as e:
                if e.code < 500:
                    return f'ERRO {e.code} {bucket}/{caminho}'
                erro = e.code
            except (OSError, http.client.HTTPException) as e:  # timeout, conexão caída: tenta de novo
                erro = type(e).__name__
        else:
            return f'ERRO {erro} {bucket}/{caminho}'
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        open(destino, 'wb').write(corpo)
        return 'ok'

    unicos = sorted(set(pendentes))
    falhas = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for n, r in enumerate(ex.map(baixar, unicos), 1):
            if r.startswith('ERRO'):
                falhas.append(r)
            if n % 250 == 0:
                print(f'  anexos: {n}/{len(unicos)}')
    retrato['_anexos_falhos'] = falhas
    print(f'anexos: {len(pendentes)} referências, {len(unicos)} arquivos, {len(falhas)} falhas')
    for f in falhas[:20]:
        print('  ', f)

    json.dump(retrato, open(os.path.join(RETRATO, 'combustivel_frete.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1, default=str)  # Decimal vai como texto exato


if __name__ == '__main__':
    if '--sem-anexos' in sys.argv:
        ANEXOS.clear()
    main()
