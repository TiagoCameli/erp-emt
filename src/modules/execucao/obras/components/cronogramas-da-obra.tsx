"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange } from "lucide-react";

import { DataTable, EmptyState, SecaoDetalhe, StatusBadge } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import type { CronogramaDaObra } from "@/modules/execucao/obras/queries";
import { ROTULO_STATUS_CRONOGRAMA } from "@/modules/execucao/_shared/rotulos";

const SITUACAO: Record<string, string> = { rascunho: "rascunho", ativo: "aprovado", concluido: "executado", arquivado: "cancelado" };

const colunas: ColumnDef<CronogramaDaObra, unknown>[] = [
  { accessorKey: "codigo", header: "Código", size: 120, cell: ({ row }) => <span className="font-mono">{row.original.codigo}</span> },
  { accessorKey: "nome", header: "Nome", size: 260 },
  {
    id: "situacao",
    header: "Situação",
    size: 130,
    cell: ({ row }) => (
      <StatusBadge status={SITUACAO[row.original.status] ?? row.original.status} rotulo={ROTULO_STATUS_CRONOGRAMA[row.original.status] ?? row.original.status} />
    ),
  },
  { id: "inicio", header: "Início previsto", size: 140, meta: { atomico: true }, cell: ({ row }) => formatarData(row.original.inicioPrevisto) },
  { id: "termino", header: "Término previsto", size: 140, meta: { atomico: true }, cell: ({ row }) => formatarData(row.original.terminoPrevisto) },
  { accessorKey: "nAtividades", header: "Atividades", size: 110, meta: { alinharDireita: true, atomico: true } },
  { accessorKey: "nCriticas", header: "Críticas", size: 100, meta: { alinharDireita: true, atomico: true } },
];

export function CronogramasDaObra({ cronogramas }: { cronogramas: CronogramaDaObra[] }) {
  const router = useRouter();
  return (
    <SecaoDetalhe titulo="Cronogramas">
      <DataTable<CronogramaDaObra>
        columns={colunas}
        data={cronogramas}
        idDaLinha={(c) => c.id}
        onRowClick={(c) => router.push(`/execucao/cronogramas/${c.id}`)}
        emptyState={<EmptyState icone={CalendarRange} titulo="Nenhum cronograma nesta obra" className="border-none bg-transparent" />}
      />
    </SecaoDetalhe>
  );
}
