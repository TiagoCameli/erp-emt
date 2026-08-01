"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, Plus } from "lucide-react";

import {
  colunaData,
  DataTable,
  EmptyState,
  FiltroMes,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  formatarData,
  formatarQuantidade,
  mesParaCompetencia,
} from "@/lib/formatadores";
import {
  formatarCompetencia,
  STATUS_FOLHA,
  type StatusFolha,
} from "@/modules/rh/_shared/formato";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import type { FolhaLista } from "@/modules/rh/folha/queries";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";

const OPCOES_STATUS = (Object.keys(STATUS_FOLHA) as StatusFolha[]).map(
  (valor) => ({ valor, rotulo: STATUS_FOLHA[valor].rotulo }),
);

const colunas: ColumnDef<FolhaLista, unknown>[] = [
  {
    accessorKey: "competencia",
    header: "Competência",
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {formatarCompetencia(row.original.competencia)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_FOLHA[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "encargosPercentual",
    header: "Encargos %",
    // Secundária: o percentual está no detalhe da folha, aqui pesa o dinheiro.
    meta: { alinharDireita: true, ocultaPorPadrao: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.encargosPercentual)}%
      </span>
    ),
  },
  {
    accessorKey: "custoTotal",
    header: "Custo total",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "valorLiquido",
    header: "Líquido",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorLiquido} />,
  },
  // Secundária, mas existe para o filtro de período de fechamento não filtrar
  // por um dado que a tela nunca mostra.
  colunaData<FolhaLista>("dataFechamento", "Fechamento", formatarData, {
    meta: { ocultaPorPadrao: true },
  }),
];

export interface FolhasTabelaProps {
  folhas: FolhaLista[];
  podeCriar: boolean;
}

/**
 * Listagem das folhas gerenciais: clique na linha abre o detalhe da folha. O
 * estado vazio oferece gerar a primeira folha (se houver permissão), abrindo o
 * mesmo drawer da ação primária do cabeçalho.
 *
 * Filtros em memória: a tela carrega todas as folhas (uma por competência, ou
 * seja doze linhas por ano), então não há paginação server-side para mentir.
 */
export function FolhasTabela({ folhas, podeCriar }: FolhasTabelaProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [mes, setMes] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [fechamentoDe, setFechamentoDe] = React.useState("");
  const [fechamentoAte, setFechamentoAte] = React.useState("");
  const [custoDe, setCustoDe] = React.useState("");
  const [custoAte, setCustoAte] = React.useState("");
  const [liquidoDe, setLiquidoDe] = React.useState("");
  const [liquidoAte, setLiquidoAte] = React.useState("");

  const dados = React.useMemo(() => {
    const competencia = mesParaCompetencia(mes);
    return folhas.filter((folha) => {
      if (competencia !== "" && folha.competencia !== competencia) return false;
      if (status !== "" && folha.status !== status) return false;
      if (!noPeriodo(folha.dataFechamento, fechamentoDe, fechamentoAte)) {
        return false;
      }
      if (!naFaixa(folha.custoTotal, custoDe, custoAte)) return false;
      if (!naFaixa(folha.valorLiquido, liquidoDe, liquidoAte)) return false;
      return true;
    });
  }, [
    folhas,
    mes,
    status,
    fechamentoDe,
    fechamentoAte,
    custoDe,
    custoAte,
    liquidoDe,
    liquidoAte,
  ]);

  return (
    <>
      <DataTable
        idTabela="rh.folha"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "competencia",
            rotulo: "Competência",
            temValor: mes !== "",
            onLimpar: () => setMes(""),
            elemento: (
              <FiltroMes
                valor={mes}
                onValorChange={setMes}
                rotulo="Competência"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Situação",
            temValor: status !== "",
            onLimpar: () => setStatus(""),
            elemento: (
              <FiltroSelect
                valor={status}
                onValorChange={setStatus}
                opcoes={OPCOES_STATUS}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
          {
            id: "fechamento",
            rotulo: "Período de fechamento",
            ocultoPorPadrao: true,
            temValor: fechamentoDe !== "" || fechamentoAte !== "",
            onLimpar: () => {
              setFechamentoDe("");
              setFechamentoAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={fechamentoDe}
                ate={fechamentoAte}
                rotulo="Fechamento"
                onPeriodoChange={(de, ate) => {
                  setFechamentoDe(de);
                  setFechamentoAte(ate);
                }}
              />
            ),
          },
          {
            id: "custoTotal",
            rotulo: "Custo total",
            ocultoPorPadrao: true,
            temValor: custoDe !== "" || custoAte !== "",
            onLimpar: () => {
              setCustoDe("");
              setCustoAte("");
            },
            elemento: (
              <FiltroValor
                de={custoDe}
                ate={custoAte}
                rotulo="Custo total"
                onValorChange={(de, ate) => {
                  setCustoDe(de);
                  setCustoAte(ate);
                }}
              />
            ),
          },
          {
            id: "liquido",
            rotulo: "Líquido",
            ocultoPorPadrao: true,
            temValor: liquidoDe !== "" || liquidoAte !== "",
            onLimpar: () => {
              setLiquidoDe("");
              setLiquidoAte("");
            },
            elemento: (
              <FiltroValor
                de={liquidoDe}
                ate={liquidoAte}
                rotulo="Líquido"
                onValorChange={(de, ate) => {
                  setLiquidoDe(de);
                  setLiquidoAte(ate);
                }}
              />
            ),
          },
        ]}
        onRowClick={(folha) => router.push(`/rh/folha/${folha.id}`)}
        emptyState={
          <EmptyState
            icone={Calculator}
            titulo="Nenhuma folha gerada"
            className="border-none bg-transparent"
            descricao="Gere a folha gerencial de uma competência para consolidar ponto, adiantamentos e encargos por colaborador."
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Gerar folha
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar ? (
        <GerarFolhaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          onGerada={(id) => router.push(`/rh/folha/${id}`)}
        />
      ) : null}
    </>
  );
}
