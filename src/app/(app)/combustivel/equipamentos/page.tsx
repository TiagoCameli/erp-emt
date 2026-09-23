import { notFound } from "next/navigation";

import { EmptyState, GradeKpis, MoneyText } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import {
  ID_NAO_IDENTIFICADO,
  kpisConsumidores,
  rankingConsumidores,
  temPontosDeTendencia,
  type LinhaConsumidor,
} from "@/modules/combustivel/analitico/calculo";
import { KpiAnalitico } from "@/modules/combustivel/analitico/components/kpi-analitico";
import { BarraPercentual, CelulaTendencia, TabelaRanking } from "@/modules/combustivel/analitico/components/ranking";
import {
  formatarContagem,
  formatarLitros,
  formatarPct,
  formatarRPorL,
  plural,
  textoDiferenca,
} from "@/modules/combustivel/analitico/formato";
import { linkSaidasDoConsumidor } from "@/modules/combustivel/analitico/links";
import { recorteDaUrl } from "@/modules/combustivel/analitico/recorte";
import { saidasDoRecorte } from "@/modules/combustivel/anomalias/base";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";

/** Lê todas as saídas (a base inteira, página por página): passa do teto padrão da Vercel. */
export const maxDuration = 60;

const ROTULO_SENTINELA = "Não identificado";

/**
 * Aba Equipamentos (modo próprios) / Carretas (modo carretas): a ConsumidoresTab da
 * origem. Linha de KPIs e o ranking de todos os consumidores do recorte; cada linha abre a
 * lista de Saídas com o mesmo recorte.
 */
export default async function PaginaEquipamentosCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) notFound();
  const veSaidas = temPermissao(usuario, "combustivel.saidas", "ver");

  const params = await searchParams;
  const { modo, periodo, anterior } = recorteDaUrl(params, dataHojeISO());
  const base = await carregarBaseCombustivel();

  // BARRA-FILTROS-GLOBAL: aplicar aqui o filtro global sobre as duas listas (o mesmo
  // filtro nas duas, senão o delta compara recortes diferentes). Os cálculos abaixo
  // recebem a lista pronta e não mudam.
  const noPeriodo = saidasDoRecorte(base.saidas, modo, periodo.de, periodo.ate);
  const doAnterior = saidasDoRecorte(base.saidas, modo, anterior.de, anterior.ate);

  const proprios = modo === "proprios";
  const kpis = kpisConsumidores(noPeriodo, doAnterior, modo, periodo.de, periodo.ate);
  const linhas = rankingConsumidores(noPeriodo, modo, periodo.de, periodo.ate);
  const vazio = noPeriodo.length === 0;

  const equipamentoPorId = new Map(base.equipamentos.map((e) => [e.id, e]));
  const sentinelas = base.equipamentos.filter((e) => e.sentinela).map((e) => e.id);
  const nome = (linha: Pick<LinhaConsumidor, "id" | "sentinela">): string =>
    linha.sentinela ? ROTULO_SENTINELA : proprios ? (equipamentoPorId.get(linha.id)?.descricao ?? linha.id) : linha.id;
  const meta = (linha: LinhaConsumidor): string | null => {
    if (linha.sentinela) return `${plural(linha.qtdSaidas, "saída", "saídas")} sem equipamento`;
    if (proprios) {
      const equipamento = equipamentoPorId.get(linha.id);
      return equipamento?.codigo?.trim() || equipamento?.tipo?.trim() || null;
    }
    return linha.transportadoraId ? (base.transportadoraNome.get(linha.transportadoraId) ?? null) : null;
  };

  const top = linhas.find((l) => l.id === kpis.topChave) ?? null;
  const topSentinela = kpis.topChave === ID_NAO_IDENTIFICADO;
  const rotulo = proprios ? "Equipamentos" : "Carretas";

  return (
    <>
      <TituloAba
        titulo={rotulo}
        descricao={
          proprios
            ? "Consumo por equipamento próprio no período"
            : "Consumo por carreta de transportadora (placa) no período"
        }
      />

      {/* BARRA-FILTROS-GLOBAL: a barra entra aqui, acima dos KPIs. */}

      {vazio ? (
        <EmptyState
          titulo={proprios ? "Nenhuma saída de equipamento próprio no período" : "Nenhuma saída de carreta no período"}
          descricao="Ajuste o período ou os filtros"
        />
      ) : (
        <>
          <GradeKpis className="mb-4">
            <KpiAnalitico
              titulo="Volume total"
              valor={formatarLitros(kpis.volume)}
              detalhe="no período"
              delta={kpis.deltaVolume}
              serie={kpis.sparkVolume}
              explicacao="Soma de litros das saídas no período (modo e filtros)."
            />
            <KpiAnalitico
              titulo="Custo total"
              valor={<MoneyText valor={kpis.custo} />}
              detalhe="no período"
              delta={kpis.deltaCusto}
              altaRuim
              serie={kpis.sparkCusto}
              explicacao="Soma do valor total das saídas no período. Alta de custo em vermelho."
            />
            <KpiAnalitico
              titulo={proprios ? "Equipamentos ativos" : "Carretas ativas"}
              valor={formatarContagem(kpis.qtdConsumidores)}
              detalhe={
                proprios && kpis.qtdSentinela > 0
                  ? `+${plural(kpis.qtdSentinela, "saída", "saídas")} sem ID`
                  : "no período"
              }
              delta={kpis.chipConsumidores.tipo === "percentual" ? kpis.chipConsumidores.valor : undefined}
              diferenca={textoDiferenca(kpis.chipConsumidores)}
              explicacao={
                proprios
                  ? "Equipamentos cadastrados distintos com pelo menos uma saída no período. Saídas sem identificação (Outros) não entram no total."
                  : "Placas distintas com pelo menos uma saída no período."
              }
            />
            <KpiAnalitico
              titulo={proprios ? "Top equipamento" : "Top carreta"}
              valor={
                top ? (
                  <span className={topSentinela ? "text-status-pendente" : undefined}>{nome(top)}</span>
                ) : (
                  "—"
                )
              }
              detalhe={
                top
                  ? [
                      formatarLitros(kpis.topLitros),
                      kpis.topPct > 0 ? `${formatarPct(kpis.topPct, 0)} do total` : null,
                      topSentinela ? null : meta(top),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined
              }
              explicacao={
                topSentinela
                  ? 'O maior consumidor é o grupo "Não identificado": atribuir as saídas vai mudar este número.'
                  : "Consumidor com mais litros no período."
              }
              vazio={!top}
            />
          </GradeKpis>

          <TabelaRanking
            titulo={proprios ? "Ranking de equipamentos" : "Ranking de carretas"}
            subtitulo={`${plural(linhas.length, proprios ? "equipamento" : "placa", proprios ? "equipamentos" : "placas")} no período${veSaidas ? " · o nome abre as saídas do recorte" : ""}${proprios ? " · linha hachurada = atribuir" : ""}`}
            linhas={linhas}
            chave={(l) => l.id}
            cabecalhoNome={proprios ? "Equipamento" : "Placa"}
            nome={(l) => (proprios || l.sentinela ? nome(l) : <span className="font-mono">{l.id}</span>)}
            meta={meta}
            href={veSaidas ? (l) => linkSaidasDoConsumidor(l.id, { modo, de: periodo.de, ate: periodo.ate }, sentinelas, params) : undefined}
            destacar={(l) => l.sentinela}
            colunas={[
              { cabecalho: "Litros", celula: (l) => formatarLitros(l.litros) },
              { cabecalho: "Custo", celula: (l) => <MoneyText valor={l.custo} /> },
              { cabecalho: "R$/L", className: "text-muted-foreground", celula: (l) => formatarRPorL(l.rPorL) },
              { cabecalho: "Saídas", celula: (l) => l.qtdSaidas },
              {
                cabecalho: "% do total",
                alinhar: "esquerda",
                className: "w-44",
                celula: (l) => <BarraPercentual pct={l.pctTotal} aviso={l.sentinela} />,
              },
              {
                cabecalho: "Tend.",
                alinhar: "esquerda",
                className: "w-20",
                celula: (l) => <CelulaTendencia serie={l.spark} suficiente={temPontosDeTendencia(l.spark)} />,
              },
            ]}
          />
        </>
      )}
    </>
  );
}
