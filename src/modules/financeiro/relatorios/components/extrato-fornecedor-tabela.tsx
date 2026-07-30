"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  CelulaDescricaoCategoria,
  colunaDinheiro,
  DataTable,
  EmptyState,
  FiltroBusca,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  STATUS_LANCAMENTO,
  type StatusLancamento,
} from "@/modules/financeiro/_shared/formato";
import type { ExtratoLancamento } from "../queries";

interface ExtratoFornecedorTabelaProps {
  lancamentos: ExtratoLancamento[];
}

function formatoStatus(status: string): {
  badge: StatusLancamento | string;
  rotulo: string;
} {
  const formato = STATUS_LANCAMENTO[status as StatusLancamento];
  return formato
    ? { badge: formato.badge, rotulo: formato.rotulo }
    : { badge: status, rotulo: status };
}

/**
 * Extrato de lançamentos a pagar do fornecedor: número, descrição com a
 * categoria, status, competência, vencimento e valor. Ordenável e com busca por
 * número ou descrição. O fornecedor em si é escolhido no controle da seção, que
 * recarrega o relatório pela URL.
 */
export function ExtratoFornecedorTabela({
  lancamentos,
}: ExtratoFornecedorTabelaProps) {
  const colunas = React.useMemo<ColumnDef<ExtratoLancamento, unknown>[]>(
    () => [
      {
        accessorKey: "numero",
        header: "Número",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-detalhe">
            {row.original.numero ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "descricao",
        header: "Descrição e categoria",
        size: 280,
        meta: { rotulo: "Descrição e categoria", naoTruncar: true },
        cell: ({ row }) => (
          <CelulaDescricaoCategoria
            descricao={row.original.descricao}
            categoriaNome={row.original.categoriaNome}
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 140,
        cell: ({ row }) => {
          const { badge, rotulo } = formatoStatus(row.original.status);
          return <StatusBadge status={badge} rotulo={rotulo} />;
        },
      },
      {
        accessorKey: "mesCompetencia",
        header: "Mês de referência",
        size: 150,
        cell: ({ row }) => formatarMesAno(row.original.mesCompetencia),
      },
      {
        accessorKey: "dataVencimento",
        header: "Vencimento",
        size: 130,
        cell: ({ row }) => formatarData(row.original.dataVencimento),
      },
      colunaDinheiro<ExtratoLancamento>("valor", "Valor"),
    ],
    [],
  );

  // O extrato vem inteiro do servidor, então a busca filtra no client. Está
  // declarada em `filtros` (não no `searchKey` da tabela) para aparecer no menu
  // "Filtros" junto de qualquer filtro futuro desta listagem.
  const [busca, setBusca] = React.useState("");
  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo === "") return lancamentos;
    return lancamentos.filter((lancamento) =>
      `${lancamento.numero ?? ""} ${lancamento.descricao}`
        .toLowerCase()
        .includes(termo),
    );
  }, [lancamentos, busca]);

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por número ou descrição"
        />
      ),
    },
  ];

  return (
    <DataTable
      idTabela="financeiro.relatorios.extrato-fornecedor"
      columns={colunas}
      data={dados}
      filtros={filtros}
      emptyState={
        <EmptyState
          titulo="Sem lançamentos"
          descricao="Nenhum lançamento a pagar para este fornecedor."
        />
      }
    />
  );
}
