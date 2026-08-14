"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PiggyBank, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarPercentual } from "@/lib/formatadores";
import { removerProvisao } from "@/modules/rh/provisoes/actions";
import type { ProvisaoLista } from "@/modules/rh/provisoes/queries";

export interface ProvisoesTabelaProps {
  provisoes: ProvisaoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a provisão da linha. */
  onEditar: (provisao: ProvisaoLista) => void;
}

/**
 * Listagem de provisões da folha. Ações por linha: editar e excluir (com
 * motivo, via lixeira). Sem busca/filtro de propósito: a lista tende a ter
 * poucas linhas (13º, férias), diferente do cadastro de encargos.
 */
export function ProvisoesTabela({
  provisoes,
  podeEditar,
  podeExcluir,
  onEditar,
}: ProvisoesTabelaProps) {
  const [excluindo, setExcluindo] = React.useState<ProvisaoLista | null>(
    null,
  );

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerProvisao(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Provisão excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<ProvisaoLista, unknown>[]>(() => {
    const base: ColumnDef<ProvisaoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "percentual",
        header: "Percentual",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarPercentual(row.original.percentual, 3)}
          </span>
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const provisao = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da provisão"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(provisao)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(provisao)}
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
  }, [podeEditar, podeExcluir, onEditar]);

  return (
    <>
      {/* Sem `idTabela` de propósito, igual às faixas de INSS/IRRF: lista
          curta, esconder/reordenar coluna não paga a barra extra. */}
      <DataTable
        columns={colunas}
        data={provisoes}
        emptyState={
          <EmptyState
            icone={PiggyBank}
            titulo="Nenhuma provisão cadastrada"
            descricao="Cadastre a provisão de 13º e de férias para entrarem no custo da folha"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir provisão"
        descricao={
          excluindo
            ? `A provisão ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir provisão"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
