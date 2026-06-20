"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import {
  STATUS_CHECKLIST,
  type StatusChecklist,
} from "@/modules/manutencao/_shared/formato";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import type { ExecucaoLista } from "@/modules/manutencao/checklists/queries";

const OPCOES_STATUS = (Object.keys(STATUS_CHECKLIST) as StatusChecklist[]).map(
  (valor) => ({ valor, rotulo: STATUS_CHECKLIST[valor].rotulo }),
);

const colunas: ColumnDef<ExecucaoLista, unknown>[] = [
  {
    accessorKey: "data",
    header: "Data",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.data)}</span>
    ),
  },
  {
    accessorKey: "checklistNome",
    header: "Checklist",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.checklistNome}</span>
    ),
  },
  {
    accessorKey: "equipamentoDescricao",
    header: "Equipamento",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span>{row.original.equipamentoDescricao}</span>
        {row.original.equipamentoPlaca ? (
          <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.equipamentoPlaca}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "operadorNome",
    header: "Operador",
    cell: ({ row }) =>
      row.original.operadorNome ? (
        row.original.operadorNome
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_CHECKLIST[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
];

export interface ExecucoesTabelaProps {
  execucoes: ExecucaoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  equipamentoId: string;
  equipamentos: EquipamentoOpcao[];
}

/**
 * Histórico de execuções de checklist: filtros de equipamento e status na URL,
 * paginação server-side e clique na linha abre o detalhe da execução.
 */
export function ExecucoesTabela({
  execucoes,
  total,
  pagina,
  tamanho,
  status,
  equipamentoId,
  equipamentos,
}: ExecucoesTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();

  const opcoesEquipamento = equipamentos.map((eq) => ({
    valor: eq.id,
    rotulo: eq.placa ? `${eq.descricao} (${eq.placa})` : eq.descricao,
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
          valor={equipamentoId}
          onValorChange={(valor) =>
            setMuitos({ equipamento: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesEquipamento}
          placeholder="Equipamento"
          todosRotulo="Todos os equipamentos"
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
        data={execucoes}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(execucao) =>
          router.push(`/manutencao/checklists/${execucao.id}`)
        }
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhuma execução"
            descricao="As execuções de checklist pré-uso aparecem aqui assim que forem enviadas."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
