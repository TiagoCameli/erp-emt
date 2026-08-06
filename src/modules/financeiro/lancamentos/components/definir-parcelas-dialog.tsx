"use client";

import * as React from "react";
import {
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { InputMoeda } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import {
  diferencaParaTotal,
  redistribuirProporcional,
  somarParcelas,
  temDataVazia,
  temValorInvalido,
  type ParcelaForm,
} from "@/modules/compras/ordens/calculo-parcelas";
import {
  definirParcelasLancamento,
  sugerirParcelasDoLancamento,
} from "@/modules/financeiro/lancamentos/actions";

export interface DefinirParcelasDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  lancamentoId: string;
  /** Valor do lançamento: a soma das parcelas tem que fechar com ele. */
  valor: number;
  /** Parcelas atuais (vazio quando o lançamento nasceu sem parcelas). */
  parcelasAtuais: { dataVencimento: string | null; valor: number }[];
  /** Descrição da condição da OC de origem, quando houver. Habilita a sugestão. */
  condicaoDescricao: string | null;
}

/**
 * Define as parcelas de um lançamento que nasceu sem elas (o caso da OC que não
 * definiu parcelas). Mesma mecânica da seção Parcelas da OC: tabela editável,
 * sugestão pela condição de pagamento da ordem de origem e a soma tendo que
 * fechar com o valor do lançamento.
 *
 * O banco recusa se alguma parcela já foi aprovada ou paga; a tela nem oferece
 * o botão nesse caso.
 */
export function DefinirParcelasDialog({
  aberto,
  onAbertoChange,
  lancamentoId,
  valor,
  parcelasAtuais,
  condicaoDescricao,
}: DefinirParcelasDialogProps) {
  /** O que já existe no lançamento, ou uma linha em branco para começar. */
  function parcelasIniciais(): ParcelaForm[] {
    return parcelasAtuais.length > 0
      ? parcelasAtuais.map((parcela) => ({
          dataVencimento: parcela.dataVencimento ?? "",
          valor: String(parcela.valor).replace(".", ","),
        }))
      : [{ dataVencimento: "", valor: "" }];
  }

  const [parcelas, setParcelas] =
    React.useState<ParcelaForm[]>(parcelasIniciais);
  const [salvando, setSalvando] = React.useState(false);
  const [gerando, setGerando] = React.useState(false);

  // Recarrega ao abrir, ajustando o estado DURANTE a renderização (padrão
  // recomendado pelo React para "estado derivado de prop que mudou"), em vez de
  // um efeito com setState, que dispara render em cascata.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) setParcelas(parcelasIniciais());
  }

  const soma = somarParcelas(parcelas);
  const diferenca = diferencaParaTotal(parcelas, valor);
  const fecha = diferenca === 0;
  const dataVazia = temDataVazia(parcelas);
  const valorInvalido = temValorInvalido(parcelas);
  const podeSalvar =
    parcelas.length > 0 && fecha && !dataVazia && !valorInvalido && !salvando;

  function alterar(indice: number, campo: keyof ParcelaForm, texto: string) {
    setParcelas((atual) =>
      atual.map((parcela, i) =>
        i === indice ? { ...parcela, [campo]: texto } : parcela,
      ),
    );
  }

  async function gerarPelaCondicao() {
    setGerando(true);
    const resultado = await sugerirParcelasDoLancamento(lancamentoId);
    setGerando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setParcelas(
      resultado.parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: String(parcela.valor).replace(".", ","),
      })),
    );
  }

  async function salvar() {
    setSalvando(true);
    const resultado = await definirParcelasLancamento(
      lancamentoId,
      parcelas.map((parcela) => ({
        dataVencimento: parcela.dataVencimento,
        valor: paraNumero(parcela.valor),
      })),
    );
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Parcelas definidas");
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Definir parcelas</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            As parcelas precisam somar {formatarBRL(valor)}, o valor deste
            lançamento. Enquanto não houver parcelas, ele não entra na fila de
            aprovação de pagamentos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {condicaoDescricao ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={gerando || salvando}
                onClick={() => void gerarPelaCondicao()}
              >
                {gerando ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                Gerar por {condicaoDescricao}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() =>
                setParcelas((atual) => [
                  ...atual,
                  { dataVencimento: "", valor: "" },
                ])
              }
            >
              <Plus />
              Adicionar parcela
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="hidden gap-3 px-1 sm:grid sm:grid-cols-[48px_180px_minmax(0,1fr)_auto]">
              <span className="text-legenda font-medium text-muted-foreground">
                Nº
              </span>
              <span className="text-legenda font-medium text-muted-foreground">
                Vencimento
              </span>
              <span className="text-right text-legenda font-medium text-muted-foreground">
                Valor
              </span>
              <span aria-hidden />
            </div>

            {parcelas.map((parcela, indice) => (
              <div
                key={indice}
                className="grid grid-cols-1 items-center gap-2 rounded-md bg-card px-1 sm:grid-cols-[48px_180px_minmax(0,1fr)_auto] sm:gap-3"
              >
                <span className="text-detalhe text-muted-foreground tabular-nums">
                  {indice + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    Vencimento
                  </Label>
                  <Input
                    type="date"
                    value={parcela.dataVencimento}
                    onChange={(evento) =>
                      alterar(indice, "dataVencimento", evento.target.value)
                    }
                    aria-label={`Vencimento da parcela ${indice + 1}`}
                    className="tabular-nums"
                    disabled={salvando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    Valor
                  </Label>
                  <InputMoeda
                    valor={parcela.valor}
                    onValorChange={(texto) => alterar(indice, "valor", texto)}
                    ariaLabel={`Valor da parcela ${indice + 1}`}
                    disabled={salvando}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover parcela ${indice + 1}`}
                  disabled={salvando || parcelas.length === 1}
                  onClick={() =>
                    setParcelas((atual) => atual.filter((_, i) => i !== indice))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <span className="text-detalhe text-muted-foreground">
              Soma{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatarBRL(soma)}
              </span>
            </span>
            <span
              className={
                fecha
                  ? "text-detalhe font-medium text-status-aprovado"
                  : "text-detalhe font-medium text-destructive"
              }
            >
              {fecha
                ? "Fecha com o lançamento"
                : diferenca > 0
                  ? `Faltam ${formatarBRL(diferenca)}`
                  : `Passa ${formatarBRL(-diferenca)}`}
            </span>
          </div>

          {!fecha && parcelas.length > 0 ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-detalhe">
                <TriangleAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                A soma não fecha com {formatarBRL(valor)}.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando}
                onClick={() =>
                  setParcelas((atual) => redistribuirProporcional(atual, valor))
                }
              >
                Redistribuir proporcionalmente
              </Button>
            </div>
          ) : null}

          {dataVazia ? (
            <p className="text-legenda text-destructive" role="alert">
              Toda parcela precisa de uma data de vencimento.
            </p>
          ) : null}
          {valorInvalido ? (
            <p className="text-legenda text-destructive" role="alert">
              Toda parcela precisa de um valor maior que zero.
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
              "Salvar parcelas"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
