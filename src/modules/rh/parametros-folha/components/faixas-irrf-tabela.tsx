"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Receipt } from "lucide-react";
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
import { removerFaixaIrrf } from "@/modules/rh/parametros-folha/actions";
import type { FaixaIrrfLista } from "@/modules/rh/parametros-folha/queries";

export interface FaixasIrrfTabelaProps {
  faixas: FaixaIrrfLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a faixa da linha. */
  onEditar: (faixa: FaixaIrrfLista) => void;
}

/**
 * Listagem das faixas de IRRF, já ordenadas pelo limite (vindas da query).
 * Ações por linha: editar e excluir (com motivo, via lixeira).
 */
export function FaixasIrrfTabela({
  faixas,
  podeEditar,
  podeExcluir,
  onEditar,
}: FaixasIrrfTabelaProps) {
  const [excluindo, setExcluindo] = React.useState<FaixaIrrfLista | null>(
    null,
  );

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerFaixaIrrf(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Faixa de IRRF excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<FaixaIrrfLista, unknown>[]>(() => {
    const base: ColumnDef<FaixaIrrfLista, unknown>[] = [
      colunaDinheiro<FaixaIrrfLista>("limiteAte", "Limite até"),
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
      // Largura pelo cabeçalho: "Parcela a deduzir" não cabe nos 140 do helper
      // de dinheiro, e o rótulo truncado é o que identifica a coluna.
      colunaDinheiro<FaixaIrrfLista>("parcelaDeduzir", "Parcela a deduzir", {
        size: 170,
      }),
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
      {/* Sem `idTabela` de propósito: ver a nota em faixas-inss-tabela. Três
          colunas fixas não justificam a barra de personalização. */}
      <DataTable
        columns={colunas}
        data={faixas}
        emptyState={
          <EmptyState
            icone={Receipt}
            titulo="Nenhuma faixa de IRRF cadastrada"
            descricao="Cadastre as faixas oficiais vigentes do IRRF"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir faixa de IRRF"
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
