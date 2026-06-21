"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Wrench } from "lucide-react";

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
  PRIORIDADE_OS,
  ROTULO_TIPO_OS,
  STATUS_OS,
  type StatusOS,
} from "@/modules/manutencao/_shared/formato";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import type { OrdemLista } from "@/modules/manutencao/ordens-servico/queries";

const OPCOES_STATUS = (Object.keys(STATUS_OS) as StatusOS[]).map((valor) => ({
  valor,
  rotulo: STATUS_OS[valor].rotulo,
}));

const colunas: ColumnDef<OrdemLista, unknown>[] = [
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
    accessorKey: "equipamentoDescricao",
    header: "Equipamento",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.equipamentoDescricao}</span>
        {row.original.equipamentoPlaca ? (
          <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.equipamentoPlaca}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <StatusBadge status="rascunho" rotulo={ROTULO_TIPO_OS[row.original.tipo]} />
    ),
  },
  {
    accessorKey: "prioridade",
    header: "Prioridade",
    cell: ({ row }) => {
      const info = PRIORIDADE_OS[row.original.prioridade];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_OS[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "custoTotal",
    header: "Custo",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "dataAbertura",
    header: "Abertura",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataAbertura)}
      </span>
    ),
  },
];

export interface OrdensTabelaProps {
  ordens: OrdemLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  equipamentoId: string;
  equipamentos: EquipamentoOpcao[];
}

/**
 * Listagem das OS: filtros de status e equipamento na URL, paginação
 * server-side e clique na linha abre o detalhe.
 */
export function OrdensTabela({
  ordens,
  total,
  pagina,
  tamanho,
  status,
  equipamentoId,
  equipamentos,
}: OrdensTabelaProps) {
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
          valor={status}
          onValorChange={(valor) =>
            setMuitos({ status: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
        <FiltroSelect
          valor={equipamentoId}
          onValorChange={(valor) =>
            setMuitos({ equipamento: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesEquipamento}
          placeholder="Equipamento"
          todosRotulo="Todos os equipamentos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={ordens}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(ordem) =>
          router.push(`/manutencao/ordens-servico/${ordem.id}`)
        }
        emptyState={
          <EmptyState
            icone={Wrench}
            titulo="Nenhuma ordem de serviço"
            descricao="Abra a primeira OS para começar a registrar manutenções."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
