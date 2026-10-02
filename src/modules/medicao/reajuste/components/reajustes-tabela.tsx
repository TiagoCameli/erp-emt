"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Percent } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText, StatusBadge } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import { SeloSituacaoReajuste } from "@/modules/medicao/reajuste/components/selo-situacao-reajuste";
import { diferencaReajuste } from "@/modules/medicao/reajuste/formato";
import type { LinhaListaReajuste } from "@/modules/medicao/reajuste/tipos";

/**
 * Colunas da aba Reajuste. No celular o card mostra o contrato no título, o reajuste no valor, a
 * medição no subtítulo e o selo da medição e a situação dos índices nos primeiros campos.
 */
export const colunasReajustes: ColumnDef<LinhaListaReajuste, unknown>[] = [
  {
    id: "contrato",
    accessorFn: (l) => `${l.contratoCodigo} ${l.contratoNome}`,
    header: "Contrato",
    size: 240,
    meta: { fixa: true, naoTruncar: true, celular: "titulo" },
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono">{row.original.contratoCodigo}</span>
        <span className="text-legenda text-muted-foreground">{row.original.contratoNome}</span>
      </div>
    ),
  },
  {
    id: "medicao",
    accessorFn: (l) => l.numero,
    header: "Medição",
    size: 190,
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium tabular-nums">{row.original.numero}ª</span>
        <span className="tabular-nums text-legenda text-muted-foreground">
          {periodoMedicao(row.original.periodoInicio, row.original.periodoFim)}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 140,
    meta: { celular: "destaque" },
    cell: ({ row }) => <SeloMedicao status={row.original.status} />,
  },
  {
    id: "total",
    accessorFn: (l) => l.total,
    header: "Reajuste",
    size: 150,
    meta: { alinharDireita: true, atomico: true, celular: "valor" },
    // Sem relatório não há reajuste: traço, nunca "R$ 0,00".
    cell: ({ row }) => (row.original.total === null ? <CelulaVazia /> : <MoneyText valor={row.original.total} />),
  },
  {
    accessorKey: "situacao",
    header: "Situação",
    size: 150,
    meta: { celular: "destaque" },
    cell: ({ row }) =>
      row.original.situacao === null ? (
        <StatusBadge status="rascunho" rotulo="Sem relatório" />
      ) : (
        <SeloSituacaoReajuste situacao={row.original.situacao} />
      ),
  },
  {
    id: "diferenca",
    header: "Diferença para o anterior",
    size: 200,
    // A diferença vem pronta de `mc_v_reajuste_medicao` (só o relatório que vale tem uma).
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => {
      if (row.original.diferenca === null) return null;
      const d = diferencaReajuste(row.original.diferenca);
      return <span className={cn("tabular-nums", d.sinal < 0 && "text-status-rejeitado")}>{d.texto}</span>;
    },
  },
  {
    accessorKey: "relatorios",
    header: "Relatórios",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <span className="tabular-nums">{row.original.relatorios}</span>,
  },
];

function idDaLinha(l: LinhaListaReajuste): string {
  return l.medicaoId;
}

export interface ReajustesTabelaProps {
  linhas: LinhaListaReajuste[];
}

/**
 * Uma linha por medição enviada ou aprovada (a ordem vem de `listarReajustes`), com o reajuste que
 * vale nela. Clique abre o detalhe da medição, onde mora a seção Reajuste.
 */
export function ReajustesTabela({ linhas }: ReajustesTabelaProps) {
  const router = useRouter();
  return (
    <DataTable
      idTabela="medicao.reajuste"
      columns={colunasReajustes}
      data={linhas}
      idDaLinha={idDaLinha}
      onRowClick={(l) => router.push(`/medicao/medicoes/${l.medicaoId}`)}
      cabecalhoFixo
      emptyState={
        <EmptyState
          icone={Percent}
          titulo="Nenhuma medição enviada ou aprovada"
          descricao="O reajuste entra na medição depois de enviada. Ajuste os filtros ou envie uma medição"
          className="border-none bg-transparent"
        />
      }
    />
  );
}
