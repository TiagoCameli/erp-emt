# -*- coding: utf-8 -*-
"""Planilha para o Tiago responder um a um o que sobrou na raiz da Manutencao.

Uma linha por lancamento, com o que a nota diz, onde o resto do lancamento ja
esta, e a minha sugestao. A coluna RESPOSTA tem menu com todos os destinos
validos, e aceita texto livre para quando ele quiser dividir.
"""
import io, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

SAIDA = '/Users/tiagocameli/Downloads/raiz-manutencao-duvidas.xlsx'
MANUT = 'Manutenção/Documentação de Equipamentos'

# (numero, sugestao, porque / o que falta saber)
SUGESTAO = {
    '5080': (MANUT, 'Fica. E "transporte de equipamentos de PVH x CZS": custo da frota inteira, nao de uma maquina.'),
    '2629': ('', 'R$ 18 mil de bateria em granel, sem maquina citada. Cria uma etapa "Bateria" como a do Lubrificante, ou joga na Oficina?'),
    '1683': ('Escritório Central', 'Multa da placa NXS1761, que nao existe na frota. O MC poe em Empresa.'),
    '2027': ('', '"Caixa de marcha DOS CAMINHOES" no plural. Quais caminhoes?'),
    '1536': ('', '"03 placas das centrais dos caminhoes". Quais tres?'),
    '4432': ('', 'Qual das cinco Hilux e a "de apoio"?'),
    '1905': ('', 'Qual das cinco Hilux e a "de apoio"?'),
    '3500': (MANUT + ' > Oficina', 'Salario do mecanico Kennedy. O MC rateia salario de mecanico entre as maquinas; a Oficina e o meio-termo.'),
    '2669': (MANUT + ' > Oficina', 'Peca sem maquina citada. O MC poe em Empresa; a Oficina mantem na manutencao.'),
    '4570': (MANUT + ' > Oficina', 'Salario. O resto do lancamento ja esta no AC 405.'),
    '0426': (MANUT + ' > Oficina', 'Salario do Kennedy.'),
    '2946': (MANUT, 'Frete de peca da manutencao em geral. Fica, ou vai para a Oficina?'),
    '0949': ('', 'Qual das cinco Hilux e a "de apoio"?'),
    '1468': ('Escritório Central', 'Primeira parcela do 13o. O MC poe em Empresa.'),
    '0490': (MANUT + ' > Oficina', 'Salario. O resto ja esta no Ramal do Gama.'),
    '3732': ('', 'Radiador de qual maquina?'),
    '3169': (MANUT, 'Frete da GOL LOG. Fica, ou Oficina?'),
    '5176': ('', '"Manutencao Equipamentos EMT" e todo o texto que existe. De qual maquina?'),
    '5125': (MANUT, 'Frete mensal de peca. O resto ja esta na 009.'),
    '2361': ('009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',
             'Frete de diesel para as obras, nada de manutencao. O MC diz 12.500 para a 009 e 2.500 para a 003.'),
    '1147': (MANUT + ' > Oficina', 'Salario.'),
    '1519': ('', 'Cita a 416E E o Boiadeiro MZO 7876. Qual das duas 416E? Divido meio a meio com o Boiadeiro?'),
    '0632': ('DIVIDIR: Hilux SQQ-8F87 - 06 + Hilux QWQ-1D76 - 05 + Hilux SQR1C93 - 07',
             'Esta e a unica das Hilux que da certeza: o texto traz as TRES placas. Divido em tres partes iguais?'),
    '1891': ('', 'Cita motoniveladora 12H e retro 416E. Ha duas de cada. Quais?'),
    '4307': (MANUT, 'Frete de peca. O resto ja esta na 009.'),
    '5943': ('004 - Galpão Silo', 'O texto diz "mecanico passou 1 semana prestando servico NO SILO".'),
    '0055': (MANUT + ' > Oficina', 'Salario. O resto ja esta na 009.'),
    '2053': ('DIVIDIR: Rolo CP56 - 01 + Rolo Pé de Carneiro CP56 - 02',
             '"Lavagem do rolo 01 e 02 CAT". Meio a meio?'),
    '1248': (MANUT, 'Frete da GOLOG.'),
    '4623': (MANUT, 'Frete, e o texto e literalmente "frete".'),
    '1450': ('', 'Remendo e cola de vulcanizacao: borracharia. De qual maquina?'),
    '3288': ('DIVIDIR: Rolo CP56 - 01 + Rolo Pé de Carneiro CP56 - 02',
             'Produtos para o rolo pe de carneiro 01 e 02. O rolo chapa Colorado ja esta na Colorado.'),
    '1486': ('', 'Correia e bomba alimentadora sem maquina citada. O resto ja esta na Colorado.'),
    '5713': ('Escritório Central', 'Multa da placa QLZ6A95. Essa placa esta na frota?'),
    '3614': ('', '"Importado do maiscontrole" e todo o texto. O MC tambem nao tem descricao.'),
    '2467': ('', 'Pino da balanca e deslizante GUERRA: e uma das carretas Guerra. B2D095 - 02 ou B2T093 - 03?'),
    '4714': (MANUT, 'Frete de peca da VEMAP.'),
    '0793': (MANUT, 'Frete mensal de peca. O resto ja esta na 009.'),
    '2048': ('DIVIDIR: Rolo Chapa CB10 - 01 + Rolo de Pneu CW34 - 01',
             '"Ar condicionado do rolo chapa e rolo de pneu". Meio a meio?'),
    '3369': (MANUT + ' > Oficina', 'Material eletrico e de solda: consumo de oficina.'),
    '2594': ('Escritório Central', 'Licenciamento da placa NXS2265, que nao esta na frota.'),
    '4535': ('Escritório Central', 'Licenciamento da placa QLW3B35, que nao esta na frota.'),
    '0115': ('Escritório Central', 'Licenciamento da placa NXS3504, que nao esta na frota.'),
    '1635': ('Escritório Central', 'Licenciamento da placa QLZ3923, que nao esta na frota.'),
    '0702': ('', 'Disco, fita e broca "para rolo pe de carneiro CP56". Ha dois CP56. Qual, ou meio a meio?'),
    '0373': ('003 - Recuperação do Ramal do Gama',
             'Despesa de saida para o Ramal do Gama e AC 405. O MC diz 450 para a 003 e 550 para a 007.'),
    '5018': ('Escritório Central', 'Licenciamento da QLZ3923, mesma placa do LAN-2026-1635.'),
    '1769': ('Escritório Central', 'Licenciamento da NXS2265, mesma placa do LAN-2026-2594.'),
    '3176': (MANUT + ' > Oficina', '"DOLA - MANGUEIRA". Dola e o mecanico; mangueira e consumo de oficina.'),
    '2686': ('', 'Alinhamento da "Hilux CINZA". Qual das cinco e a cinza?'),
    '0295': (MANUT + ' > Trator de Esteira D6NXL - 01', 'Arruelas, parafusos e porcas "D6N": e o D6NXL.'),
    '3137': (MANUT + ' > Oficina', 'Salario. O resto ja esta no AC 405.'),
    '4470': ('Escritório Central', 'IPVA da NXS2265, que nao esta na frota.'),
    '5951': ('', 'Abastecimento de R$ 50 num "caixa do dia". De qual veiculo?'),
    '2377': ('', 'Bucha estabilizadora MB1720/1938: e modelo de caminhao. Qual da frota?'),
    '5952': ('', '"Caixa do dia" de R$ 40 na Cruzeiro Pecas. De qual maquina?'),
    '5847': ('', 'Frete da solenoide "da pa carregadeira". Ha a 924K - 01, a W20 - 02 e a Komatsu 150. Qual?'),
    '5937': ('', '"Caixa do dia" de R$ 14 na Cruzeiro Pecas. De qual maquina?'),
    '5938': (MANUT, 'Frete de R$ 10 no "caixa do dia".'),
}

linhas = [l for l in io.open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/duvidas.txt',
                             encoding='utf-8').read().split('\n') if l.strip()]
destinos = [d for d in io.open('/Users/tiagocameli/.claude/jobs/87cb0088/tmp/destinos.txt',
                               encoding='utf-8').read().split('\n') if d.strip()]

wb = Workbook()
ws = wb.active
ws.title = 'Dúvidas'

VERDE = '3E7744'
AMBAR = 'CF943A'
CAB = PatternFill('solid', fgColor='45464B')
FUNDO_RESP = PatternFill('solid', fgColor='FBF1E3')
FUNDO_SUG = PatternFill('solid', fgColor='F7F7F5')
borda = Border(*[Side(style='thin', color='D8D5CE')] * 4)

COLS = [('#', 5), ('Lançamento', 15), ('Data', 11), ('Valor na raiz', 14),
        ('Total do lanç.', 14), ('Fornecedor', 26), ('Descrição da nota', 60),
        ('Categoria', 20), ('Onde o resto do lançamento já está', 44),
        ('Minha sugestão', 46), ('O que falta saber', 60), ('SUA RESPOSTA', 40)]

ws.append([c for c, _ in COLS])
for i, (_, w) in enumerate(COLS, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
    cel = ws.cell(row=1, column=i)
    cel.font = Font(bold=True, color='FFFFFF', size=10)
    cel.fill = CAB
    cel.alignment = Alignment(vertical='center', wrap_text=True)
ws.row_dimensions[1].height = 30

total = 0.0
for n, linha in enumerate(linhas, 1):
    p = linha.split('§')
    num, dt, fatia, valor, forn, desc, cat, nrat = p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]
    resto = p[8] if len(p) > 8 else ''
    curto = num.replace('LAN-2026-', '')
    sug, falta = SUGESTAO.get(curto, ('', ''))
    total += float(fatia)
    ws.append([n, num, dt, float(fatia), float(valor), forn, desc, cat,
               resto or '(o lançamento inteiro está na raiz)', sug, falta, ''])
    r = ws.max_row
    for c in range(1, 13):
        cel = ws.cell(row=r, column=c)
        cel.border = borda
        cel.alignment = Alignment(vertical='top', wrap_text=(c in (7, 9, 10, 11)))
        if c in (4, 5):
            cel.number_format = 'R$ #,##0.00'
        if c in (10, 11):
            cel.fill = FUNDO_SUG
            cel.font = Font(size=9, color='6B6B6B')
        if c == 12:
            cel.fill = FUNDO_RESP
        if c in (1, 3):
            cel.alignment = Alignment(vertical='top', horizontal='center')
        if c == 7:
            cel.font = Font(size=9)
    ws.row_dimensions[r].height = 44

r = ws.max_row + 1
ws.cell(row=r, column=3, value='TOTAL').font = Font(bold=True)
c = ws.cell(row=r, column=4, value=round(total, 2))
c.font = Font(bold=True)
c.number_format = 'R$ #,##0.00'
ws.cell(row=r, column=6, value='%d lançamentos' % len(linhas)).font = Font(bold=True)

ws.freeze_panes = 'B2'
ws.auto_filter.ref = 'A1:L%d' % (ws.max_row - 1)

# ---- aba de destinos, e o menu na coluna RESPOSTA ----
wd = wb.create_sheet('Destinos')
wd.append(['Destinos válidos (copie e cole na coluna SUA RESPOSTA)'])
wd.cell(row=1, column=1).font = Font(bold=True, color='FFFFFF')
wd.cell(row=1, column=1).fill = CAB
wd.column_dimensions['A'].width = 70
for d in destinos:
    wd.append([d])
wd.freeze_panes = 'A2'

dv = DataValidation(type='list',
                    formula1='=Destinos!$A$2:$A$%d' % (len(destinos) + 1),
                    allow_blank=True, showDropDown=False)
dv.error = None
dv.errorStyle = 'warning'
dv.promptTitle = 'Destino'
dv.prompt = ('Escolha da lista, ou escreva livre. Para dividir, escreva '
             '"DIVIDIR: <destino> + <destino>" e eu divido meio a meio, '
             'ou ponha os valores.')
dv.showInputMessage = True
ws.add_data_validation(dv)
dv.add('L2:L%d' % (len(linhas) + 1))

# ---- aba de instrucoes ----
wi = wb.create_sheet('Como usar', 0)
wi.column_dimensions['A'].width = 104
texto = [
    ('Raiz da Manutenção: o que ainda está em dúvida', True),
    ('', False),
    ('São %d lançamentos e R$ %s que continuam no centro "Manutenção/Documentação de'
     % (len(linhas), ('{:,.2f}'.format(total)).replace(',', '@').replace('.', ',').replace('@', '.')), False),
    ('Equipamentos" sem etapa, ou seja: sem máquina.', False),
    ('', False),
    ('Preencha só a coluna "SUA RESPOSTA" (a última, fundo âmbar).', True),
    ('', False),
    ('   • A célula tem menu com todos os destinos válidos do cadastro.', False),
    ('   • Aceita texto livre também. Para dividir entre máquinas, escreva:', False),
    ('        DIVIDIR: Rolo CP56 - 01 + Rolo Pé de Carneiro CP56 - 02', False),
    ('     e eu divido meio a meio. Se a proporção não for igual, escreva os valores:', False),
    ('        Rolo CP56 - 01 = 200,00 + Rolo Pé de Carneiro CP56 - 02 = 208,29', False),
    ('   • Se quiser deixar como está, escreva FICA.', False),
    ('   • Se a linha não é custo de máquina nenhuma, escreva o centro de destino.', False),
    ('', False),
    ('A coluna "Minha sugestão" é palpite meu, não fato. Onde está vazia é porque eu', False),
    ('não tenho material para palpitar, e a coluna ao lado diz exatamente o que falta.', False),
    ('', False),
    ('Onze linhas já vêm com sugestão de DIVIDIR ou com destino que eu tenho certeza —', False),
    ('essas você pode só confirmar.', False),
    ('', False),
    ('Não está aqui: as compras de lubrificante em granel (R$ 77.184,64), que já foram', False),
    ('para a etapa Lubrificante nova. Nem as 38 trocas de óleo que citam a máquina —', False),
    ('essas continuam na máquina, porque mover destruiria o custo por equipamento.', False),
]
for t, negrito in texto:
    wi.append([t])
    if negrito:
        wi.cell(row=wi.max_row, column=1).font = Font(bold=True, size=12 if wi.max_row == 1 else 11)

wb.save(SAIDA)
print('gravei %s' % SAIDA)
print('%d linhas, R$ %.2f' % (len(linhas), total))
print('%d destinos no menu' % len(destinos))
