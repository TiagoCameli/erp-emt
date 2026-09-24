import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Crown, Droplet, Gauge, Truck, Wallet, Wrench } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { dataHojeISO, formatarBRL } from "@/lib/formatadores";
import { abasVisiveis, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { BarraFiltrosCombustivel } from "@/modules/combustivel/_shared/components/barra-filtros-combustivel";
import { diasNoPeriodo, filtroGlobalDaUrl, pontasDoPeriodo } from "@/modules/combustivel/_shared/filtro-global";
import type { Periodo } from "@/modules/combustivel/relatorios/periodo";
import { hrefComRecorte } from "@/modules/combustivel/_shared/navegacao";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { ROTA_ANOMALIAS } from "@/modules/combustivel/anomalias/links";
import { autoGranularidade, tendencia } from "@/modules/combustivel/painel/calculo";
import { AvisoSentinela } from "@/modules/combustivel/painel/components/aviso-sentinela";
import { CartaoKpi, type DestaqueKpi, type VariacaoKpi } from "@/modules/combustivel/painel/components/cartao-kpi";
import {
  CustoPorFornecedor,
  CustoPorObra,
  EvolucaoTemporal,
  MixCombustivel,
  TopConsumidores,
} from "@/modules/combustivel/painel/components/graficos";
import { HeatmapDiaHora } from "@/modules/combustivel/painel/components/heatmap-dia-hora";
import { UltimosAbastecimentos } from "@/modules/combustivel/painel/components/ultimos-abastecimentos";
import { brlCompactoDe, litrosCompactos, porcento } from "@/modules/combustivel/painel/formato";
import { carregarPainel } from "@/modules/combustivel/painel/queries";

/**
 * A Visão Geral e a contagem de anomalias leem todas as saídas (o D3 e o D5 olham o
 * banco inteiro, como na origem), página por página: passa do teto padrão da Vercel.
 */
export const maxDuration = 60;

function numero(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** O `pickTrend` da origem: base anterior < 5 troca o % pela diferença absoluta. */
function variacaoComBase(
  delta: number,
  baseAnterior: number,
  diferenca: number,
  unidade: "litros" | "contagem",
): VariacaoKpi {
  const t = tendencia(delta, baseAnterior, diferenca);
  if (t.tipo === "percentual") return { tipo: "percentual", valor: t.valor, neutro: true };
  const sinal = t.valor > 0 ? "+" : "−";
  const corpo = unidade === "litros" ? formatarLitros(Math.abs(t.valor)) : numero(Math.abs(t.valor), 0);
  return { tipo: "absoluto", texto: `${sinal}${corpo}` };
}

function paramsDaUrl(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const url = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    for (const item of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) url.append(chave, item);
  }
  return url;
}

/** O link com o recorte e o período da tela; sem período, o destino também fica sem. */
function hrefComPeriodo(rota: string, url: URLSearchParams, periodo: Periodo | null, extra?: Record<string, string>) {
  const params = new URLSearchParams(hrefComRecorte(rota, url).split("?")[1] ?? "");
  const pontas = pontasDoPeriodo(periodo);
  if (pontas.de) params.set("de", pontas.de);
  else params.delete("de");
  if (pontas.ate) params.set("ate", pontas.ate);
  else params.delete("ate");
  for (const [chave, valor] of Object.entries(extra ?? {})) params.set(chave, valor);
  return `${rota}?${params.toString()}`;
}

/**
 * Visão Geral do Combustível, a da origem (v2/visao-geral/VisaoGeralTab) sobre o recorte
 * global (modo do topo + barra de filtros). Sem permissão de vê-la, a rota do módulo cai
 * na primeira aba que a pessoa pode ver (mesmo padrão de /manutencao).
 */
export default async function VisaoGeralCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) {
    const primeiraAba = abasVisiveis(usuario, "combustivel").find((aba) => aba.rota !== "/combustivel");
    if (!primeiraAba) notFound();
    redirect(primeiraAba.rota);
  }

  const params = await searchParams;
  const hoje = dataHojeISO();
  const filtro = filtroGlobalDaUrl(params);
  const url = paramsDaUrl(params);
  const veAnomalias = temPermissao(usuario, "combustivel.anomalias", "ver");

  const painel = await carregarPainel(filtro, hoje);
  const { kpis, sparks, anomalias } = painel;
  const vazio = kpis.qtdSaidas === 0;
  // Sem período fechado não há "anterior" de mesma duração: a variação some.
  const semVariacao = vazio || !painel.comparavel;
  const proprios = filtro.modo === "proprios";

  const linkAnomalias = veAnomalias ? hrefComPeriodo(ROTA_ANOMALIAS, url, filtro.periodo) : undefined;
  const linkAtribuir = veAnomalias ? hrefComPeriodo(ROTA_ANOMALIAS, url, filtro.periodo, { detector: "D1" }) : null;

  const destaqueAnomalias: DestaqueKpi = anomalias.criticas > 0 ? "perigo" : anomalias.atencao > 0 ? "atencao" : "sucesso";
  const detalheAnomalias =
    anomalias.total === 0
      ? "Nenhuma detectada"
      : [
          anomalias.criticas > 0 ? `${anomalias.criticas} crítica${anomalias.criticas > 1 ? "s" : ""}` : null,
          anomalias.atencao > 0 ? `${anomalias.atencao} atenção` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <>
      <BarraFiltrosCombustivel filtro={filtro} opcoes={painel.opcoes} />

      {proprios ? (
        <AvisoSentinela volumeTotal={kpis.volume} volumeSentinela={kpis.volumeSentinela} hrefAtribuir={linkAtribuir} />
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <CartaoKpi
            titulo="Volume total"
            icone={Droplet}
            valor={litrosCompactos(kpis.volume)}
            detalhe={vazio ? undefined : `${formatarLitros(kpis.volume)} no período`}
            variacao={semVariacao ? undefined : variacaoComBase(kpis.deltaVolume, kpis.qtdSaidasAnt, kpis.diffVolume, "litros")}
            spark={sparks.volume}
            dica="Soma de litros das saídas no período filtrado."
            vazio={vazio}
          />
          <CartaoKpi
            titulo="Custo total"
            icone={Wallet}
            valor={brlCompactoDe(kpis.custo)}
            detalhe={vazio ? undefined : <MoneyText valor={kpis.custo} />}
            variacao={semVariacao ? undefined : { tipo: "percentual", valor: kpis.deltaCusto, inverter: true }}
            spark={sparks.custo}
            dica="Soma do valor total das saídas no período. Alta de custo = vermelho."
            vazio={vazio}
          />
          <CartaoKpi
            titulo="R$/L médio"
            icone={Gauge}
            valor={`R$ ${numero(kpis.rPorL, 2)}`}
            detalhe={vazio ? undefined : "custo ÷ volume"}
            variacao={semVariacao || sparks.mediaRpL === 0 ? undefined : { tipo: "percentual", valor: kpis.deltaRpL, inverter: true }}
            spark={sparks.rPorL}
            dica={`Custo total ÷ volume total no período (${formatarBRL(kpis.custo)} ÷ ${formatarLitros(kpis.volume)}).`}
            vazio={vazio}
          />
          <CartaoKpi
            titulo={proprios ? "Equipamentos" : "Carretas"}
            icone={proprios ? Wrench : Truck}
            valor={numero(kpis.qtdConsumidores, 0)}
            detalhe={vazio ? undefined : proprios ? "abastecidos no período" : "placas distintas no período"}
            variacao={
              semVariacao
                ? undefined
                : variacaoComBase(kpis.deltaConsumidores, kpis.qtdConsumidoresAnt, kpis.diffConsumidores, "contagem")
            }
            dica={
              proprios
                ? "Quantidade distinta de equipamentos com pelo menos uma saída no período."
                : "Quantidade distinta de placas com pelo menos uma saída no período."
            }
            vazio={vazio}
          />
          <CartaoKpi
            titulo={proprios ? "Maior equipamento" : "Maior carreta"}
            icone={Crown}
            valor={painel.maior?.nome}
            detalhe={
              painel.maior
                ? [formatarLitros(kpis.maiorLitros), kpis.maiorPct > 0 ? porcento(kpis.maiorPct, 0) : null, painel.maior.detalhe]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
            dica={proprios ? "Equipamento com mais litros no período." : "Carreta (placa) com mais litros no período."}
            vazio={!painel.maior}
          />
          <CartaoKpi
            titulo="Anomalias"
            icone={AlertTriangle}
            valor={numero(anomalias.total, 0)}
            detalhe={detalheAnomalias}
            destaque={destaqueAnomalias}
            dica="Anomalias críticas e de atenção detectadas no período (D1-D4), sem as conferidas. D5 informativos não contam aqui."
            href={linkAnomalias}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EvolucaoTemporal
              evolucao={painel.evolucao}
              granularidadeInicial={autoGranularidade(painel.periodo.de, painel.periodo.ate)}
              vazio={vazio}
              filtro={filtro}
            />
          </div>
          <MixCombustivel fatias={painel.mix} filtro={filtro} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopConsumidores consumidores={painel.consumidores} filtro={filtro} hrefSentinela={linkAtribuir} />
          <CustoPorObra obras={painel.obras} filtro={filtro} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CustoPorFornecedor fornecedores={painel.fornecedores.linhas} media={painel.fornecedores.media} filtro={filtro} />
          {/* A origem só mostra o heatmap com 14+ dias: em recorte curto a grade fica quase vazia. */}
          {diasNoPeriodo(painel.periodo) >= 14 ? <HeatmapDiaHora dados={painel.heatmap} /> : <div className="hidden lg:block" />}
        </div>

        <UltimosAbastecimentos
          modo={filtro.modo}
          saidas={painel.ultimas}
          total={kpis.qtdSaidas}
          hrefVerTodos={hrefComPeriodo("/combustivel/abastecimentos", url, filtro.periodo)}
        />
      </div>
    </>
  );
}
