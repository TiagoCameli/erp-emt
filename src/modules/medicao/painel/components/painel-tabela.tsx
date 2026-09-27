"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet } from "lucide-react";

import { CelulaVazia, DataTable, EmptyState, MoneyText, StatusBadge } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { percentualExibicao, periodoMedicao } from "@/modules/medicao/boletim/formato";
import { SeloMedicao } from "@/modules/medicao/_shared/selo-medicao";
import {
  ROTULO_STATUS_CONTRATO,
  ROTULO_TIPO_CONTRATANTE,
  type StatusContrato,
  type TipoContratante,
} from "@/modules/medicao/_shared/rotulos";
import type { ContratoPainel, MedicaoCorrentePainel, Painel } from "@/modules/medicao/painel/tipos";

/**
 * Dinheiro do painel: o texto que a RPC mandou, só formatado. Nulo é contrato sem regra de
 * arredondamento (a célula do contrato traz a nota), nunca "R$ 0,00".
 */
function Dinheiro({ valor, negrito }: { valor: string | null; negrito?: boolean }) {
  if (valor === null) return <CelulaVazia />;
  return <MoneyText valor={valor} className={cn(negrito && "font-semibold")} />;
}

function Numero({ texto, negrito }: { texto: string; negrito?: boolean }) {
  return <span className={cn("tabular-nums", negrito && "font-semibold")}>{texto}</span>;
}

function CelulaContrato({ contrato }: { contrato: ContratoPainel }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono">{contrato.codigo}</span>
      <span className="text-legenda text-muted-foreground">{contrato.nome_obra}</span>
      {contrato.previsto === null ? (
        <span className="text-legenda text-status-pendente">Sem regra de arredondamento</span>
      ) : null}
    </div>
  );
}

function CelulaContratante({ contrato }: { contrato: ContratoPainel }) {
  return (
    <div className="flex flex-col">
      <span>{contrato.contratante_nome}</span>
      <span className="text-legenda text-muted-foreground">
        {ROTULO_TIPO_CONTRATANTE[contrato.contratante_tipo as TipoContratante] ?? contrato.contratante_tipo}
      </span>
    </div>
  );
}

function CelulaStatus({ status }: { status: string }) {
  return (
    <StatusBadge status={status} rotulo={ROTULO_STATUS_CONTRATO[status as StatusContrato] ?? status} />
  );
}

/** Nª, período, selo e valor da medição corrente; nulo é contrato sem medição nenhuma. */
function CelulaCorrente({ corrente }: { corrente: MedicaoCorrentePainel | null }) {
  if (!corrente) return <span className="text-muted-foreground">Nenhuma medição</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{corrente.numero}ª</span>
        <SeloMedicao status={corrente.status} />
      </span>
      <span className="tabular-nums text-legenda text-muted-foreground">
        {periodoMedicao(corrente.periodo_inicio, corrente.periodo_fim)}
      </span>
      <Dinheiro valor={corrente.valor} />
    </div>
  );
}

const colunas: ColumnDef<ContratoPainel, unknown>[] = [
  {
    id: "contrato",
    header: "Contrato",
    size: 240,
    meta: { fixa: true, naoTruncar: true },
    cell: ({ row }) => <CelulaContrato contrato={row.original} />,
  },
  {
    id: "contratante",
    header: "Contratante",
    size: 200,
    meta: { naoTruncar: true },
    cell: ({ row }) => <CelulaContratante contrato={row.original} />,
  },
  {
    id: "status",
    header: "Status",
    size: 120,
    cell: ({ row }) => <CelulaStatus status={row.original.status} />,
  },
  {
    id: "previsto",
    header: "Previsto",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Dinheiro valor={row.original.previsto} />,
  },
  {
    id: "acumulado",
    header: "Acumulado",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Dinheiro valor={row.original.acumulado} />,
  },
  {
    id: "pct_executado",
    header: "% Executado",
    size: 110,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Numero texto={percentualExibicao(row.original.pct_executado)} />,
  },
  {
    id: "saldo",
    header: "Saldo",
    size: 150,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => <Dinheiro valor={row.original.saldo} />,
  },
  {
    id: "corrente",
    header: "Medição corrente",
    size: 220,
    meta: { naoTruncar: true },
    cell: ({ row }) => <CelulaCorrente corrente={row.original.corrente} />,
  },
];

function idDaLinha(c: ContratoPainel): string {
  return c.id;
}

export interface PainelTabelaProps {
  painel: Painel;
  /**
   * `medicao.boletim/ver`, lido no servidor pela página. Sem ele a linha não é clicável: o
   * boletim daria 404.
   */
  podeAbrirBoletim: boolean;
}

/**
 * Uma linha por contrato (a RPC já filtra pela lista de acesso do usuário, D3), com o rodapé do
 * `total` consolidado da RPC: a tela não soma nada (D7). Clique na linha abre o boletim do
 * contrato, para quem pode ver o boletim.
 */
export function PainelTabela({ painel, podeAbrirBoletim }: PainelTabelaProps) {
  const router = useRouter();
  const t = painel.total;

  return (
    <DataTable
      idTabela="medicao.painel"
      columns={colunas}
      data={painel.contratos}
      idDaLinha={idDaLinha}
      onRowClick={podeAbrirBoletim ? (c) => router.push(`/medicao/boletim?contrato=${c.id}`) : undefined}
      cabecalhoFixo
      rodape={{
        contrato: <span className="font-semibold">Total consolidado</span>,
        previsto: <Dinheiro valor={t.previsto} negrito />,
        acumulado: <Dinheiro valor={t.acumulado} negrito />,
        pct_executado: <Numero texto={percentualExibicao(t.pct_executado)} negrito />,
        saldo: <Dinheiro valor={t.saldo} negrito />,
        corrente: <Dinheiro valor={t.corrente} negrito />,
      }}
      emptyState={
        <EmptyState
          icone={FileSpreadsheet}
          titulo="Nenhum contrato encontrado"
          descricao="Ajuste os filtros ou verifique se você está na lista de acesso de algum contrato"
          className="border-none bg-transparent"
        />
      }
    />
  );
}
