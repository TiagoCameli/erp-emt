import Link from "next/link";
import type { ReactNode } from "react";

import { MoneyText } from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

/**
 * Lista de barras horizontais em HTML puro: rótulo em cima, barra embaixo,
 * valor à direita.
 *
 * Substituiu o `BarChart layout="vertical"` do Recharts nos blocos de ranking, e
 * o motivo é o nome: "Manutenção/Documentação de Equipamentos" e "009 -
 * Manutenção da Rodovia BR-364/AC - Lote 09 & 10" não cabem num eixo Y de
 * 150px, e o eixo cortava justamente a parte que distingue uma linha da outra.
 * Com o rótulo numa linha própria, de largura inteira, ele cabe.
 *
 * Sem biblioteca porque não há nada aqui que precise de uma: é uma div com
 * largura percentual. E sendo componente de servidor, não custa nada no bundle
 * da primeira tela depois do login.
 *
 * ## Como a barra mede
 *
 * Contra o MAIOR total da lista, não contra a soma. A pergunta destes blocos é
 * "quem é grande perto de quem", e medir contra a soma faria a barra do maior
 * item encolher só porque a lista tem mais linhas — o mesmo dado desenhando
 * gráficos diferentes conforme o corte.
 *
 * ## Cor
 *
 * A cor vem da ENTIDADE (o que o segmento significa), nunca da posição no
 * ranking. Cor por posição não informa nada e muda de linha quando o filtro
 * muda, fazendo parecer que o dado mudou. Quem tem duas séries manda `legenda`:
 * identidade nunca pode depender só da cor.
 */

export interface SegmentoBarra {
  /** Nome da série, para a legenda e para o `title` da linha. */
  rotulo: string;
  valor: number;
  /** Token de cor do design system (`var(--color-chart-N)`). */
  cor: string;
}

export interface LinhaBarra {
  id: string;
  rotulo: string;
  /** Os pedaços da barra, empilhados na ordem em que vêm. */
  segmentos: SegmentoBarra[];
  /** Chip discreto ao lado do rótulo (ex.: "5 parcelas"). */
  emblema?: string;
  /** Texto pequeno abaixo do valor (ex.: "42% do período"). */
  detalhe?: ReactNode;
  /** Deixa a linha clicável, para a tela que mostra o mesmo número. */
  href?: string;
}

/** Soma dos segmentos: é ela que a barra mede e o número que aparece à direita. */
function totalDa(linha: LinhaBarra): number {
  return linha.segmentos.reduce((soma, s) => soma + s.valor, 0);
}

/** Legenda de série, sempre presente quando há mais de uma. */
function Legenda({ series }: { series: SegmentoBarra[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((serie) => (
        <span
          key={serie.rotulo}
          className="flex items-center gap-1.5 text-legenda text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: serie.cor }}
          />
          {serie.rotulo}
        </span>
      ))}
    </div>
  );
}

export interface BarrasHorizontaisProps {
  linhas: LinhaBarra[];
  /**
   * As séries, na ordem da pilha. Com duas ou mais vira legenda; com uma só o
   * título do bloco já diz o que a barra é, e a caixinha seria ruído.
   */
  series?: SegmentoBarra[];
}

export function BarrasHorizontais({ linhas, series }: BarrasHorizontaisProps) {
  const maior = Math.max(...linhas.map(totalDa), 0);

  return (
    <div>
      {series !== undefined && series.length > 1 ? (
        <Legenda series={series} />
      ) : null}

      <ul className="space-y-3">
        {linhas.map((linha) => {
          const total = totalDa(linha);
          // Barra de valor zero não desenha nada, e é isso mesmo: a linha
          // continua na lista com o rótulo e o R$ 0,00, dizendo que existe e
          // não movimentou.
          const larguraDaLinha = maior === 0 ? 0 : (total / maior) * 100;

          const conteudo = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-detalhe text-foreground">
                    {linha.rotulo}
                  </span>
                  {linha.emblema ? (
                    <span className="shrink-0 rounded border border-border px-1.5 py-px text-legenda uppercase tracking-wide text-muted-foreground">
                      {linha.emblema}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <MoneyText
                    valor={total}
                    className="block text-detalhe font-medium text-foreground"
                  />
                  {linha.detalhe ? (
                    <span className="block text-legenda text-muted-foreground">
                      {linha.detalhe}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* O trilho cinza dá a escala mesmo para a linha pequena: sem ele,
                  uma barra de 2% fica sem referência do que seria 100%. */}
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="flex h-full gap-[2px] rounded-full"
                  style={{ width: `${larguraDaLinha}%` }}
                >
                  {linha.segmentos.map((segmento) => (
                    <span
                      key={segmento.rotulo}
                      // A fatia mede contra o total DA LINHA, e o `gap` de 2px
                      // entre os pedaços é o que impede duas cores encostadas de
                      // lerem como uma só.
                      style={{
                        backgroundColor: segmento.cor,
                        width:
                          total === 0
                            ? "0%"
                            : `${(segmento.valor / total) * 100}%`,
                      }}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                    />
                  ))}
                </div>
              </div>
            </>
          );

          const titulo = linha.segmentos
            .map((s) => `${s.rotulo}: ${formatarBRL(s.valor)}`)
            .join(" · ");

          return (
            <li key={linha.id} title={titulo}>
              {linha.href ? (
                <Link
                  href={linha.href}
                  className={cn(
                    "block rounded-sm",
                    "hover:[&_span]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2",
                  )}
                >
                  {conteudo}
                </Link>
              ) : (
                conteudo
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
