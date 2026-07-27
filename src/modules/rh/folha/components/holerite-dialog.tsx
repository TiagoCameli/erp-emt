"use client";

import { MoneyText } from "@/components/canonicos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FolhaItem } from "@/modules/rh/folha/queries";

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** FGTS informativo do mês: salário × %/100, 2 casas. Não é desconto. */
function fgtsDoMes(salarioBase: number, fgtsPercentual: number): number {
  return Math.round(salarioBase * (fgtsPercentual / 100) * 100) / 100;
}

/** Linha de valor (rótulo à esquerda, dinheiro à direita). */
function Linha({
  rotulo,
  valor,
  forte,
}: {
  rotulo: string;
  valor: number;
  forte?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={forte ? "font-medium" : "text-muted-foreground"}>
        {rotulo}
      </span>
      <MoneyText valor={valor} className={forte ? "font-semibold" : undefined} />
    </div>
  );
}

export interface HoleriteDialogProps {
  item: FolhaItem | null;
  competencia: string;
  fgtsPercentual: number;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

/**
 * Holerite (contracheque) do colaborador na competência: proventos (salário),
 * descontos (INSS, IRRF, adiantamentos), líquido a receber, e o FGTS do mês
 * como informativo (depósito do empregador, não desconta do líquido). Só
 * exibe o que a folha já calculou; nenhum cálculo fiscal aqui.
 */
export function HoleriteDialog({
  item,
  competencia,
  fgtsPercentual,
  aberto,
  onAbertoChange,
}: HoleriteDialogProps) {
  if (!item) return null;

  const totalDescontos =
    Math.round((item.inss + item.irrf + item.adiantamentos) * 100) / 100;
  const fgts = fgtsDoMes(item.salarioBase, fgtsPercentual);

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.colaboradorNome}</DialogTitle>
          <DialogDescription>
            {(item.colaboradorFuncao ?? "Sem função") +
              " · Competência " +
              formatarCompetencia(competencia)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-detalhe">
          <section>
            <h3 className="mb-1 text-legenda font-medium text-muted-foreground uppercase">
              Proventos
            </h3>
            <Linha rotulo="Salário" valor={item.salarioBase} />
          </section>

          <section>
            <h3 className="mb-1 text-legenda font-medium text-muted-foreground uppercase">
              Descontos
            </h3>
            <Linha rotulo="INSS" valor={item.inss} />
            <Linha rotulo="IRRF" valor={item.irrf} />
            <Linha rotulo="Adiantamentos" valor={item.adiantamentos} />
            <div className="mt-1 border-t border-border pt-1">
              <Linha rotulo="Total de descontos" valor={totalDescontos} forte />
            </div>
          </section>

          <section className="rounded-md border border-border bg-surface p-3">
            <Linha rotulo="Líquido a receber" valor={item.valorLiquido} forte />
          </section>

          <section>
            <h3 className="mb-1 text-legenda font-medium text-muted-foreground uppercase">
              Informativo
            </h3>
            <Linha rotulo="FGTS do mês (depósito, não desconta)" valor={fgts} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
