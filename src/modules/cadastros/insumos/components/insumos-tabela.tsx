"use client";

import * as React from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { MoreHorizontal, Package, Plus, Tags } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
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
  CategoriaDeCustoOpcao,
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
  /** Filtro por unidade de medida (id) vindo da URL. */
  unidade: string;
  categorias: CategoriaOpcao[];
  grupos: GrupoOpcao[];
  unidades: UnidadeOpcao[];
  categoriasDeCusto: CategoriaDeCustoOpcao[];
  padroesDeCusto: Record<string, string>;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Tela de insumos: cabeçalho com importar e novo, filtros persistidos na URL e
 * resolvidos NO SERVIDOR (busca, status, grupo, subcategoria e unidade), tabela
 * com paginação server-side e ações de linha (editar, ativar/desativar,
 * excluir) e o drawer de criação e edição.
 *
 * Filtrar no servidor não é detalhe: a listagem é paginada, e filtrar só a
 * página carregada mostraria 3 resultados de um universo de milhares.
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
  unidade,
  categorias,
  grupos,
  unidades,
  categoriasDeCusto,
  padroesDeCusto,
  podeCriar,
  podeEditar,
  podeExcluir,
}: InsumosTabelaProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();
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

  const chaveDaPagina = `${pagina}|${status}|${grupo}|${categoria}|${unidade}|${buscaInicial}`;
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
        size: 130,
        cell: ({ row }) =>
          row.original.codigo ? (
            <span className="codigo-doc">{row.original.codigo}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        // A tabela é table-fixed e a sobra de largura é repartida na PROPORÇÃO
        // das larguras declaradas, então o que decide o tamanho na tela é a
        // relação entre as colunas, não o número absoluto. Nome é a única forma
        // de identificar a peça entre 2.349 insumos ("295/80R22.5 LISO RODA
        // GL2..." não diz nada cortado), então leva a maior fatia; coluna sem
        // `size` cairia no padrão de 150 do TanStack e disputaria de igual.
        accessorKey: "nome",
        header: "Nome",
        size: 420,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "grupoNome",
        header: "Grupo",
        size: 130,
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
        size: 100,
        // Secundária: só importa na hora de comprar, não na hora de achar.
        meta: { ocultaPorPadrao: true },
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
      // Cabe só o botão "⋮". Sem `size` ela nasceria com os mesmos 150 das
      // outras e viraria o vazio à direita da tabela.
      size: 60,
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
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
        modulo="Cadastros"
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
        onLimparFiltros={limparTodos}
        idTabela="cadastros.insumos"
        columns={colunas}
        data={insumos}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={aoMudarPaginacao}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome ou código",
            fixo: true,
            // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
            // deixa o texto da busca filtrando a lista.
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome ou código"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativos",
            onLimpar: () => setMuitos({ status: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) =>
                  setMuitos({
                    status: valor === "" ? "todos" : valor,
                    pagina: "1",
                  })
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
          {
            id: "grupo",
            rotulo: "Grupo",
            temValor: grupo !== "",
            // Soltar o grupo solta a subcategoria também: ela pertence ao grupo.
            onLimpar: () =>
              setMuitos({ grupo: null, categoria: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={grupo}
                onValorChange={(valor) =>
                  setMuitos({
                    grupo: valor === "" ? null : valor,
                    // Trocar o grupo derruba a subcategoria: ela é do anterior.
                    categoria: null,
                    pagina: "1",
                  })
                }
                opcoes={grupos.map((g) => ({ valor: g.id, rotulo: g.nome }))}
                placeholder="Grupo"
                todosRotulo="Todos os grupos"
              />
            ),
          },
          {
            id: "categoria",
            rotulo: "Subcategoria",
            temValor: categoria !== "",
            onLimpar: () => setMuitos({ categoria: null, pagina: "1" }),
            elemento: (
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
            ),
          },
          {
            id: "unidade",
            rotulo: "Unidade de medida",
            ocultoPorPadrao: true,
            temValor: unidade !== "",
            onLimpar: () => setMuitos({ unidade: null, pagina: "1" }),
            elemento: (
              <FiltroSelect
                valor={unidade}
                onValorChange={(valor) =>
                  setMuitos({
                    unidade: valor === "" ? null : valor,
                    pagina: "1",
                  })
                }
                opcoes={unidades.map((u) => ({
                  valor: u.id,
                  rotulo: `${u.sigla} - ${u.nome}`,
                }))}
                placeholder="Unidade"
                todosRotulo="Todas as unidades"
                className="max-w-60"
              />
            ),
          },
        ]}
        toolbar={
          aClassificar ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setMuitos({
                  grupo: null,
                  categoria: aClassificar.id,
                  // Limpa a unidade também: é um atalho para a fila de trabalho
                  // inteira, não para um pedaço dela.
                  unidade: null,
                  status: "todos",
                  pagina: "1",
                })
              }
            >
              <Tags />
              Ver &quot;A classificar&quot;
            </Button>
          ) : undefined
        }
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
        categoriasDeCusto={categoriasDeCusto}
        padroesDeCusto={padroesDeCusto}
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
