"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { CalendarClock } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { STATUS_PONTO, type StatusPonto } from "@/modules/rh/_shared/formato";
import type { ObraOpcao } from "@/modules/rh/_shared/queries";
import type { PontoLista } from "@/modules/rh/apontamentos/queries";

const OPCOES_STATUS = (Object.keys(STATUS_PONTO) as StatusPonto[]).map(
  (valor) => ({ valor, rotulo: STATUS_PONTO[valor].rotulo }),
);

const colunas: ColumnDef<PontoLista, unknown>[] = [
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
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.data)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_PONTO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "qtdColaboradores",
    header: "Colaboradores",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.qtdColaboradores}</span>
    ),
  },
  {
    accessorKey: "totalHoras",
    header: "Total de horas",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.totalHoras)} h
      </span>
    ),
  },
];

export interface PontosTabelaProps {
  pontos: PontoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  obraId: string;
  status: string;
  obras: ObraOpcao[];
}

/**
 * Listagem dos pontos do dia: filtros de obra e status na URL, paginação
 * server-side e clique na linha abre o detalhe.
 */
export function PontosTabela({
  pontos,
  total,
  pagina,
  tamanho,
  obraId,
  status,
  obras,
}: PontosTabelaProps) {
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
          valor={obraId}
          onValorChange={(valor) =>
            setMuitos({ obra: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesObra}
          placeholder="Obra"
          todosRotulo="Todas as obras"
        />
        <FiltroSelect
          valor={status}
          onValorChange={(valor) =>
            setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={pontos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(ponto) => router.push(`/rh/apontamentos/${ponto.id}`)}
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhum ponto lançado"
            descricao="Crie o ponto de um dia numa obra para começar a apontar as horas da equipe."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
