"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { ClipboardList, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import {
  ROTULO_STATUS_PEDIDO,
  type StatusPedido as ChaveStatusPedido,
} from "@/modules/compras/_shared/formato";
import type {
  InsumoOpcao,
  OpcaoSelecao,
  PedidoLista,
} from "@/modules/compras/pedidos/queries";
import { PedidoFormDrawer } from "./pedido-form-drawer";

const OPCOES_STATUS = (
  Object.keys(ROTULO_STATUS_PEDIDO) as ChaveStatusPedido[]
).map((chave) => ({
  valor: chave,
  rotulo: ROTULO_STATUS_PEDIDO[chave].rotulo,
}));

const colunas: ColumnDef<PedidoLista, unknown>[] = [
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = ROTULO_STATUS_PEDIDO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "qtdItens",
    header: "Itens",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.qtdItens}</span>
    ),
  },
  {
    accessorKey: "criadoEm",
    header: "Criado em",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatarData(row.original.criadoEm)}</span>
    ),
  },
  {
    accessorKey: "solicitanteNome",
    header: "Solicitante",
    cell: ({ row }) =>
      row.original.solicitanteNome ? (
        row.original.solicitanteNome
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

export interface PedidosTabelaProps {
  pedidos: PedidoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  status: string;
  busca: string;
  insumos: InsumoOpcao[];
  centrosCusto: OpcaoSelecao[];
  depositos: OpcaoSelecao[];
  podeCriar: boolean;
}

/**
 * Listagem de pedidos com paginação server-side e filtros (busca por número e
 * status) persistidos na URL. Clicar numa linha abre o detalhe; o botão do
 * cabeçalho abre o drawer de criação para quem tem permissão de criar.
 */
export function PedidosTabela({
  pedidos,
  total,
  pagina,
  tamanho,
  status,
  busca: buscaUrl,
  insumos,
  centrosCusto,
  depositos,
  podeCriar,
}: PedidosTabelaProps) {
  const router = useRouter();
  const [criando, setCriando] = React.useState(false);
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
      <div className="flex items-end justify-between gap-2">
        <FilterBar>
          <FiltroBusca
            valor={busca}
            onValorChange={setBusca}
            placeholder="Buscar por número"
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

        {podeCriar ? (
          <Button type="button" size="sm" onClick={() => setCriando(true)}>
            <Plus />
            Novo pedido
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={colunas}
        data={pedidos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(pedido) => router.push(`/compras/pedidos/${pedido.id}`)}
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhum pedido por aqui"
            descricao={
              podeCriar
                ? "Crie o primeiro pedido de compra para começar"
                : "Quando houver pedidos, eles aparecem nesta lista"
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar ? (
        <PedidoFormDrawer
          key={criando ? "aberto" : "fechado"}
          aberto={criando}
          onAbertoChange={setCriando}
          pedido={null}
          insumos={insumos}
          centrosCusto={centrosCusto}
          depositos={depositos}
        />
      ) : null}
    </div>
  );
}
