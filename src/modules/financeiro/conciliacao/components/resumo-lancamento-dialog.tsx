"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, LoaderCircle } from "lucide-react";

import { MoneyText, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarData } from "@/lib/formatadores";
import { resumoDoLancamento } from "@/modules/financeiro/conciliacao/actions";
import {
  ROTULO_TIPO_LANCAMENTO,
  STATUS_LANCAMENTO,
  STATUS_PARCELA,
} from "@/modules/financeiro/_shared/formato";
import type { LancamentoDetalhe } from "@/modules/financeiro/lancamentos/queries";

export interface ResumoLancamentoDialogProps {
  /** Null fecha o diálogo. O pai remonta a cada lançamento (key). */
  lancamentoId: string | null;
  onFechar: () => void;
}

function mesDeReferencia(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}/${ano}`;
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Resumo do lançamento para conferir antes de casar (Tiago, 05/10/2026): quem,
 * o quê, competência, parcelas com conta e situação, e o rateio por centro de
 * custo. O detalhe completo abre em outra aba.
 */
export function ResumoLancamentoDialog({
  lancamentoId,
  onFechar,
}: ResumoLancamentoDialogProps) {
  const [lancamento, setLancamento] = React.useState<LancamentoDetalhe | null>(
    null,
  );
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!lancamentoId) return;
    let ativo = true;
    void resumoDoLancamento(lancamentoId).then((resposta) => {
      if (!ativo) return;
      if ("erro" in resposta) setErro(resposta.erro);
      else setLancamento(resposta.lancamento);
    });
    return () => {
      ativo = false;
    };
  }, [lancamentoId]);

  const favorecido = lancamento
    ? (lancamento.fornecedorNome ??
      lancamento.clienteNome ??
      lancamento.colaboradorNome ??
      "-")
    : "";

  return (
    <Dialog
      open={lancamentoId !== null}
      onOpenChange={(aberto) => !aberto && onFechar()}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {lancamento
              ? `${lancamento.numero ?? "Lançamento"} · ${favorecido}`
              : "Lançamento"}
          </DialogTitle>
          <DialogDescription>
            {lancamento
              ? `${ROTULO_TIPO_LANCAMENTO[lancamento.tipo]}, ${STATUS_LANCAMENTO[lancamento.status].rotulo.toLowerCase()}`
              : "Resumo do lançamento"}
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p className="text-sm text-status-rejeitado">{erro}</p>
        ) : !lancamento ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Carregando
          </div>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            <dl className="flex flex-col gap-1.5">
              <Linha rotulo="Descrição">{lancamento.descricao}</Linha>
              <Linha rotulo="Valor">
                <MoneyText valor={lancamento.valor} />
              </Linha>
              <Linha rotulo="Categoria">
                {lancamento.categoriaNome ?? "-"}
              </Linha>
              <Linha rotulo="Mês de referência">
                {mesDeReferencia(lancamento.mesCompetencia)}
              </Linha>
              <Linha rotulo="Data da compra">
                {formatarData(lancamento.dataCompra)}
              </Linha>
              <Linha rotulo="Documento">
                {lancamento.numeroDocumento ?? "-"}
              </Linha>
              {lancamento.observacoes ? (
                <Linha rotulo="Observações">{lancamento.observacoes}</Linha>
              ) : null}
            </dl>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-medium">
                {lancamento.parcelas.length === 1
                  ? "Parcela"
                  : `Parcelas (${lancamento.parcelas.length})`}
              </h3>
              <ul className="flex flex-col gap-1">
                {lancamento.parcelas.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {p.numeroParcela}ª ·{" "}
                      {p.dataPagamento
                        ? `paga ${formatarData(p.dataPagamento)}`
                        : `vence ${p.dataVencimento ? formatarData(p.dataVencimento) : "-"}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.contaBancariaNome ?? "Sem conta"}
                    </span>
                    <MoneyText valor={p.valorLiquido} />
                    <StatusBadge
                      status={STATUS_PARCELA[p.status].badge}
                      rotulo={STATUS_PARCELA[p.status].rotulo}
                    />
                  </li>
                ))}
              </ul>
            </section>

            {lancamento.rateios.length > 0 ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Centro de custo</h3>
                <ul className="flex flex-col gap-1">
                  {lancamento.rateios.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {r.centroCustoCodigo ? `${r.centroCustoCodigo} · ` : ""}
                        {r.centroCustoNome}
                      </span>
                      <MoneyText valor={r.valor} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {lancamento ? (
            <Button asChild variant="outline">
              <Link
                href={`/financeiro/lancamentos/${lancamento.id}`}
                target="_blank"
                rel="noopener"
              >
                <ExternalLink />
                Abrir lançamento
              </Link>
            </Button>
          ) : null}
          <Button type="button" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
