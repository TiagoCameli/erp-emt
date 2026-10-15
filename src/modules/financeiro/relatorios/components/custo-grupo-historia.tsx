import { MoneyText } from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";
import {
  itensComparaveis,
  maioresAltas,
  variacaoRelativa,
} from "@/modules/financeiro/relatorios/custo-grupo-comparacao";
import type { CustoPorGrupo } from "@/modules/financeiro/relatorios/queries";

/**
 * A história do Custo por grupo, acima da tabela: quanto foi, contra o período
 * anterior, o que mais subiu e o mês a mês. A tabela continua embaixo para
 * quem quer abrir grupo, subcategoria e insumo.
 */
export function CustoGrupoHistoria({
  custo,
  anterior,
  descricaoPeriodo,
  descricaoAnterior,
  serie,
}: {
  custo: CustoPorGrupo;
  /** Mesmo recorte no período anterior de mesmo tamanho; null se não houver. */
  anterior: CustoPorGrupo | null;
  descricaoPeriodo: string;
  descricaoAnterior: string | null;
  /** Custo total por mês do período; vazio quando o período não é fechado. */
  serie: { mes: string; total: number }[];
}) {
  const semInsumo = custo.grupos.find((g) => g.grupoId === null);
  const relativa = anterior ? variacaoRelativa(custo.total, anterior.total) : null;
  const altas = anterior
    ? maioresAltas(itensComparaveis(custo.grupos), itensComparaveis(anterior.grupos))
    : [];
  const maiorAlta = altas[0]?.variacao ?? 0;
  const maiorMes = Math.max(0, ...serie.map((m) => m.total));

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-4xl text-corpo text-foreground">
        {descricaoPeriodo}: custo de <strong className="font-semibold tabular-nums">{formatarBRL(custo.total)}</strong>
        {anterior && descricaoAnterior ? (
          relativa === null ? (
            <>, sem custo no período anterior ({descricaoAnterior.toLowerCase()})</>
          ) : (
            <>
              ,{" "}
              <strong className={cn("font-semibold tabular-nums", relativa > 0 && "text-chart-2")}>
                {formatarPercentual(Math.abs(relativa) * 100, 1)} {relativa >= 0 ? "acima" : "abaixo"}
              </strong>{" "}
              do período anterior ({descricaoAnterior.toLowerCase()}:{" "}
              <span className="tabular-nums">{formatarBRL(anterior.total)}</span>)
            </>
          )
        ) : null}
        .
        {semInsumo && custo.total > 0 ? (
          <>
            {" "}
            <span className="tabular-nums">{formatarPercentual((semInsumo.valor / custo.total) * 100, 1)}</span> é
            lançamento avulso, sem insumo de ordem de compra: a tabela abre essa linha por categoria financeira.
          </>
        ) : null}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {altas.length > 0 ? (
          <section aria-labelledby="custo-subiu" className="flex min-w-0 flex-col gap-2">
            <h3 id="custo-subiu" className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
              O que mais subiu
            </h3>
            <ul className="flex flex-col gap-2">
              {altas.map((a, i) => (
                <li
                  key={a.chave}
                  className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)_7.5rem]"
                  title={`${a.nome}: de ${formatarBRL(a.anterior)} para ${formatarBRL(a.atual)}`}
                >
                  <span className="min-w-0 truncate text-detalhe text-foreground">{a.nome}</span>
                  <BarraProporcional
                    valor={a.variacao}
                    maximo={maiorAlta}
                    ordem={i}
                    cor="bg-chart-2"
                    className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                  />
                  <span className="text-right text-detalhe font-medium tabular-nums text-foreground">
                    +{formatarBRL(a.variacao)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : anterior ? (
          <p className="text-detalhe text-muted-foreground">Nenhum grupo nem categoria subiu contra o período anterior.</p>
        ) : null}

        {serie.length > 1 ? (
          <section aria-labelledby="custo-mes-a-mes" className="flex min-w-0 flex-col gap-2">
            <h3 id="custo-mes-a-mes" className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
              Mês a mês
            </h3>
            <ul className="flex flex-col gap-1.5">
              {serie.map((m, i) => (
                <li key={m.mes} className="grid grid-cols-[4.5rem_minmax(0,1fr)_8.5rem] items-center gap-3">
                  <span className="text-detalhe text-muted-foreground">{rotuloMes(m.mes)}</span>
                  <BarraProporcional valor={m.total} maximo={maiorMes} ordem={i} cor="bg-chart-3" />
                  <MoneyText valor={m.total} className="text-right text-detalhe text-foreground" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
