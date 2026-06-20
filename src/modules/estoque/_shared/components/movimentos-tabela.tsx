"use client";

import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  MoneyText,
  StatusBadge,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import { TIPO_MOVIMENTO } from "@/modules/estoque/_shared/formato";
import type {
  DepositoOpcao,
  InsumoOpcao,
  MovimentoLista,
} from "@/modules/estoque/_shared/queries";

type ColunaMovimento = ColumnDef<MovimentoLista, unknown>;

/** Data do movimento, alinhada por tabular-nums. */
export const colunaData: ColunaMovimento = {
  accessorKey: "dataMovimento",
  header: "Data",
  cell: ({ row }) => (
    <span className="tabular-nums">
      {formatarData(row.original.dataMovimento)}
    </span>
  ),
};

/** Tipo do movimento como badge (entrada, saída, ajuste etc). */
export const colunaTipo: ColunaMovimento = {
  accessorKey: "tipo",
  header: "Tipo",
  cell: ({ row }) => {
    const info = TIPO_MOVIMENTO[row.original.tipo];
    return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
  },
};

/** Insumo com o código em mono quando existe. */
export const colunaInsumo: ColunaMovimento = {
  accessorKey: "insumoNome",
  header: "Insumo",
  cell: ({ row }) => (
    <div className="min-w-0">
      <span className="font-medium">{row.original.insumoNome}</span>
      {row.original.insumoCodigo ? (
        <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
          {row.original.insumoCodigo}
        </span>
      ) : null}
    </div>
  ),
};

/** Depósito de origem. */
export const colunaDeposito: ColunaMovimento = {
  accessorKey: "depositoNome",
  header: "Depósito",
  cell: ({ row }) => row.original.depositoNome,
};

/** Depósito de destino (transferências). */
export const colunaDestino: ColunaMovimento = {
  accessorKey: "depositoDestinoNome",
  header: "Destino",
  cell: ({ row }) =>
    row.original.depositoDestinoNome ?? (
      <span className="text-muted-foreground">-</span>
    ),
};

/** Quantidade com a sigla da unidade. */
export const colunaQuantidade: ColunaMovimento = {
  accessorKey: "quantidade",
  header: "Quantidade",
  meta: { alinharDireita: true },
  cell: ({ row }) => (
    <span className="tabular-nums">
      {formatarQuantidade(row.original.quantidade)} {row.original.unidadeSigla}
    </span>
  ),
};

/** Custo unitário em BRL. */
export const colunaCustoUnitario: ColunaMovimento = {
  accessorKey: "custoUnitario",
  header: "Custo unit.",
  meta: { alinharDireita: true },
  cell: ({ row }) =>
    row.original.custoUnitario === null ? (
      <span className="text-muted-foreground">-</span>
    ) : (
      <MoneyText valor={row.original.custoUnitario} />
    ),
};

/** Custo total em BRL. */
export const colunaCustoTotal: ColunaMovimento = {
  accessorKey: "custoTotal",
  header: "Custo total",
  meta: { alinharDireita: true },
  cell: ({ row }) =>
    row.original.custoTotal === null ? (
      <span className="text-muted-foreground">-</span>
    ) : (
      <MoneyText valor={row.original.custoTotal} />
    ),
};

/** Centro de custo do consumo, com o código quando existe. */
export const colunaCentroCusto: ColunaMovimento = {
  accessorKey: "centroCustoNome",
  header: "Centro de custo",
  cell: ({ row }) =>
    row.original.centroCustoNome ? (
      <div className="min-w-0">
        {row.original.centroCustoCodigo ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.centroCustoCodigo}
          </span>
        ) : null}
        <span>{row.original.centroCustoNome}</span>
      </div>
    ) : (
      <span className="text-muted-foreground">-</span>
    ),
};

/** Observação livre do movimento (motivo do ajuste, nota etc). */
export const colunaObservacao: ColunaMovimento = {
  accessorKey: "observacao",
  header: "Observação",
  cell: ({ row }) =>
    row.original.observacao ? (
      <span className="text-muted-foreground">{row.original.observacao}</span>
    ) : (
      <span className="text-muted-foreground">-</span>
    ),
};

export interface MovimentosTabelaProps {
  movimentos: MovimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  insumoId: string;
  depositoId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  colunas: ColunaMovimento[];
  vazio: { icone: LucideIcon; titulo: string; descricao: string };
  /** Esconde o filtro de depósito (ex.: aba de tanques). */
  semFiltroDeposito?: boolean;
}

/**
 * Casca compartilhada das listagens de movimento: filtros de insumo e depósito
 * persistidos na URL, paginação server-side e empty state. Cada aba só passa
 * as colunas que quer (compostas com os helpers `coluna*` deste arquivo).
 */
export function MovimentosTabela({
  movimentos,
  total,
  pagina,
  tamanho,
  insumoId,
  depositoId,
  insumos,
  depositos,
  colunas,
  vazio,
  semFiltroDeposito,
}: MovimentosTabelaProps) {
  const { setMuitos } = useFiltrosUrl();

  const opcoesInsumo = insumos.map((insumo) => ({
    valor: insumo.id,
    rotulo: insumo.codigo ? `${insumo.codigo} - ${insumo.nome}` : insumo.nome,
  }));

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
        <FiltroSelect
          valor={insumoId}
          onValorChange={(valor) =>
            setMuitos({ insumo: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesInsumo}
          placeholder="Insumo"
          todosRotulo="Todos os insumos"
        />
        {semFiltroDeposito ? null : (
          <FiltroSelect
            valor={depositoId}
            onValorChange={(valor) =>
              setMuitos({ deposito: valor === "" ? null : valor, pagina: "1" })
            }
            opcoes={opcoesDeposito}
            placeholder="Depósito"
            todosRotulo="Todos os depósitos"
          />
        )}
      </FilterBar>

      <DataTable
        columns={colunas}
        data={movimentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        emptyState={
          <EmptyState
            icone={vazio.icone}
            titulo={vazio.titulo}
            descricao={vazio.descricao}
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
