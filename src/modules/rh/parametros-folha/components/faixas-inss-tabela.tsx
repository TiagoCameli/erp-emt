"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, MoreHorizontal } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  colunaDinheiro,
  ConfirmDialog,
  DataTable,
  EmptyState,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { removerFaixaInss } from "@/modules/rh/parametros-folha/actions";
import type { FaixaInssLista } from "@/modules/rh/parametros-folha/queries";

export interface FaixasInssTabelaProps {
  faixas: FaixaInssLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a faixa da linha. */
  onEditar: (faixa: FaixaInssLista) => void;
}

/**
 * Listagem das faixas de INSS, já ordenadas pelo limite (vindas da query).
 * Ações por linha: editar e excluir (com motivo, via lixeira).
 */
export function FaixasInssTabela({
  faixas,
  podeEditar,
  podeExcluir,
  onEditar,
}: FaixasInssTabelaProps) {
  const [excluindo, setExcluindo] = React.useState<FaixaInssLista | null>(
    null,
  );

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerFaixaInss(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Faixa de INSS excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<FaixaInssLista, unknown>[]>(() => {
    const base: ColumnDef<FaixaInssLista, unknown>[] = [
      colunaDinheiro<FaixaInssLista>("limiteAte", "Limite até"),
      {
        accessorKey: "aliquota",
        header: "Alíquota",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarPercentual(row.original.aliquota, 3)}
          </span>
        ),
      },
    ];

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const faixa = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da faixa"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(faixa)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(faixa)}
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
      {/* Sem `idTabela` de propósito: personalizar esconder/reordenar duas
          colunas não vale a barra de "Altura" e "Colunas", que aparecia
          repetida nas duas tabelas de faixa da mesma tela. */}
      <DataTable
        columns={colunas}
        data={faixas}
        emptyState={
          <EmptyState
            icone={Landmark}
            titulo="Nenhuma faixa de INSS cadastrada"
            descricao="Cadastre as faixas oficiais vigentes do INSS"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir faixa de INSS"
        descricao={
          excluindo
            ? `A faixa até ${formatarBRL(excluindo.limiteAte)} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir faixa"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
