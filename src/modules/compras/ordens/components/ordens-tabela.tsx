"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ShoppingCart } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { infoStatusOC, ROTULO_STATUS_OC } from "@/modules/compras/_shared/formato";
import type { OrdemLista } from "@/modules/compras/ordens/queries";

const OPCOES_STATUS = Object.entries(ROTULO_STATUS_OC).map(
  ([valor, info]) => ({ valor, rotulo: info.rotulo }),
);

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
    accessorKey: "fornecedorNome",
    header: "Fornecedor",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.fornecedorNome}</span>
    ),
  },
  {
    accessorKey: "valorTotal",
    header: "Valor total",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = infoStatusOC(row.original.status);
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "dataEmissao",
    header: "Emissão",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataEmissao)}
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
  busca: string;
}

/**
 * Listagem das ordens de compra com paginação server-side e filtros (busca
 * por número ou fornecedor e status) persistidos na URL. Clicar numa linha
 * abre o detalhe.
 */
export function OrdensTabela({
  ordens,
  total,
  pagina,
  tamanho,
  status,
  busca: buscaUrl,
}: OrdensTabelaProps) {
  const router = useRouter();
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número ou fornecedor"
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
        data={ordens}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(ordem) => router.push(`/compras/ordens/${ordem.id}`)}
        emptyState={
          <EmptyState
            icone={ShoppingCart}
            titulo="Nenhuma ordem de compra"
            descricao="Crie a primeira ordem de compra para começar"
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
