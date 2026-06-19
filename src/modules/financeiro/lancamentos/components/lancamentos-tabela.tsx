"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Receipt } from "lucide-react";

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
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  type StatusLancamento,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";
import type { LancamentoLista } from "@/modules/financeiro/lancamentos/queries";

const OPCOES_TIPO = (
  Object.keys(ROTULO_TIPO_LANCAMENTO) as TipoLancamento[]
).map((valor) => ({ valor, rotulo: ROTULO_TIPO_LANCAMENTO[valor] }));

const OPCOES_STATUS = (
  Object.keys(STATUS_LANCAMENTO) as StatusLancamento[]
).map((valor) => ({ valor, rotulo: STATUS_LANCAMENTO[valor].rotulo }));

const colunas: ColumnDef<LancamentoLista, unknown>[] = [
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
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.tipo === "a_receber" ? "aprovado" : "pendente_aprovacao"}
        rotulo={ROTULO_TIPO_LANCAMENTO[row.original.tipo]}
      />
    ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.descricao}</span>
        {row.original.origem !== "manual" ? (
          <span className="ml-1.5 text-legenda text-muted-foreground">
            (origem {row.original.origem})
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "categoriaNome",
    header: "Categoria",
    cell: ({ row }) =>
      row.original.categoriaNome ? (
        <span>{row.original.categoriaNome}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
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
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.dataVencimento
          ? formatarData(row.original.dataVencimento)
          : "-"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_LANCAMENTO[row.original.status];
      // Todo lançamento nasce com status 'a_pagar' (em aberto); para um
      // recebível o rótulo correto é "A receber", não "A pagar".
      const rotulo =
        row.original.status === "a_pagar" &&
        row.original.tipo === "a_receber"
          ? "A receber"
          : info.rotulo;
      return <StatusBadge status={info.badge} rotulo={rotulo} />;
    },
  },
];

export interface LancamentosTabelaProps {
  lancamentos: LancamentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  tipo: string;
  status: string;
}

/**
 * Listagem de lançamentos com paginação server-side e filtros (tipo e status)
 * persistidos na URL. Clicar numa linha abre o detalhe.
 */
export function LancamentosTabela({
  lancamentos,
  total,
  pagina,
  tamanho,
  tipo,
  status,
}: LancamentosTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();

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
          valor={tipo}
          onValorChange={(valor) =>
            setMuitos({ tipo: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={OPCOES_TIPO}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
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
        data={lancamentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(lancamento) =>
          router.push(`/financeiro/lancamentos/${lancamento.id}`)
        }
        emptyState={
          <EmptyState
            icone={Receipt}
            titulo="Nenhum lançamento"
            descricao="Crie o primeiro lançamento a pagar ou a receber para começar"
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
