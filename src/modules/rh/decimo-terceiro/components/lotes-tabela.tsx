"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { Button } from "@/components/ui/button";
import {
  formatarPercentual,
  rotuloParcela,
  STATUS_LOTE_INFO,
} from "@/modules/rh/decimo-terceiro/formato";
import type { LoteLista } from "@/modules/rh/decimo-terceiro/queries";
import { STATUS_LOTE, type StatusLote } from "@/modules/rh/decimo-terceiro/schemas";

import { GerarLoteDrawer } from "./gerar-lote-drawer";

const OPCOES_STATUS = STATUS_LOTE.map((valor) => ({
  valor,
  rotulo: STATUS_LOTE_INFO[valor].rotulo,
}));

const colunas: ColumnDef<LoteLista, unknown>[] = [
  {
    accessorKey: "ano",
    header: "Ano",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.ano}</span>
    ),
  },
  {
    accessorKey: "parcela",
    header: "Parcela",
    cell: ({ row }) => (
      <span className="font-medium">{rotuloParcela(row.original.parcela)}</span>
    ),
  },
  {
    accessorKey: "percentual",
    header: "Percentual",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarPercentual(row.original.percentual)}
      </span>
    ),
  },
  {
    accessorKey: "quantidadePessoas",
    header: "Pessoas",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.quantidadePessoas}</span>
    ),
  },
  {
    accessorKey: "comDesconto",
    header: "Desconto",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.comDesconto ? "INSS e IRRF" : "Sem desconto"}
      </span>
    ),
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
  {
    accessorKey: "status",
    header: "Situação",
    cell: ({ row }) => {
      const info = STATUS_LOTE_INFO[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
];

export interface LotesTabelaProps {
  lotes: LoteLista[];
  podeCriar: boolean;
  anoSugerido: number;
  quantidadeForaDoLote: number;
  temProvisaoDe13: boolean;
}

export function LotesTabela({
  lotes,
  podeCriar,
  anoSugerido,
  quantidadeForaDoLote,
  temProvisaoDe13,
}: LotesTabelaProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [status, setStatus] = useFiltroSessao("statusLote", "");

  const dados = React.useMemo(
    () => lotes.filter((lote) => status === "" || lote.status === status),
    [lotes, status],
  );

  return (
    <>
      <DataTable
        idTabela="rh.decimo-terceiro"
        columns={colunas}
        data={dados}
        filtros={[
          {
            id: "statusLote",
            rotulo: "Situação",
            temValor: status !== "",
            onLimpar: () => setStatus(""),
            elemento: (
              <FiltroSelect
                valor={status}
                onValorChange={(valor) => setStatus(valor as StatusLote | "")}
                opcoes={OPCOES_STATUS}
                placeholder="Situação"
                todosRotulo="Todas as situações"
              />
            ),
          },
        ]}
        onRowClick={(lote) =>
          router.push(`/rh/decimo-terceiro-e-ferias/13o/${lote.id}`)
        }
        emptyState={
          <EmptyState
            icone={CalendarDays}
            titulo="Nenhum 13º gerado"
            className="border-none bg-transparent"
            descricao="Gere o lote de uma parcela. O sistema calcula os avos de cada CLT pela data de admissão, você confere linha a linha, e a aprovação gera uma conta a pagar por pessoa."
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Gerar 13º
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar ? (
        <GerarLoteDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          anoSugerido={anoSugerido}
          quantidadeForaDoLote={quantidadeForaDoLote}
          temProvisaoDe13={temProvisaoDe13}
          onGerado={(id) =>
            router.push(`/rh/decimo-terceiro-e-ferias/13o/${id}`)
          }
        />
      ) : null}
    </>
  );
}
