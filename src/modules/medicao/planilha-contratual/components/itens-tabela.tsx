"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ListChecks, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  MoneyText,
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
import { formatarQuantidade } from "@/lib/formatadores";
import type { UnidadeOpcao } from "@/modules/medicao/_shared/queries";
import { removerItem } from "@/modules/medicao/planilha-contratual/actions";
import type { ItemLista } from "@/modules/medicao/planilha-contratual/queries";
import { ImportarItens } from "./importar-itens";
import { ItemFormDrawer } from "./item-form-drawer";

export interface ItensTabelaProps {
  planilhaId: string;
  itens: ItemLista[];
  unidades: UnidadeOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/**
 * Tabela dos itens de uma planilha contratual. Mostra unidade, quantidade
 * contratada, preço, valor, medido acumulado e saldo. Adiciona, edita, remove
 * e importa itens quando há permissão.
 */
export function ItensTabela({
  planilhaId,
  itens,
  unidades,
  podeCriar,
  podeEditar,
  podeExcluir,
}: ItensTabelaProps) {
  const [busca, setBusca] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<ItemLista | null>(null);
  const [removendo, setRemovendo] = React.useState<ItemLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(item: ItemLista) {
    setEmEdicao(item);
    setDrawerAberto(true);
  }

  async function aoConfirmarRemocao() {
    if (!removendo) return;
    const resultado = await removerItem(removendo.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Item removido");
    setRemovendo(null);
  }

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter(
      (item) =>
        item.descricao.toLowerCase().includes(termo) ||
        (item.codigo?.toLowerCase().includes(termo) ?? false),
    );
  }, [itens, busca]);

  const colunas = React.useMemo<ColumnDef<ItemLista, unknown>[]>(() => {
    const base: ColumnDef<ItemLista, unknown>[] = [
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
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.descricao}</span>
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
        accessorKey: "quantidadeContratada",
        header: "Qtd. contratada",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.quantidadeContratada)}
          </span>
        ),
      },
      {
        accessorKey: "precoUnitario",
        header: "Preço unitário",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.precoUnitario} />,
      },
      {
        accessorKey: "valor",
        header: "Valor contratual",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        accessorKey: "medidoAcumulado",
        header: "Medido",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatarQuantidade(row.original.medidoAcumulado)}
          </span>
        ),
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums",
              row.original.saldo < 0 && "text-destructive",
            )}
          >
            {formatarQuantidade(row.original.saldo)}
          </span>
        ),
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${item.descricao}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(item)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <>
                  {podeEditar ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setRemovendo(item)}
                  >
                    Remover
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar, podeExcluir]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar>
          <FiltroBusca
            valor={busca}
            onValorChange={setBusca}
            placeholder="Buscar por código ou descrição"
          />
        </FilterBar>
        {podeCriar ? (
          <div className="flex items-center gap-2">
            <ImportarItens planilhaId={planilhaId} />
            <Button type="button" size="sm" onClick={abrirNovo}>
              <Plus />
              Novo item
            </Button>
          </div>
        ) : null}
      </div>

      <DataTable
        columns={colunas}
        data={filtrados}
        emptyState={
          <EmptyState
            icone={ListChecks}
            titulo="Nenhum item nesta planilha"
            descricao={
              podeCriar
                ? "Adicione o primeiro item ou importe uma planilha."
                : "Nenhum item para mostrar com os filtros atuais."
            }
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo item
                </Button>
              ) : undefined
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeCriar || podeEditar ? (
        <ItemFormDrawer
          key={emEdicao?.id ?? "novo"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          planilhaId={planilhaId}
          item={emEdicao}
          unidades={unidades}
        />
      ) : null}

      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setRemovendo(null);
        }}
        titulo="Remover item"
        descricao={`O item ${removendo?.descricao ?? ""} será removido da planilha. Esta ação não pode ser desfeita.`}
        textoConfirmar="Remover item"
        variante="destrutivo"
        onConfirmar={aoConfirmarRemocao}
      />
    </div>
  );
}
