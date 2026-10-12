"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { ROTULO_PRODUTO } from "@/modules/financeiro/aplicacoes/calculo";
import {
  resumoDaSubconta,
  type SaldoDaAplicacao,
} from "@/modules/financeiro/contas-bancarias/aplicacoes-da-subconta";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";

export interface AplicacoesDaSubcontaExpandidaProps {
  subconta: ContaLista;
  aplicacoes: readonly SaldoDaAplicacao[];
}

/**
 * Uma aplicação da subconta, ou a linha do que sobra no saldo sem aplicação
 * (sempre a última).
 */
type LinhaAplicacao =
  | { tipo: "aplicacao"; id: string; aplicacao: SaldoDaAplicacao; saldo: number }
  | { tipo: "fora"; id: string; saldo: number };

// A linha "Fora dos investimentos" fecha a lista: ordenar a levaria para o meio,
// então nenhuma coluna ordena.
const COLUNAS: ColumnDef<LinhaAplicacao, unknown>[] = [
  {
    id: "investimento",
    header: "Investimento",
    size: 260,
    enableSorting: false,
    meta: { celular: "titulo" },
    cell: ({ row }) => {
      const r = row.original;
      if (r.tipo === "fora") {
        return (
          <span title="Movimento lançado na subconta sem investimento. Abra o extrato da subconta para achar qual é.">
            Fora dos investimentos
          </span>
        );
      }
      return (
        <>
          {r.aplicacao.nome}
          {r.aplicacao.ativa ? null : <span className="text-muted-foreground"> (inativa)</span>}
        </>
      );
    },
  },
  {
    id: "tipo",
    header: "Tipo",
    size: 140,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.tipo === "aplicacao" ? (
        <span className="text-muted-foreground">
          {ROTULO_PRODUTO[row.original.aplicacao.produto] ?? row.original.aplicacao.produto}
        </span>
      ) : null,
  },
  {
    id: "ultimaPosicao",
    header: "Última posição",
    size: 150,
    enableSorting: false,
    meta: { atomico: true },
    cell: ({ row }) => {
      const r = row.original;
      if (r.tipo !== "aplicacao") return null;
      return (
        <span className="text-muted-foreground">
          {r.aplicacao.ultimaPosicao ? formatarData(r.aplicacao.ultimaPosicao) : "Sem posição gravada"}
        </span>
      );
    },
  },
  {
    id: "saldo",
    header: "Saldo",
    size: 160,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    cell: ({ row }) => <MoneyText valor={row.original.saldo} />,
  },
];

/**
 * A linha expandida da subconta de investimentos: quais são os investimentos e
 * quanto tem em cada um (pedido do Tiago em 08/10/2026). A soma fecha com o
 * saldo da subconta; o que sobrar é movimento sem aplicação, mostrado à parte.
 */
export function AplicacoesDaSubcontaExpandida({
  subconta,
  aplicacoes,
}: AplicacoesDaSubcontaExpandidaProps) {
  const resumo = resumoDaSubconta(subconta.id, subconta.saldoAtual, aplicacoes);

  if (resumo.aplicacoes.length === 0) {
    return (
      <p className="border-t border-border px-4 py-3 text-detalhe text-muted-foreground">
        Esta subconta não tem investimento cadastrado. Cadastre em Cadastros &gt;
        Centros de custo, no centro Investimentos, escolhendo esta conta.
      </p>
    );
  }

  const registros: LinhaAplicacao[] = resumo.aplicacoes.map((a) => ({
    tipo: "aplicacao" as const,
    id: a.aplicacaoId,
    aplicacao: a,
    saldo: a.saldo,
  }));
  if (resumo.foraDasAplicacoes !== null) {
    registros.push({ tipo: "fora", id: "fora-dos-investimentos", saldo: resumo.foraDasAplicacoes });
  }

  return (
    <div className="border-t border-border px-4 py-3" data-testid="aplicacoes-da-subconta">
      <div className="max-w-3xl">
        <DataTable
          idTabela="financeiro.contas-bancarias.aplicacoes-da-subconta"
          columns={COLUNAS}
          data={registros}
          idDaLinha={(r) => r.id}
          semPaginacao
          classeDaLinha={(r) => (r.tipo === "fora" ? "text-status-pendente" : undefined)}
          rodape={{
            investimento: <span className="font-semibold">Total da subconta</span>,
            saldo: (
              <MoneyText valor={subconta.saldoAtual ?? resumo.total} className="font-semibold" />
            ),
          }}
        />
      </div>
    </div>
  );
}
