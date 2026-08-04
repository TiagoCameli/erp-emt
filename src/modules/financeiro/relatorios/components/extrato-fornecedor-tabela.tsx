"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  CelulaDescricaoCategoria,
  CelulaVazia,
  colunaDinheiro,
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  StatusBadge,
  type FiltroConfiguravel,
} from "@/components/canonicos";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import {
  dentroDaFaixaValor,
  dentroDoPeriodo,
  mesmoMesReferencia,
  usePaginacaoCliente,
} from "@/modules/financeiro/_shared/filtros-cliente";
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
        cell: ({ row }) =>
          row.original.numero ? (
            <span className="codigo-doc">{row.original.numero}</span>
          ) : (
            <CelulaVazia />
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
        // O rótulo é mais largo que o conteúdo (mm/aaaa): com 150 saía cortado.
        size: 176,
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

  // O extrato vem inteiro do servidor, então todos os filtros rodam em memória.
  // Estão declarados em `filtros` (não no `searchKey` da tabela) para aparecerem
  // no menu "Filtros", com a escolha salva junto das colunas do usuário. O
  // fornecedor em si continua no seletor da seção, que recarrega o relatório.
  const { paginacao, setPaginacao, zerarPagina } = usePaginacaoCliente();
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [mes, setMes] = React.useState("");
  const [valorDe, setValorDe] = React.useState("");
  const [valorAte, setValorAte] = React.useState("");
  const [vencimentoDe, setVencimentoDe] = React.useState("");
  const [vencimentoAte, setVencimentoAte] = React.useState("");

  // Trocar filtro volta para a primeira página, senão a pessoa filtra e cai
  // numa página vazia.
  function mudarBusca(valor: string) {
    setBusca(valor);
    zerarPagina();
  }
  function mudarStatus(valor: string) {
    setStatus(valor);
    zerarPagina();
  }
  function mudarMes(valor: string) {
    setMes(valor);
    zerarPagina();
  }
  function mudarValor(de: string, ate: string) {
    setValorDe(de);
    setValorAte(ate);
    zerarPagina();
  }
  function mudarVencimento(de: string, ate: string) {
    setVencimentoDe(de);
    setVencimentoAte(ate);
    zerarPagina();
  }

  // As opções de status saem do próprio extrato: oferecer "Pago" num extrato
  // sem nada pago só devolve tabela vazia.
  const opcoesStatus = React.useMemo(() => {
    const presentes = new Set(lancamentos.map((lancamento) => lancamento.status));
    return [...presentes]
      .map((valor) => ({ valor, rotulo: formatoStatus(valor).rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [lancamentos]);

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lancamentos.filter((lancamento) => {
      if (status !== "" && lancamento.status !== status) return false;
      if (!mesmoMesReferencia(lancamento.mesCompetencia, mes)) return false;
      if (!dentroDaFaixaValor(lancamento.valor, valorDe, valorAte)) return false;
      if (
        !dentroDoPeriodo(
          lancamento.dataVencimento,
          vencimentoDe,
          vencimentoAte,
        )
      ) {
        return false;
      }
      if (
        termo !== "" &&
        !`${lancamento.numero ?? ""} ${lancamento.descricao}`
          .toLowerCase()
          .includes(termo)
      ) {
        return false;
      }
      return true;
    });
  }, [
    lancamentos,
    busca,
    status,
    mes,
    valorDe,
    valorAte,
    vencimentoDe,
    vencimentoAte,
  ]);

  const filtros: FiltroConfiguravel[] = [
    {
      id: "busca",
      rotulo: "Busca",
      fixo: true,
      elemento: (
        <FiltroBusca
          valor={busca}
          onValorChange={mudarBusca}
          placeholder="Buscar por número ou descrição"
        />
      ),
    },
    {
      id: "status",
      rotulo: "Status",
      ocultoPorPadrao: true,
      temValor: status !== "",
      onLimpar: () => mudarStatus(""),
      elemento: (
        <FiltroSelect
          valor={status}
          onValorChange={mudarStatus}
          opcoes={opcoesStatus}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      ),
    },
    {
      id: "mes",
      rotulo: "Mês de referência",
      ocultoPorPadrao: true,
      temValor: mes !== "",
      onLimpar: () => mudarMes(""),
      elemento: <FiltroMes valor={mes} onValorChange={mudarMes} />,
    },
    {
      id: "vencimento",
      rotulo: "Período de vencimento",
      ocultoPorPadrao: true,
      temValor: vencimentoDe !== "" || vencimentoAte !== "",
      onLimpar: () => mudarVencimento("", ""),
      elemento: (
        <FiltroPeriodo
          de={vencimentoDe}
          ate={vencimentoAte}
          onPeriodoChange={mudarVencimento}
          rotulo="Vencimento"
        />
      ),
    },
    {
      id: "valor",
      rotulo: "Faixa de valor",
      ocultoPorPadrao: true,
      temValor: valorDe !== "" || valorAte !== "",
      onLimpar: () => mudarValor("", ""),
      elemento: (
        <FiltroValor de={valorDe} ate={valorAte} onValorChange={mudarValor} />
      ),
    },
  ];

  const filtrando =
    busca.trim() !== "" ||
    status !== "" ||
    mes !== "" ||
    valorDe !== "" ||
    valorAte !== "" ||
    vencimentoDe !== "" ||
    vencimentoAte !== "";

  return (
    <DataTable
      idTabela="financeiro.relatorios.extrato-fornecedor"
      columns={colunas}
      data={dados}
      filtros={filtros}
      pageIndex={paginacao.pageIndex}
      pageSize={paginacao.pageSize}
      onPaginationChange={setPaginacao}
      emptyState={
        filtrando && lancamentos.length > 0 ? (
          <EmptyState
            titulo="Nenhum lançamento com esses filtros"
            descricao="O extrato tem lançamentos, mas nenhum bate com os filtros escolhidos."
          />
        ) : (
          <EmptyState
            titulo="Sem lançamentos"
            descricao="Nenhum lançamento a pagar para este fornecedor."
          />
        )
      }
    />
  );
}
