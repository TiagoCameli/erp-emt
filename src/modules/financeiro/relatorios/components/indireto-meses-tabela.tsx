import Link from "next/link";

import { MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { MesDoIndireto } from "@/modules/financeiro/relatorios/indireto-por-mes";
import { ROTULO_STATUS_RATEIO } from "@/modules/financeiro/relatorios/rateio-indireto";
import { mesPorExtenso, nomeCurto } from "@/modules/financeiro/relatorios/resultado-por-obra";

/**
 * Os tokens de série dos gráficos, um por obra. A cor segue a OBRA, não a
 * posição no mês: a mesma obra tem a mesma cor em todas as linhas do ano.
 * O `--chart-5` (vermelho) fica de fora: aqui vermelho é "sem obra".
 */
const CORES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"] as const;
const COR_DEMAIS = "bg-muted-foreground/40";

/** A cor de cada obra no ano: as quatro que mais receberam ganham cor própria. */
export function coresDasObras(meses: readonly MesDoIndireto[]): Map<string, string> {
  const total = new Map<string, { centro: string; cent: number }>();
  for (const m of meses) {
    for (const o of m.obras) {
      const atual = total.get(o.centroId) ?? { centro: o.centro, cent: 0 };
      atual.cent += Math.round(o.indireto * 100);
      total.set(o.centroId, atual);
    }
  }
  return new Map(
    [...total.entries()]
      .sort(([, a], [, b]) => b.cent - a.cent || a.centro.localeCompare(b.centro, "pt-BR"))
      .map(([id], i) => [id, CORES[i] ?? COR_DEMAIS]),
  );
}

/** "009 58% · 007 24% · +2 · sem obra", sem separador sobrando quando falta parte. */
export function legendaDaReparticao(mes: MesDoIndireto): string {
  const partes = mes.obras.slice(0, 3).map((o) => `${nomeCurto(o.centro)} ${formatarPercentual(o.pct, 0)}`);
  if (mes.obras.length > 3) partes.push(`+${mes.obras.length - 3}`);
  if (mes.naoRateado > 0) partes.push(mes.obras.length === 0 ? "tudo sem obra" : "sem obra");
  return partes.join(" · ");
}

function Reparticao({ mes, cores }: { mes: MesDoIndireto; cores: ReadonlyMap<string, string> }) {
  if (mes.total === 0) return <span className="text-muted-foreground">—</span>;
  const naoRateadoPct = mes.total === 0 ? 0 : (mes.naoRateado / mes.total) * 100;
  return (
    <div className="flex min-w-48 flex-col gap-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded-[3px] bg-muted" aria-hidden>
        {mes.obras.map((o) => (
          <span key={o.centroId} className={cores.get(o.centroId) ?? COR_DEMAIS} style={{ width: `${o.pct}%` }} />
        ))}
        {naoRateadoPct > 0 ? <span className="bg-destructive/60" style={{ width: `${naoRateadoPct}%` }} /> : null}
      </div>
      <span className="text-legenda text-muted-foreground">{legendaDaReparticao(mes)}</span>
    </div>
  );
}

/**
 * Uma linha por mês: quanto foi o indireto, como foi repartido, a categoria que
 * mais pesou e o estado do rateio. O mês aberto ganha destaque e o detalhe
 * (categorias e o ajuste dos percentuais) aparece logo abaixo da tabela.
 */
export function IndiretoMesesTabela({
  meses,
  aberto,
  href,
  mesCorrente,
}: {
  meses: readonly MesDoIndireto[];
  /** yyyy-MM do mês com o detalhe aberto. */
  aberto: string;
  href: (mes: string) => string;
  /** yyyy-MM: mês depois dele é previsto. */
  mesCorrente: string;
}) {
  const cores = coresDasObras(meses);
  const totalAno = meses.reduce((s, m) => s + Math.round(m.total * 100), 0) / 100;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-detalhe">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Mês</th>
            <th className="px-2 py-1.5 text-right font-medium">Indireto</th>
            <th className="px-2 py-1.5 text-left font-medium">Como foi repartido</th>
            <th className="px-2 py-1.5 text-left font-medium">Categoria que mais pesou</th>
            <th className="px-2 py-1.5 text-left font-medium">Rateio</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => {
            const maior = m.categorias[0];
            const ativo = m.mes === aberto;
            return (
              <tr key={m.mes} className={cn("border-t border-border", ativo && "bg-muted/50")}>
                <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">
                  <Link className="text-primary hover:underline" href={href(m.mes)} aria-current={ativo ? "true" : undefined}>
                    {mesPorExtenso(m.mes)}
                  </Link>
                  {m.mes > mesCorrente ? <span className="ml-1 text-muted-foreground">(previsto)</span> : null}
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <MoneyText valor={m.total} />
                </td>
                <td className="px-2 py-1.5">
                  <Reparticao mes={m} cores={cores} />
                </td>
                <td className="px-2 py-1.5">
                  {maior ? (
                    <span>
                      {maior.categoria} <MoneyText valor={maior.total} />{" "}
                      <span className="text-muted-foreground">({formatarPercentual(maior.pct, 0)})</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {m.indiretoAcimaDoDireto.length > 0 ? (
                    <span className="block text-legenda text-destructive">
                      {m.indiretoAcimaDoDireto.map((o) => nomeCurto(o.centro)).join(", ")}{" "}
                      {m.indiretoAcimaDoDireto.length === 1 ? "recebe" : "recebem"} mais indireto que o próprio custo direto
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Link className="text-primary hover:underline" href={href(m.mes)}>
                    {ROTULO_STATUS_RATEIO[m.status].split(" (")[0]}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/40">
            <th scope="row" className="px-2 py-1.5 text-left font-semibold">No ano</th>
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
              <MoneyText valor={totalAno} />
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
