"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  alternarAtivo,
  excluir,
} from "@/modules/cadastros/categorias/actions";
import type { CategoriaLista } from "@/modules/cadastros/categorias/queries";
import { ROTULO_TIPO_CATEGORIA } from "@/modules/cadastros/categorias/schemas";
import { CategoriasFormDrawer } from "./categorias-form-drawer";

export interface CategoriasTabelaProps {
  categorias: CategoriaLista[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/**
 * Listagem de categorias de insumo: busca por nome, filtro de status,
 * criação e edição no drawer, ativar/desativar e exclusão para a lixeira.
 */
export function CategoriasTabela({
  categorias,
  podeCriar,
  podeEditar,
  podeExcluir,
}: CategoriasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<CategoriaLista | null>(null);

  const [aExcluir, setAExcluir] = React.useState<CategoriaLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(categoria: CategoriaLista) {
    setEmEdicao(categoria);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(categoria: CategoriaLista) {
    const resultado = await alternarAtivo(categoria.id, !categoria.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(categoria.ativo ? "Categoria desativada" : "Categoria ativada");
  }

  async function aoExcluir(motivo?: string) {
    if (!aExcluir) return;
    const resultado = await excluir(aExcluir.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Categoria movida para a lixeira");
    setAExcluir(null);
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return categorias.filter((categoria) => {
      if (status === "ativos" && !categoria.ativo) return false;
      if (status === "inativos" && categoria.ativo) return false;
      if (termo && !categoria.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [categorias, busca, status]);

  const colunas = React.useMemo<ColumnDef<CategoriaLista, unknown>[]>(() => {
    const base: ColumnDef<CategoriaLista, unknown>[] = [
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
        cell: ({ row }) => ROTULO_TIPO_CATEGORIA[row.original.tipo],
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

    if (!podeEditar && !podeExcluir) return base;

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
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => abrirEdicao(categoria)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => aoAlternarAtivo(categoria)}>
                    {categoria.ativo ? "Desativar" : "Ativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeEditar && podeExcluir ? <DropdownMenuSeparator /> : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setAExcluir(categoria)}
                >
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
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
            icone={Tags}
            titulo="Nenhuma categoria encontrada"
            descricao="Cadastre categorias para agrupar os insumos por natureza."
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
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={aExcluir !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAExcluir(null);
          }}
          titulo="Excluir categoria"
          descricao={
            aExcluir
              ? `A categoria ${aExcluir.nome} vai para a lixeira. Informe o motivo.`
              : ""
          }
          textoConfirmar="Excluir categoria"
          variante="destrutivo"
          exigeMotivo
          onConfirmar={aoExcluir}
        />
      ) : null}
    </>
  );
}
