"use client";

import { motion, MotionConfig } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Uma barra horizontal que mede `valor` contra `maximo` e cresce ao entrar na
 * tela, na `ordem` em que aparece. É o traço dos relatórios que contam uma
 * lista (prazo, fornecedor, obra) sem precisar de um gráfico inteiro: o rótulo
 * e o valor ficam em texto ao lado, a barra só dá o tamanho.
 *
 * `reducedMotion="user"` entrega a barra pronta para quem pediu menos
 * movimento ao sistema.
 */
export function BarraProporcional({
  valor,
  maximo,
  ordem = 0,
  cor = "bg-chart-1",
  className,
}: {
  valor: number;
  maximo: number;
  ordem?: number;
  /** Classe de fundo do traço (token de gráfico: bg-chart-1, bg-chart-2...). */
  cor?: string;
  className?: string;
}) {
  const fracao = maximo > 0 ? Math.min(Math.abs(valor) / maximo, 1) : 0;
  return (
    <MotionConfig reducedMotion="user">
      <span aria-hidden className={cn("relative block h-2.5 w-full", className)}>
        <motion.span
          className={cn("absolute inset-y-0 left-0 rounded-[3px]", cor)}
          style={{
            width: fracao > 0 ? `max(${fracao * 100}%, 2px)` : 0,
            transformOrigin: "left",
          }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ delay: ordem * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </span>
    </MotionConfig>
  );
}
