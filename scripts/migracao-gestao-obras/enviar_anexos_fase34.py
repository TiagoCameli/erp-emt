"""Sobe para o bucket `anexos` do ERP os anexos da carga do Combustível e do Frete.

Uso: python3 scripts/migracao-gestao-obras/enviar_anexos_fase34.py [--conferir-hash]

Lê _retrato/anexos34.json (gerado por gerar_carga_fase34.py) e sobe cada arquivo no path que
a carga grava em `public.arquivos`, com a chave de serviço do .env.local deste repo (o
service_role do ERP só tem o Storage: é o uso certo dele). Arquivo que já está no bucket com o
mesmo tamanho não sobe de novo (dá para retomar). Confere o tamanho de cada um depois de
subir; --conferir-hash baixa de volta e compara o sha256 (o dobro do tráfego).

ORDEM DA VIRADA: subir os anexos e, NA MESMA HORA, aplicar a carga. A faxina
(/api/faxina-arquivos, diária) apaga objeto do bucket sem linha em `arquivos`: objeto sem a
carga aplicada some no dia seguinte, e subir dias antes é trabalho perdido.
"""
import concurrent.futures
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'https://vsesgvqjgqpapoxhnbqx.supabase.co'
BUCKET = 'anexos'
HASH = '--conferir-hash' in sys.argv


def chave():
    for linha in open(os.path.join(RAIZ, '.env.local'), encoding='utf-8'):
        if linha.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            return linha.split('=', 1)[1].strip().strip('"')
    sys.exit('SUPABASE_SERVICE_ROLE_KEY ausente no .env.local do ERP')


K = chave()
CAB = {'apikey': K, 'Authorization': f'Bearer {K}'}


def tamanho_no_bucket(path):
    try:
        with urllib.request.urlopen(urllib.request.Request(f'{ERP}/storage/v1/object/info/{BUCKET}/{path}', headers=CAB), timeout=60) as r:
            info = json.loads(r.read())
            return int(info.get('size') or (info.get('metadata') or {}).get('size') or -1)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return None
        raise


def enviar(item):
    corpo = open(item['local'], 'rb').read()
    for tentativa in range(4):
        try:
            if tamanho_no_bucket(item['path']) == len(corpo) and not HASH:
                return 'ja'
            req = urllib.request.Request(f'{ERP}/storage/v1/object/{BUCKET}/{item["path"]}', data=corpo, method='POST',
                                         headers={**CAB, 'Content-Type': item['mime'], 'x-upsert': 'true'})
            with urllib.request.urlopen(req, timeout=300) as r:
                if r.status not in (200, 201):
                    raise OSError(f'HTTP {r.status}')
            if HASH:
                with urllib.request.urlopen(urllib.request.Request(f'{ERP}/storage/v1/object/{BUCKET}/{item["path"]}', headers=CAB),
                                            timeout=300) as r:
                    if hashlib.sha256(r.read()).hexdigest() != hashlib.sha256(corpo).hexdigest():
                        return f'ERRO {item["path"]}: o arquivo no bucket difere do original'
            elif tamanho_no_bucket(item['path']) != len(corpo):
                return f'ERRO {item["path"]}: tamanho no bucket difere do original'
            return 'ok'
        except (OSError, urllib.error.HTTPError) as e:
            erro = e
    return f'ERRO {item["path"]}: {erro}'


def main():
    manifesto = json.load(open(os.path.join(D, '_retrato', 'anexos34.json')))
    falhas, feitos = [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for n, r in enumerate(ex.map(enviar, manifesto), 1):
            if r.startswith('ERRO'):
                falhas.append(r)
            else:
                feitos += 1
            if n % 200 == 0:
                print(f'  {n}/{len(manifesto)}', flush=True)
    print(f'{feitos} de {len(manifesto)} no bucket; {len(falhas)} falhas')
    for f in falhas[:30]:
        print('  ', f)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
