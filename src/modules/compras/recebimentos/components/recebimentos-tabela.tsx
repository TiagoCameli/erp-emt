"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PackageCheck, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  MoneyText,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { infoStatusRecebimento } from "@/modules/compras/_shared/formato";
import type {
  OrdemReceptivel,
  RecebimentoLista,
} from "@/modules/compras/recebimentos/queries";
import { RecebimentoDetalheDrawer } from "./recebimento-detalhe";
import { RecebimentoFormDrawer } from "./recebimento-form-drawer";

const colunas: ColumnDef<RecebimentoLista, unknown>[] = [
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
    id: "ordemCompra",
    header: "OC",
    cell: ({ row }) =>
      row.original.ordemCompraNumero ? (
        <span className="codigo-doc">{row.original.ordemCompraNumero}</span>
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
    accessorKey: "numeroNf",
    header: "NF",
    cell: ({ row }) =>
      row.original.numeroNf ? (
        <span className="codigo-doc">{row.original.numeroNf}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "valorNf",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorNf} />,
  },
  {
    accessorKey: "dataRecebimento",
    header: "Recebido em",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataRecebimento)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = infoStatusRecebimento(row.original.status);
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
];

export interface RecebimentosTabelaProps {
  recebimentos: RecebimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  busca: string;
  ordens: OrdemReceptivel[];
  podeCriar: boolean;
}

/**
 * Listagem de recebimentos com paginação server-side e busca (número, NF, OC
 * ou fornecedor) persistida na URL. O botão registra um novo (escolhendo a OC
 * receptível); clicar numa linha abre o detalhe com itens, NF e trilha.
 */
export function RecebimentosTabela({
  recebimentos,
  total,
  pagina,
  tamanho,
  busca: buscaUrl,
  ordens,
  podeCriar,
}: RecebimentosTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaUrl);
  const [formAberto, setFormAberto] = React.useState(false);
  // Muda a cada abertura: remonta o form com estado limpo, sem reset em efeito.
  const [chaveForm, setChaveForm] = React.useState(0);
  const [detalheId, setDetalheId] = React.useState<string | null>(null);

  function abrirForm() {
    setChaveForm((valor) => valor + 1);
    setFormAberto(true);
  }

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
          placeholder="Buscar por NF, OC ou fornecedor"
        />
        {podeCriar ? (
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              onClick={abrirForm}
              disabled={ordens.length === 0}
            >
              <Plus aria-hidden="true" />
              Registrar recebimento
            </Button>
          </div>
        ) : null}
      </FilterBar>

      {podeCriar && ordens.length === 0 ? (
        <p className="text-detalhe text-muted-foreground">
          Nenhuma ordem de compra aprovada esperando recebimento no momento.
        </p>
      ) : null}

      <DataTable
        columns={colunas}
        data={recebimentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        onRowClick={(recebimento) => setDetalheId(recebimento.id)}
        emptyState={
          <EmptyState
            icone={PackageCheck}
            titulo="Nenhum recebimento registrado"
            descricao="Registre o recebimento de uma ordem de compra aprovada"
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar ? (
        <RecebimentoFormDrawer
          key={chaveForm}
          aberto={formAberto}
          onAbertoChange={setFormAberto}
          ordens={ordens}
          onRegistrado={(recebimentoId) => {
            setFormAberto(false);
            setDetalheId(recebimentoId);
          }}
        />
      ) : null}

      <RecebimentoDetalheDrawer
        key={detalheId ?? "fechado"}
        recebimentoId={detalheId}
        aberto={detalheId !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setDetalheId(null);
        }}
        podeEditar={podeCriar}
      />
    </div>
  );
}
