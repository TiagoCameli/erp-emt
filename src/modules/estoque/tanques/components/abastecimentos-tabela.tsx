"use client";

import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Fuel } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  MoneyText,
  useFiltrosUrl,
} from "@/components/canonicos";
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import type {
  EquipamentoOpcao,
  TanqueOpcao,
} from "@/modules/estoque/_shared/queries";
import type { AbastecimentoLista } from "@/modules/estoque/tanques/queries";

type ColunaAbastecimento = ColumnDef<AbastecimentoLista, unknown>;

const COLUNAS: ColunaAbastecimento[] = [
  {
    accessorKey: "dataAbastecimento",
    header: "Data",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarData(row.original.dataAbastecimento)}
      </span>
    ),
  },
  {
    accessorKey: "tanqueNome",
    header: "Tanque / Insumo",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.tanqueNome}</span>
        <span className="block text-legenda text-muted-foreground">
          {row.original.insumoNome}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "equipamentoDescricao",
    header: "Equipamento",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span>{row.original.equipamentoDescricao}</span>
        {row.original.equipamentoPlaca ? (
          <span className="block text-legenda text-muted-foreground">
            {row.original.equipamentoPlaca}
          </span>
        ) : null}
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
    id: "leitura",
    header: "Leitura",
    meta: { alinharDireita: true },
    cell: ({ row }) => {
      const { horimetro, km } = row.original;
      if (horimetro !== null) {
        return (
          <span className="tabular-nums">
            {formatarQuantidade(horimetro)} h
          </span>
        );
      }
      if (km !== null) {
        return (
          <span className="tabular-nums">{formatarQuantidade(km)} km</span>
        );
      }
      return <span className="text-muted-foreground">-</span>;
    },
  },
  {
    accessorKey: "operadorNome",
    header: "Operador",
    cell: ({ row }) =>
      row.original.operadorNome ?? (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "custoTotal",
    header: "Custo",
    meta: { alinharDireita: true },
    cell: ({ row }) =>
      row.original.custoTotal === null ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <MoneyText valor={row.original.custoTotal} />
      ),
  },
];

export interface AbastecimentosTabelaProps {
  abastecimentos: AbastecimentoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  tanqueId: string;
  equipamentoId: string;
  tanques: TanqueOpcao[];
  equipamentos: EquipamentoOpcao[];
}

/**
 * Listagem dos abastecimentos: filtros de tanque e equipamento persistidos na
 * URL, paginação server-side e empty state.
 */
export function AbastecimentosTabela({
  abastecimentos,
  total,
  pagina,
  tamanho,
  tanqueId,
  equipamentoId,
  tanques,
  equipamentos,
}: AbastecimentosTabelaProps) {
  const { setMuitos } = useFiltrosUrl();

  const opcoesTanque = tanques.map((tanque) => ({
    valor: tanque.id,
    rotulo: tanque.nome,
  }));

  const opcoesEquipamento = equipamentos.map((equipamento) => ({
    valor: equipamento.id,
    rotulo: equipamento.placa
      ? `${equipamento.descricao} (${equipamento.placa})`
      : equipamento.descricao,
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
          valor={tanqueId}
          onValorChange={(valor) =>
            setMuitos({ tanque: valor === "" ? null : valor, pagina: "1" })
          }
          opcoes={opcoesTanque}
          placeholder="Tanque"
          todosRotulo="Todos os tanques"
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
        columns={COLUNAS}
        data={abastecimentos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        emptyState={
          <EmptyState
            icone={Fuel}
            titulo="Nenhum abastecimento"
            descricao="Registre o primeiro abastecimento de equipamento."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
