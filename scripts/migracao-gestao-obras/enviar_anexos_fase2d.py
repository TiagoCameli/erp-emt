"""Sobe para o bucket `anexos` do ERP os anexos da carga da Fase 2d.

Uso: python3 scripts/migracao-gestao-obras/enviar_anexos_fase2d.py

Lê _retrato/anexos.json (gerado por gerar_carga_manutencao.py) e sobe cada arquivo no path
que a carga grava em `public.arquivos`, com a chave de serviço do .env.local deste repo (o
service_role do ERP só tem o Storage: é o uso certo dele).

Ordem da virada: subir os anexos e, NA MESMA HORA, aplicar a carga. A faxina
(/api/faxina-arquivos, diária) apaga objeto do bucket sem linha em `arquivos`: objeto sem a
carga aplicada some no dia seguinte. Rodar de novo não duplica (x-upsert).
"""
import hashlib
import json
import os
import sys
import urllib.request

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(D, '..', '..'))
ERP = 'https://vsesgvqjgqpapoxhnbqx.supabase.co'
BUCKET = 'anexos'


def chave():
    for linha in open(os.path.join(RAIZ, '.env.local'), encoding='utf-8'):
        if linha.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            return linha.split('=', 1)[1].strip().strip('"')
    sys.exit('SUPABASE_SERVICE_ROLE_KEY ausente no .env.local do ERP')


def main():
    k = chave()
    manifesto = json.load(open(os.path.join(D, '_retrato', 'anexos.json')))
    for item in manifesto:
        corpo = open(item['local'], 'rb').read()
        req = urllib.request.Request(
            f'{ERP}/storage/v1/object/{BUCKET}/{item["path"]}', data=corpo, method='POST',
            headers={'apikey': k, 'Authorization': f'Bearer {k}', 'Content-Type': item['mime'], 'x-upsert': 'true'})
        with urllib.request.urlopen(req, timeout=120) as r:
            if r.status not in (200, 201):
                sys.exit(f'{item["path"]}: HTTP {r.status}')
        # Confere o que chegou: baixa de volta e compara o hash (o registro em arquivos usa este hash).
        volta = urllib.request.Request(f'{ERP}/storage/v1/object/{BUCKET}/{item["path"]}',
                                       headers={'apikey': k, 'Authorization': f'Bearer {k}'})
        with urllib.request.urlopen(volta, timeout=120) as r:
            if hashlib.sha256(r.read()).hexdigest() != hashlib.sha256(corpo).hexdigest():
                sys.exit(f'{item["path"]}: o arquivo no bucket difere do original')
        print(f'{item["path"]} ok ({len(corpo)} bytes)')


if __name__ == '__main__':
    main()
