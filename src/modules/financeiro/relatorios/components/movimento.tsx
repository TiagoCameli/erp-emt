"use client";

import * as React from "react";
import {
  animate,
  motion,
  MotionConfig,
  useInView,
  useReducedMotion,
} from "motion/react";

import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * O movimento dos relatórios, num lugar só, para todos falarem a mesma língua:
 *
 * - `Revelar`: o conteúdo de um relatório entra subindo de leve. Com `chave`,
 *   trocar de relatório refaz a entrada (o olho percebe que a tela mudou).
 * - `ValorAnimado`: o número do cartão conta até o valor. Mostra o valor final
 *   no servidor e para quem pediu menos movimento; só anima no navegador.
 * - `RevelarGrafico`: o gráfico aparece numa varredura da esquerda para a
 *   direita, na ordem em que o tempo corre no eixo. A animação do PRÓPRIO
 *   Recharts continua desligada (`SEM_ANIMACAO`): ela apagava as barras quando
 *   o container media zero no primeiro quadro. Aqui é só um recorte por CSS no
 *   container, que não mexe na medição.
 * - `BarraDivergente`: barra que sai do zero para a direita (positivo) ou para
 *   a esquerda (negativo), para resultado de obra, margem e saldo.
 *
 * Tudo dentro de `MotionConfig reducedMotion="user"`: quem marcou "reduzir
 * movimento" no sistema recebe a tela pronta.
 */

const SUAVE = [0.22, 1, 0.36, 1] as const;

export function Revelar({
  children,
  chave,
  atraso = 0,
  className,
}: {
  children: React.ReactNode;
  /** Muda quando o conteúdo é outro (o relatório aberto), para a entrada se repetir. */
  chave?: string;
  atraso?: number;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={chave}
        className={className}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: atraso, ease: SUAVE }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function ValorAnimado({
  valor,
  className,
  duracao = 0.9,
}: {
  valor: number;
  className?: string;
  duracao?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const visivel = useInView(ref, { once: true, amount: 0.6 });
  const reduzir = useReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !visivel || reduzir || valor === 0) return;
    const controle = animate(0, valor, {
      duration: duracao,
      ease: SUAVE,
      onUpdate: (atual) => {
        el.textContent = formatarBRL(Math.round(atual * 100) / 100);
      },
      // Termina SEMPRE no valor exato: o arredondamento do quadro intermediário
      // não pode ser o número que fica na tela.
      onComplete: () => {
        el.textContent = formatarBRL(valor);
      },
    });
    return () => controle.stop();
  }, [visivel, reduzir, valor, duracao]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {formatarBRL(valor)}
    </span>
  );
}

export function RevelarGrafico({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        // Termina num recorte MAIOR que o gráfico (-100% para todo lado), e não
        // em "inset(0)": o tooltip do Recharts sai da caixa quando o ponto está
        // na borda, e um recorte do tamanho exato o cortaria para sempre.
        initial={{ clipPath: "inset(0% 100% 0% 0%)" }}
        whileInView={{ clipPath: "inset(-100% -100% -100% -100%)" }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.9, ease: SUAVE }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function BarraDivergente({
  valor,
  maximo,
  ordem = 0,
  className,
}: {
  valor: number;
  /** O maior valor absoluto da lista: as duas metades usam a mesma régua. */
  maximo: number;
  ordem?: number;
  className?: string;
}) {
  const fracao = maximo > 0 ? Math.min(Math.abs(valor) / maximo, 1) : 0;
  const negativo = valor < 0;
  return (
    <MotionConfig reducedMotion="user">
      <span aria-hidden className={cn("relative block h-2.5 w-full", className)}>
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
        {fracao > 0 ? (
          <motion.span
            // Positivo em verde da marca, negativo em âmbar: verde e vermelho
            // lado a lado não se separam para quem não distingue as duas cores.
            className={cn(
              "absolute inset-y-0 rounded-[3px]",
              negativo ? "right-1/2 bg-chart-2" : "left-1/2 bg-chart-1",
            )}
            style={{
              width: `max(${fracao * 50}%, 2px)`,
              transformOrigin: negativo ? "right" : "left",
            }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: ordem * 0.05, duration: 0.5, ease: SUAVE }}
          />
        ) : null}
      </span>
    </MotionConfig>
  );
}

/**
 * Um traço já desenhado (barra empilhada, por exemplo) que cresce da esquerda
 * ao entrar na tela. Para componentes de servidor que montam a barra em HTML e
 * só querem o movimento por fora.
 */
export function CrescerDaEsquerda({
  children,
  ordem = 0,
  className,
}: {
  children: React.ReactNode;
  ordem?: number;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        style={{ transformOrigin: "left" }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: ordem * 0.05, duration: 0.5, ease: SUAVE }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
