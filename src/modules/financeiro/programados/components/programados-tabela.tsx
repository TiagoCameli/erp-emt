"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock } from "lucide-react";

import {
  DataTable,
  EmptyState,
  KPICard,
  MoneyText,
  StatusBadge,
  type StatusPadrao,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { PagarParcelaDrawer } from "@/modules/financeiro/pagamentos/components/pagar-parcela-drawer";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";
import {
  bucketProgramacao,
  type BucketProgramacao,
  type ResumoProgramados,
} from "@/modules/financeiro/programados/calculo";
import type { ParcelaProgramada } from "@/modules/financeiro/programados/queries";
import { ProgramarDialog } from "./programar-dialog";

/** Rótulo + cor (StatusPadrao canônico) de cada bucket da fila. */
const BUCKET_BADGE: Record<
  BucketProgramacao,
  { rotulo: string; status: StatusPadrao }
> = {
  atrasada: { rotulo: "Atrasada", status: "rejeitado" },
  hoje: { rotulo: "Hoje", status: "pendente_aprovacao" },
  proxima: { rotulo: "Próxima", status: "rascunho" },
};

export interface ProgramadosTabelaProps {
  /** Parcelas da fila, já ordenadas pela data efetiva (calculo.ts/queries.ts). */
  parcelas: ParcelaProgramada[];
  resumo: ResumoProgramados;
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no server component. */
  hoje: string;
  contas: ContaBancariaOpcao[];
  /** Permissão de editar em financeiro.programados (programar/reprogramar). */
  podeEditar: boolean;
  /** Permissão de criar em financeiro.pagamentos (o Pagar reusa esse fluxo). */
  podePagar: boolean;
}

/** Converte a parcela programada para o formato que o drawer de pagamento espera. */
function paraParcelaAprovada(parcela: ParcelaProgramada): ParcelaAprovada {
  return {
    id: parcela.id,
    lancamentoId: parcela.lancamentoId,
    lancamentoNumero: parcela.lancamentoNumero,
    numeroParcela: parcela.numeroParcela,
    descricao: parcela.lancamentoDescricao,
    fornecedorNome: parcela.fornecedorNome,
    dataVencimento: parcela.dataVencimento,
    valor: parcela.valor,
    aprovadoEm: null,
  };
}

/**
 * Aba Programados: KPIs de atrasado/hoje/próximos 7 dias no topo e a fila de
 * parcelas aprovadas ordenada pela data efetiva, com ação de Pagar (reusa o
 * `PagarParcelaDrawer` de pagamentos/) e Programar/Reprogramar (dialog
 * próprio, um campo de data).
 */
export function ProgramadosTabela({
  parcelas,
  resumo,
  hoje,
  contas,
  podeEditar,
  podePagar,
}: ProgramadosTabelaProps) {
  const router = useRouter();

  const [parcelaPagamento, setParcelaPagamento] =
    React.useState<ParcelaAprovada | null>(null);
  const [drawerPagarAberto, setDrawerPagarAberto] = React.useState(false);

  const [parcelaProgramacao, setParcelaProgramacao] =
    React.useState<ParcelaProgramada | null>(null);
  const [dialogProgramarAberto, setDialogProgramarAberto] = React.useState(false);

  function abrirPagamento(parcela: ParcelaProgramada) {
    setParcelaPagamento(paraParcelaAprovada(parcela));
    setDrawerPagarAberto(true);
  }

  function abrirProgramacao(parcela: ParcelaProgramada) {
    setParcelaProgramacao(parcela);
    setDialogProgramarAberto(true);
  }

  const semConta = contas.length === 0;

  const colunas = React.useMemo<ColumnDef<ParcelaProgramada, unknown>[]>(
    () => [
      {
        accessorKey: "fornecedorNome",
        header: "Fornecedor",
      },
      {
        accessorKey: "lancamentoDescricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.lancamentoDescricao}</span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataVencimento
              ? formatarData(row.original.dataVencimento)
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "dataEfetiva",
        header: "Data programada",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.dataEfetiva
              ? formatarData(row.original.dataEfetiva)
              : "-"}
          </span>
        ),
      },
      {
        id: "bucket",
        header: "Situação",
        cell: ({ row }) => {
          const { dataEfetiva } = row.original;
          if (!dataEfetiva) return null;
          const bucket = BUCKET_BADGE[bucketProgramacao(dataEfetiva, hoje)];
          return <StatusBadge status={bucket.status} rotulo={bucket.rotulo} />;
        },
      },
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {podeEditar ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => abrirProgramacao(row.original)}
              >
                {row.original.dataProgramada ? "Reprogramar" : "Programar"}
              </Button>
            ) : null}
            {podePagar ? (
              <Button
                type="button"
                size="sm"
                disabled={semConta}
                onClick={() => abrirPagamento(row.original)}
              >
                Pagar
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [hoje, podeEditar, podePagar, semConta],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Atrasado"
          valor={<MoneyText valor={resumo.atrasado} />}
          detalhe={`${resumo.quantidade.atrasado} ${resumo.quantidade.atrasado === 1 ? "parcela" : "parcelas"}`}
        />
        <KPICard
          titulo="Hoje"
          valor={<MoneyText valor={resumo.hoje} />}
          detalhe={`${resumo.quantidade.hoje} ${resumo.quantidade.hoje === 1 ? "parcela" : "parcelas"}`}
        />
        <KPICard
          titulo="Próximos 7 dias"
          valor={<MoneyText valor={resumo.proximos7} />}
          detalhe={`${resumo.quantidade.proximos7} ${resumo.quantidade.proximos7 === 1 ? "parcela" : "parcelas"}`}
        />
      </div>

      {podePagar && semConta ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-detalhe text-muted-foreground">
          Cadastre uma conta bancária ativa antes de registrar pagamentos.
        </p>
      ) : null}

      <DataTable
        columns={colunas}
        data={parcelas}
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhum pagamento na fila"
            descricao="Parcelas aprovadas aparecem aqui, ordenadas pela data programada"
            className="border-none bg-transparent"
          />
        }
      />

      <PagarParcelaDrawer
        aberto={drawerPagarAberto}
        onAbertoChange={setDrawerPagarAberto}
        parcela={parcelaPagamento}
        contas={contas}
        onPago={() => router.refresh()}
      />

      <ProgramarDialog
        aberto={dialogProgramarAberto}
        onAbertoChange={setDialogProgramarAberto}
        parcela={parcelaProgramacao}
        onProgramado={() => router.refresh()}
      />
    </div>
  );
}
