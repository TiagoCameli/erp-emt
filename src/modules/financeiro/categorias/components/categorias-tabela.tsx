"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderTree, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { alternarAtivo } from "@/modules/financeiro/categorias/actions";
import type {
  CategoriaFinanceiraLista,
  CategoriaPaiOpcao,
} from "@/modules/financeiro/categorias/queries";
import {
  ROTULO_TIPO_CATEGORIA_FINANCEIRA,
  TIPOS_CATEGORIA_FINANCEIRA,
  type TipoCategoriaFinanceira,
} from "@/modules/financeiro/categorias/schemas";
import { CategoriasFormDrawer } from "./categorias-form-drawer";

export interface CategoriasTabelaProps {
  categorias: CategoriaFinanceiraLista[];
  categoriasPai: CategoriaPaiOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

const OPCOES_TIPO = TIPOS_CATEGORIA_FINANCEIRA.map((tipo) => ({
  valor: tipo,
  rotulo: ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo],
}));

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** Badge de tipo: receita em verde, despesa em âmbar. */
function badgeTipo(tipo: TipoCategoriaFinanceira) {
  return (
    <StatusBadge
      status={tipo === "receita" ? "aprovado" : "pendente_aprovacao"}
      rotulo={ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo]}
    />
  );
}

/**
 * Listagem do plano de contas gerencial: busca por nome, filtro por tipo e
 * por status, criação e edição no drawer, ativar e desativar.
 */
export function CategoriasTabela({
  categorias,
  categoriasPai,
  podeCriar,
  podeEditar,
}: CategoriasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] =
    React.useState<CategoriaFinanceiraLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(categoria: CategoriaFinanceiraLista) {
    setEmEdicao(categoria);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(categoria: CategoriaFinanceiraLista) {
    const resultado = await alternarAtivo(categoria.id, !categoria.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      categoria.ativo ? "Categoria desativada" : "Categoria ativada",
    );
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return categorias.filter((categoria) => {
      if (status === "ativos" && !categoria.ativo) return false;
      if (status === "inativos" && categoria.ativo) return false;
      if (tipo && categoria.tipo !== tipo) return false;
      if (termo && !categoria.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [categorias, busca, tipo, status]);

  const colunas = React.useMemo<
    ColumnDef<CategoriaFinanceiraLista, unknown>[]
  >(() => {
    const base: ColumnDef<CategoriaFinanceiraLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => badgeTipo(row.original.tipo),
      },
      {
        accessorKey: "paiNome",
        header: "Categoria pai",
        cell: ({ row }) =>
          row.original.paiNome ? (
            row.original.paiNome
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "usos",
        header: "Lançamentos",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.usos}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const categoria = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${categoria.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(categoria)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => aoAlternarAtivo(categoria)}>
                {categoria.ativo ? "Desativar" : "Ativar"}
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
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={tipo}
          onValorChange={setTipo}
          opcoes={OPCOES_TIPO}
          placeholder="Tipo"
          todosRotulo="Todos os tipos"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={FolderTree}
            titulo="Nenhuma categoria encontrada"
            descricao="Cadastre categorias para montar o plano de contas de receitas e despesas."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNova}>
                  <Plus />
                  Nova categoria
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <CategoriasFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          categoria={emEdicao}
          categoriasPai={categoriasPai}
        />
      ) : null}
    </>
  );
}
