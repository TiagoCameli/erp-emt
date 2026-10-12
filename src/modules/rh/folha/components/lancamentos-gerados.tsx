"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Receipt } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import type { LancamentosDaFolhaAgrupados } from "@/modules/rh/folha/calculo";
import type { LancamentoDaFolha } from "@/modules/rh/folha/queries";
import type { StatusFolha } from "@/modules/rh/_shared/formato";

export interface LancamentosGeradosProps {
  status: StatusFolha;
  agrupado: LancamentosDaFolhaAgrupados;
  /**
   * Permissão de ver lançamento (financeiro.lancamentos:ver). Sem ela o
   * número mostra só como texto: link pra uma tela que devolve 404 é pior
   * que não linkar. Espelha a coluna "No Financeiro" de
   * adiantamentos-tabela.tsx (Task 6).
   */
  podeVerLancamento: boolean;
}

/** Tabela de uma lista de lançamentos (salários ou guias) com o total no rodapé. */
function TabelaLancamentos({
  idTabela,
  lancamentos,
  total,
  podeVerLancamento,
}: {
  /** Salários e guias são tabelas distintas: cada uma guarda o próprio ajuste. */
  idTabela: string;
  lancamentos: LancamentoDaFolha[];
  total: number;
  podeVerLancamento: boolean;
}) {
  const colunas = React.useMemo<ColumnDef<LancamentoDaFolha, unknown>[]>(
    () => [
      {
        id: "descricao",
        header: "Descrição",
        accessorFn: (lancamento) => lancamento.descricao,
        size: 280,
        meta: { celular: "titulo" },
      },
      {
        id: "vencimento",
        header: "Vencimento",
        accessorFn: (lancamento) => lancamento.dataVencimento ?? "",
        size: 120,
        meta: { atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento ? (
              formatarData(row.original.dataVencimento)
            ) : (
              <CelulaVazia />
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (lancamento) =>
          STATUS_PARCELA[lancamento.statusParcela].rotulo,
        size: 130,
        meta: { naoTruncar: true },
        cell: ({ row }) => {
          const infoParcela = STATUS_PARCELA[row.original.statusParcela];
          return (
            <StatusBadge status={infoParcela.badge} rotulo={infoParcela.rotulo} />
          );
        },
      },
      {
        id: "valor",
        header: "Valor",
        accessorFn: (lancamento) => lancamento.valor,
        size: 140,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        id: "lancamento",
        header: () => <span className="sr-only">Lançamento no Financeiro</span>,
        accessorFn: (lancamento) => lancamento.numero ?? "",
        size: 150,
        meta: { alinharDireita: true, atomico: true, rotulo: "Lançamento" },
        cell: ({ row }) => {
          const lancamento = row.original;
          return podeVerLancamento ? (
            <Link
              href={`/financeiro/lancamentos/${lancamento.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <span className="codigo-doc">{lancamento.numero ?? "Abrir"}</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : lancamento.numero ? (
            <span className="codigo-doc text-muted-foreground">
              {lancamento.numero}
            </span>
          ) : (
            <CelulaVazia />
          );
        },
      },
    ],
    [podeVerLancamento],
  );

  return (
    <DataTable
      idTabela={idTabela}
      columns={colunas}
      data={lancamentos}
      idDaLinha={(lancamento) => lancamento.id}
      semPaginacao
      rodape={{
        descricao: <span className="font-semibold">Total</span>,
        valor: <MoneyText valor={total} className="font-semibold" />,
      }}
    />
  );
}

/**
 * Seção "Lançamentos gerados" do detalhe da folha (Bloco 8a, Task 7): mostra
 * o que a aprovação criou no Financeiro, separado em salários (um por
 * colaborador) e guias (um por grupo de recolhimento). Não mexe em dinheiro
 * nem em banco — só lê o que a aprovação já gravou.
 *
 * Em rascunho e pendente_aprovacao não existe lançamento nenhum (a aprovação
 * é quem gera), e o estado vazio explica isso em vez de mostrar uma lista sem
 * contexto. Aprovada sem nenhum grupo do outro lado (ex.: nenhum grupo de
 * recolhimento configurado) também é estado normal, não erro — cada sublista
 * tem sua própria nota quando fica vazia.
 */
export function LancamentosGerados({
  status,
  agrupado,
  podeVerLancamento,
}: LancamentosGeradosProps) {
  // Explica a diferença entre custo_total e a soma dos lançamentos ANTES que
  // alguém compare os dois e abra chamado: a provisão de 13º e férias (Bloco
  // 8b) é custo sem caixa, entra no custo_total da folha mas nunca gera
  // lançamento nem guia, então não aparece em nenhuma das listas abaixo.
  const notaProvisao = (
    <p className="text-legenda text-muted-foreground">
      A provisão de 13º e férias entra no custo da folha e não vira conta a
      pagar: por isso não aparece nesta lista.
    </p>
  );

  if (status !== "aprovado") {
    return (
      <div className="flex flex-col gap-3">
        {notaProvisao}
        <EmptyState
          icone={Receipt}
          titulo="Lançamentos ainda não gerados"
          // O texto promete o que a aprovação faz HOJE: desde 29/08/2026 ela
          // aprova o pagamento junto. Sem dizer isso aqui, quem lê antes de
          // aprovar continua esperando um segundo aval que não vem mais.
          descricao="A aprovação da folha cria um lançamento a pagar por colaborador (o líquido) e um por grupo de recolhimento (a guia), já com o pagamento aprovado e programado para o vencimento da folha. Enquanto a folha estiver em rascunho ou pendente de aprovação, não existe lançamento nenhum."
        />
      </div>
    );
  }

  if (agrupado.salarios.length === 0 && agrupado.guias.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {notaProvisao}
        <EmptyState
          icone={Receipt}
          titulo="Nenhum lançamento gerado"
          descricao="Esta folha foi aprovada sem gerar lançamentos. Confira os líquidos dos colaboradores e os grupos de recolhimento configurados em Parâmetros da Folha."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {notaProvisao}
      <div>
        <h3 className="mb-2 text-legenda font-medium text-muted-foreground">
          Salários
        </h3>
        {agrupado.salarios.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum colaborador gerou lançamento nesta folha (líquido zerado ou
            negativo).
          </p>
        ) : (
          <TabelaLancamentos
            idTabela="rh.folha.detalhe.lancamentos-salarios"
            lancamentos={agrupado.salarios}
            total={agrupado.totalSalarios}
            podeVerLancamento={podeVerLancamento}
          />
        )}
      </div>
      <div>
        <h3 className="mb-2 text-legenda font-medium text-muted-foreground">
          Guias
        </h3>
        {agrupado.guias.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Nenhum grupo de recolhimento configurado para esta folha.
          </p>
        ) : (
          <TabelaLancamentos
            idTabela="rh.folha.detalhe.lancamentos-guias"
            lancamentos={agrupado.guias}
            total={agrupado.totalGuias}
            podeVerLancamento={podeVerLancamento}
          />
        )}
      </div>
    </div>
  );
}
