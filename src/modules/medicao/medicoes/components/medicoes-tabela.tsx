"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText, colunaNumero } from "@/components/canonicos";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import type { MedicaoLista } from "@/modules/medicao/medicoes/tipos";

const colunas: ColumnDef<MedicaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Nª",
    size: 90,
    meta: { fixa: true, atomico: true },
    cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.numero}ª</span>,
  },
  {
    id: "periodo",
    header: "Período",
    size: 200,
    meta: { atomico: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{periodoMedicao(row.original.periodoInicio, row.original.periodoFim)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 150,
    cell: ({ row }) => <SeloMedicao status={row.original.status} />,
  },
  {
    accessorKey: "valor",
    header: "Valor",
    size: 160,
    meta: { alinharDireita: true, atomico: true },
    // Nulo é contrato ainda sem regra de arredondamento (spec 6.2): travessão, nunca "R$ 0,00".
    cell: ({ row }) => (row.original.valor === null ? <CelulaVazia /> : <MoneyText valor={row.original.valor} />),
  },
  colunaNumero<MedicaoLista>("lancamentos", "Lançamentos"),
];

function idDaLinha(m: MedicaoLista): string {
  return m.id;
}

export interface MedicoesTabelaProps {
  medicoes: MedicaoLista[];
  contratoId: string;
  /** `medicao.lancamentos/ver`, lido no servidor. Sem ela a linha não é clicável (daria 404). */
  podeVerLancamentos: boolean;
}

/**
 * Lista de medições do contrato, da mais recente para a mais antiga (a ordem já vem de
 * `carregarMedicoes`). Clique na linha leva para os lançamentos daquela medição, para quem pode
 * vê-los.
 */
export function MedicoesTabela({ medicoes, contratoId, podeVerLancamentos }: MedicoesTabelaProps) {
  const router = useRouter();
  return (
    <DataTable
      idTabela="medicao.medicoes"
      columns={colunas}
      data={medicoes}
      idDaLinha={idDaLinha}
      onRowClick={
        podeVerLancamentos
          ? (m) => router.push(`/medicao/lancamentos?contrato=${contratoId}&medicao=${m.numero}`)
          : undefined
      }
      cabecalhoFixo
      emptyState={
        <EmptyState
          icone={ClipboardList}
          titulo="Nenhuma medição aberta"
          descricao="Comece pela primeira medição, no botão do cabeçalho"
          className="border-none bg-transparent"
        />
      }
    />
  );
}
