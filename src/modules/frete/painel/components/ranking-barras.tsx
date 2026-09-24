"use client";

import type { ReactNode } from "react";

import { MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";

export interface ItemBarra {
  id: string;
  rotulo: string;
  valor: number;
  /** Texto pequeno abaixo do valor (ex.: "12 fretes · 340 t"). */
  detalhe?: ReactNode;
  /** Item agregado ("Outros"): cinza e sem clique. */
  agregado?: boolean;
}

export interface RankingBarrasProps {
  itens: ItemBarra[];
  /** Valor da dimensão escolhida no cross-filter; os outros esmaecem, como na origem. */
  selecionado?: string;
  /** Sem ele a lista é só leitura. */
  onAlternar?: (id: string) => void;
  vazio: string;
}

/**
 * Ranking em barras horizontais de HTML (o mesmo desenho de `BarrasHorizontais` do
 * painel de Gestão), com o clique do cross-filter da origem: clicar filtra o painel
 * inteiro pela entidade, clicar de novo desfaz.
 *
 * Uma cor só (a do verde da marca): o comprimento já carrega a grandeza e a cor segue a
 * entidade, nunca a posição. A barra mede contra o maior da lista.
 */
export function RankingBarras({ itens, selecionado, onAlternar, vazio }: RankingBarrasProps) {
  if (itens.length === 0) return <p className="py-6 text-center text-detalhe text-muted-foreground">{vazio}</p>;
  const maior = Math.max(...itens.map((i) => i.valor), 0);
  return (
    <ul className="space-y-2.5">
      {itens.map((item) => {
        const largura = maior === 0 ? 0 : (Math.max(item.valor, 0) / maior) * 100;
        const apagado = !!selecionado && selecionado !== item.id;
        const clicavel = !!onAlternar && !item.agregado;
        const conteudo = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-detalhe text-foreground">{item.rotulo}</span>
              <span className="shrink-0 text-right">
                <MoneyText valor={item.valor} className="block text-detalhe font-medium text-foreground" />
                {item.detalhe ? <span className="block text-legenda text-muted-foreground">{item.detalhe}</span> : null}
              </span>
            </span>
            <span className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${largura}%`,
                  backgroundColor: item.agregado ? "var(--color-status-rascunho)" : "var(--color-chart-1)",
                }}
              />
            </span>
          </>
        );
        return (
          <li key={item.id} className={cn(apagado && "opacity-40")}>
            {clicavel ? (
              <button
                type="button"
                onClick={() => onAlternar(item.id)}
                aria-pressed={selecionado === item.id}
                className="block w-full rounded-sm text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {conteudo}
              </button>
            ) : (
              <div>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
