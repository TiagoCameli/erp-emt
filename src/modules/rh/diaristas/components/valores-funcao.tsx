"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Tags } from "lucide-react";

import { colunaDinheiro, DataTable, EmptyState } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import type { FuncaoDiaria } from "@/modules/rh/diaristas/queries";

type FuncaoComValor = FuncaoDiaria & { valor: number };

export interface ValoresFuncaoProps {
  funcoes: FuncaoDiaria[];
}

/**
 * Tabela "Valores por função": o último valor de diária de cada função. Só
 * leitura: quem atualiza é a diária mais recente da função (ou a criação da
 * função no formulário), no banco.
 */
export function ValoresFuncao({ funcoes }: ValoresFuncaoProps) {
  const dados = React.useMemo(
    () => funcoes.filter((f): f is FuncaoComValor => f.valor != null),
    [funcoes],
  );

  const colunas = React.useMemo<ColumnDef<FuncaoComValor, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Função",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      colunaDinheiro<FuncaoComValor>("valor", "Valor da diária"),
      {
        accessorKey: "atualizadoEm",
        header: "Atualizado em",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.atualizadoEm
              ? formatarData(row.original.atualizadoEm)
              : "—"}
          </span>
        ),
      },
      {
        id: "origem",
        header: "Origem",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.diariaId ? "Última diária" : "Criada no formulário"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      idTabela="rh.diaristas.valores"
      columns={colunas}
      data={dados}
      emptyState={
        <EmptyState
          className="border-none bg-transparent"
          icone={Tags}
          titulo="Nenhum valor por função ainda"
          descricao="O valor de cada função aparece aqui a partir da primeira diária lançada com ela."
        />
      }
    />
  );
}
