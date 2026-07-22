"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/canonicos/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
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
  }
}

const TAMANHOS_PAGINA = [10, 25, 50, 100] as const;
const TAMANHO_PADRAO = 25;
const MAX_LINHAS_SKELETON = 10;

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
}

function IconeOrdenacao({ direcao }: { direcao: false | "asc" | "desc" }) {
  if (direcao === "asc") return <ArrowUp className="size-3.5 shrink-0" />;
  if (direcao === "desc") return <ArrowDown className="size-3.5 shrink-0" />;
  return <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />;
}

/**
 * Tabela canônica do ERP: densa, com ordenação, busca local opcional,
 * paginação client-side ou server-side e export Excel opcional.
 * Nenhuma listagem do app monta tabela fora deste componente.
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
}: DataTableProps<TData>) {
  const modoServidor = total !== undefined && onPaginationChange !== undefined;

  const [paginacaoInterna, setPaginacaoInterna] = React.useState<PaginationState>({
    pageIndex: pageIndex ?? 0,
    pageSize: pageSize ?? TAMANHO_PADRAO,
  });
  const [ordenacaoInterna, setOrdenacaoInterna] = React.useState<SortingState>(
    sorting ?? []
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

  const table = useReactTable({
    data,
    columns,
    state: { pagination: paginacao, sorting: ordenacao },
    onPaginationChange: aoMudarPaginacao,
    onSortingChange: aoMudarOrdenacao,
    getCoreRowModel: getCoreRowModel(),
    enableSorting: !modoServidor || onSortingChange !== undefined,
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
  const qtdSkeleton = Math.min(tamanhoPagina, MAX_LINHAS_SKELETON);

  return (
    <div className="flex flex-col gap-2">
      {(colunaBusca !== undefined || exportar !== undefined) && (
        <div className="flex items-center justify-between gap-2">
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
          ) : (
            <span />
          )}
          {exportar && (
            <Button type="button" variant="outline" size="sm" onClick={exportar}>
              <FileSpreadsheet />
              Exportar Excel
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="hover:bg-transparent">
                {grupo.headers.map((header) => {
                  const alinharDireita =
                    header.column.columnDef.meta?.alinharDireita === true;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-9 px-3 text-detalhe font-medium text-muted-foreground",
                        alinharDireita && "text-right"
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 select-none hover:text-foreground",
                            alinharDireita && "flex-row-reverse"
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          <IconeOrdenacao direcao={header.column.getIsSorted()} />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: qtdSkeleton }, (_, indiceLinha) => (
                <TableRow key={indiceLinha} className="h-9 hover:bg-transparent">
                  {columns.map((_coluna, indiceColuna) => (
                    <TableCell key={indiceColuna} className="px-3 text-detalhe">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : linhas.length > 0 ? (
              linhas.map((linha) => (
                <TableRow
                  key={linha.id}
                  onClick={onRowClick ? () => onRowClick(linha.original) : undefined}
                  className={cn(
                    "h-9 hover:bg-muted/50",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {linha.getVisibleCells().map((celula) => (
                    <TableCell
                      key={celula.id}
                      className={cn(
                        "px-3 text-detalhe",
                        celula.column.columnDef.meta?.alinharDireita === true &&
                          "text-right"
                      )}
                    >
                      {flexRender(celula.column.columnDef.cell, celula.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-detalhe text-muted-foreground"
                >
                  {emptyState ?? "Nenhum registro encontrado"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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

/**
 * Helper para coluna monetária: célula com MoneyText,
 * cabeçalho e células alinhados à direita.
 */
export function colunaDinheiro<TData>(
  accessorKey: string,
  header: string
): ColumnDef<TData, unknown> {
  return {
    accessorKey,
    header,
    meta: { alinharDireita: true },
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
  };
}
