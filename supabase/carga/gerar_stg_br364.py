#!/usr/bin/env python3
"""Gera a migration de staging da carga BR-364 Lote 09 a partir dos dois xlsx.

POR QUE UM GERADOR E NAO SQL ESCRITO A MAO: sao 1.647 + 1.773 linhas. O .sql
precisa ser revisavel linha a linha pelo Tiago, e precisa ser reproduzivel: se a
planilha for reexportada, roda-se este script de novo e o diff mostra
exatamente o que mudou na origem, em vez de um arquivo editado a mao onde nao se
sabe mais o que veio da planilha e o que veio do dedo de alguem.

POR QUE TUDO text: conversao de data (dd/mm/aaaa, e 95 linhas de Vencimento com
varias datas separadas por "; ") e de dinheiro e REGRA DE NEGOCIO, e regra e da
fase seguinte. Staging guarda o texto cru para que, quando um total nao fechar,
se ache a linha exata da planilha em vez de discutir arredondamento.

Uso:
    python3 supabase/carga/gerar_stg_br364.py

Le de ~/Downloads e escreve:
    supabase/migrations/20260804130001_stg_br364_carga.sql
    supabase/rollbacks/20260804130001_stg_br364_carga_rollback.sql
"""

from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
ORIGEM = Path(os.path.expanduser("~/Downloads"))
VERSAO = "20260804130001"
SAIDA_SQL = RAIZ / "supabase" / "migrations" / f"{VERSAO}_stg_br364_carga.sql"
SAIDA_ROLLBACK = RAIZ / "supabase" / "rollbacks" / f"{VERSAO}_stg_br364_carga_rollback.sql"

LINHAS_POR_INSERT = 100

# (coluna no banco, cabecalho exato da planilha). A ordem e a da planilha, de
# proposito: quem revisa o .sql compara com o Excel aberto do lado.
COLUNAS_LANCAMENTOS = [
    ("indice", "Índice"),
    ("lancamento", "Lançamento"),
    ("competencia", "Competência"),
    ("valor", "Valor"),
    ("pago_a", "Pago a"),
    ("cnpj_cpf", "CNPJ / CPF"),
    ("descricao", "Descrição"),
    ("quem_paga", "Quem Paga"),
    ("numero_documento", "Número do Documento"),
    ("categoria", "Categoria"),
    ("condicao_pagamento", "Condição de Pagamento"),
    ("forma_pagamento", "Forma de Pagamento"),
    ("vencimento", "Vencimento"),
    ("conta", "Conta"),
    ("centro_custo", "Centro de Custo"),
    ("plano_contas", "Plano de Contas"),
    ("observacoes", "Observações"),
]

COLUNAS_PAGAMENTOS = [
    ("indice", "Índice"),
    ("data_competencia", "Data de Competência"),
    ("data_vencimento", "Data de Vencimento"),
    ("data_pagamento", "Data de Pagamento"),
    ("valor_parcela", "Valor da Parcela"),
    ("valor_em_aberto", "Valor em Aberto"),
    ("valor_pago_parcela", "Valor Pago da Parcela"),
    ("juros_multas", "Juros / Multas"),
    ("descontos", "Descontos"),
    ("valor_total_pago", "Valor Total Pago"),
    ("fornecedor", "Fornecedor"),
    ("cnpj_cpf_fornecedor", "CNPJ / CPF do Fornecedor"),
    ("dados_bancarios_fornecedor", "Dados Bancários do Fornecedor"),
    ("descricao", "Descrição"),
    ("numero_documento", "Número do Documento"),
    ("categoria", "Categoria"),
    ("plano_contas", "Plano de Contas"),
    ("grupo", "Grupo"),
    ("condicao_pagamento", "Condição de Pagamento"),
    ("forma_pagamento", "Forma de Pagamento"),
    ("quem_paga", "Quem Paga"),
    ("conta_bancaria", "Conta Bancária"),
    ("centro_custo", "Centro de Custo"),
    ("obra", "Obra"),
    ("comentarios", "Comentários"),
]

TABELAS = [
    {
        "tabela": "stg_br364_lancamentos",
        "arquivo": "Lancamentos-2026-08-04.xlsx",
        "aba": "Lançamentos",
        "colunas": COLUNAS_LANCAMENTOS,
        "somas": ["valor"],
    },
    {
        "tabela": "stg_br364_pagamentos",
        "arquivo": "Pagamentos-2026-08-04.xlsx",
        "aba": "Pagamentos",
        "colunas": COLUNAS_PAGAMENTOS,
        "somas": [
            "valor_parcela",
            "valor_em_aberto",
            "valor_pago_parcela",
            "juros_multas",
            "descontos",
            "valor_total_pago",
        ],
    },
]


def como_texto(valor) -> str | None:
    """Celula do Excel virando texto sem perder nem inventar digito.

    None continua None (celula vazia) e string vazia continua string vazia: a
    planilha distingue as duas e a staging tambem, porque so a fase seguinte
    pode decidir se "" e o mesmo que ausente. float passa por Decimal(repr())
    para nao ganhar cauda binaria (o repr do CPython e a menor forma que volta
    ao mesmo float) nem notacao cientifica.
    """
    if valor is None:
        return None
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, int):
        return str(valor)
    if isinstance(valor, float):
        return format(Decimal(repr(valor)), "f")
    if isinstance(valor, str):
        return valor
    return str(valor)


def literal(texto: str | None) -> str:
    if texto is None:
        return "null"
    # standard_conforming_strings esta on (padrao no PG 17), entao a unica
    # escapatoria necessaria e dobrar a apostrofe. Nenhuma celula das duas
    # planilhas tem barra invertida (conferido); quebra de linha dentro do
    # literal e valida e fica literal no banco.
    return "'" + texto.replace("'", "''") + "'"


def ler(spec) -> list[list[str | None]]:
    caminho = ORIGEM / spec["arquivo"]
    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    ws = wb[spec["aba"]]
    iterador = ws.iter_rows(values_only=True)
    cabecalho = [c for c in next(iterador)]
    esperado = [h for _, h in spec["colunas"]]
    if cabecalho[: len(esperado)] != esperado:
        raise SystemExit(
            f"{spec['arquivo']}: cabecalho mudou.\n  esperado={esperado}\n  achado  ={cabecalho}"
        )
    indice = {h: i for i, h in enumerate(cabecalho)}
    linhas = []
    for numero, bruta in enumerate(iterador, start=2):
        if all(c is None or (isinstance(c, str) and c.strip() == "") for c in bruta):
            raise SystemExit(f"{spec['arquivo']} linha {numero}: linha totalmente vazia")
        valores = [como_texto(bruta[indice[h]]) for _, h in spec["colunas"]]
        linhas.append([numero] + valores)
        wb_len = len(spec["colunas"]) + 1
        if len(linhas[-1]) != wb_len:
            raise SystemExit(f"{spec['arquivo']} linha {numero}: numero de colunas errado")
    wb.close()
    return linhas


def soma(linhas, colunas, nome_coluna) -> Decimal:
    pos = 1 + [c for c, _ in colunas].index(nome_coluna)
    total = Decimal(0)
    for linha in linhas:
        total += Decimal(linha[pos])
    return total


def gerar() -> None:
    dados = {}
    for spec in TABELAS:
        dados[spec["tabela"]] = ler(spec)

    partes: list[str] = []
    w = partes.append

    w(
        "-- Carga BR-364 Lote 09: area de staging fiel a origem, sem regra de negocio.\n"
        "--\n"
        "-- O QUE ESTA MIGRATION FAZ: cria duas tabelas de staging e carrega nelas, como\n"
        "-- TEXTO, as duas planilhas exportadas do sistema antigo em 04/08/2026\n"
        "-- (Lancamentos-2026-08-04.xlsx aba \"Lancamentos\", 1.647 linhas, e\n"
        "-- Pagamentos-2026-08-04.xlsx aba \"Pagamentos\", 1.773 linhas). Nada e\n"
        "-- convertido, nada e filtrado, nada e casado: nenhum lancamento, parcela,\n"
        "-- categoria, fornecedor ou saldo de conta e criado aqui.\n"
        "--\n"
        "-- POR QUE TODAS AS COLUNAS text: as duas conversoes que a carga precisa (data\n"
        "-- dd/mm/aaaa e dinheiro) sao regra, e regra pertence a fase seguinte. Guardar\n"
        "-- cru tem um motivo pratico: sao R$ 21,8 milhoes, e quando um total nao fechar\n"
        "-- ao centavo o conferente tem de chegar na LINHA da planilha, nao num numero\n"
        "-- ja mastigado. Dois casos deste lote provam a necessidade:\n"
        "--   1. Vencimento nao e sempre uma data. Em 95 linhas de lancamentos ele traz\n"
        "--      N datas separadas por \"; \" (\"12/08/2026; 11/09/2026; 13/10/2026\"),\n"
        "--      exatamente as 95 com Condicao de Pagamento 2X..21X. Uma coluna date\n"
        "--      recusaria a linha ou, pior, guardaria so a primeira parcela.\n"
        "--   2. Valor em Excel ora e int (203600) ora float (41218.45); o texto\n"
        "--      preserva a forma exportada e o cast fica explicito na fase seguinte.\n"
        "--\n"
        "-- linha_planilha e a chave primaria de proposito: e o numero da linha no Excel\n"
        "-- (2 = primeira linha de dados, porque 1 e o cabecalho). Achado divergente na\n"
        "-- conferencia, abre-se a planilha nessa linha. indice e a coluna \"Indice\" da\n"
        "-- origem e NAO e inteiro: 236 lancamentos e 179 pagamentos usam a forma N.M\n"
        "-- (\"4.1\", \"4.2\") para parcela, por isso ele tambem e text.\n"
        "--\n"
        "-- SEM RLS COM POLICY, SEM GRANT: staging nao e tela. Ninguem autenticado le ou\n"
        "-- escreve nisso; quem trabalha aqui e a conferencia via SQL (service role /\n"
        "-- postgres, que passam por cima da RLS). Entao RLS fica ligada SEM policy\n"
        "-- nenhuma, que e o fechado total para authenticated e anon.\n"
        "-- O revoke explicito nao e enfeite: neste projeto o default privilege do papel\n"
        "-- postgres no schema public da Dxtm (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) a\n"
        "-- anon e authenticated (medido em pg_default_acl). TRUNCATE nao passa por RLS,\n"
        "-- ou seja, sem o revoke um anonimo apagaria a staging inteira.\n"
        "--\n"
        "-- Estas tabelas sao descartaveis: depois da carga conferida e aprovada, o\n"
        "-- rollback correspondente derruba as duas.\n"
        "--\n"
        "-- Arquivo gerado por supabase/carga/gerar_stg_br364.py. Nao edite a mao:\n"
        "-- reexporte a planilha e rode o gerador de novo.\n"
    )

    for spec in TABELAS:
        tabela = spec["tabela"]
        linhas = dados[tabela]
        colunas = spec["colunas"]
        w(f"\n-- ============================================================\n")
        w(f"-- {tabela}: {spec['arquivo']} aba \"{spec['aba']}\", {len(linhas)} linhas\n")
        w(f"-- ============================================================\n\n")
        w(f"create table public.{tabela} (\n")
        w("  linha_planilha integer primary key,\n")
        corpo = [f"  {nome} text" for nome, _ in colunas]
        w(",\n".join(corpo))
        w("\n);\n\n")
        w(f"alter table public.{tabela} enable row level security;\n")
        w(f"revoke all on table public.{tabela} from anon, authenticated;\n\n")
        texto_tabela = (
            f"Staging cru da carga BR-364 Lote 09: {spec['arquivo']} aba {spec['aba']}. "
            "Todas as colunas text, fiel a origem. Descartavel."
        )
        w(f"comment on table public.{tabela} is {literal(texto_tabela)};\n")
        w(
            f"comment on column public.{tabela}.linha_planilha is "
            f"{literal('Numero da linha no Excel de origem (2 = primeira linha de dados).')};\n"
        )
        for nome, cabecalho in colunas:
            w(
                f"comment on column public.{tabela}.{nome} is "
                f"{literal('Coluna da planilha: ' + cabecalho)};\n"
            )
        w("\n")

        lista_colunas = ", ".join(["linha_planilha"] + [c for c, _ in colunas])
        for inicio in range(0, len(linhas), LINHAS_POR_INSERT):
            bloco = linhas[inicio : inicio + LINHAS_POR_INSERT]
            w(f"insert into public.{tabela} ({lista_colunas}) values\n")
            valores = []
            for linha in bloco:
                celulas = [str(linha[0])] + [literal(v) for v in linha[1:]]
                valores.append("  (" + ", ".join(celulas) + ")")
            w(",\n".join(valores))
            w(";\n")
        w("\n")

    # Trava de conferencia: a migration se recusa a passar se a carga nao bater
    # com o que foi medido na planilha na hora de gerar o arquivo. Sem isso, uma
    # linha perdida no meio de 3.420 inserts passaria calada.
    w("-- ============================================================\n")
    w("-- Trava: contagem e somas medidas na planilha ao gerar este arquivo.\n")
    w("-- Se a carga divergir, a migration falha e nada e gravado.\n")
    w("-- ============================================================\n\n")
    w("do $$\ndeclare\n  v_qtd bigint;\n  v_soma numeric;\nbegin\n")
    for spec in TABELAS:
        tabela = spec["tabela"]
        linhas = dados[tabela]
        w(f"  select count(*) into v_qtd from public.{tabela};\n")
        w(f"  if v_qtd <> {len(linhas)} then\n")
        w(
            f"    raise exception '{tabela}: carregou % linhas, esperado {len(linhas)}', v_qtd;\n"
        )
        w("  end if;\n")
        for coluna in spec["somas"]:
            total = soma(linhas, spec["colunas"], coluna)
            w(
                f"  select coalesce(sum({coluna}::numeric), 0) into v_soma from public.{tabela};\n"
            )
            w(f"  if v_soma <> {total} then\n")
            w(
                f"    raise exception '{tabela}.{coluna}: somou %, esperado {total}', v_soma;\n"
            )
            w("  end if;\n")
    w("end $$;\n")

    SAIDA_SQL.write_text("".join(partes), encoding="utf-8")

    SAIDA_ROLLBACK.write_text(
        "-- Rollback de "
        + SAIDA_SQL.name
        + ".\n"
        "-- Staging e descartavel: derruba as duas tabelas da carga BR-364 Lote 09.\n"
        "-- Nenhuma tabela de negocio depende delas (nenhuma FK aponta para ca), por\n"
        "-- isso drop simples, sem cascade, que falharia de proposito se alguem tivesse\n"
        "-- criado dependencia.\n\n"
        "drop table if exists public.stg_br364_pagamentos;\n"
        "drop table if exists public.stg_br364_lancamentos;\n",
        encoding="utf-8",
    )

    for spec in TABELAS:
        tabela = spec["tabela"]
        linhas = dados[tabela]
        print(f"{tabela}: {len(linhas)} linhas")
        for coluna in spec["somas"]:
            print(f"  soma {coluna} = {soma(linhas, spec['colunas'], coluna)}")
    print(f"escrito: {SAIDA_SQL}")
    print(f"escrito: {SAIDA_ROLLBACK}")


if __name__ == "__main__":
    gerar()
