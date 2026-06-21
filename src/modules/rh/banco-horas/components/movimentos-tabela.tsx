"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock, MoreHorizontal, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
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
import { formatarData, formatarQuantidade } from "@/lib/formatadores";
import type { MovimentoLista } from "@/modules/rh/banco-horas/queries";
import {
  ROTULO_TIPO_MOVIMENTO,
  TIPOS_MOVIMENTO,
} from "@/modules/rh/banco-horas/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { MovimentoFormDrawer } from "./movimento-form-drawer";

export interface MovimentosTabelaProps {
  movimentos: MovimentoLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem de movimentos do banco de horas: busca por colaborador, filtro por
 * tipo, criação e edição no drawer. Não há exclusão neste recurso.
 */
export function MovimentosTabela({
  movimentos,
  colaboradores,
  podeCriar,
  podeEditar,
}: MovimentosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<MovimentoLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(movimento: MovimentoLista) {
    setEmEdicao(movimento);
    setDrawerAberto(true);
  }

  const opcoesTipo = React.useMemo(
    () =>
      TIPOS_MOVIMENTO.map((t) => ({
        valor: t,
        rotulo: ROTULO_TIPO_MOVIMENTO[t],
      })),
    [],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return movimentos.filter((item) => {
      if (tipo && item.tipo !== tipo) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [movimentos, busca, tipo]);

  const colunas = React.useMemo<ColumnDef<MovimentoLista, unknown>[]>(() => {
    const base: ColumnDef<MovimentoLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) =>
          row.original.tipo === "credito" ? (
            <StatusBadge status="aprovado" rotulo="Crédito" />
          ) : (
            <StatusBadge status="pendente_aprovacao" rotulo="Débito" />
          ),
      },
      {
        accessorKey: "horas",
        header: "Horas",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.horas)} h
          </span>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        cell: ({ row }) =>
          row.original.motivo ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const movimento = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações do movimento de ${movimento.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(movimento)}>
                Editar
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
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por colaborador"
        />
        <FiltroSelect
          valor={tipo}
          onValorChange={setTipo}
          opcoes={opcoesTipo}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={Clock}
            titulo="Nenhum movimento encontrado"
            descricao="Registre créditos e débitos de horas por colaborador. O saldo é calculado no painel acima."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo movimento
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <MovimentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          movimento={emEdicao}
        />
      ) : null}
    </>
  );
}
