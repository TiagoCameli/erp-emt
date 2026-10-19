"use client";

import * as React from "react";
import { motion, MotionConfig } from "motion/react";

import { MoneyText } from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  frasesDaPonte,
  type DegrauPonte,
  type PonteDoResultado,
} from "@/modules/financeiro/relatorios/ponte-do-resultado";

/** Patamar em asfalto, o que entra em verde, o que sai em âmbar (nunca vermelho: ver a memória do ΔE). */
const COR_DO_TIPO: Record<DegrauPonte["tipo"], string> = {
  total: "bg-chart-3",
  entrada: "bg-chart-1",
  saida: "bg-chart-2",
};

const ROTULO_DO_TIPO: Record<DegrauPonte["tipo"], string> = {
  total: "Patamar",
  entrada: "Entra",
  saida: "Sai",
};

/** Os patamares que fecham uma conta ganham peso: são o que a pessoa procura. */
const DESTAQUE = new Set(["receita-liquida", "resultado-periodo", "sobra"]);

/** Tempo entre um degrau e o próximo: a ponte se monta na ordem em que se lê. */
const PASSO_S = 0.07;

function Degrau({
  degrau,
  ordem,
  escala,
}: {
  degrau: DegrauPonte;
  ordem: number;
  escala: PonteDoResultado["escala"];
}) {
  const vao = escala.max - escala.min || 1;
  const esquerda = ((Math.min(degrau.de, degrau.ate) - escala.min) / vao) * 100;
  const largura = (Math.abs(degrau.ate - degrau.de) / vao) * 100;
  // A barra cresce a partir de onde o dinheiro estava: o que desce (saída, ou
  // patamar negativo saindo do zero) cresce da direita para a esquerda.
  const origem = degrau.valor < 0 ? "right" : "left";
  const destaque = DESTAQUE.has(degrau.id);
  const titulo = `${degrau.rotulo}: ${formatarBRL(degrau.valor)}${
    degrau.daReceita !== null
      ? ` (${formatarPercentual(degrau.daReceita * 100, 1)} da receita líquida)`
      : ""
  }`;

  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(10rem,15rem)_minmax(0,1fr)_9.5rem_3.5rem]"
      title={titulo}
    >
      <span
        className={cn(
          "truncate text-detalhe",
          destaque ? "font-semibold text-foreground" : "text-muted-foreground",
          degrau.tipo === "total" && !destaque && "font-medium text-foreground",
        )}
      >
        {degrau.rotulo}
      </span>
      <div className="relative col-span-2 h-5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {escala.min < 0 ? (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${((0 - escala.min) / vao) * 100}%` }}
          />
        ) : null}
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0.5 rounded-[3px]",
            COR_DO_TIPO[degrau.tipo],
            destaque && "inset-y-0",
          )}
          style={{
            left: `${esquerda}%`,
            width: `max(${largura}%, 2px)`,
            transformOrigin: origem,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            delay: ordem * PASSO_S,
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>
      <motion.span
        className="row-start-1 text-right sm:col-start-3"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: ordem * PASSO_S + 0.2, duration: 0.3 }}
      >
        <MoneyText
          valor={degrau.valor}
          className={cn(
            "text-detalhe",
            destaque ? "font-semibold" : "text-foreground",
            degrau.tipo === "total" && degrau.valor < 0 && "text-destructive",
          )}
        />
      </motion.span>
      <span className="hidden text-right text-legenda tabular-nums text-muted-foreground sm:block">
        {degrau.daReceita !== null ? formatarPercentual(degrau.daReceita * 100, 1) : ""}
      </span>
    </li>
  );
}

function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-legenda text-muted-foreground">
      {(["total", "entrada", "saida"] as const).map((tipo) => (
        <li key={tipo} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[2px]", COR_DO_TIPO[tipo])} />
          {ROTULO_DO_TIPO[tipo]}
        </li>
      ))}
      <li className="sm:ml-auto">% da receita líquida</li>
    </ul>
  );
}

/**
 * A ponte do resultado: da receita bruta ao resultado do período, degrau a
 * degrau, e depois para onde foi o resultado (investimento e mútuo).
 *
 * É a mesma conta da tabela abaixo contada em ordem de leitura. A tabela segue
 * sendo a fonte de todas as linhas e do drill; a ponte só mostra as maiores
 * despesas e junta o resto. As barras crescem em sequência com o `motion`, e
 * `reducedMotion="user"` as entrega prontas para quem pediu menos movimento ao
 * sistema.
 */
export function DrePonte({ ponte }: { ponte: PonteDoResultado }) {
  const frases = React.useMemo(
    () => frasesDaPonte(ponte, formatarBRL, (v) => formatarPercentual(v, 1)),
    [ponte],
  );
  let ordem = 0;

  return (
    <MotionConfig reducedMotion="user">
      <figure className="flex flex-col gap-4" aria-label="Ponte do resultado">
        {frases.resultado ? (
          <figcaption className="text-corpo text-foreground">{frases.resultado}</figcaption>
        ) : null}
        <Legenda />
        <ol className="flex flex-col gap-2">
          {ponte.resultado.map((degrau) => (
            <Degrau key={degrau.id} degrau={degrau} ordem={ordem++} escala={ponte.escala} />
          ))}
        </ol>
        {ponte.destino.length > 0 ? (
          <section className="flex flex-col gap-2 border-t border-dashed pt-4">
            <h3 className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
              Para onde foi o resultado
            </h3>
            {frases.destino ? (
              <p className="text-detalhe text-muted-foreground">
                {frases.destino} Nada disso é custo: máquina vira patrimônio
                e mútuo é dinheiro a receber.
              </p>
            ) : null}
            <ol className="flex flex-col gap-2">
              {ponte.destino.map((degrau) => (
                <Degrau key={degrau.id} degrau={degrau} ordem={ordem++} escala={ponte.escala} />
              ))}
            </ol>
          </section>
        ) : null}
      </figure>
    </MotionConfig>
  );
}
