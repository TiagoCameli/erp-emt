"use client";

import * as React from "react";
import {
  LoaderCircle,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import { InputMoeda, StatusBadge } from "@/components/canonicos";
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
import { formatarBRL, formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import {
  redistribuirProporcional,
  somarParcelas,
  temDataVazia,
  temValorInvalido,
  type ParcelaForm,
} from "@/modules/compras/ordens/calculo-parcelas";
import { STATUS_PARCELA } from "@/modules/financeiro/_shared/formato";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";
import {
  motivoParaNaoSalvar,
  separarParcelas,
  totalDepoisDaEdicao,
  totalPreservado,
  type ParcelaGravada,
} from "@/modules/financeiro/lancamentos/parcelas-editaveis";
import {
  definirParcelasLancamento,
  sugerirParcelasDoLancamento,
} from "@/modules/financeiro/lancamentos/actions";

export interface DefinirParcelasDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  lancamentoId: string;
  /** Valor atual do cabeçalho. Em lançamento de origem, é ele que manda. */
  valor: number;
  /** Origem do lançamento: só `manual` deixa o total seguir as parcelas. */
  origem: string;
  /** Parcelas atuais com o status, que decide o que dá para editar em cada uma. */
  parcelasAtuais: ParcelaGravada[];
  /** Descrição da condição da OC de origem, quando houver. Habilita a sugestão. */
  condicaoDescricao: string | null;
}

/**
 * Edita as parcelas de um lançamento.
 *
 * Serve dois casos com a mesma mecânica:
 *
 * 1. **Lançamento que nasceu sem parcelas** (a OC que não as definiu): a tela
 *    começa em branco e a soma tem que fechar com o valor do cabeçalho, porque
 *    naquele caso o valor pertence à origem.
 * 2. **Lançamento que já tem parcela paga ou aprovada**: as fechadas aparecem
 *    TRAVADAS, com o status, e só as em aberto abrem para editar. Em lançamento
 *    manual o valor do cabeçalho passa a ser a soma de todas — mudar uma parcela
 *    muda o total, e é o que permite registrar uma renegociação sem apagar os
 *    pagamentos que já aconteceram.
 *
 * A regra de quem pode ser tocada e de quanto o lançamento passa a valer mora em
 * `parcelas-editaveis.ts`, testada à parte. Aqui é só a tela.
 */
export function DefinirParcelasDialog({
  aberto,
  onAbertoChange,
  lancamentoId,
  valor,
  origem,
  parcelasAtuais,
  condicaoDescricao,
}: DefinirParcelasDialogProps) {
  const grupos = separarParcelas(parcelasAtuais);
  const preservadas = grupos.preservadas;
  const temPreservada = preservadas.length > 0;
  const ehManual = origem === "manual";
  /** Em manual o total segue as parcelas; fora dele o cabeçalho manda. */
  const totalSegueParcelas = ehManual;

  /** As editáveis que já existem, ou uma linha em branco para começar. */
  function parcelasIniciais(): ParcelaForm[] {
    return grupos.editaveis.length > 0
      ? grupos.editaveis.map((parcela) => ({
          dataVencimento: parcela.dataVencimento ?? "",
          valor: String(parcela.valor).replace(".", ","),
        }))
      : temPreservada
        ? []
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

  const somaEditaveis = somarParcelas(parcelas);
  const pago = totalPreservado(parcelasAtuais);
  const novoTotal = totalDepoisDaEdicao(parcelasAtuais, parcelas);
  /** Quanto as editáveis têm que somar quando o cabeçalho manda no total. */
  const alvoDasEditaveis = Math.round((valor - pago) * 100) / 100;
  const diferenca = Math.round((alvoDasEditaveis - somaEditaveis) * 100) / 100;
  const fecha = diferenca === 0;

  const dataVazia = temDataVazia(parcelas);
  const valorInvalido = temValorInvalido(parcelas);
  const motivo = motivoParaNaoSalvar({
    gravadas: parcelasAtuais,
    editadas: parcelas,
    origem,
    valorDoCabecalho: valor,
  });
  const podeSalvar = motivo === null && !dataVazia && !valorInvalido && !salvando;
  const totalMudou = Math.round((novoTotal - valor) * 100) !== 0;

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
    toast.success(
      totalMudou
        ? `Parcelas salvas. O lançamento passou a valer ${formatarBRL(novoTotal)}`
        : "Parcelas salvas",
    );
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {temPreservada ? "Editar parcelas em aberto" : "Definir parcelas"}
          </DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            {temPreservada
              ? totalSegueParcelas
                ? `${preservadas.length === 1 ? "Uma parcela já foi" : `${preservadas.length} parcelas já foram`} paga ou aprovada e não muda aqui. O valor do lançamento é a soma de todas: mexer nas de baixo muda o total.`
                : `${preservadas.length === 1 ? "Uma parcela já foi" : `${preservadas.length} parcelas já foram`} paga ou aprovada e não muda aqui. As em aberto precisam somar ${formatarBRL(alvoDasEditaveis)}, porque o valor deste lançamento vem da origem.`
              : totalSegueParcelas
                ? "O valor do lançamento é a soma das parcelas."
                : `As parcelas precisam somar ${formatarBRL(valor)}, o valor deste lançamento. Enquanto não houver parcelas, ele não entra na fila de aprovação de pagamentos.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {temPreservada ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2">
              <span className="flex items-center gap-1.5 text-legenda font-medium text-muted-foreground">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                Já pagas ou aprovadas · {formatarBRL(pago)}
              </span>
              {preservadas.map((parcela) => (
                <div
                  key={parcela.numeroParcela}
                  className="flex flex-wrap items-center justify-between gap-2 text-detalhe"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {parcela.numeroParcela}
                    </span>
                    <span className="tabular-nums">
                      {parcela.dataVencimento
                        ? formatarData(parcela.dataVencimento)
                        : "—"}
                    </span>
                    <StatusBadge
                      status={
                        STATUS_PARCELA[parcela.status as StatusParcela]?.badge ??
                        "rascunho"
                      }
                      rotulo={
                        STATUS_PARCELA[parcela.status as StatusParcela]
                          ?.rotulo ?? parcela.status
                      }
                      discreto
                    />
                  </span>
                  <span className="tabular-nums">
                    {formatarBRL(parcela.valor)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {condicaoDescricao && !temPreservada ? (
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

            {parcelas.length === 0 ? (
              <p className="px-1 text-detalhe text-muted-foreground">
                Nenhuma parcela em aberto. O lançamento fica valendo os{" "}
                {formatarBRL(pago)} já pagos.
              </p>
            ) : null}

            {parcelas.map((parcela, indice) => (
              <div
                key={indice}
                className="grid grid-cols-1 items-center gap-2 rounded-md bg-card px-1 sm:grid-cols-[48px_180px_minmax(0,1fr)_auto] sm:gap-3"
              >
                <span className="text-detalhe text-muted-foreground tabular-nums">
                  {preservadas.length + indice + 1}
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
                    aria-label={`Vencimento da parcela ${preservadas.length + indice + 1}`}
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
                    ariaLabel={`Valor da parcela ${preservadas.length + indice + 1}`}
                    disabled={salvando}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover parcela ${preservadas.length + indice + 1}`}
                  disabled={
                    salvando || (parcelas.length === 1 && !temPreservada)
                  }
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
              {temPreservada ? "Soma das em aberto" : "Soma"}{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatarBRL(somaEditaveis)}
              </span>
            </span>
            {totalSegueParcelas ? (
              <span className="text-detalhe text-muted-foreground">
                Valor do lançamento{" "}
                <span
                  className={
                    totalMudou
                      ? "font-semibold text-foreground tabular-nums"
                      : "font-medium text-foreground tabular-nums"
                  }
                >
                  {formatarBRL(novoTotal)}
                </span>
                {totalMudou ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · era {formatarBRL(valor)}
                  </span>
                ) : null}
              </span>
            ) : (
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
            )}
          </div>

          {!totalSegueParcelas && !fecha && parcelas.length > 0 ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-detalhe">
                <TriangleAlert
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                A soma não fecha com {formatarBRL(alvoDasEditaveis)}.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={salvando}
                onClick={() =>
                  setParcelas((atual) =>
                    redistribuirProporcional(atual, alvoDasEditaveis),
                  )
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
          {motivo && !dataVazia && !valorInvalido ? (
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
              "Salvar parcelas"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
