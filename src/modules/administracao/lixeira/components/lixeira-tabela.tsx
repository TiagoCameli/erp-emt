"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";

import {
  DataTable,
  EmptyState,
  Trilha,
  useFiltrosUrl,
  type EventoTrilha,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
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
import type { ItemLixeira } from "@/modules/administracao/lixeira/queries";

interface LixeiraTabelaProps {
  itens: ItemLixeira[];
  total: number;
  /** Página atual, base 0. */
  pagina: number;
  tamanho: number;
  mostrarRestaurados: boolean;
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

export function LixeiraTabela({
  itens,
  total,
  pagina,
  tamanho,
  mostrarRestaurados,
  podeEditar,
}: LixeiraTabelaProps) {
  const { setMuitos: atualizarParams } = useFiltrosUrl();
  const [itemSelecionado, setItemSelecionado] =
    React.useState<ItemLixeira | null>(null);

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
      <div className="flex items-center justify-end gap-2">
        <Switch
          id="mostrar-restaurados"
          checked={mostrarRestaurados}
          onCheckedChange={(marcado) =>
            atualizarParams({ restaurados: marcado ? "1" : null, pagina: null })
          }
        />
        <Label
          htmlFor="mostrar-restaurados"
          className="text-detalhe text-muted-foreground"
        >
          Mostrar restaurados
        </Label>
      </div>

      <DataTable
        columns={colunas}
        data={itens}
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          {/* Fase 1+: habilitar o botão e chamar a action:
                              const resultado = await restaurarItem(itemSelecionado.id);
                              if (resultado?.erro) toast.error(resultado.erro);
                              else toast.success("Registro restaurado"); */}
                          <Button type="button" disabled>
                            Restaurar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Restauração estará disponível quando os módulos
                        transacionais existirem (Fase 1+)
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
