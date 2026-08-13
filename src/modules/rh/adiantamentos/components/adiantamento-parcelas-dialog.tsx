"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { CelulaVazia, MoneyText, StatusBadge } from "@/components/canonicos";
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

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-detalhe">
            <thead>
              <tr className="border-b border-border text-legenda text-muted-foreground">
                <th className="px-3 py-2 text-center font-medium">
                  Competência
                </th>
                <th className="px-3 py-2 text-right font-medium">Previsto</th>
                <th className="px-3 py-2 text-right font-medium">
                  Descontado
                </th>
                <th className="px-3 py-2 text-center font-medium">
                  Situação
                </th>
                <th className="px-3 py-2 text-center font-medium">Folha</th>
              </tr>
            </thead>
            <tbody>
              {adiantamento.parcelas.map((parcela) => {
                const situacao = situacaoParcela(parcela);
                return (
                  <tr
                    key={parcela.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-center tabular-nums">
                      {formatarMesAno(parcela.competencia)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={parcela.valorPrevisto} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText valor={parcela.valorDescontado} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge
                        status={situacao.status}
                        rotulo={situacao.rotulo}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {parcela.folhaId === null ? (
                        <CelulaVazia />
                      ) : podeVerFolha ? (
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
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
