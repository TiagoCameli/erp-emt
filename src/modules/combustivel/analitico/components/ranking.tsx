import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  TabelaRankingCliente,
  type ColunaRankingCliente,
  type LinhaRankingCliente,
} from "@/modules/combustivel/analitico/components/ranking-tabela";
import { formatarPct } from "@/modules/combustivel/analitico/formato";

/**
 * As peças do ranking das abas analíticas da origem (ConsumidoresRankingTable,
 * ObrasRankingTable, FornecedoresRankingTable): a tabela, a barra de "% do total" e a
 * mini tendência. Sem estado: renderizam no servidor (a tabela em si é a DataTable,
 * em `ranking-tabela.tsx`).
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

/**
 * Id da tabela pela página: cada ranking tem as suas colunas, e o id é o que separa a
 * largura e a ordem salvas de um e de outro ("Equipamento", "Placa", "Obra",
 * "Fornecedor" viram `combustivel.ranking.equipamento` e assim por diante).
 */
export function idTabelaRanking(cabecalhoNome: string): string {
  const slug = cabecalhoNome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `combustivel.ranking.${slug}`;
}

/**
 * A tabela de ranking da origem: posição, nome, as métricas, % do total e tendência.
 *
 * Roda no servidor: as funções das páginas (nome, link, célula de cada métrica) são
 * chamadas aqui, e só o resultado já renderizado vai para a DataTable no cliente.
 */
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
  const linhasCliente: LinhaRankingCliente[] = linhas.map((linha, indice) => {
    const link = href?.(linha) ?? null;
    return {
      chave: chave(linha),
      posicao: indice + 1,
      nome: link ? (
        <Link href={link} className="hover:underline">
          {nome(linha)}
        </Link>
      ) : (
        nome(linha)
      ),
      detalhe: meta?.(linha) ?? null,
      hachurada: destacar?.(linha) ?? false,
      celulas: colunas.map((coluna) => coluna.celula(linha)),
    };
  });
  const colunasCliente: ColunaRankingCliente[] = colunas.map(({ cabecalho, alinhar, className }) => ({
    cabecalho,
    alinhar,
    className,
  }));

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-corpo font-semibold">{titulo}</h3>
        <p className="text-detalhe text-muted-foreground">{subtitulo}</p>
      </header>
      <div className="p-3">
        <TabelaRankingCliente
          idTabela={idTabelaRanking(cabecalhoNome)}
          cabecalhoNome={cabecalhoNome}
          colunas={colunasCliente}
          linhas={linhasCliente}
        />
      </div>
    </section>
  );
}

/** A célula "Tend." da origem: a série, ou "poucos pts" com menos de 4 dias com valor. */
export function CelulaTendencia({ serie, suficiente }: { serie: readonly number[]; suficiente: boolean }) {
  return suficiente ? <Sparkline serie={serie} /> : <span className="text-legenda italic text-muted-foreground">poucos pts</span>;
}
