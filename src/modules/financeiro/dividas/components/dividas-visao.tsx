import { GradeKpis, ItemGrade, KPICard, MoneyText } from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { VencimentosGrafico } from "@/modules/financeiro/dividas/components/vencimentos-grafico";
import type { PainelDividas } from "@/modules/financeiro/dividas/painel";
import { COR_ENTIDADE } from "@/modules/financeiro/relatorios/components/cores-grafico";
import { BarrasHorizontais } from "@/modules/gestao/components/barras-horizontais";

const SERIES_CREDOR = [
  { rotulo: "Principal", cor: COR_ENTIDADE.a_pagar },
  { rotulo: "Juros e encargos", cor: COR_ENTIDADE.juros_divida },
];

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * O painel do topo de Dívidas: a carteira inteira em seis números e dois
 * gráficos. Não segue o filtro de status da tabela de propósito: contrato
 * quitado não tem nada em aberto, então a carteira é a mesma com ou sem ele.
 */
export function DividasVisao({ painel }: { painel: PainelDividas }) {
  const economia = Math.max(0, Math.round((painel.aPagar - painel.quitacaoHoje) * 100) / 100);

  return (
    <div className="mb-6 flex flex-col gap-4">
      <GradeKpis id="financeiro.dividas.kpis" titulo="Dívidas">
        <KPICard
          titulo="Saldo devedor"
          valor={<MoneyText valor={painel.saldoDevedor} />}
          detalhe={`Principal em aberto de ${plural(painel.contratosAtivos, "contrato ativo", "contratos ativos")}`}
        />
        <KPICard
          titulo="A pagar no prazo"
          valor={<MoneyText valor={painel.aPagar} />}
          detalhe={`Principal mais ${formatarBRL(painel.jurosAPagar)} de juros e encargos`}
        />
        <KPICard
          titulo="Quitar hoje"
          valor={<MoneyText valor={painel.quitacaoHoje} />}
          detalhe={
            economia > 0
              ? `${formatarBRL(economia)} a menos que pagar no prazo`
              : "Parcelas em aberto a valor presente"
          }
        />
        <KPICard
          titulo="Vence em 12 meses"
          valor={<MoneyText valor={painel.vence12Meses} />}
          detalhe={
            painel.vence12MesesConsorcios > 0
              ? `Contratos ${formatarBRL(painel.vence12MesesContratos)} · consórcios ${formatarBRL(painel.vence12MesesConsorcios)}`
              : "O compromisso de caixa do próximo ano"
          }
        />
        <KPICard
          titulo="Em atraso"
          valor={<MoneyText valor={painel.atraso} />}
          detalhe={
            painel.parcelasEmAtraso > 0
              ? `${plural(painel.parcelasEmAtraso, "parcela vencida", "parcelas vencidas")} sem baixa no lançamento`
              : "Nenhuma parcela vencida em aberto"
          }
        />
        <KPICard
          titulo="Consórcios a pagar"
          valor={<MoneyText valor={painel.consorciosAPagar} />}
          detalhe={
            painel.consorciosDivida > 0
              ? `${formatarBRL(painel.consorciosDivida)} já é dívida (cotas contempladas)`
              : plural(painel.cotasEmAberto, "cota em aberto", "cotas em aberto")
          }
        />
      </GradeKpis>

      <GradeKpis id="financeiro.dividas.graficos" titulo="Gráficos de dívidas" vao="amplo">
        <ItemGrade titulo="O que vence pela frente" idCard="vencimentos" larguraPadrao={8}>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-corpo font-medium text-foreground">O que vence pela frente</h3>
              <p className="text-legenda text-muted-foreground">
                Prestações em aberto por mês de vencimento, com juros. Parcela vencida sem baixa fica na
                barra &quot;Em atraso&quot;.
                {painel.contratosSemCronograma > 0
                  ? ` ${plural(painel.contratosSemCronograma, "contrato sem cronograma fica", "contratos sem cronograma ficam")} de fora.`
                  : ""}
              </p>
            </div>
            <VencimentosGrafico meses={painel.meses} />
          </div>
        </ItemGrade>
        <ItemGrade titulo="Por credor" idCard="credores" larguraPadrao={4}>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-corpo font-medium text-foreground">Por credor</h3>
              <p className="text-legenda text-muted-foreground">
                Quanto falta pagar a cada banco: principal e juros em aberto.
              </p>
            </div>
            {painel.credores.length > 0 ? (
              <BarrasHorizontais
                series={SERIES_CREDOR}
                linhas={painel.credores.map((c) => ({
                  id: c.credor,
                  rotulo: c.credor,
                  emblema: plural(c.contratos, "contrato", "contratos"),
                  detalhe: `principal ${formatarBRL(c.principal)}`,
                  segmentos: [
                    { rotulo: "Principal", valor: c.principal, cor: COR_ENTIDADE.a_pagar },
                    { rotulo: "Juros e encargos", valor: c.juros, cor: COR_ENTIDADE.juros_divida },
                  ],
                }))}
              />
            ) : (
              <p className="text-detalhe text-muted-foreground">Nenhum contrato com saldo em aberto.</p>
            )}
          </div>
        </ItemGrade>
      </GradeKpis>
    </div>
  );
}
