# -*- coding: utf-8 -*-
"""Le a planilha devolvida e prova que e a MINHA, editada.

Duas provas antes de olhar resposta nenhuma:
  1. os 59 numeros de lancamento sao exatamente os que eu escrevi;
  2. a soma da coluna "valor na raiz" ainda e R$ 101.994,63.
Se qualquer uma falhar, e outro arquivo e eu nao devo aplicar nada.
"""
import io, openpyxl

ARQ = '/Users/tiagocameli/Downloads/raiz-manutencao-duvidas.xlsx'
BASE = '/Users/tiagocameli/.claude/jobs/87cb0088/tmp/'

meus = []
for l in io.open(BASE + 'duvidas.txt', encoding='utf-8').read().split('\n'):
    if l.strip():
        p = l.split('§')
        meus.append((p[0], round(float(p[2]), 2)))

wb = openpyxl.load_workbook(ARQ, data_only=True)
print('abas:', wb.sheetnames)
ws = wb['Dúvidas']

lidos, respostas = [], []
for r in range(2, ws.max_row + 1):
    num = ws.cell(row=r, column=2).value
    if not num or not str(num).startswith('LAN-'):
        continue
    fatia = ws.cell(row=r, column=4).value
    resp = ws.cell(row=r, column=13).value
    lidos.append((str(num), round(float(fatia), 2)))
    respostas.append((str(num), str(resp).strip() if resp is not None else ''))

print()
print('=== PROVA 1: sao os meus 59 lancamentos? ===')
print('   eu escrevi %d, li %d' % (len(meus), len(lidos)))
if [n for n, _ in meus] == [n for n, _ in lidos]:
    print('   OK: mesma lista, mesma ordem')
else:
    faltam = set(n for n, _ in meus) - set(n for n, _ in lidos)
    sobram = set(n for n, _ in lidos) - set(n for n, _ in meus)
    print('   DIVERGE. faltam: %s | sobram: %s' % (sorted(faltam), sorted(sobram)))

print()
print('=== PROVA 2: a soma da fatia na raiz ainda fecha? ===')
sm, sl = sum(v for _, v in meus), sum(v for _, v in lidos)
print('   eu: R$ %.2f | li: R$ %.2f | %s' % (sm, sl, 'OK' if abs(sm - sl) < 0.005 else 'DIVERGE'))
mudou = [(n, a, b) for (n, a), (_, b) in zip(meus, lidos) if abs(a - b) > 0.005]
if mudou:
    print('   valores alterados na planilha:', mudou)

print()
print('=== RESPOSTAS ===')
vazias = [n for n, r in respostas if not r or r.lower() == 'none']
print('respondidas: %d de %d  (em branco: %d)' % (len(respostas) - len(vazias), len(respostas), len(vazias)))
if vazias:
    print('em branco:', ', '.join(v.replace('LAN-2026-', '') for v in vazias))
print()
for num, r in respostas:
    if r and r.lower() != 'none':
        print('%s  ->  %s' % (num.replace('LAN-2026-', ''), r))

print()
print('=== ABA HILUX ===')
wh = wb['Hilux']
for row in range(1, wh.max_row + 1):
    a = wh.cell(row=row, column=1).value
    b = wh.cell(row=row, column=2).value
    d = wh.cell(row=row, column=4).value
    if a and ('Hilux' in str(a) or str(a) == 'TOTAL') and (d or b):
        print('   %-38s %-12s ->  %s' % (str(a)[:38], b if b else '', d if d else '(em branco)'))

# qualquer coisa escrita fora das colunas que eu esperava
print()
print('=== ele escreveu em outro lugar? ===')
extra = []
for r in range(2, ws.max_row + 1):
    for c in (10, 11, 12):
        pass
for aba in wb.sheetnames:
    w = wb[aba]
    if aba in ('Dúvidas', 'Hilux'):
        continue
    print('   aba %s: %d linhas' % (aba, w.max_row))
wb.close()
