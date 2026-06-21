"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ReceiptText } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { STATUS_FATURA } from "@/modules/medicao/_shared/formato";
import type { FaturaLista } from "@/modules/medicao/faturas/queries";

export interface FaturasTabelaProps {
  faturas: FaturaLista[];
}

const OPCOES_STATUS = [
  { valor: "aberta", rotulo: STATUS_FATURA.aberta.rotulo },
  { valor: "cancelada", rotulo: STATUS_FATURA.cancelada.rotulo },
];

const COLUNAS: ColumnDef<FaturaLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) =>
      row.original.numero ? (
        <span className="codigo-doc">{row.original.numero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "obraNome",
    header: "Obra",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="font-medium">{row.original.obraNome}</span>
        {row.original.obraLote ? (
          <span className="ml-1.5 text-legenda text-muted-foreground">
            {row.original.obraLote}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: "clienteNome",
    header: "Cliente",
    cell: ({ row }) =>
      row.original.clienteNome ? (
        <span>{row.original.clienteNome}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "medicaoNumero",
    header: "Medição",
    cell: ({ row }) =>
      row.original.medicaoNumero ? (
        <span className="codigo-doc">{row.original.medicaoNumero}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "competencia",
    header: "Competência",
    cell: ({ row }) => <span>{formatarData(row.original.competencia)}</span>,
  },
  {
    accessorKey: "dataVencimento",
    header: "Vencimento",
    cell: ({ row }) =>
      row.original.dataVencimento ? (
        <span>{formatarData(row.original.dataVencimento)}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "valor",
    header: "Valor",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valor} />,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const formato = STATUS_FATURA[row.original.status];
      return <StatusBadge status={formato.badge} rotulo={formato.rotulo} />;
    },
  },
];

/**
 * Listagem de faturas (somente leitura): busca por número ou obra e filtro por
 * status, ambos client-side. A tabela pagina sozinha, já que as faturas chegam
 * inteiras do servidor (volume baixo).
 */
export function FaturasTabela({ faturas }: FaturasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return faturas.filter((fatura) => {
      if (status && fatura.status !== status) return false;
      if (termo) {
        const numero = fatura.numero?.toLowerCase() ?? "";
        const obra = fatura.obraNome.toLowerCase();
        if (!numero.includes(termo) && !obra.includes(termo)) return false;
      }
      return true;
    });
  }, [faturas, busca, status]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número ou obra"
        />
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      </FilterBar>

      <DataTable
        columns={COLUNAS}
        data={dados}
        emptyState={
          <EmptyState
            icone={ReceiptText}
            titulo="Nenhuma fatura gerada"
            descricao="As faturas aparecem aqui automaticamente quando uma medição é aprovada."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
