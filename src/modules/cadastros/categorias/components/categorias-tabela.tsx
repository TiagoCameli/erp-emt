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
import { cn } from "@/lib/utils";
import { CLASSE_COR_GRUPO } from "@/modules/cadastros/_shared/insumo-grupos";
import { alternarAtivo, excluir } from "@/modules/cadastros/categorias/actions";
import type {
  CategoriaLista,
  GrupoComCategorias,
  GrupoOpcao,
} from "@/modules/cadastros/categorias/queries";
import { CategoriasFormDrawer } from "./categorias-form-drawer";

export interface CategoriasTabelaProps {
  grupos: GrupoComCategorias[];
  opcoesGrupo: GrupoOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

/**
 * Categorias de insumo em 2 níveis: uma seção por grupo fixo, com as
 * subcategorias dentro. Grupo não tem CRUD (é semeado no banco); o que se cria,
 * edita e desativa é a subcategoria, sempre dentro de um grupo.
 *
 * A contagem de insumos por subcategoria fica visível porque é ela que diz se a
 * exclusão vai passar: subcategoria com insumo vinculado é recusada pelo banco.
 */
export function CategoriasTabela({
  grupos,
  opcoesGrupo,
  podeCriar,
  podeEditar,
  podeExcluir,
}: CategoriasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<CategoriaLista | null>(null);
  const [grupoNovo, setGrupoNovo] = React.useState<string | null>(null);
  const [aExcluir, setAExcluir] = React.useState<CategoriaLista | null>(null);

  function abrirNova(grupoId: string) {
    setEmEdicao(null);
    setGrupoNovo(grupoId);
    setDrawerAberto(true);
  }

  function abrirEdicao(categoria: CategoriaLista) {
    setEmEdicao(categoria);
    setGrupoNovo(null);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(categoria: CategoriaLista) {
    const resultado = await alternarAtivo(categoria.id, !categoria.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      categoria.ativo ? "Subcategoria desativada" : "Subcategoria ativada",
    );
  }

  async function aoExcluir(categoria: CategoriaLista, motivo: string) {
    const resultado = await excluir(categoria.id, motivo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Subcategoria movida para a lixeira");
  }

  const termo = busca.trim().toLowerCase();

  const filtrados = React.useMemo(
    () =>
      grupos.map((grupo) => ({
        ...grupo,
        categorias: grupo.categorias.filter((categoria) => {
          if (status === "ativos" && !categoria.ativo) return false;
          if (status === "inativos" && categoria.ativo) return false;
          if (termo && !categoria.nome.toLowerCase().includes(termo)) {
            return false;
          }
          return true;
        }),
      })),
    [grupos, status, termo],
  );

  const colunas = React.useMemo<ColumnDef<CategoriaLista, unknown>[]>(() => {
    const base: ColumnDef<CategoriaLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Subcategoria",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "insumos",
        header: "Insumos",
        size: 110,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.insumos}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativa" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativa" />
          ),
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
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
                  <DropdownMenuItem
                    onSelect={() => void aoAlternarAtivo(categoria)}
                  >
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
          placeholder="Buscar subcategoria"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todas"
        />
      </FilterBar>

      <div className="flex flex-col gap-6">
        {filtrados.map((grupo) => (
          <section key={grupo.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-legenda font-medium",
                    CLASSE_COR_GRUPO[grupo.cor],
                  )}
                >
                  {grupo.nome}
                </span>
                <span className="text-legenda text-muted-foreground">
                  {grupo.categorias.length} subcategoria
                  {grupo.categorias.length === 1 ? "" : "s"} · {grupo.insumos}{" "}
                  insumo{grupo.insumos === 1 ? "" : "s"}
                </span>
              </div>
              {podeCriar ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => abrirNova(grupo.id)}
                >
                  <Plus />
                  Nova subcategoria
                </Button>
              ) : null}
            </div>

            {/* Um idTabela só para as tabelas de todos os grupos: as colunas
                são as mesmas, e quem arruma a largura numa espera ver igual
                nas outras. */}
            <DataTable
              idTabela="cadastros.categorias"
              columns={colunas}
              data={grupo.categorias}
              emptyState={
                <EmptyState
                  icone={Tags}
                  titulo="Nenhuma subcategoria neste grupo"
                  descricao="Ajuste os filtros ou cadastre uma subcategoria."
                  className="border-none bg-transparent"
                />
              }
            />
          </section>
        ))}
      </div>

      {podeCriar || podeEditar ? (
        <CategoriasFormDrawer
          key={emEdicao?.id ?? grupoNovo ?? "nova"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          categoria={emEdicao}
          grupoPadrao={grupoNovo}
          grupos={opcoesGrupo}
        />
      ) : null}

      <ConfirmDialog
        aberto={aExcluir !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setAExcluir(null);
        }}
        titulo="Excluir subcategoria"
        descricao={
          aExcluir && aExcluir.insumos > 0
            ? `Esta subcategoria tem ${aExcluir.insumos} insumo(s) vinculado(s) e o banco vai recusar a exclusão. Mova os insumos para outra subcategoria antes: lista de insumos, seleção múltipla, "Alterar categoria".`
            : "A subcategoria vai para a lixeira e pode ser restaurada. Informe o motivo."
        }
        textoConfirmar="Excluir"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={async (motivo) => {
          if (aExcluir) await aoExcluir(aExcluir, motivo ?? "");
          setAExcluir(null);
        }}
      />
    </>
  );
}
