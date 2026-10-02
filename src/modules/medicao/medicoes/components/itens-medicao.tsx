"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ListChecks } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";
import type { ItemMedicaoDetalhe } from "@/modules/medicao/medicoes/tipos";

/** Número do banco (texto) no formato da tela; nulo é travessão, nunca um zero inventado. */
function Numero({ valor }: { valor: string | null }) {
  return valor === null ? <CelulaVazia /> : <span className="tabular-nums">{numeroExibicao(valor)}</span>;
}

const colunas: ColumnDef<ItemMedicaoDetalhe, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    size: 110,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => (row.original.codigo ? <span className="font-mono">{row.original.codigo}</span> : <CelulaVazia />),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    size: 320,
    cell: ({ row }) => row.original.descricao ?? <CelulaVazia />,
  },
  {
    accessorKey: "unidade",
    header: "Unid.",
    size: 70,
    meta: { atomico: true },
    cell: ({ row }) => row.original.unidade ?? <CelulaVazia />,
  },
  {
    accessorKey: "qtdMedida",
    header: "Medida",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero valor={row.original.qtdMedida} />,
  },
  {
    accessorKey: "ajustes",
    header: "Ajustes da revisão",
    size: 130,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero valor={row.original.ajustes} />,
  },
  {
    accessorKey: "qtdAprovada",
    header: "Aprovada",
    size: 120,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero valor={row.original.qtdAprovada} />,
  },
  {
    accessorKey: "glosa",
    header: "Glosa",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero valor={row.original.glosa} />,
  },
  {
    accessorKey: "valor",
    header: "Valor",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (row.original.valor === null ? <CelulaVazia /> : <MoneyText valor={row.original.valor} />),
  },
];

function idDaLinha(i: ItemMedicaoDetalhe): string {
  return i.itemId;
}

export interface ItensMedicaoProps {
  itens: ItemMedicaoDetalhe[];
  /** Total da medição do banco (`mc_v_medicao_totais`), só exibido no pé (D7). */
  valorTotal: string | null;
}

/**
 * Itens da medição: medida (lançamentos + ajustes), os ajustes da revisão corrente, aprovada, glosa
 * e valor, todos como o banco calculou (`mc_v_medicao_itens`). Aprovada e glosa ficam vazias até a
 * medição ser aprovada.
 */
export function ItensMedicao({ itens, valorTotal }: ItensMedicaoProps) {
  return (
    <DataTable
      idTabela="medicao.medicoes.itens"
      columns={colunas}
      data={itens}
      idDaLinha={idDaLinha}
      cabecalhoFixo
      rodape={valorTotal === null ? undefined : { valor: <MoneyText valor={valorTotal} /> }}
      emptyState={
        <EmptyState
          icone={ListChecks}
          titulo="Nenhum item medido"
          descricao="Os itens aparecem aqui assim que a medição recebe lançamento ou ajuste"
          className="border-none bg-transparent"
        />
      }
    />
  );
}
