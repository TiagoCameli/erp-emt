"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { CampoFormulario, InputDecimal, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/formatadores";
import {
  CAMPOS_RETENCAO,
  liquidoDeRetencao,
  paraNumero,
  ROTULO_RETENCAO,
  TOLERANCIA_RETENCAO,
  totalRetencoes,
  type CampoRetencao,
} from "@/modules/financeiro/lancamentos/schemas";

/** O que a tela guarda: tudo string, como todo campo de dinheiro do formulário. */
export type ValoresRetencao = Record<CampoRetencao | "valorBruto", string>;

export interface RetencaoPainelProps {
  valores: ValoresRetencao;
  onValorChange: (campo: keyof ValoresRetencao, valor: string) => void;
  /** O campo `valor` do lançamento, que é o LÍQUIDO. */
  liquido: string;
  onLiquidoChange: (valor: string) => void;
  desabilitado?: boolean;
  erroBruto?: string;
}

/** Converte número para o texto do input (vírgula decimal). */
function paraTexto(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/**
 * A área de retenção na fonte do lançamento a receber.
 *
 * POR QUE ELA EXISTE: nota de medição do DNIT tem dois valores. A nota 345 vale
 * R$ 3.243.566,33 de serviço e o que entrou na conta foi R$ 2.935.427,53; a
 * diferença é imposto que o pagador recolheu. Sem os dois campos, quem lança
 * escolhe entre um saldo bancário inflado e uma receita de obra subestimada.
 *
 * COMO SE USA: digita o bruto, digita as retenções que a nota mostra, e o líquido
 * aparece calculado. O campo do líquido continua EDITÁVEL de propósito, porque o
 * pagador arredonda: nas nove notas da BR-364 o crédito difere do cálculo em até
 * 3 centavos, e para os dois lados. Quando o editado difere do calculado, a
 * diferença aparece nomeada em vez de sumir.
 *
 * O painel nasce fechado quando não há retenção, que é o caso da esmagadora
 * maioria dos lançamentos: um recebimento simples continua com um campo de valor
 * e nada mais.
 */
export function RetencaoPainel({
  valores,
  onValorChange,
  liquido,
  onLiquidoChange,
  desabilitado,
  erroBruto,
}: RetencaoPainelProps) {
  const temRetencao =
    valores.valorBruto !== "" ||
    CAMPOS_RETENCAO.some((campo) => valores[campo] !== "");

  /**
   * Aberto é DERIVADO, não sincronizado por efeito: documento que já tem
   * retenção abre sozinho, e o botão só precisa cobrir o caso de quem vai
   * digitar a primeira. Um `useEffect` com `setAberto` aqui dispararia render em
   * cascata a cada tecla no campo de bruto, e o lint reclama com razão.
   */
  const [abertoManual, setAbertoManual] = React.useState(false);
  const aberto = temRetencao || abertoManual;

  const numeros = React.useMemo(() => {
    const mapa: Partial<Record<CampoRetencao, number>> = {};
    for (const campo of CAMPOS_RETENCAO) {
      mapa[campo] = paraNumero(valores[campo] ?? "");
    }
    return mapa;
  }, [valores]);

  const bruto = paraNumero(valores.valorBruto ?? "");
  const total = totalRetencoes(numeros);
  const calculado = liquidoDeRetencao(bruto, numeros);
  const informado = paraNumero(liquido ?? "");
  const diferenca = Math.round((informado - calculado) * 100) / 100;
  const foraDaTolerancia = Math.abs(diferenca) > TOLERANCIA_RETENCAO;

  /**
   * Escreve o líquido calculado no campo Valor a cada mudança de bruto ou
   * retenção. É o "calculado automaticamente" do pedido: quem digita não faz a
   * subtração de sete parcelas na cabeça.
   */
  function mudar(campo: keyof ValoresRetencao, texto: string) {
    onValorChange(campo, texto);

    const proximos: Partial<Record<CampoRetencao, number>> = { ...numeros };
    let proximoBruto = bruto;
    if (campo === "valorBruto") {
      proximoBruto = paraNumero(texto);
    } else {
      proximos[campo] = paraNumero(texto);
    }
    if (proximoBruto > 0) {
      onLiquidoChange(paraTexto(liquidoDeRetencao(proximoBruto, proximos)));
    }
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={desabilitado}
        onClick={() => setAbertoManual(true)}
        className="self-start"
      >
        Lançar com retenção na fonte
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-detalhe font-medium text-foreground">
            Retenção na fonte
          </p>
          <p className="text-legenda text-muted-foreground">
            Imposto que o pagador recolhe. O líquido é o que entra na conta.
          </p>
        </div>
        {!temRetencao ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={desabilitado}
            onClick={() => setAbertoManual(false)}
          >
            Fechar
          </Button>
        ) : null}
      </div>

      <CampoFormulario
        id="lan-valor-bruto"
        rotulo="Valor bruto"
        ajuda="O valor do serviço na nota, antes das retenções."
        erro={erroBruto}
      >
        <InputDecimal
          id="lan-valor-bruto"
          placeholder="0,00"
          className="tabular-nums text-right"
          disabled={desabilitado}
          value={valores.valorBruto}
          onChange={(evento) => mudar("valorBruto", evento.target.value)}
        />
      </CampoFormulario>

      {/* Sete campos curtos numa grade: a nota fiscal lista as retenções numa
          faixa, e empilhar sete linhas de formulário cheias afastaria o líquido
          do bruto, que é o par que a pessoa confere. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CAMPOS_RETENCAO.map((campo) => (
          <div key={campo} className="flex flex-col gap-1">
            <label
              htmlFor={`lan-${campo}`}
              className="text-legenda text-muted-foreground"
            >
              {ROTULO_RETENCAO[campo]}
            </label>
            <InputDecimal
              id={`lan-${campo}`}
              placeholder="0,00"
              className="tabular-nums text-right"
              disabled={desabilitado}
              value={valores[campo]}
              onChange={(evento) => mudar(campo, evento.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-detalhe">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Total retido</span>
          <MoneyText valor={total} className="text-detalhe" />
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">
            Líquido calculado (bruto menos retenções)
          </span>
          <MoneyText valor={calculado} className="text-detalhe font-medium" />
        </div>
        {/* A diferença só aparece quando existe. Um campo "diferença: R$ 0,00"
            fixo na tela treina a pessoa a ignorar a linha, e é justamente ela
            que precisa ser vista quando não é zero. */}
        {diferenca !== 0 ? (
          <div
            className={
              foraDaTolerancia
                ? "flex items-center justify-between gap-3 text-status-rejeitado"
                : "flex items-center justify-between gap-3 text-muted-foreground"
            }
          >
            <span className="inline-flex items-center gap-1.5">
              {foraDaTolerancia ? (
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              ) : null}
              {foraDaTolerancia
                ? "O valor informado não fecha com as retenções"
                : "Arredondamento do pagador"}
            </span>
            <span className="tabular-nums">
              {diferenca > 0 ? "+" : ""}
              {formatarBRL(diferenca)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
