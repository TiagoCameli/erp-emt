"use client";

import * as React from "react";
import { motion, MotionConfig } from "motion/react";

import { MoneyText } from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  COR_ENTIDADE,
  ENTIDADE_DO_GRUPO,
} from "@/modules/financeiro/relatorios/components/cores-grafico";
import type {
  DegrauCaixa,
  PonteDoCaixa,
} from "@/modules/financeiro/relatorios/fluxo-caixa";

/** Tempo entre um degrau e o próximo: a ponte se monta na ordem em que se lê. */
const PASSO_S = 0.07;

/** Os patamares que fecham uma conta ganham peso: são o que a pessoa procura. */
const DESTAQUE = new Set(["geracao", "sobra"]);

/**
 * A cor do degrau é a do GRUPO, a mesma do gráfico logo abaixo: quem lê a ponte
 * e desce para o gráfico acha o CAPEX na mesma cor. Os totais ficam no tom do
 * texto, porque não são dinheiro de grupo nenhum.
 */
function corDoDegrau(degrau: DegrauCaixa): string {
  if (!degrau.grupo) return "var(--color-foreground)";
  return COR_ENTIDADE[ENTIDADE_DO_GRUPO[degrau.grupo]];
}

function Degrau({
  degrau,
  ordem,
  escala,
}: {
  degrau: DegrauCaixa;
  ordem: number;
  escala: PonteDoCaixa["escala"];
}) {
  const vao = escala.max - escala.min || 1;
  const esquerda = ((Math.min(degrau.de, degrau.ate) - escala.min) / vao) * 100;
  const largura = (Math.abs(degrau.ate - degrau.de) / vao) * 100;
  // A barra cresce a partir de onde o dinheiro estava: o que desce cresce da
  // direita para a esquerda.
  const origem = degrau.valor < 0 ? "right" : "left";
  const destaque = DESTAQUE.has(degrau.id);

  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(10rem,15rem)_minmax(0,1fr)_9.5rem]"
      title={`${degrau.rotulo}: ${formatarBRL(degrau.valor)}`}
    >
      <span
        className={cn(
          "truncate text-detalhe",
          destaque ? "font-semibold text-foreground" : "text-muted-foreground",
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
          className={cn("absolute rounded-[3px]", destaque ? "inset-y-0" : "inset-y-0.5")}
          style={{
            left: `${esquerda}%`,
            width: `max(${largura}%, 2px)`,
            transformOrigin: origem,
            backgroundColor: corDoDegrau(degrau),
            opacity: degrau.tipo === "total" ? 0.85 : 1,
          }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            delay: ordem * PASSO_S,
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>
      <span className="row-start-1 text-right sm:col-start-3">
        <MoneyText
          valor={degrau.valor}
          className={cn(
            "text-detalhe",
            destaque ? "font-semibold" : "text-foreground",
            degrau.tipo === "total" && degrau.valor < 0 && "text-destructive",
          )}
        />
      </span>
    </li>
  );
}

/**
 * A ponte do caixa: o que entrou e saiu da operação, a geração operacional, e
 * depois o que cada outro grupo levou ou trouxe até a sobra da janela. É a
 * mesma conta dos cartões e do gráfico, contada em ordem de leitura.
 *
 * `reducedMotion="user"` entrega as barras prontas para quem pediu menos
 * movimento ao sistema.
 */
export function FluxoCaixaPonte({
  ponte,
  frase,
}: {
  ponte: PonteDoCaixa;
  frase: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <figure className="flex flex-col gap-4" aria-label="Ponte do caixa">
        <figcaption className="text-corpo text-foreground">{frase}</figcaption>
        <ol className="flex flex-col gap-2">
          {ponte.degraus.map((degrau, ordem) => (
            <Degrau key={degrau.id} degrau={degrau} ordem={ordem} escala={ponte.escala} />
          ))}
        </ol>
      </figure>
    </MotionConfig>
  );
}
