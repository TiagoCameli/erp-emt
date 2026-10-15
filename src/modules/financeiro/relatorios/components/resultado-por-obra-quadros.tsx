import { MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { ROTULOS_MESES } from "@/modules/financeiro/relatorios/custos-indiretos";
import type { PonteObrasDre, LadoPonte } from "@/modules/financeiro/relatorios/ponte-obras-dre";
import { classeDoSinal, sinalDoResultado } from "@/modules/financeiro/relatorios/relatorios";
import type { LinhaObra } from "@/modules/financeiro/relatorios/resultado-por-obra";

/**
 * Peças do Resultado por obra que não precisam de estado: a matriz mês x obra
 * e a ponte com o DRE. Tabela HTML simples (não DataTable): são poucas linhas,
 * leitura em grade, sem ordenar nem esconder coluna.
 */

const CELULA = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

function Valor({ valor, forte }: { valor: number; forte?: boolean }) {
  if (Math.round(valor * 100) === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <MoneyText
      valor={valor}
      className={cn(classeDoSinal(sinalDoResultado(valor)), forte && "font-semibold")}
    />
  );
}

/**
 * O resultado de cada obra em cada mês do ano, com o indireto. É aqui que se vê
 * a medição chegando aos saltos: mês de medição positivo, mês sem medição
 * negativo, e a soma do ano na última coluna.
 */
export function MatrizResultadoObra({
  obras,
  meses,
  totalPorMes,
  totalAno,
}: {
  obras: readonly LinhaObra[];
  /** yyyy-MM, janeiro até o mês escolhido. */
  meses: readonly string[];
  totalPorMes: readonly number[];
  totalAno: number;
}) {
  const visiveis = obras.filter((o) => o.porMesDoAno.some((v) => Math.round(v * 100) !== 0));
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-detalhe">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Obra</th>
            {meses.map((m) => (
              <th key={m} className="px-2 py-1.5 text-right font-medium">
                {ROTULOS_MESES[Number(m.slice(5, 7)) - 1]}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">No ano</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((o) => (
            <tr key={o.centroId} className="border-t border-border">
              <th scope="row" className="max-w-56 truncate px-2 py-1.5 text-left font-normal text-foreground" title={o.nome}>
                {o.nome}
              </th>
              {o.porMesDoAno.map((v, i) => (
                <td key={meses[i]} className={CELULA}>
                  <Valor valor={v} />
                </td>
              ))}
              <td className={CELULA}>
                <Valor valor={o.ano.resultado} forte />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/40">
            <th scope="row" className="px-2 py-1.5 text-left font-semibold text-foreground">
              Obras
            </th>
            {totalPorMes.map((v, i) => (
              <td key={meses[i]} className={CELULA}>
                <Valor valor={v} forte />
              </td>
            ))}
            <td className={CELULA}>
              <Valor valor={totalAno} forte />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Lado({ titulo, lado, rotuloDre }: { titulo: string; lado: LadoPonte; rotuloDre: string }) {
  return (
    <table className="w-full text-detalhe">
      <caption className="pb-1 text-left font-medium text-foreground">{titulo}</caption>
      <tbody>
        <tr>
          <th scope="row" className="py-0.5 text-left font-normal text-muted-foreground">{rotuloDre}</th>
          <td className="py-0.5 text-right tabular-nums"><MoneyText valor={lado.dre} /></td>
        </tr>
        {lado.passos.map((p) => (
          <tr key={p.id}>
            <th scope="row" className="py-0.5 text-left font-normal text-muted-foreground">
              {p.valor < 0 ? "menos " : "mais "}
              {p.rotulo.charAt(0).toLowerCase() + p.rotulo.slice(1)}
            </th>
            <td className="py-0.5 text-right tabular-nums"><MoneyText valor={Math.abs(p.valor)} /></td>
          </tr>
        ))}
        {Math.round(lado.naoExplicado * 100) !== 0 ? (
          <tr>
            <th scope="row" className="py-0.5 text-left font-normal text-destructive">
              Diferença que os termos acima não explicam
            </th>
            <td className="py-0.5 text-right tabular-nums text-destructive"><MoneyText valor={lado.naoExplicado} /></td>
          </tr>
        ) : null}
        <tr className="border-t border-border">
          <th scope="row" className="py-0.5 text-left font-medium text-foreground">Nas obras (esta tela, antes do rateio)</th>
          <td className="py-0.5 text-right font-medium tabular-nums"><MoneyText valor={lado.obras} /></td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Como o custo e a receita desta tela fecham com o DRE no mesmo período. Sem
 * isso, a diferença entre as duas telas parece erro (ver ponte-obras-dre.ts).
 */
export function PonteObrasDreQuadro({ ponte, periodo }: { ponte: PonteObrasDre; periodo: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h3 className="text-corpo font-medium text-foreground">Como fecha com o DRE ({periodo})</h3>
      <p className="text-detalhe text-muted-foreground">
        Receita e custo aqui são os mesmos lançamentos do DRE, com outro recorte: só o que caiu numa obra ou nos
        centros indiretos, e com a despesa financeira da obra dentro do custo dela.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Lado titulo="Custo" lado={ponte.custo} rotuloDre="Despesas operacionais no DRE" />
        <Lado titulo="Receita" lado={ponte.receita} rotuloDre="Receita operacional líquida no DRE" />
      </div>
    </div>
  );
}
