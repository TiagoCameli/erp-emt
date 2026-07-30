"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroPeriodo,
  FiltroSelect,
  Trilha,
  useBuscaUrl,
  useFiltrosUrl,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { restaurarItem } from "@/modules/administracao/lixeira/actions";
import { tabelaRestauravel } from "@/modules/administracao/lixeira/restauravel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatarDataHora } from "@/lib/formatadores";
import type {
  ItemLixeira,
  UsuarioParaFiltro,
} from "@/modules/administracao/lixeira/queries";

interface LixeiraTabelaProps {
  itens: ItemLixeira[];
  total: number;
  /** Página atual, base 0. */
  pagina: number;
  tamanho: number;
  mostrarRestaurados: boolean;
  /** Tabela de origem filtrada, ou vazio. */
  filtroTabela: string;
  /** Id de quem excluiu, ou vazio. */
  filtroPor: string;
  /** Início do período de exclusão (yyyy-MM-dd) ou vazio. */
  filtroDe: string;
  /** Fim do período de exclusão (yyyy-MM-dd) ou vazio. */
  filtroAte: string;
  /** Termo procurado no motivo, ou vazio. */
  filtroMotivo: string;
  /** Tabelas presentes na lixeira, para as opções do filtro. */
  tabelas: string[];
  /** Usuários para as opções do filtro de quem excluiu. */
  usuarios: UsuarioParaFiltro[];
  podeEditar: boolean;
}

function eventosDoItem(item: ItemLixeira): EventoTrilha[] {
  const eventos: EventoTrilha[] = [
    {
      id: `${item.id}-exclusao`,
      data: item.excluidoEm,
      titulo: "Registro excluído",
      descricao: item.motivo,
      usuario: item.excluidoPorNome ?? undefined,
      tipo: "exclusao",
    },
  ];

  if (item.restauradoEm) {
    eventos.push({
      id: `${item.id}-restauracao`,
      data: item.restauradoEm,
      titulo: "Registro restaurado",
      usuario: item.restauradoPorNome ?? undefined,
      tipo: "restauracao",
    });
  }

  return eventos;
}

/**
 * Listagem da lixeira com filtros e paginação na URL: todo filtro é aplicado no
 * banco pela query da página, porque a paginação é server-side e filtrar em
 * memória mostraria um punhado de exclusões como se fossem todas.
 */
export function LixeiraTabela({
  itens,
  total,
  pagina,
  tamanho,
  mostrarRestaurados,
  filtroTabela,
  filtroPor,
  filtroDe,
  filtroAte,
  filtroMotivo,
  tabelas,
  usuarios,
  podeEditar,
}: LixeiraTabelaProps) {
  const { setMuitos: atualizarParams } = useFiltrosUrl();
  // Digitar no motivo escreve na URL com debounce, como as buscas das outras
  // listagens server-side.
  const { busca: motivo, setBusca: setMotivo } = useBuscaUrl(
    filtroMotivo,
    "motivo",
  );
  const [itemSelecionado, setItemSelecionado] =
    React.useState<ItemLixeira | null>(null);
  const [restaurando, setRestaurando] = React.useState(false);

  async function handleRestaurar(item: ItemLixeira) {
    setRestaurando(true);
    const resultado = await restaurarItem(item.id);
    setRestaurando(false);
    if (resultado?.erro) {
      toast.error(resultado.erro);
    } else {
      toast.success("Registro restaurado");
      setItemSelecionado(null);
    }
  }

  const colunas = React.useMemo<ColumnDef<ItemLixeira, unknown>[]>(() => {
    const base: ColumnDef<ItemLixeira, unknown>[] = [
      {
        accessorKey: "excluidoEm",
        header: "Excluído em",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatarDataHora(row.original.excluidoEm)}
          </span>
        ),
      },
      {
        accessorKey: "tabela",
        header: "Tabela",
        cell: ({ row }) => (
          <span className="codigo-doc">{row.original.tabela}</span>
        ),
      },
      {
        accessorKey: "registroId",
        header: "Registro",
        // Secundária: o UUID abreviado só serve para conferir um caso específico.
        meta: { ocultaPorPadrao: true },
        cell: ({ row }) => (
          <span className="codigo-doc" title={row.original.registroId}>
            {row.original.registroId.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorKey: "motivo",
        header: "Motivo",
        cell: ({ row }) => (
          <span className="block max-w-md truncate" title={row.original.motivo}>
            {row.original.motivo}
          </span>
        ),
      },
      {
        accessorKey: "excluidoPorNome",
        header: "Por",
        cell: ({ row }) => row.original.excluidoPorNome ?? "Usuário removido",
      },
    ];

    if (mostrarRestaurados) {
      base.push({
        accessorKey: "restauradoEm",
        header: "Restaurado em",
        cell: ({ row }) =>
          row.original.restauradoEm ? (
            <span className="whitespace-nowrap tabular-nums">
              {formatarDataHora(row.original.restauradoEm)}
            </span>
          ) : (
            <span className="text-muted-foreground">Na lixeira</span>
          ),
      });
    }

    return base;
  }, [mostrarRestaurados]);

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="administracao.lixeira"
        columns={colunas}
        data={itens}
        filtros={[
          {
            id: "restaurados",
            rotulo: "Mostrar restaurados",
            temValor: mostrarRestaurados,
            onLimpar: () =>
              atualizarParams({ restaurados: null, pagina: null }),
            elemento: (
              <div className="flex items-center gap-2">
                <Switch
                  id="mostrar-restaurados"
                  checked={mostrarRestaurados}
                  onCheckedChange={(marcado) =>
                    atualizarParams({
                      restaurados: marcado ? "1" : null,
                      pagina: null,
                    })
                  }
                />
                <Label
                  htmlFor="mostrar-restaurados"
                  className="text-detalhe text-muted-foreground"
                >
                  Mostrar restaurados
                </Label>
              </div>
            ),
          },
          {
            id: "tabela",
            rotulo: "Tabela",
            ocultoPorPadrao: true,
            temValor: filtroTabela !== "",
            onLimpar: () => atualizarParams({ tabela: null, pagina: null }),
            elemento: (
              <FiltroSelect
                valor={filtroTabela}
                onValorChange={(valor) =>
                  atualizarParams({
                    tabela: valor === "" ? null : valor,
                    pagina: null,
                  })
                }
                opcoes={tabelas.map((tabela) => ({
                  valor: tabela,
                  rotulo: tabela,
                }))}
                placeholder="Tabela"
                todosRotulo="Todas as tabelas"
                className="max-w-56"
              />
            ),
          },
          {
            id: "por",
            rotulo: "Quem excluiu",
            ocultoPorPadrao: true,
            temValor: filtroPor !== "",
            onLimpar: () => atualizarParams({ por: null, pagina: null }),
            elemento: (
              <FiltroSelect
                valor={filtroPor}
                onValorChange={(valor) =>
                  atualizarParams({
                    por: valor === "" ? null : valor,
                    pagina: null,
                  })
                }
                opcoes={usuarios.map((usuario) => ({
                  valor: usuario.id,
                  rotulo: usuario.nome,
                }))}
                placeholder="Quem excluiu"
                todosRotulo="Todos os usuários"
                className="max-w-56"
              />
            ),
          },
          {
            id: "periodo",
            rotulo: "Período da exclusão",
            ocultoPorPadrao: true,
            temValor: filtroDe !== "" || filtroAte !== "",
            onLimpar: () =>
              atualizarParams({ de: null, ate: null, pagina: null }),
            elemento: (
              <FiltroPeriodo
                de={filtroDe}
                ate={filtroAte}
                rotulo="Excluído em"
                onPeriodoChange={(de, ate) =>
                  atualizarParams({
                    de: de === "" ? null : de,
                    ate: ate === "" ? null : ate,
                    pagina: null,
                  })
                }
              />
            ),
          },
          {
            id: "motivo",
            rotulo: "Motivo",
            ocultoPorPadrao: true,
            // O que está digitado conta, mesmo antes do debounce escrever na
            // URL: esconder o filtro no meio da digitação tem que limpar.
            temValor: motivo !== "" || filtroMotivo !== "",
            onLimpar: () => {
              setMotivo("");
              atualizarParams({ motivo: null, pagina: null });
            },
            elemento: (
              <FiltroBusca
                valor={motivo}
                onValorChange={setMotivo}
                placeholder="Buscar no motivo"
              />
            ),
          },
        ]}
        total={total}
        pageIndex={pagina}
        pageSize={tamanho}
        onPaginationChange={({ pageIndex, pageSize }) =>
          atualizarParams({
            pagina: pageIndex === 0 ? null : String(pageIndex + 1),
            tamanho: pageSize === 25 ? null : String(pageSize),
          })
        }
        onRowClick={setItemSelecionado}
        emptyState={
          <EmptyState
            icone={Trash2}
            titulo="A lixeira está vazia"
            descricao="Exclusões de registros transacionais aparecem aqui com motivo e podem ser restauradas."
            className="border-none bg-transparent"
          />
        }
      />

      <Dialog
        open={itemSelecionado !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setItemSelecionado(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {itemSelecionado ? (
            <>
              <DialogHeader>
                <DialogTitle>Detalhe da exclusão</DialogTitle>
                <DialogDescription>
                  <span className="codigo-doc">{itemSelecionado.tabela}</span>
                  {" · "}
                  <span className="codigo-doc">
                    {itemSelecionado.registroId}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1 text-detalhe font-medium">
                    Dados do registro
                  </p>
                  <pre className="codigo-doc max-h-64 overflow-auto rounded-md border border-border bg-surface p-3 whitespace-pre-wrap">
                    {JSON.stringify(itemSelecionado.dados, null, 2)}
                  </pre>
                </div>

                <div>
                  <p className="mb-2 text-detalhe font-medium">Trilha</p>
                  <Trilha eventos={eventosDoItem(itemSelecionado)} />
                </div>
              </div>

              {podeEditar && !itemSelecionado.restauradoEm ? (
                <DialogFooter>
                  {tabelaRestauravel(itemSelecionado.tabela) ? (
                    <Button
                      type="button"
                      disabled={restaurando}
                      onClick={() => handleRestaurar(itemSelecionado)}
                    >
                      {restaurando ? (
                        <>
                          <LoaderCircle className="animate-spin" />
                          Restaurando...
                        </>
                      ) : (
                        "Restaurar"
                      )}
                    </Button>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>
                            <Button type="button" disabled>
                              Restaurar
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Este tipo de registro não pode ser restaurado pela
                          lixeira.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
