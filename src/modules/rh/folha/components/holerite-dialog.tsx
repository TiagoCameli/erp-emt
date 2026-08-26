"use client";

import { Printer } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import {
  CabecalhoDocumento,
  PistaEmt,
  RodapeEmpresa,
} from "@/components/canonicos/marca-documento";
import { Button } from "@/components/ui/button";
import { formatarQuantidade } from "@/lib/formatadores";
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

/**
 * FGTS informativo do mês: salário BASE × %/100, 2 casas. Não é desconto.
 *
 * A base é o salário base, sem gratificação, pela mesma razão dos encargos: a
 * regra declarada pelo Tiago é que a gratificação não é afetada por encargo, e
 * o FGTS é depósito do empregador. Se essa regra mudar, muda aqui e na
 * fn_folha_aplicar_encargos_e_provisoes juntas — hoje as duas concordam.
 */
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
 * Holerite (contracheque) do colaborador na competência: proventos (salário e
 * gratificação, quando houver), descontos (INSS, IRRF, adiantamentos), líquido
 * a receber, e o FGTS do mês
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
    Math.round(
      (item.inss + item.irrf + item.descontos + item.adiantamentos) * 100,
    ) / 100;
  const fgts = fgtsDoMes(item.salarioBase, fgtsPercentual);
  // Total de proventos só aparece quando há gratificação: com salário sozinho a
  // linha repetiria o número de cima, e holerite com número repetido é onde o
  // funcionário para de conferir.
  const totalProventos =
    Math.round((item.salarioBase + item.gratificacao) * 100) / 100;

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
              {item.gratificacao > 0 ? (
                <>
                  <Linha rotulo="Gratificação" valor={item.gratificacao} />
                  <div className="mt-1 border-t border-border pt-1">
                    <Linha
                      rotulo="Total de proventos"
                      valor={totalProventos}
                      forte
                    />
                  </div>
                </>
              ) : null}
            </section>

            <section>
              <h3 className="mb-1 text-legenda font-medium text-muted-foreground uppercase">
                Descontos
              </h3>
              <Linha rotulo="INSS" valor={item.inss} />
              <Linha rotulo="IRRF" valor={item.irrf} />
              {/* Só quando existe: um "Desconto R$ 0,00" em todo holerite de
                  quem não tem desconto faria o funcionário procurar o que foi
                  descontado dele.
                  O rótulo trazia o percentual ("Desconto (7,5% do salário
                  base)"), e não traz mais: desde 26/08/2026 o desconto é
                  digitado em reais, e anunciar um percentual que ninguém aplicou
                  daria ao funcionário uma conta para fazer que não fecha — 7,5%
                  de R$ 1.621,00 dá R$ 121,575, e o valor real é o do
                  contracheque. */}
              {item.descontos > 0 ? (
                <Linha
                  rotulo={
                    // As horas entram no rótulo quando existem: é o que o
                    // funcionário confere. Sem elas, "Desconto" pelado — o
                    // rótulo não inventa um motivo que ninguém declarou.
                    item.descontoHoras !== null && item.descontoHoras > 0
                      ? `Desconto (${formatarQuantidade(item.descontoHoras)}h não trabalhadas)`
                      : "Desconto"
                  }
                  valor={item.descontos}
                />
              ) : null}
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
                rotulo="FGTS do mês sobre o salário base (depósito, não desconta)"
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
