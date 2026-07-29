"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { MoreHorizontal, Package, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  PageHeader,
  StatusBadge,
  useBuscaUrl,
  useFiltrosUrl,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import {
  CLASSE_COR_GRUPO,
  SUBCATEGORIA_A_CLASSIFICAR,
} from "@/modules/cadastros/_shared/insumo-grupos";
import type { GrupoOpcao } from "@/modules/cadastros/categorias/queries";
import {
  alternarAtivo,
  excluir,
  importar,
  reclassificarEmLote,
  validarImport,
} from "@/modules/cadastros/insumos/actions";
import type {
  CategoriaOpcao,
  InsumoLista,
  UnidadeOpcao,
} from "@/modules/cadastros/insumos/queries";
import { InsumosFormDrawer } from "./insumos-form-drawer";
import { ReclassificarDialog } from "./reclassificar-dialog";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface InsumosTabelaProps {
  insumos: InsumoLista[];
  total: number;
  pagina: number;
  tamanho: number;
  busca: string;
  status: string;
  /** Filtro por grupo (id) vindo da URL. */
  grupo: string;
  /** Filtro por subcategoria (id) vindo da URL. */
  categoria: string;
  categorias: CategoriaOpcao[];
  grupos: GrupoOpcao[];
  unidades: UnidadeOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Tela de insumos: cabeçalho com importar e novo, filtros de busca e status
 * persistidos na URL (resolvidos no servidor), tabela com paginação
 * server-side e ações de linha (editar, ativar/desativar, excluir) e o
 * drawer de criação e edição.
 */
export function InsumosTabela({
  insumos,
  total,
  pagina,
  tamanho,
  busca: buscaInicial,
  status,
  grupo,
  categoria,
  categorias,
  grupos,
  unidades,
  podeCriar,
  podeEditar,
  podeExcluir,
}: InsumosTabelaProps) {
  const { setMuitos } = useFiltrosUrl();
  const { busca, setBusca } = useBuscaUrl(buscaInicial);

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<InsumoLista | null>(null);

  const [excluindo, setExcluindo] = React.useState<InsumoLista | null>(null);

  // Seleção múltipla para a reclassificação em lote. Vive por página: trocar de
  // página ou de filtro zera, senão o usuário aplicaria a ação em linha que não
  // está mais vendo.
  const [selecionados, setSelecionados] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [reclassificando, setReclassificando] = React.useState(false);

  // Atalho para a fila de trabalho: a subcategoria "A classificar" do grupo
  // Material é a maior (o resto da importação caiu ali).
  const aClassificar =
    categorias.find(
      (c) =>
        c.nome === SUBCATEGORIA_A_CLASSIFICAR &&
        c.grupoNome.toLowerCase() === "material",
    ) ?? categorias.find((c) => c.nome === SUBCATEGORIA_A_CLASSIFICAR);

  const chaveDaPagina = `${pagina}|${status}|${grupo}|${categoria}|${buscaInicial}`;
  const [chaveAnterior, setChaveAnterior] = React.useState(chaveDaPagina);
  if (chaveDaPagina !== chaveAnterior) {
    setChaveAnterior(chaveDaPagina);
    if (selecionados.size > 0) setSelecionados(new Set());
  }

  const todosSelecionados =
    insumos.length > 0 && insumos.every((i) => selecionados.has(i.id));

  const alternarTodos = React.useCallback(() => {
    setSelecionados(
      todosSelecionados ? new Set() : new Set(insumos.map((i) => i.id)),
    );
  }, [insumos, todosSelecionados]);

  function alternarUm(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function aoReclassificar(categoriaId: string) {
    const resultado = await reclassificarEmLote([...selecionados], categoriaId);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(
      resultado.alterados === 1
        ? "1 insumo reclassificado"
        : `${resultado.alterados} insumos reclassificados`,
    );
    setSelecionados(new Set());
    setReclassificando(false);
  }

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(insumo: InsumoLista) {
    setEmEdicao(insumo);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(insumo: InsumoLista) {
    const resultado = await alternarAtivo(insumo.id, !insumo.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(insumo.ativo ? "Insumo desativado" : "Insumo reativado");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Insumo movido para a lixeira");
    setExcluindo(null);
  }

  function aoMudarPaginacao(paginacao: PaginationState) {
    setMuitos({
      pagina: String(paginacao.pageIndex + 1),
      tamanho: String(paginacao.pageSize),
    });
  }

  const colunas: ColumnDef<InsumoLista, unknown>[] = React.useMemo(() => {
    const base: ColumnDef<InsumoLista, unknown>[] = [];

    if (podeEditar) {
      base.push({
        id: "selecao",
        size: 44,
        enableSorting: false,
        meta: { fixa: true, rotulo: "Seleção" },
        header: () => (
          <Checkbox
            checked={todosSelecionados}
            onCheckedChange={alternarTodos}
            aria-label="Selecionar todos os insumos desta página"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selecionados.has(row.original.id)}
            onCheckedChange={() => alternarUm(row.original.id)}
            aria-label={`Selecionar ${row.original.nome}`}
          />
        ),
      });
    }

    base.push(
      {
        accessorKey: "codigo",
        header: "Código",
        cell: ({ row }) =>
          row.original.codigo ? (
            <span className="codigo-doc">{row.original.codigo}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "grupoNome",
        header: "Grupo",
        size: 150,
        meta: { naoTruncar: true },
        cell: ({ row }) =>
          row.original.grupoNome ? (
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-legenda font-medium",
                CLASSE_COR_GRUPO[row.original.grupoCor],
              )}
            >
              {row.original.grupoNome}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "categoriaNome",
        header: "Subcategoria",
        size: 200,
        cell: ({ row }) =>
          row.original.categoriaNome ? (
            <span
              className={
                row.original.categoriaNome === SUBCATEGORIA_A_CLASSIFICAR
                  ? "text-status-pendente"
                  : undefined
              }
            >
              {row.original.categoriaNome}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "unidadeSigla",
        header: "Unidade",
        cell: ({ row }) =>
          row.original.unidadeSigla ?? (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    );

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const insumo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${insumo.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => abrirEdicao(insumo)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => aoAlternarAtivo(insumo)}>
                    {insumo.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setExcluindo(insumo)}
                  >
                    Excluir
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [alternarTodos, podeEditar, podeExcluir, selecionados, todosSelecionados]);

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descricao="Materiais, peças, óleos, combustíveis, betuminosos e serviços"
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar insumos"
                modeloHref="/cadastros/insumos/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
              <Button type="button" size="sm" onClick={abrirNovo}>
                <Plus />
                Novo insumo
              </Button>
            </>
          ) : undefined
        }
      />

      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome ou código"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) =>
            setMuitos({ status: valor === "" ? "todos" : valor, pagina: "1" })
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
        <FiltroSelect
          valor={grupo}
          onValorChange={(valor) =>
            setMuitos({
              grupo: valor === "" ? null : valor,
              // Trocar o grupo derruba a subcategoria: ela pertence ao anterior.
              categoria: null,
              pagina: "1",
            })
          }
          opcoes={grupos.map((g) => ({ valor: g.id, rotulo: g.nome }))}
          placeholder="Grupo"
          todosRotulo="Todos os grupos"
        />
        <FiltroSelect
          valor={categoria}
          onValorChange={(valor) =>
            setMuitos({
              categoria: valor === "" ? null : valor,
              pagina: "1",
            })
          }
          opcoes={categorias
            .filter((c) => grupo === "" || c.grupoId === grupo)
            .map((c) => ({ valor: c.id, rotulo: c.nome }))}
          placeholder="Subcategoria"
          todosRotulo="Todas as subcategorias"
          className="max-w-60"
        />
        {aClassificar ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setMuitos({
                grupo: null,
                categoria: aClassificar.id,
                status: "todos",
                pagina: "1",
              })
            }
          >
            <Tags />
            Ver &quot;A classificar&quot;
          </Button>
        ) : null}
      </FilterBar>

      {selecionados.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-detalhe">
            {selecionados.size === 1
              ? "1 insumo selecionado"
              : `${selecionados.size} insumos selecionados`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelecionados(new Set())}
            >
              Limpar seleção
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setReclassificando(true)}
            >
              <Tags />
              Alterar categoria
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={colunas}
        data={insumos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        emptyState={
          <EmptyState
            icone={Package}
            titulo="Nenhum insumo encontrado"
            descricao={
              podeCriar
                ? "Cadastre o primeiro insumo ou importe uma planilha"
                : "Nenhum insumo para mostrar com os filtros atuais"
            }
            className="border-none bg-transparent"
          />
        }
      />

      <InsumosFormDrawer
        key={emEdicao?.id ?? "novo"}
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        insumo={emEdicao}
        categorias={categorias}
        grupos={grupos}
        unidades={unidades}
      />

      <ReclassificarDialog
        aberto={reclassificando}
        onAbertoChange={setReclassificando}
        quantidade={selecionados.size}
        categorias={categorias}
        grupos={grupos}
        onConfirmar={aoReclassificar}
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir insumo"
        descricao={`O insumo ${excluindo?.nome ?? ""} vai para a lixeira. Informe o motivo da exclusão.`}
        textoConfirmar="Excluir insumo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
