"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Ruler } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import {
  STATUS_MEDICAO,
  type StatusMedicao,
} from "@/modules/medicao/_shared/formato";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import type { MedicaoLista } from "@/modules/medicao/medicoes/queries";

const OPCOES_STATUS = (Object.keys(STATUS_MEDICAO) as StatusMedicao[]).map(
  (valor) => ({ valor, rotulo: STATUS_MEDICAO[valor].rotulo }),
);

const colunas: ColumnDef<MedicaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "obraNome",
    header: "Obra",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.obraNome}</span>
        {row.original.obraLote ? (
          <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
            Lote {row.original.obraLote}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "competencia",
    header: "Competência",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.competencia)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_MEDICAO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => {
      const { status, valorTotal } = row.original;
      if (status !== "aprovada" || valorTotal === 0) {
        return <span className="text-muted-foreground">-</span>;
      }
      return <MoneyText valor={valorTotal} />;
    },
  },
];

export interface MedicoesTabelaProps {
  medicoes: MedicaoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  obraId: string;
  obras: ObraOpcao[];
}

/**
 * Listagem das medições: filtros de status e obra na URL, paginação
 * server-side e clique na linha abre o detalhe.
 */
export function MedicoesTabela({
  medicoes,
  total,
  pagina,
  tamanho,
  status,
  obraId,
  obras,
}: MedicoesTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();

  const opcoesObra = obras.map((obra) => ({
    valor: obra.id,
    rotulo: obra.lote ? `${obra.nome} (Lote ${obra.lote})` : obra.nome,
  }));

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroSelect
          valor={status}
          onValorChange={(valor) =>
            setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
        <FiltroSelect
          valor={obraId}
          onValorChange={(valor) =>
            setMuitos({ obra: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesObra}
          placeholder="Obra"
          todosRotulo="Todas as obras"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={medicoes}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(medicao) => router.push(`/medicao/medicoes/${medicao.id}`)}
        emptyState={
          <EmptyState
            icone={Ruler}
            titulo="Nenhuma medição"
            descricao="Crie a primeira medição para registrar o avanço medido do período."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
