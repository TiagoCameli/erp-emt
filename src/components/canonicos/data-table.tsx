"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type Header,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  FileSpreadsheet,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/canonicos/combobox";
import { MenuColunas, type ColunaAlternavel } from "@/components/canonicos/menu-colunas";
import {
  chavePreferenciasTabela,
  escreverPreferenciasTabela,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  lerPreferenciasTabela,
  ordemEfetiva,
  VERSAO_PREFERENCIAS,
} from "@/components/canonicos/preferencias-tabela";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MoneyText } from "./money-text";

declare module "@tanstack/react-table" {
  // Os parâmetros precisam espelhar a declaração original do TanStack.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Alinha cabeçalho e células da coluna à direita (colunas numéricas). */
    alinharDireita?: boolean;
    /** Rótulo curto no menu "Colunas". Sem ele, usa o header quando é texto. */
    rotulo?: string;
    /** Coluna que o usuário não pode esconder (chave do registro, ações). */
    fixa?: boolean;
    /** Nasce escondida: o usuário liga no menu "Colunas" se quiser. */
    ocultaPorPadrao?: boolean;
    /** Some abaixo deste breakpoint, para não estourar scroll horizontal. */
    esconderAte?: Breakpoint;
    /** Desliga o truncamento (célula com badge, botão, conteúdo montado). */
    naoTruncar?: boolean;
  }
}

const TAMANHOS_PAGINA = [10, 25, 50, 100] as const;
const TAMANHO_PADRAO = 25;
const MAX_LINHAS_SKELETON = 10;
const ID_COLUNA_ACOES = "__acoes__";
const ALTURA_MAXIMA_PADRAO = "calc(100vh - 20rem)";

/** Breakpoints em que uma coluna secundária pode sumir. */
type Breakpoint = "sm" | "md" | "lg" | "xl";

/** Classes de breakpoint. Strings completas, senão o Tailwind não gera. */
const CLASSES_ESCONDER: Record<Breakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Total de registros no servidor. Junto com onPaginationChange ativa o modo server-side. */
  total?: number;
  /** Página atual (base 0). Obrigatório no modo server-side. */
  pageIndex?: number;
  /** Tamanho da página. Padrão 25. */
  pageSize?: number;
  /** Recebe a nova paginação. Junto com total ativa o modo server-side. */
  onPaginationChange?: (paginacao: PaginationState) => void;
  /** Ordenação controlada (use junto com onSortingChange). */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Id da coluna usada na busca local (apenas modo client-side). */
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (registro: TData) => void;
  /** Conteúdo exibido quando não há registros. */
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  /** Quando presente, exibe o botão "Exportar Excel" acima da tabela. */
  exportar?: () => void;
  /**
   * Liga a personalização da tabela pelo usuário (menu "Colunas", arrastar a
   * borda do cabeçalho para redimensionar, arrastar o cabeçalho para reordenar)
   * e a memória disso no navegador. O id identifica a tabela na memória:
   * use o recurso da tela, ex. "compras.ordens". Sem ele a tabela se comporta
   * como sempre — é o que mantém as outras listagens do app intactas.
   */
  idTabela?: string;
  /** Usuário logado, para a memória não vazar entre pessoas no mesmo navegador. */
  idUsuario?: string;
  /** Cabeçalho fixo ao rolar. A tabela ganha rolagem própria (ver alturaMaxima). */
  cabecalhoFixo?: boolean;
  /** Altura máxima da área de rolagem quando cabecalhoFixo. Padrão: sobra da viewport. */
  alturaMaxima?: string;
  /** Filtros e busca da listagem, na mesma barra dos botões da tabela. */
  toolbar?: React.ReactNode;
  /**
   * Ações secundárias da linha, num menu "..." na última coluna. Devolva
   * DropdownMenuItem (de @/components/ui/dropdown-menu). Clique no menu não
   * dispara o onRowClick.
   */
  acoesLinha?: (registro: TData) => React.ReactNode;
}

function IconeOrdenacao({ direcao }: { direcao: false | "asc" | "desc" }) {
  if (direcao === "asc") return <ArrowUp className="size-3.5 shrink-0" />;
  if (direcao === "desc") return <ArrowDown className="size-3.5 shrink-0" />;
  return <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />;
}

/** Rótulo da coluna no menu "Colunas": meta.rotulo, senão o header textual. */
function rotuloColuna(
  id: string,
  header: unknown,
  meta: { rotulo?: string } | undefined,
): string {
  if (meta?.rotulo) return meta.rotulo;
  if (typeof header === "string") return header;
  return id;
}

/** Texto do title (tooltip nativo) quando o conteúdo da célula é texto puro. */
function tituloDaCelula<TData>(celula: Cell<TData, unknown>): string | undefined {
  if (celula.column.columnDef.meta?.naoTruncar === true) return undefined;
  const valor = celula.getValue();
  if (typeof valor === "string" && valor.trim() !== "") return valor;
  if (typeof valor === "number") return String(valor);
  return undefined;
}

/**
 * Tabela canônica do ERP: densa, com ordenação, busca local opcional,
 * paginação client-side ou server-side, export Excel opcional e, quando a tela
 * passa `idTabela`, personalização pelo usuário (colunas, largura, ordem)
 * lembrada no navegador. Nenhuma listagem do app monta tabela fora daqui.
 */
export function DataTable<TData>({
  columns,
  data,
  total,
  pageIndex,
  pageSize,
  onPaginationChange,
  sorting,
  onSortingChange,
  searchKey,
  searchPlaceholder,
  onRowClick,
  emptyState,
  isLoading = false,
  exportar,
  idTabela,
  idUsuario,
  cabecalhoFixo = false,
  alturaMaxima,
  toolbar,
  acoesLinha,
}: DataTableProps<TData>) {
  const modoServidor = total !== undefined && onPaginationChange !== undefined;
  const personalizavel = idTabela !== undefined;

  const colunasComAcoes = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!acoesLinha) return columns;
    return [
      ...columns,
      {
        id: ID_COLUNA_ACOES,
        header: () => <span className="sr-only">Ações</span>,
        size: 52,
        minSize: 52,
        maxSize: 52,
        enableSorting: false,
        enableResizing: false,
        meta: { fixa: true, naoTruncar: true, alinharDireita: true },
        cell: ({ row }) => (
          <div
            className="flex justify-end"
            onClick={(evento) => evento.stopPropagation()}
            onKeyDown={(evento) => evento.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ações"
                >
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {acoesLinha(row.original)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
  }, [columns, acoesLinha]);

  const idsColunas = React.useMemo(
    () =>
      colunasComAcoes.map((coluna, indice) => {
        const comAccessor = coluna as { accessorKey?: string; id?: string };
        return comAccessor.id ?? comAccessor.accessorKey ?? String(indice);
      }),
    [colunasComAcoes],
  );

  const visibilidadePadrao = React.useMemo<VisibilityState>(() => {
    const padrao: VisibilityState = {};
    colunasComAcoes.forEach((coluna, indice) => {
      if (coluna.meta?.ocultaPorPadrao === true) {
        padrao[idsColunas[indice]] = false;
      }
    });
    return padrao;
  }, [colunasComAcoes, idsColunas]);

  const [paginacaoInterna, setPaginacaoInterna] = React.useState<PaginationState>({
    pageIndex: pageIndex ?? 0,
    pageSize: pageSize ?? TAMANHO_PADRAO,
  });
  const [ordenacaoInterna, setOrdenacaoInterna] = React.useState<SortingState>(
    sorting ?? []
  );
  const [visibilidade, setVisibilidade] =
    React.useState<VisibilityState>(visibilidadePadrao);
  const [ordemColunas, setOrdemColunas] = React.useState<ColumnOrderState>([]);
  const [larguras, setLarguras] = React.useState<ColumnSizingState>({});
  const [arrastando, setArrastando] = React.useState<string | null>(null);

  const chaveMemoria = personalizavel
    ? chavePreferenciasTabela(idTabela, idUsuario)
    : null;

  // Hidrata a personalização do navegador depois da montagem (o servidor
  // renderiza o padrão da tela; ler no primeiro render daria mismatch).
  React.useEffect(() => {
    if (!chaveMemoria) return;
    const salvo = lerPreferenciasTabela(
      window.localStorage.getItem(chaveMemoria),
      idsColunas,
    );
    if (!salvo) return;
    setVisibilidade({ ...visibilidadePadrao, ...salvo.visiveis });
    setOrdemColunas(
      salvo.ordem.length > 0 ? ordemEfetiva(salvo.ordem, idsColunas) : [],
    );
    setLarguras(salvo.larguras);
    // idsColunas/visibilidadePadrao são estáveis por tela; a memória é lida uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveMemoria]);

  const foraDoPadrao =
    Object.keys(larguras).length > 0 ||
    ordemColunas.length > 0 ||
    idsColunas.some(
      (id) =>
        (visibilidade[id] ?? true) !== (visibilidadePadrao[id] ?? true),
    );

  const gravar = React.useCallback(
    (
      proximaVisibilidade: VisibilityState,
      proximaOrdem: ColumnOrderState,
      proximasLarguras: ColumnSizingState,
    ) => {
      if (!chaveMemoria) return;
      window.localStorage.setItem(
        chaveMemoria,
        escreverPreferenciasTabela({
          versao: VERSAO_PREFERENCIAS,
          visiveis: proximaVisibilidade as Record<string, boolean>,
          ordem: proximaOrdem,
          larguras: proximasLarguras,
        }),
      );
    },
    [chaveMemoria],
  );

  const paginacao: PaginationState = onPaginationChange
    ? { pageIndex: pageIndex ?? 0, pageSize: pageSize ?? TAMANHO_PADRAO }
    : paginacaoInterna;
  const ordenacao: SortingState = onSortingChange ? (sorting ?? []) : ordenacaoInterna;

  const aoMudarPaginacao: OnChangeFn<PaginationState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(paginacao) : atualizador;
    if (onPaginationChange) onPaginationChange(nova);
    else setPaginacaoInterna(nova);
  };

  const aoMudarOrdenacao: OnChangeFn<SortingState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(ordenacao) : atualizador;
    if (onSortingChange) onSortingChange(nova);
    else setOrdenacaoInterna(nova);
  };

  const aoMudarVisibilidade: OnChangeFn<VisibilityState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(visibilidade) : atualizador;
    setVisibilidade(nova);
    gravar(nova, ordemColunas, larguras);
  };

  const aoMudarLarguras: OnChangeFn<ColumnSizingState> = (atualizador) => {
    const nova =
      typeof atualizador === "function" ? atualizador(larguras) : atualizador;
    setLarguras(nova);
    gravar(visibilidade, ordemColunas, nova);
  };

  function restaurarPadrao() {
    setVisibilidade(visibilidadePadrao);
    setOrdemColunas([]);
    setLarguras({});
    if (chaveMemoria) window.localStorage.removeItem(chaveMemoria);
  }

  function reordenar(idOrigem: string, idDestino: string) {
    if (idOrigem === idDestino) return;
    const atual = ordemColunas.length > 0 ? ordemColunas : idsColunas;
    const proxima = atual.filter((id) => id !== idOrigem);
    const posicao = proxima.indexOf(idDestino);
    proxima.splice(posicao < 0 ? proxima.length : posicao, 0, idOrigem);
    setOrdemColunas(proxima);
    gravar(visibilidade, proxima, larguras);
  }

  const table = useReactTable({
    data,
    columns: colunasComAcoes,
    state: {
      pagination: paginacao,
      sorting: ordenacao,
      ...(personalizavel
        ? {
            columnVisibility: visibilidade,
            columnOrder: ordemColunas.length > 0 ? ordemColunas : undefined,
            columnSizing: larguras,
          }
        : {}),
    },
    onPaginationChange: aoMudarPaginacao,
    onSortingChange: aoMudarOrdenacao,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: !modoServidor || onSortingChange !== undefined,
    ...(personalizavel
      ? {
          onColumnVisibilityChange: aoMudarVisibilidade,
          onColumnSizingChange: aoMudarLarguras,
          enableColumnResizing: true,
          columnResizeMode: "onChange" as const,
          defaultColumn: { minSize: LARGURA_MINIMA, maxSize: LARGURA_MAXIMA },
        }
      : { enableColumnResizing: false }),
    ...(modoServidor
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          pageCount: Math.max(1, Math.ceil((total ?? 0) / paginacao.pageSize)),
        }
      : {
          getPaginationRowModel: getPaginationRowModel(),
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
        }),
  });

  const colunaBusca =
    !modoServidor && searchKey ? table.getColumn(searchKey) : undefined;

  const totalRegistros = modoServidor
    ? (total ?? 0)
    : table.getFilteredRowModel().rows.length;
  const { pageIndex: indicePagina, pageSize: tamanhoPagina } =
    table.getState().pagination;
  const de = totalRegistros === 0 ? 0 : indicePagina * tamanhoPagina + 1;
  const ate = Math.min((indicePagina + 1) * tamanhoPagina, totalRegistros);

  const linhas = table.getRowModel().rows;
  const colunasVisiveis = table.getVisibleLeafColumns();
  const qtdSkeleton = Math.min(tamanhoPagina, MAX_LINHAS_SKELETON);

  const colunasDoMenu: ColunaAlternavel[] = table
    .getAllLeafColumns()
    .filter((coluna) => coluna.columnDef.meta?.fixa !== true)
    .map((coluna) => ({
      id: coluna.id,
      rotulo: rotuloColuna(
        coluna.id,
        coluna.columnDef.header,
        coluna.columnDef.meta,
      ),
      visivel: coluna.getIsVisible(),
      onAlternar: (visivel) => coluna.toggleVisibility(visivel),
    }));

  const temBarra =
    colunaBusca !== undefined ||
    exportar !== undefined ||
    toolbar !== undefined ||
    personalizavel;

  function classesResponsivas<T>(
    header: Header<T, unknown> | Cell<T, unknown>,
  ): string | undefined {
    const esconderAte = header.column.columnDef.meta?.esconderAte;
    return esconderAte ? CLASSES_ESCONDER[esconderAte] : undefined;
  }

  const cabecalho = (
    <TableHeader>
      {table.getHeaderGroups().map((grupo) => (
        <TableRow key={grupo.id} className="hover:bg-transparent">
          {grupo.headers.map((header) => {
            const alinharDireita =
              header.column.columnDef.meta?.alinharDireita === true;
            const podeReordenar =
              personalizavel && header.column.columnDef.meta?.fixa !== true;
            return (
              <TableHead
                key={header.id}
                style={personalizavel ? { width: header.getSize() } : undefined}
                draggable={podeReordenar}
                onDragStart={
                  podeReordenar
                    ? () => setArrastando(header.column.id)
                    : undefined
                }
                onDragEnd={podeReordenar ? () => setArrastando(null) : undefined}
                onDragOver={
                  podeReordenar
                    ? (evento) => {
                        if (arrastando) evento.preventDefault();
                      }
                    : undefined
                }
                onDrop={
                  podeReordenar
                    ? () => {
                        if (arrastando) reordenar(arrastando, header.column.id);
                        setArrastando(null);
                      }
                    : undefined
                }
                className={cn(
                  "h-9 px-3 text-detalhe font-medium text-muted-foreground",
                  alinharDireita && "text-right",
                  personalizavel && "relative",
                  podeReordenar && "cursor-grab active:cursor-grabbing",
                  arrastando === header.column.id && "opacity-50",
                  arrastando !== null &&
                    arrastando !== header.column.id &&
                    podeReordenar &&
                    "border-l-2 border-l-faixa",
                  cabecalhoFixo &&
                    "sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--color-border)]",
                  classesResponsivas(header),
                )}
              >
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 select-none hover:text-foreground",
                      alinharDireita && "flex-row-reverse"
                    )}
                  >
                    <span className="truncate">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </span>
                    <IconeOrdenacao direcao={header.column.getIsSorted()} />
                  </button>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}

                {personalizavel && header.column.getCanResize() ? (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Redimensionar coluna ${rotuloColuna(
                      header.column.id,
                      header.column.columnDef.header,
                      header.column.columnDef.meta,
                    )}`}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(evento) => evento.stopPropagation()}
                    className={cn(
                      "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                      "hover:bg-faixa/60",
                      header.column.getIsResizing() && "bg-faixa"
                    )}
                  />
                ) : null}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );

  const corpo = (
    <TableBody>
      {isLoading ? (
        Array.from({ length: qtdSkeleton }, (_, indiceLinha) => (
          <TableRow key={indiceLinha} className="h-9 hover:bg-transparent">
            {colunasVisiveis.map((coluna) => (
              <TableCell
                key={coluna.id}
                className={cn(
                  "px-3 text-detalhe",
                  coluna.columnDef.meta?.esconderAte
                    ? CLASSES_ESCONDER[coluna.columnDef.meta.esconderAte]
                    : undefined,
                )}
              >
                <Skeleton
                  className={cn(
                    "h-4",
                    coluna.columnDef.meta?.alinharDireita === true
                      ? "ml-auto w-16"
                      : "w-full",
                  )}
                />
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : linhas.length > 0 ? (
        linhas.map((linha) => (
          <TableRow
            key={linha.id}
            onClick={onRowClick ? () => onRowClick(linha.original) : undefined}
            onKeyDown={
              onRowClick
                ? (evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      onRowClick(linha.original);
                    }
                  }
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
            className={cn(
              "h-9 hover:bg-muted/50",
              onRowClick &&
                "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            )}
          >
            {linha.getVisibleCells().map((celula) => {
              const alinharDireita =
                celula.column.columnDef.meta?.alinharDireita === true;
              const conteudo = flexRender(
                celula.column.columnDef.cell,
                celula.getContext(),
              );
              const naoTruncar =
                celula.column.columnDef.meta?.naoTruncar === true;
              return (
                <TableCell
                  key={celula.id}
                  className={cn(
                    "px-3 text-detalhe",
                    alinharDireita && "text-right",
                    classesResponsivas(celula),
                  )}
                >
                  {naoTruncar ? (
                    conteudo
                  ) : (
                    <div className="truncate" title={tituloDaCelula(celula)}>
                      {conteudo}
                    </div>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))
      ) : (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={colunasVisiveis.length}
            className="h-32 text-center text-detalhe text-muted-foreground"
          >
            {emptyState ?? "Nenhum registro encontrado"}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );

  const tabela = (
    <table
      data-slot="table"
      className={cn(
        "w-full caption-bottom text-sm",
        personalizavel && "table-fixed",
      )}
    >
      {cabecalho}
      {corpo}
    </table>
  );

  return (
    <div className="flex flex-col gap-2">
      {temBarra && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {colunaBusca ? (
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={(colunaBusca.getFilterValue() as string | undefined) ?? ""}
                  onChange={(evento) => colunaBusca.setFilterValue(evento.target.value)}
                  placeholder={searchPlaceholder ?? "Buscar"}
                  className="h-8 pl-8 text-detalhe"
                />
              </div>
            ) : null}
            {toolbar}
          </div>
          <div className="flex items-center gap-2">
            {personalizavel && (
              <MenuColunas
                colunas={colunasDoMenu}
                onRestaurarPadrao={restaurarPadrao}
                foraDoPadrao={foraDoPadrao}
              />
            )}
            {exportar && (
              <Button type="button" variant="outline" size="sm" onClick={exportar}>
                <FileSpreadsheet />
                Exportar Excel
              </Button>
            )}
          </div>
        </div>
      )}

      {cabecalhoFixo ? (
        <div
          className="overflow-auto rounded-md border border-border"
          style={{ maxHeight: alturaMaxima ?? ALTURA_MAXIMA_PADRAO }}
        >
          {tabela}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div data-slot="table-container" className="relative w-full overflow-x-auto">
            {tabela}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-detalhe text-muted-foreground tabular-nums">
          {de} a {ate} de {totalRegistros}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-detalhe text-muted-foreground">
              Linhas por página
            </span>
            <Combobox
              valor={String(tamanhoPagina)}
              onValorChange={(valor) =>
                aoMudarPaginacao({ pageIndex: 0, pageSize: Number(valor) })
              }
              opcoes={TAMANHOS_PAGINA.map((tamanho) => ({
                valor: String(tamanho),
                rotulo: String(tamanho),
              }))}
              size="sm"
              className="w-[4.5rem] text-detalhe"
              ariaLabel="Linhas por página"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Página anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Próxima página"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Marca de célula vazia: nunca deixar buraco cru na tabela. */
export function CelulaVazia() {
  return (
    <span aria-label="não informado" className="text-muted-foreground">
      —
    </span>
  );
}

/**
 * Helper para coluna monetária: célula com MoneyText,
 * cabeçalho e células alinhados à direita.
 */
export function colunaDinheiro<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 140,
    cell: ({ getValue }) => {
      const valor = getValue();
      return (
        <MoneyText
          valor={
            typeof valor === "number" || typeof valor === "string" ? valor : null
          }
        />
      );
    },
    ...extra,
    meta: { alinharDireita: true, ...extra?.meta },
  };
}

/**
 * Helper para coluna de data: dd/mm/aaaa, largura fixa, tabular-nums, e
 * travessão quando não há data. Recebe o formatador para não acoplar o
 * canônico ao fuso (quem chama passa `formatarData`).
 */
export function colunaData<TData>(
  accessorKey: string,
  header: string,
  formatar: (valor: string) => string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 116,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "string" || valor === "") return <CelulaVazia />;
      const texto = formatar(valor);
      return texto === "" ? (
        <CelulaVazia />
      ) : (
        <span className="tabular-nums">{texto}</span>
      );
    },
    ...extra,
    meta: { naoTruncar: true, ...extra?.meta },
  };
}

/** Helper para coluna de texto: trunca com tooltip nativo e travessão no vazio. */
export function colunaTexto<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 180,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "string" || valor.trim() === "") return <CelulaVazia />;
      return valor;
    },
    ...extra,
  };
}

/** Helper para coluna numérica inteira (contagem): direita, tabular-nums. */
export function colunaNumero<TData>(
  accessorKey: string,
  header: string,
  extra?: Partial<ColumnDef<TData, unknown>>,
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    size: 110,
    cell: ({ getValue }) => {
      const valor = getValue();
      if (typeof valor !== "number") return <CelulaVazia />;
      return <span className="tabular-nums">{valor}</span>;
    },
    ...extra,
    meta: { alinharDireita: true, naoTruncar: true, ...extra?.meta },
  };
}
