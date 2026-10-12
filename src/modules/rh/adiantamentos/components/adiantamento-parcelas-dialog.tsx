"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";

import {
  CelulaVazia,
  DataTable,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarMesAno } from "@/lib/formatadores";
import { resumirParcelas } from "@/modules/rh/adiantamentos/parcelamento";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";

export interface AdiantamentoParcelasDialogProps {
  adiantamento: AdiantamentoLista | null;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Permissão para abrir o link da folha (rh.folha:ver); sem ela, só o texto. */
  podeVerFolha: boolean;
}

/**
 * Situação de uma parcela, para o badge: aberta (ainda não processada por
 * nenhuma folha), descontada (processada e descontou algo), ou processada
 * sem descontar nada (não coube nem centavo naquele mês). As duas últimas
 * têm `folhaId` preenchido e só se diferenciam pelo valor descontado — se a
 * tela não distinguir as duas, parece que a folha esqueceu do colaborador.
 */
function situacaoParcela(parcela: { folhaId: string | null; valorDescontado: number }) {
  if (parcela.folhaId === null) {
    return { status: "rascunho", rotulo: "Em aberto" } as const;
  }
  if (parcela.valorDescontado > 0) {
    return { status: "aprovado", rotulo: "Descontada" } as const;
  }
  return { status: "pendente_aprovacao", rotulo: "Sem desconto" } as const;
}

type Parcela = AdiantamentoLista["parcelas"][number];

/**
 * Colunas do plano. A ordem é a do plano (competência), então nenhuma coluna
 * ordena.
 */
function colunasParcelas(podeVerFolha: boolean): ColumnDef<Parcela, unknown>[] {
  return [
    {
      id: "competencia",
      header: "Competência",
      size: 120,
      enableSorting: false,
      meta: { atomico: true, celular: "titulo" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatarMesAno(row.original.competencia)}
        </span>
      ),
    },
    {
      id: "previsto",
      header: "Previsto",
      size: 130,
      enableSorting: false,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <MoneyText valor={row.original.valorPrevisto} />,
    },
    {
      id: "descontado",
      header: "Descontado",
      size: 130,
      enableSorting: false,
      meta: { alinharDireita: true, atomico: true, celular: "valor" },
      cell: ({ row }) => <MoneyText valor={row.original.valorDescontado} />,
    },
    {
      id: "situacao",
      header: "Situação",
      size: 130,
      enableSorting: false,
      meta: { naoTruncar: true, celular: "destaque" },
      cell: ({ row }) => {
        const situacao = situacaoParcela(row.original);
        return <StatusBadge status={situacao.status} rotulo={situacao.rotulo} />;
      },
    },
    {
      id: "folha",
      header: "Folha",
      size: 150,
      enableSorting: false,
      meta: { atomico: true },
      cell: ({ row }) => {
        const parcela = row.original;
        if (parcela.folhaId === null) return <CelulaVazia />;
        return podeVerFolha ? (
          <Link
            href={`/rh/folha/${parcela.folhaId}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <span className="codigo-doc">
              Folha {formatarMesAno(parcela.competencia)}
            </span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="codigo-doc text-muted-foreground">
            Folha {formatarMesAno(parcela.competencia)}
          </span>
        );
      },
    },
  ];
}

/**
 * Detalhe do plano de parcelas de um adiantamento: competência, previsto,
 * descontado, situação e a folha que descontou. Ordenado por competência (a
 * mesma ordem que `listarAdiantamentos` já devolve): `numero` não é
 * identidade estável e não aparece em lugar nenhum desta tela.
 *
 * O resumo (total do plano/saldo) é recalculado aqui com `resumirParcelas`
 * a partir dos dados já recebidos via prop — não é uma releitura do banco,
 * é a mesma função pura da listagem aplicada de novo sobre o que já chegou.
 */
export function AdiantamentoParcelasDialog({
  adiantamento,
  aberto,
  onAbertoChange,
  podeVerFolha,
}: AdiantamentoParcelasDialogProps) {
  const colunas = React.useMemo(
    () => colunasParcelas(podeVerFolha),
    [podeVerFolha],
  );
  if (!adiantamento) return null;

  const resumo = resumirParcelas(adiantamento.valor, adiantamento.parcelas);

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Parcelas de {adiantamento.colaboradorNome}</DialogTitle>
          <DialogDescription>
            {resumo.parcelasDescontadas} de {resumo.parcelasTotal} parcela(s)
            já processada(s) em folha.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-surface p-3 text-detalhe">
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">Concedido</span>
            <MoneyText valor={adiantamento.valor} className="font-semibold" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">
              Total do plano
            </span>
            <MoneyText valor={resumo.totalPlano} className="font-semibold" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-legenda text-muted-foreground">
              Saldo em aberto
            </span>
            <MoneyText valor={resumo.saldo} className="font-semibold" />
          </div>
        </div>

        <DataTable
          idTabela="rh.adiantamentos.parcelas"
          columns={colunas}
          data={adiantamento.parcelas}
          idDaLinha={(parcela) => parcela.id}
          semPaginacao
        />
      </DialogContent>
    </Dialog>
  );
}
