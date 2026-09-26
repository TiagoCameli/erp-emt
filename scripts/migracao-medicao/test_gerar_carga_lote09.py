"""Testes do extrator do Lote 09 (Task 1, Fase 2 de Medição de Contratos).

Roda com a cópia local do xlsx. Caminho por env var L09_XLSX (default: a cópia de
trabalho usada na análise, XLSX_PADRAO do gerador). Se o arquivo não existir (é o caso do
CI, que não tem a planilha), os testes são pulados, não falham.

Uso:
  python3 -m unittest scripts/migracao-medicao/test_gerar_carga_lote09.py -v
  python3 -m pytest scripts/migracao-medicao/test_gerar_carga_lote09.py -v   # se houver pytest
"""
import os
import sys
import unittest
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gerar_carga_lote09 as gc

CAMINHO_XLSX = os.environ.get('L09_XLSX', gc.XLSX_PADRAO)

# Os 8 grupos, regra sem_arredondar: alvos conferidos pelo Tiago (plano, "Fonte e
# decisões") e reproduzidos pela análise prévia (regras.py).
GRUPOS_ESPERADOS = {
    '01': {'previsto': '761566.89', 'acumulado': '117937.01', 'decima': '0.00'},
    '02': {'previsto': '91142410.02', 'acumulado': '18657438.30', 'decima': '3312.02'},
    '03': {'previsto': '15650687.43', 'acumulado': '139520.48', 'decima': '0.00'},
    '04': {'previsto': '74015072.36', 'acumulado': '15662616.12', 'decima': '660861.19'},
    '05': {'previsto': '4104431.62', 'acumulado': '0.00', 'decima': '0.00'},
    '06': {'previsto': '50465073.89', 'acumulado': '0.00', 'decima': '0.00'},
    '07': {'previsto': '1704476.68', 'acumulado': '1070413.54', 'decima': '0.00'},
    '08': {'previsto': '6083764.60', 'acumulado': '893736.31', 'decima': '16565.06'},
}


@unittest.skipUnless(os.path.exists(CAMINHO_XLSX), f'xlsx do Lote 09 ausente ({CAMINHO_XLSX}); CI não tem a planilha')
class TestGerarCargaLote09(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.staging, cls.esperado = gc.gerar(CAMINHO_XLSX)
        cls.linhas_por_codigo = {l['codigo']: l for l in cls.staging['linhas']}
        cls.linhas_por_ordem = {l['ordem']: l for l in cls.staging['linhas']}
        cls.quantidades_por_chave = {
            (q['ordem'], q['numero_medicao']): q['quantidade'] for q in cls.staging['quantidades']
        }

    def test_hash_confere(self):
        self.assertEqual(gc.sha256_arquivo(CAMINHO_XLSX), gc.SHA256_ESPERADO)

    def test_contagens(self):
        self.assertEqual(len(self.staging['linhas']), 265)
        self.assertEqual(self.esperado['linhas'], 265)
        self.assertEqual(self.esperado['titulos'], 20)
        self.assertEqual(self.esperado['servicos'], 245)
        self.assertEqual(self.esperado['medicoes'], 10)

    def test_linha_dope_02_02_01(self):
        linha = self.linhas_por_codigo.get('02.02.01')
        self.assertIsNotNone(linha, 'linha do DOPE (02.02.01) não encontrada')
        self.assertEqual(linha['linha_origem'], 20)
        self.assertEqual(linha['tipo'], 'servico')
        # não pode sobrar um 02.02 duplicado apontando pra essa linha
        self.assertNotIn('02.02', [l['codigo'] for l in self.staging['linhas'] if l['linha_origem'] == 20])

    def test_02_07_04_preco_e_quantidade(self):
        linha = self.linhas_por_codigo['02.07.04']
        self.assertEqual(linha['preco_unitario'], '580.8643')
        self.assertEqual(linha['quantidade_prevista'], '17057.717')

    def test_01_01_preco_e_9a_medicao(self):
        linha = self.linhas_por_codigo['01.01']
        self.assertEqual(linha['preco_unitario'], '21154.63583333333')
        qtd_9a = self.quantidades_por_chave[(linha['ordem'], 9)]
        self.assertEqual(qtd_9a, '0.749996')

    def test_numero_texto_bate_com_o_importador_do_app(self):
        # numeroParaTexto do app (leitor.ts) usa JS String(n): float inteiro vira "36",
        # não "36.0"; não inteiro mantém os mesmos dígitos do repr do Python.
        linha_01_01 = self.linhas_por_codigo['01.01']
        self.assertEqual(linha_01_01['quantidade_prevista'], '36')
        linha_02_07_04 = self.linhas_por_codigo['02.07.04']
        self.assertEqual(linha_02_07_04['quantidade_prevista'], '17057.717')

    def test_linhas_ocultas_184_a_199_quantidade_zero(self):
        for codigo in ('03.16.01', '03.16.05', '03.16.05.01', '03.16.09'):
            linha = self.linhas_por_codigo[codigo]
            self.assertEqual(linha['tipo'], 'servico')
            self.assertEqual(Decimal(linha['quantidade_prevista']), Decimal('0'))

    def test_grupo_08_e_titulo(self):
        linha = self.linhas_por_codigo['08']
        self.assertEqual(linha['tipo'], 'titulo')
        self.assertIsNone(linha['preco_unitario'])
        self.assertIsNone(linha['quantidade_prevista'])

    def test_pai_por_maior_prefixo(self):
        # 02.02.01 (DOPE) e 02.02.02/03 são filhos de 02.02 (Usinagem), não do título 02.
        pai_dope = self.linhas_por_ordem[self.linhas_por_codigo['02.02.01']['pai_ordem']]
        self.assertEqual(pai_dope['codigo'], '02.02')
        pai_02_02_02 = self.linhas_por_ordem[self.linhas_por_codigo['02.02.02']['pai_ordem']]
        self.assertEqual(pai_02_02_02['codigo'], '02.02')
        # títulos de grupo (01, 02, 03...) não têm pai
        self.assertIsNone(self.linhas_por_codigo['01']['pai_ordem'])
        self.assertIsNone(self.linhas_por_codigo['02']['pai_ordem'])

    def test_grupos(self):
        self.assertEqual(self.esperado['grupos'], GRUPOS_ESPERADOS)

    def test_totais(self):
        self.assertEqual(self.esperado['total'], {
            'previsto': '243927483.49',
            'acumulado': '36541661.77',
            'decima': '680738.27',
            'saldo': '207385821.72',
        })

    def test_esperado_traz_previsto_e_acumulado_por_linha(self):
        ordem = self.linhas_por_codigo['02.07.04']['ordem']
        preco = Decimal(self.esperado['precos'][ordem])
        qtd_prevista = Decimal(self.esperado['qtds_previstas'][ordem])
        self.assertEqual(Decimal(self.esperado['previstos'][ordem]), preco * qtd_prevista)
        self.assertIn(ordem, self.esperado['qtds_acumuladas'])


if __name__ == '__main__':
    unittest.main()
