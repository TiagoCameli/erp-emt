"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BellRing, MoreHorizontal, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarQuantidade } from "@/lib/formatadores";
import { ROTULO_TIPO_DEPOSITO } from "@/modules/cadastros/depositos/schemas";
import type { MinimoLista } from "@/modules/estoque/alertas/queries";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";
import { MinimoFormDrawer } from "./minimo-form-drawer";

export interface AlertasTabelaProps {
  minimos: MinimoLista[];
  podeEditar: boolean;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

const OPCOES_STATUS = [
  { valor: "abaixo", rotulo: "Abaixo do mínimo" },
];

/**
 * Listagem dos estoques mínimos definidos, cruzados com o saldo atual. Filtro
 * por situação (todos ou só os abaixo do mínimo) e edição do valor no drawer.
 */
export function AlertasTabela({
  minimos,
  podeEditar,
  insumos,
  depositos,
}: AlertasTabelaProps) {
  const [status, setStatus] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<MinimoLista | null>(null);

  function abrirEdicao(minimo: MinimoLista) {
    setEmEdicao(minimo);
    setDrawerAberto(true);
  }

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  const dados = React.useMemo(() => {
    if (status === "abaixo") return minimos.filter((m) => m.abaixo);
    return minimos;
  }, [minimos, status]);

  const colunas = React.useMemo<ColumnDef<MinimoLista, unknown>[]>(() => {
    const base: ColumnDef<MinimoLista, unknown>[] = [
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        cell: ({ row }) => (
          <div className="flex flex-col">
            {row.original.insumoCodigo ? (
              <span className="text-legenda text-muted-foreground">
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
          <div className="flex flex-col">
            <span>{row.original.depositoNome}</span>
            <span className="text-legenda text-muted-foreground">
              {ROTULO_TIPO_DEPOSITO[row.original.depositoTipo]}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "minimo",
        header: "Mínimo",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.minimo)}
            {row.original.unidadeSigla ? ` ${row.original.unidadeSigla}` : ""}
          </span>
        ),
      },
      {
        accessorKey: "saldoAtual",
        header: "Saldo atual",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.saldoAtual)}
            {row.original.unidadeSigla ? ` ${row.original.unidadeSigla}` : ""}
          </span>
        ),
      },
      {
        accessorKey: "abaixo",
        header: "Situação",
        cell: ({ row }) =>
          row.original.abaixo ? (
            <StatusBadge status="rejeitado" rotulo="Abaixo do mínimo" />
          ) : (
            <StatusBadge status="aprovado" rotulo="OK" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const minimo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${minimo.insumoNome} em ${minimo.depositoNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(minimo)}>
                Editar mínimo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <FilterBar>
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Situação"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={BellRing}
            titulo="Nenhum mínimo definido"
            descricao="Defina o estoque mínimo de um insumo por depósito para receber alertas."
            acao={
              podeEditar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Definir mínimo
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar ? (
        <MinimoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          minimo={emEdicao}
          insumos={insumos}
          depositos={depositos}
        />
      ) : null}
    </>
  );
}
