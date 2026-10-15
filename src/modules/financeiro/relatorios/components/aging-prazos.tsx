import { MoneyText } from "@/components/canonicos";
import type { PrazoFaixa } from "@/modules/financeiro/relatorios/calculo";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";

function Lado({
  titulo,
  vencido,
  prazos,
  maximo,
  cor,
}: {
  titulo: string;
  vencido: number;
  prazos: PrazoFaixa[];
  maximo: number;
  cor: string;
}) {
  const linhas = [{ rotulo: "Vencido", valor: vencido, chave: "vencido" }].concat(
    prazos.map((p) => ({ rotulo: p.rotulo, valor: p.valor, chave: p.prazo })),
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-detalhe font-semibold uppercase tracking-wide text-foreground">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-2">
        {linhas.map((linha, i) => (
          <li
            key={linha.chave}
            className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_8.5rem] items-center gap-3"
          >
            <span className="truncate text-detalhe text-muted-foreground">{linha.rotulo}</span>
            <BarraProporcional
              valor={linha.valor}
              maximo={maximo}
              ordem={i}
              cor={linha.chave === "vencido" ? "bg-destructive" : cor}
            />
            <MoneyText
              valor={linha.valor}
              className={
                linha.chave === "vencido" && linha.valor > 0
                  ? "text-right text-detalhe font-medium text-destructive"
                  : "text-right text-detalhe text-foreground"
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A agenda do que está em aberto: vencido e o a vencer por prazo, dos dois
 * lados. A mesma régua para os dois, para o tamanho das barras se comparar.
 */
export function AgingPrazos({
  vencidoAPagar,
  vencidoAReceber,
  prazosAPagar,
  prazosAReceber,
}: {
  vencidoAPagar: number;
  vencidoAReceber: number;
  prazosAPagar: PrazoFaixa[];
  prazosAReceber: PrazoFaixa[];
}) {
  const maximo = Math.max(
    vencidoAPagar,
    vencidoAReceber,
    ...prazosAPagar.map((p) => p.valor),
    ...prazosAReceber.map((p) => p.valor),
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Lado titulo="A pagar" vencido={vencidoAPagar} prazos={prazosAPagar} maximo={maximo} cor="bg-chart-2" />
      <Lado titulo="A receber" vencido={vencidoAReceber} prazos={prazosAReceber} maximo={maximo} cor="bg-chart-1" />
    </div>
  );
}
