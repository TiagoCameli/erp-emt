"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, UserMinus } from "lucide-react";

import {
  colunaData,
  DataTable,
  EmptyState,
  FiltroPeriodo,
  FiltroSelect,
  FiltroValor,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/formatadores";
import { naFaixa, noPeriodo } from "@/modules/rh/_shared/filtros";
import {
  ROTULO_TIPO_RESCISAO,
  STATUS_RESCISAO,
  type StatusRescisao,
  type TipoRescisao,
} from "@/modules/rh/rescisoes/formato";
import type {
  ColaboradorParaRescisao,
  RescisaoLista,
} from "@/modules/rh/rescisoes/queries";

import { GerarRescisaoDrawer } from "./gerar-rescisao-drawer";

const OPCOES_STATUS = (Object.keys(STATUS_RESCISAO) as StatusRescisao[]).map(
  (valor) => ({ valor, rotulo: STATUS_RESCISAO[valor].rotulo }),
);

const OPCOES_TIPO = (
  Object.keys(ROTULO_TIPO_RESCISAO) as TipoRescisao[]
).map((valor) => ({ valor, rotulo: ROTULO_TIPO_RESCISAO[valor] }));

const colunas: ColumnDef<RescisaoLista, unknown>[] = [
  {
    accessorKey: "numero",
    header: "Número",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.numero}</span>
    ),
  },
  {
    accessorKey: "colaboradorNome",
    header: "Colaborador",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.colaboradorNome}</span>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {ROTULO_TIPO_RESCISAO[row.original.tipo]}
      </span>
    ),
  },
  colunaData<RescisaoLista>("dataDesligamento", "Desligamento", formatarData),
  {
    accessorKey: "status",
    header: "Situação",
    cell: ({ row }) => {
      const info = STATUS_RESCISAO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "valorProventos",
    header: "Proventos",
    meta: { alinharDireita: true, ocultaPorPadrao: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorProventos} />,
  },
  {
    accessorKey: "valorDescontos",
    header: "Descontos",
    meta: { alinharDireita: true, ocultaPorPadrao: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorDescontos} />,
  },
  {
    accessorKey: "valorLiquido",
    header: "Líquido",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorLiquido} />,
  },
];

export interface RescisoesTabelaProps {
  rescisoes: RescisaoLista[];
  colaboradores: ColaboradorParaRescisao[];
  podeCriar: boolean;
}

export function RescisoesTabela({
  rescisoes,
  colaboradores,
  podeCriar,
}: RescisoesTabelaProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  const [status, setStatus] = useFiltroSessao("status", "");
  const [tipo, setTipo] = useFiltroSessao("tipo", "");
  const [desligamentoDe, setDesligamentoDe] = useFiltroSessao(
    "desligamentoDe",
    "",
  );
  const [desligamentoAte, setDesligamentoAte] = useFiltroSessao(
    "desligamentoAte",
    "",
  );
  const [liquidoDe, setLiquidoDe] = useFiltroSessao("liquidoDe", "");
  const [liquidoAte, setLiquidoAte] = useFiltroSessao("liquidoAte", "");

  const dados = React.useMemo(
    () =>
      rescisoes.filter((rescisao) => {
        if (status !== "" && rescisao.status !== status) return false;
        if (tipo !== "" && rescisao.tipo !== tipo) return false;
        // `data_desligamento` é DATE, não timestamptz: o dia já é o dia, e
        // converter para fuso local aqui deslocaria a data em um dia.
        if (
          !noPeriodo(
            rescisao.dataDesligamento,
            desligamentoDe,
            desligamentoAte,
          )
        ) {
          return false;
        }
        if (!naFaixa(rescisao.valorLiquido, liquidoDe, liquidoAte)) return false;
        return true;
      }),
    [
      rescisoes,
      status,
      tipo,
      desligamentoDe,
      desligamentoAte,
      liquidoDe,
      liquidoAte,
    ],
  );

  return (
    <>
      <DataTable
        idTabela="rh.rescisoes"
        columns={colunas}
        data={dados}
        filtros={[
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
            id: "tipo",
            rotulo: "Tipo",
            temValor: tipo !== "",
            onLimpar: () => setTipo(""),
            elemento: (
              <FiltroSelect
                valor={tipo}
                onValorChange={setTipo}
                opcoes={OPCOES_TIPO}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
          {
            id: "desligamento",
            rotulo: "Desligamento",
            ocultoPorPadrao: true,
            temValor: desligamentoDe !== "" || desligamentoAte !== "",
            onLimpar: () => {
              setDesligamentoDe("");
              setDesligamentoAte("");
            },
            elemento: (
              <FiltroPeriodo
                de={desligamentoDe}
                ate={desligamentoAte}
                rotulo="Desligamento"
                onPeriodoChange={(de, ate) => {
                  setDesligamentoDe(de);
                  setDesligamentoAte(ate);
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
        onRowClick={(rescisao) => router.push(`/rh/rescisoes/${rescisao.id}`)}
        emptyState={
          <EmptyState
            icone={UserMinus}
            titulo="Nenhuma rescisão"
            className="border-none bg-transparent"
            descricao="Gere a rescisão de um colaborador CLT. O sistema calcula as verbas, você confere e edita o que precisar, e a aprovação desliga a pessoa e gera a conta a pagar."
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Gerar rescisão
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar ? (
        <GerarRescisaoDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          onGerada={(id) => router.push(`/rh/rescisoes/${id}`)}
        />
      ) : null}
    </>
  );
}
