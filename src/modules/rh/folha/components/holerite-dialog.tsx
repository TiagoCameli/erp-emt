"use client";

import { Printer } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import {
  CabecalhoDocumento,
  PistaEmt,
  RodapeEmpresa,
} from "@/components/canonicos/marca-documento";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

/**
 * Rótulo do desconto de adiantamento: identifica a parcela ("Adiantamento
 * 2/3") quando o colaborador tem mais de uma parcela descontada nesta folha
 * E o plano dela tem mais de uma parcela no total. Com plano de 1 parcela
 * (à vista) o rótulo genérico já diz tudo, e "1/1" seria ruído. Sem a
 * informação (ex.: quem gerou a leitura não tem `rh.adiantamentos:ver`), cai
 * no mesmo rótulo genérico de sempre — nunca quebra, nunca mostra número
 * errado.
 */
function rotuloAdiantamento(
  parcelas: { ordinal: number; total: number }[] | undefined,
): string {
  const comOrdinal = (parcelas ?? []).filter((parcela) => parcela.total > 1);
  if (comOrdinal.length === 0) return "Adiantamentos";
  return comOrdinal
    .map((parcela) => `Adiantamento ${parcela.ordinal}/${parcela.total}`)
    .join(" e ");
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
      <MoneyText
        valor={valor}
        className={forte ? "font-semibold" : undefined}
      />
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
 * exibe o que a folha já calculou; nenhum cálculo fiscal aqui. O botão
 * Imprimir usa a impressão do navegador (isolada via .holerite-print no CSS
 * global) para salvar/imprimir como PDF e entregar ao funcionário.
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
        <div className="holerite-print flex flex-col gap-4">
          {/*
            A mesma moldura do espelho, pelo mesmo motivo: o holerite sai da
            impressora e vai pra mão do funcionário, então precisa dizer de qual
            empresa ele é. Cabeçalho e rodapé vêm do canônico (marca-documento),
            nunca desenhados aqui, senão holerite e espelho passam a divergir.
          */}
          <CabecalhoDocumento
            titulo="Holerite"
            subtitulo={`Competência ${formatarCompetencia(competencia)}`}
          />
          <PistaEmt />

          <DialogHeader>
            <DialogTitle>{item.colaboradorNome}</DialogTitle>
            {/* Só a função: a competência já está no subtítulo do cabeçalho,
                logo acima, e repetir aqui gasta uma linha do papel dizendo duas
                vezes a mesma coisa. */}
            <DialogDescription>
              {item.colaboradorFuncao ?? "Sem função"}
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
              <Linha
                rotulo={rotuloAdiantamento(item.adiantamentoParcelas)}
                valor={item.adiantamentos}
              />
              <div className="mt-1 border-t border-border pt-1">
                <Linha
                  rotulo="Total de descontos"
                  valor={totalDescontos}
                  forte
                />
              </div>
            </section>

            <section className="rounded-md border border-border bg-surface p-3">
              <Linha
                rotulo="Líquido a receber"
                valor={item.valorLiquido}
                forte
              />
            </section>

            <section>
              <h3 className="mb-1 text-legenda font-medium text-muted-foreground uppercase">
                Informativo
              </h3>
              <Linha
                rotulo="FGTS do mês (depósito, não desconta)"
                valor={fgts}
              />
            </section>
          </div>

          <footer className="mt-1 border-t border-border pt-2">
            <RodapeEmpresa />
          </footer>
        </div>

        <DialogFooter className="nao-imprime">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
