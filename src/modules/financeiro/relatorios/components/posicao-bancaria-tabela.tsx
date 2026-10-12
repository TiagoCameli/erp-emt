"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { formatarData } from "@/lib/formatadores";
import { drillContaBancaria } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { PosicaoBancaria, PosicaoBancariaConta } from "../queries";

interface PosicaoBancariaTabelaProps {
  posicao: PosicaoBancaria;
  /** Sem permissão de ver lançamentos, a conta não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

function rotuloBanco(banco: string): string {
  return ROTULO_BANCO[banco as BancoConta] ?? banco;
}

/** Valor de uma coluna de dinheiro, para a ordenação comparar número. */
function colunaValor(
  id: "entradas" | "saidas" | "saldoAtual",
  header: string,
  classe: string,
): ColumnDef<PosicaoBancariaConta, unknown> {
  return {
    id,
    accessorFn: (conta) => conta[id],
    header,
    size: 150,
    meta: {
      rotulo: header,
      alinharDireita: true,
      atomico: true,
      celular: id === "saldoAtual" ? "valor" : undefined,
    },
    cell: ({ row }) => (
      <MoneyText valor={row.original[id]} className={classe} />
    ),
  };
}

/**
 * Posição bancária em tabela: por conta, saldo inicial, entradas, saídas e
 * saldo atual, mais a linha de total. Detalha os KPICards de cada conta.
 */
export function PosicaoBancariaTabela({
  posicao,
  podeVerLancamentos,
}: PosicaoBancariaTabelaProps) {
  const colunas = React.useMemo<ColumnDef<PosicaoBancariaConta, unknown>[]>(
    () => [
      {
        id: "conta",
        accessorFn: (conta) => conta.nome,
        header: "Conta",
        size: 220,
        meta: { rotulo: "Conta", fixa: true, celular: "titulo" },
        cell: ({ row }) => {
          const conta = row.original;
          return (
            <span className="text-foreground">
              {/* O clique abre as parcelas PAGAS por esta conta, que é o que a
                  posição soma (pelo líquido). Sem o recorte a lista traria
                  também o que ainda não passou por ela. */}
              {podeVerLancamentos ? (
                <LinkDrill
                  href={drillContaBancaria({
                    contaId: conta.contaId,
                    tipo: "a_pagar",
                  })}
                  titulo={`Ver os pagamentos feitos por ${conta.nome}`}
                >
                  {conta.nome}
                </LinkDrill>
              ) : (
                conta.nome
              )}
            </span>
          );
        },
      },
      {
        id: "banco",
        accessorFn: (conta) => rotuloBanco(conta.banco),
        header: "Banco",
        size: 150,
        meta: { rotulo: "Banco" },
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{String(getValue())}</span>
        ),
      },
      {
        id: "saldoInicial",
        accessorFn: (conta) => conta.saldoInicial,
        header: "Saldo inicial",
        size: 150,
        meta: { rotulo: "Saldo inicial", alinharDireita: true, atomico: true },
        cell: ({ row }) => {
          const conta = row.original;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <MoneyText valor={conta.saldoInicial} className="text-detalhe" />
              {/* Com data de corte, "Saldo inicial" não é a abertura da conta e
                  as colunas ao lado não são o histórico todo: as três falam de
                  um período. Certo na aritmética e mudo sobre o recorte seria a
                  mesma armadilha do plug antigo, que também era um número sem
                  data. */}
              {conta.saldoInicialData ? (
                <span
                  className="text-legenda text-muted-foreground"
                  title={`Saldo lido do extrato de ${formatarData(conta.saldoInicialData)}. As colunas ao lado somam só o movimento posterior a essa data.`}
                >
                  em {formatarData(conta.saldoInicialData)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      colunaValor("entradas", "Entradas", "text-detalhe"),
      colunaValor("saidas", "Saídas", "text-detalhe"),
      colunaValor("saldoAtual", "Saldo atual", "text-detalhe font-medium"),
    ],
    [podeVerLancamentos],
  );

  return (
    <div className="flex flex-col gap-2">
      {/*
        Contas que o usuário não pode ver o saldo ficam FORA da tabela e dos
        totais. A frase existe porque relatório que some linha em silêncio é pior
        que relatório restrito: sem ela, os totais pareceriam "todo o dinheiro da
        empresa" quando são de um recorte.
      */}
      {posicao.contasOcultas > 0 ? (
        <p className="text-detalhe text-muted-foreground">
          {posicao.contasOcultas === 1
            ? "1 conta ativa está fora deste relatório porque você não tem permissão de ver o saldo dela."
            : `${posicao.contasOcultas} contas ativas estão fora deste relatório porque você não tem permissão de ver o saldo delas.`}{" "}
          Os totais abaixo somam só as contas listadas.
        </p>
      ) : null}

      <DataTable
        idTabela="financeiro.relatorios.posicao-bancaria"
        columns={colunas}
        data={posicao.contas}
        idDaLinha={(conta) => conta.contaId}
        semPaginacao
        emptyState="Nenhuma conta bancária neste relatório"
        // Total preso ao id da coluna: acompanha quando o usuário reordena.
        rodape={{
          conta: (
            <span className="block text-center text-detalhe font-semibold text-foreground">
              Total
            </span>
          ),
          saldoInicial: (
            <MoneyText
              valor={posicao.totalSaldoInicial}
              className="text-detalhe font-semibold"
            />
          ),
          entradas: (
            <MoneyText
              valor={posicao.totalEntradas}
              className="text-detalhe font-semibold"
            />
          ),
          saidas: (
            <MoneyText
              valor={posicao.totalSaidas}
              className="text-detalhe font-semibold"
            />
          ),
          saldoAtual: (
            <MoneyText
              valor={posicao.totalSaldoAtual}
              className="text-detalhe font-semibold"
            />
          ),
        }}
      />
    </div>
  );
}
