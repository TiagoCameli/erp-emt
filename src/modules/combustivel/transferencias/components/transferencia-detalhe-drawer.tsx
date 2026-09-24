"use client";

import { ArrowRight, Calendar, Container, Droplet, FileText, Pencil, Trash2, Wallet } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import {
  BadgeCombustivel,
  CampoDetalhe,
  formatarDataHoraCurta,
  KpiDetalhe,
} from "@/modules/combustivel/_shared/components/lista-operacional";
import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";

export interface TransferenciaDetalheDrawerProps {
  transferencia: TransferenciaLinha | null;
  onFechar: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (transferencia: TransferenciaLinha) => void;
  onExcluir: (transferencia: TransferenciaLinha) => void;
}

/**
 * O TransferenciaDetalhesDrawer da origem: Litros e Valor no topo, o diagrama origem →
 * destino com o combustível, e os dados. Tudo sai da linha da lista.
 */
export function TransferenciaDetalheDrawer({
  transferencia,
  onFechar,
  podeEditar,
  podeExcluir,
  onEditar,
  onExcluir,
}: TransferenciaDetalheDrawerProps) {
  const lancada = transferencia !== null && transferencia.excluidoEm === null;
  return (
    <Sheet
      open={transferencia !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onFechar();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Transferência de combustível</SheetTitle>
          <SheetDescription>{transferencia ? formatarDataHoraCurta(transferencia.dataHora) : ""}</SheetDescription>
        </SheetHeader>

        {transferencia ? (
          <div className="flex flex-col gap-5 p-4">
            <div className="grid grid-cols-2 gap-2">
              <KpiDetalhe icone={Droplet} rotulo="Litros transferidos">
                {formatarLitros(transferencia.litros)}
              </KpiDetalhe>
              <KpiDetalhe icone={Wallet} rotulo="Valor">
                <MoneyText valor={transferencia.valorTotal} />
              </KpiDetalhe>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <Container className="size-5 text-muted-foreground" aria-hidden />
                  <span className="text-legenda font-medium text-muted-foreground">Origem</span>
                  <span className="w-full truncate text-center text-detalhe font-semibold">{transferencia.origemNome}</span>
                </div>
                <ArrowRight className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <Container className="size-5 text-muted-foreground" aria-hidden />
                  <span className="text-legenda font-medium text-muted-foreground">Destino</span>
                  <span className="w-full truncate text-center text-detalhe font-semibold">
                    {transferencia.destinoNome}
                  </span>
                </div>
              </div>
              {transferencia.insumoNome ? (
                <div className="flex items-center justify-center gap-2 border-t border-border pt-2 text-legenda text-muted-foreground">
                  Combustível: <BadgeCombustivel nome={transferencia.insumoNome} />
                </div>
              ) : null}
            </div>

            <CampoDetalhe icone={Calendar} rotulo="Data e hora">
              {formatarDataHoraCurta(transferencia.dataHora)}
            </CampoDetalhe>
            {transferencia.observacoes ? (
              <CampoDetalhe icone={FileText} rotulo="Observações">
                <p className="whitespace-pre-wrap">{transferencia.observacoes}</p>
              </CampoDetalhe>
            ) : null}
          </div>
        ) : null}

        {transferencia && lancada && (podeEditar || podeExcluir) ? (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            {podeEditar ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onEditar(transferencia)}>
                <Pencil />
                Editar
              </Button>
            ) : null}
            {podeExcluir ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => onExcluir(transferencia)}>
                <Trash2 />
                Excluir
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
