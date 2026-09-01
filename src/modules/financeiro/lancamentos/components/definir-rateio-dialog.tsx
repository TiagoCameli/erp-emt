"use client";

import * as React from "react";
import { LoaderCircle, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { InputMoeda, SeletorCentroCusto } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { definirRateioLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { CentroCustoOpcao } from "@/modules/financeiro/lancamentos/queries";
import {
  diferencaParaFechar,
  motivoParaNaoSalvar,
  somarRateios,
  type RateioForm,
} from "@/modules/financeiro/lancamentos/rateio-editavel";

/** Uma linha do rateio como o detalhe já a carregou. */
export interface RateioGravado {
  centroCustoId: string;
  valor: number;
}

export interface DefinirRateioDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  lancamentoId: string;
  /** Valor do lançamento. O rateio tem que fechar com ele, e não muda aqui. */
  valor: number;
  /** Origem do lançamento: decide o aviso de que a origem pode reescrever. */
  origem: string;
  rateiosAtuais: RateioGravado[];
  centrosCusto: readonly CentroCustoOpcao[];
}

/**
 * Origens em que o rateio é DERIVADO de outro documento, e por isso volta a ser
 * reescrito quando aquele documento é reaprovado.
 *
 * O botão fica liberado nelas assim mesmo (decisão do Tiago em 01/09/2026): o
 * caso real é a OC que rateou errado, e trancar a tela obrigaria a desaprovar e
 * reaprovar a ordem inteira só para mover um custo de obra. O preço é este aviso,
 * porque o único desfecho pior que não poder editar é editar e a edição sumir
 * sem ninguém saber por quê.
 */
const ORIGENS_QUE_REESCREVEM: Record<string, string> = {
  oc: "Este rateio veio de uma ordem de compra. Reaprovar a OC reescreve a divisão pelos itens dela e desfaz esta edição.",
  folha:
    "Este lançamento veio da folha. Reaprovar a folha reescreve o rateio e desfaz esta edição.",
  folha_guia:
    "Este lançamento veio da folha. Reaprovar a folha reescreve o rateio e desfaz esta edição.",
  adiantamento:
    "Este lançamento veio de um adiantamento do RH. Recriar o adiantamento reescreve o rateio e desfaz esta edição.",
  rescisao:
    "Este lançamento veio de uma rescisão. Reaprovar a rescisão reescreve o rateio e desfaz esta edição.",
  diaria:
    "Este lançamento veio do fechamento de diárias. Refazer o fechamento reescreve o rateio e desfaz esta edição.",
};

/**
 * Reparte o custo de um lançamento entre centros de custo.
 *
 * Existe separado do formulário do lançamento porque `fn_salvar_lancamento`
 * recusa lançamento com parcela paga ou aprovada — e era exatamente aí que a
 * divisão do custo entre as obras ficava congelada para sempre. Aqui só o rateio
 * muda: nenhuma parcela é tocada e o valor do lançamento continua o que era.
 *
 * A regra de quando dá para salvar mora em `rateio-editavel.ts`, testada à
 * parte. Aqui é só a tela.
 */
export function DefinirRateioDialog({
  aberto,
  onAbertoChange,
  lancamentoId,
  valor,
  origem,
  rateiosAtuais,
  centrosCusto,
}: DefinirRateioDialogProps) {
  function linhasIniciais(): RateioForm[] {
    return rateiosAtuais.length > 0
      ? rateiosAtuais.map((rateio) => ({
          centroCustoId: rateio.centroCustoId,
          valor: String(rateio.valor).replace(".", ","),
        }))
      : [{ centroCustoId: "", valor: "" }];
  }

  const [linhas, setLinhas] = React.useState<RateioForm[]>(linhasIniciais);
  const [justificativa, setJustificativa] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Recarrega ao abrir ajustando o estado DURANTE a renderização (padrão
  // recomendado pelo React para "estado derivado de prop que mudou"), em vez de
  // um efeito com setState, que dispara render em cascata.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setLinhas(linhasIniciais());
      // Justificativa de uma alteração não vale para a próxima.
      setJustificativa("");
    }
  }

  const soma = somarRateios(linhas);
  const diferenca = diferencaParaFechar(linhas, valor);
  const fecha = Math.round(diferenca * 100) === 0;
  const motivo = motivoParaNaoSalvar({
    linhas,
    valorDoLancamento: valor,
    justificativa,
  });
  const podeSalvar = motivo === null && !salvando;
  const avisoDaOrigem = ORIGENS_QUE_REESCREVEM[origem];

  function alterar(indice: number, campo: keyof RateioForm, texto: string) {
    setLinhas((atual) =>
      atual.map((linha, i) =>
        i === indice ? { ...linha, [campo]: texto } : linha,
      ),
    );
  }

  /**
   * Joga a diferença que falta na linha em que o cursor não está mexendo: a
   * ÚLTIMA. Não é "redistribuir proporcionalmente" como nas parcelas porque
   * rateio raramente é proporcional — a pessoa está movendo um custo de uma obra
   * para outra, e proporcional desfaria justamente a escolha que ela fez.
   */
  function jogarDiferencaNaUltima() {
    setLinhas((atual) => {
      if (atual.length === 0) return atual;
      const ultimo = atual.length - 1;
      const novoValor =
        Math.round((paraNumero(atual[ultimo].valor) + diferenca) * 100) / 100;
      return atual.map((linha, i) =>
        i === ultimo
          ? { ...linha, valor: novoValor.toFixed(2).replace(".", ",") }
          : linha,
      );
    });
  }

  async function salvar() {
    setSalvando(true);
    const resultado = await definirRateioLancamento(
      lancamentoId,
      linhas.map((linha) => ({
        centroCustoId: linha.centroCustoId,
        valor: paraNumero(linha.valor),
      })),
      justificativa,
    );
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Rateio salvo");
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85svh] flex-col sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Editar rateio por centro de custo</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            Reparte {formatarBRL(valor)} entre os centros de custo. O valor do
            lançamento não muda aqui: para mudá-lo, edite as parcelas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {avisoDaOrigem ? (
            <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-legenda text-muted-foreground">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {avisoDaOrigem}
            </p>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <div className="sticky top-0 z-10 hidden gap-3 bg-background px-1 pb-1 sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto]">
              <span className="text-legenda font-medium text-muted-foreground">
                Centro de custo
              </span>
              <span className="text-right text-legenda font-medium text-muted-foreground">
                Valor
              </span>
              <span aria-hidden />
            </div>

            {linhas.map((linha, indice) => (
              <div
                key={indice}
                className="grid grid-cols-1 items-center gap-2 rounded-md bg-card px-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_auto] sm:gap-3"
              >
                <div className="flex flex-col gap-1">
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    Centro de custo
                  </Label>
                  <SeletorCentroCusto
                    centros={centrosCusto}
                    valor={linha.centroCustoId}
                    onValorChange={(escolhido) =>
                      alterar(indice, "centroCustoId", escolhido)
                    }
                    disabled={salvando}
                    idBase={`rateio-cc-${indice}`}
                    variante="celula"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    Valor
                  </Label>
                  <InputMoeda
                    valor={linha.valor}
                    onValorChange={(texto) => alterar(indice, "valor", texto)}
                    ariaLabel={`Valor do rateio ${indice + 1}`}
                    disabled={salvando}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover rateio ${indice + 1}`}
                  // A última linha não sai: lançamento sem centro de custo é
                  // recusado pelo banco (`trg_lancamento_exige_centro`), e um
                  // botão que sempre resulta em erro é um botão que mente.
                  disabled={salvando || linhas.length === 1}
                  onClick={() =>
                    setLinhas((atual) => atual.filter((_, i) => i !== indice))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() =>
                setLinhas((atual) => [...atual, { centroCustoId: "", valor: "" }])
              }
            >
              <Plus />
              Adicionar centro de custo
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label htmlFor="rateio-justificativa">
              Por que o rateio está mudando
              <span className="text-destructive" aria-hidden>
                {" *"}
              </span>
            </Label>
            <Textarea
              id="rateio-justificativa"
              value={justificativa}
              onChange={(evento) => setJustificativa(evento.target.value)}
              disabled={salvando}
              rows={2}
              maxLength={500}
              placeholder="Ex: apólice passou a cobrir três carretas, custo era da obra errada"
            />
            <p className="text-legenda text-muted-foreground">
              Fica registrado na trilha do lançamento, com o seu nome e a hora.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-detalhe text-muted-foreground">
              Soma do rateio{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatarBRL(soma)}
              </span>
            </span>
            <span className="text-detalhe text-muted-foreground">
              Valor do lançamento{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatarBRL(valor)}
              </span>
            </span>
          </div>

          {!fecha ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-detalhe">
                <TriangleAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                {diferenca > 0
                  ? `Faltam ${formatarBRL(diferenca)} para fechar.`
                  : `Sobram ${formatarBRL(Math.abs(diferenca))}.`}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando || linhas.length === 0}
                onClick={jogarDiferencaNaUltima}
              >
                Jogar na última linha
              </Button>
            </div>
          ) : null}

          {motivo && fecha ? (
            <p className="text-legenda text-destructive" role="alert">
              {motivo}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!podeSalvar}
            onClick={() => void salvar()}
          >
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar rateio"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
