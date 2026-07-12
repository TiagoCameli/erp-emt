"use client";

import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Boxes } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { ROTULO_TIPO_DEPOSITO } from "@/modules/cadastros/depositos/schemas";
import type { SaldoLista } from "@/modules/estoque/_shared/queries";

export interface PosicaoTabelaProps {
  saldos: SaldoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  busca: string;
  depositoId: string;
  depositos: { id: string; nome: string }[];
}

const COLUNAS: ColumnDef<SaldoLista, unknown>[] = [
  {
    accessorKey: "insumoNome",
    header: "Insumo",
    cell: ({ row }) => (
      <div className="min-w-0">
        {row.original.insumoCodigo ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.insumoCodigo}
          </span>
        ) : null}
        <span className="font-medium">{row.original.insumoNome}</span>
      </div>
    ),
  },
  {
    accessorKey: "depositoNome",
    header: "Depósito",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span>{row.original.depositoNome}</span>
        <span className="ml-1.5 text-legenda text-muted-foreground">
          {ROTULO_TIPO_DEPOSITO[row.original.depositoTipo]}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "quantidade",
    header: "Quantidade",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.quantidade)} {row.original.unidadeSigla}
      </span>
    ),
  },
  {
    accessorKey: "valorTotal",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorTotal} />,
  },
];

/**
 * Posição de estoque (somente leitura): busca por insumo (nome ou código) e
 * filtro por depósito resolvidos no servidor e persistidos na URL, com
 * paginação server-side.
 */
export function PosicaoTabela({
  saldos,
  total,
  pagina,
  tamanho,
  busca: buscaInicial,
  depositoId,
  depositos,
}: PosicaoTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaInicial);

  const opcoesDeposito = depositos.map((deposito) => ({
    valor: deposito.id,
    rotulo: deposito.nome,
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
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por insumo ou código"
        />
        <FiltroSelect
          valor={depositoId}
          onValorChange={(valor) =>
            setMuitos({ deposito: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesDeposito}
          placeholder="Depósito"
          todosRotulo="Todos os depósitos"
        />
      </FilterBar>

      <DataTable
        columns={COLUNAS}
        data={saldos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        emptyState={
          <EmptyState
            icone={Boxes}
            titulo="Sem saldo em estoque"
            descricao="Quando houver entradas, o saldo de cada insumo aparece aqui."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
