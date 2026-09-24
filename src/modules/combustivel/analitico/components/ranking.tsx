import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { formatarPct } from "@/modules/combustivel/analitico/formato";

/**
 * As peças do ranking das abas analíticas da origem (ConsumidoresRankingTable,
 * ObrasRankingTable, FornecedoresRankingTable): a tabela, a barra de "% do total" e a
 * mini tendência. Sem estado: renderizam no servidor.
 */

/** Sparkline da origem em SVG puro. Uma série só, na cor primária do tema (a marca). */
export function Sparkline({ serie, largura = 64, altura = 20 }: { serie: readonly number[]; largura?: number; altura?: number }) {
  if (serie.length === 0) return null;
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const faixa = max - min || 1;
  const passo = serie.length > 1 ? largura / (serie.length - 1) : largura;
  const pontos = serie.map((v, i) => [i * passo, altura - ((v - min) / faixa) * altura] as const);
  const linha = pontos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${linha} L${pontos[pontos.length - 1]![0].toFixed(1)},${altura} L0,${altura} Z`;
  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      className="shrink-0 text-primary"
      aria-hidden="true"
      data-testid="sparkline"
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A barra de "% do total" da origem: largura mínima de 2% para a linha pequena não sumir.
 * Uma cor só (a barra compara grandeza, o comprimento já diz tudo); o grupo "Não
 * identificado" vai em âmbar, que é o aviso da origem para ele.
 */
export function BarraPercentual({ pct, aviso = false }: { pct: number; aviso?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", aviso ? "bg-emt-amarelo" : "bg-primary")}
          style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
        />
      </div>
      <span className="w-12 text-right text-legenda tabular-nums text-muted-foreground">{formatarPct(pct)}</span>
    </div>
  );
}

export interface ColunaRanking<T> {
  cabecalho: string;
  alinhar?: "esquerda" | "direita";
  className?: string;
  celula: (linha: T) => ReactNode;
}

export interface TabelaRankingProps<T> {
  titulo: string;
  subtitulo: string;
  linhas: readonly T[];
  chave: (linha: T) => string;
  /** Nome (primeira coluna de texto): com link quando `href` devolve um. */
  cabecalhoNome: string;
  nome: (linha: T) => ReactNode;
  meta?: (linha: T) => string | null;
  href?: (linha: T) => string | null;
  /** Linha hachurada (o "Não identificado" da origem). */
  destacar?: (linha: T) => boolean;
  colunas: readonly ColunaRanking<T>[];
}

const CELULA = "px-3 py-2";
const CABECALHO = "px-3 py-2 font-medium whitespace-nowrap";

/** A tabela de ranking da origem: posição, nome, as métricas, % do total e tendência. */
export function TabelaRanking<T>({
  titulo,
  subtitulo,
  linhas,
  chave,
  cabecalhoNome,
  nome,
  meta,
  href,
  destacar,
  colunas,
}: TabelaRankingProps<T>) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-corpo font-semibold">{titulo}</h3>
        <p className="text-detalhe text-muted-foreground">{subtitulo}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-detalhe">
          <thead className="bg-surface">
            <tr className="border-b border-border text-legenda uppercase tracking-wide text-muted-foreground">
              <th className={`${CABECALHO} w-10 text-right`}>#</th>
              <th className={`${CABECALHO} text-left`}>{cabecalhoNome}</th>
              {colunas.map((coluna) => (
                <th
                  key={coluna.cabecalho}
                  className={cn(CABECALHO, coluna.alinhar === "esquerda" ? "text-left" : "text-right", coluna.className)}
                >
                  {coluna.cabecalho}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, indice) => {
              const link = href?.(linha) ?? null;
              const detalhe = meta?.(linha) ?? null;
              const hachurada = destacar?.(linha) ?? false;
              return (
                <tr
                  key={chave(linha)}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface",
                    hachurada &&
                      "bg-[repeating-linear-gradient(45deg,var(--color-muted),var(--color-muted)_4px,transparent_4px,transparent_8px)]",
                  )}
                >
                  <td className={`${CELULA} text-right tabular-nums text-muted-foreground`}>{indice + 1}</td>
                  <td className={`${CELULA} max-w-72`}>
                    <div className={cn("truncate font-medium", hachurada && "text-status-pendente")}>
                      {link ? (
                        <Link href={link} className="hover:underline">
                          {nome(linha)}
                        </Link>
                      ) : (
                        nome(linha)
                      )}
                    </div>
                    {detalhe ? <div className="truncate text-legenda text-muted-foreground">{detalhe}</div> : null}
                  </td>
                  {colunas.map((coluna) => (
                    <td
                      key={coluna.cabecalho}
                      className={cn(CELULA, coluna.alinhar === "esquerda" ? "text-left" : "text-right tabular-nums", coluna.className)}
                    >
                      {coluna.celula(linha)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A célula "Tend." da origem: a série, ou "poucos pts" com menos de 4 dias com valor. */
export function CelulaTendencia({ serie, suficiente }: { serie: readonly number[]; suficiente: boolean }) {
  return suficiente ? <Sparkline serie={serie} /> : <span className="text-legenda italic text-muted-foreground">poucos pts</span>;
}
