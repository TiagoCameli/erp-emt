import { notFound } from "next/navigation";

import { EmptyState, GradeKpis, MoneyText } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { kpisObras, rankingObras, temPontosDeTendencia } from "@/modules/combustivel/analitico/calculo";
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
import { BarraFiltrosCombustivel } from "@/modules/combustivel/_shared/components/barra-filtros-combustivel";
import {
  aplicarFiltroGlobal,
  filtroGlobalDaUrl,
  periodoEfetivo,
  periodoFechado,
} from "@/modules/combustivel/_shared/filtro-global";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import { periodoAnterior } from "@/modules/combustivel/painel/calculo";
import { carregarOpcoesFiltroGlobal } from "@/modules/combustivel/painel/queries";

/** Lê todas as saídas (a base inteira, página por página): passa do teto padrão da Vercel. */
export const maxDuration = 60;

/**
 * Aba Obras: a ObrasTab da origem sobre o recorte modo + período. A obra da saída é a raiz
 * do centro de custo da alocação de MAIOR percentual (`obraDaSaida`), a saída inteira nela,
 * como a origem (que tinha uma obra por saída) e como o "Custo por obra" da Visão Geral.
 *
 * As linhas não têm link: a lista de Saídas não filtra pela obra-raiz da maior alocação,
 * então abriria outro total. Um drill que não fecha o número é pior que nenhum.
 */
export default async function PaginaObrasCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) notFound();

  const hoje = dataHojeISO();
  const filtro = filtroGlobalDaUrl(await searchParams);
  const [base, opcoes] = await Promise.all([carregarBaseCombustivel(), carregarOpcoesFiltroGlobal(filtro)]);

  // O filtro global nas duas listas: o mesmo nas duas, senão o delta compara recortes diferentes.
  const noPeriodo = aplicarFiltroGlobal(base.saidas, filtro);
  // Sem as duas pontas não existe "período anterior de mesma duração": os deltas somem em
  // vez de comparar com um vazio e mostrar +100%. `periodo` fecha as pontas abertas na
  // extensão dos dados, para os baldes das sparklines e do ranking.
  const comparavel = periodoFechado(filtro.periodo);
  const periodo = periodoEfetivo(filtro.periodo, noPeriodo, hoje);
  const doAnterior = comparavel ? aplicarFiltroGlobal(base.saidas, filtro, periodoAnterior(periodo.de, periodo.ate)) : [];

  const kpis = kpisObras(noPeriodo, doAnterior, periodo.de, periodo.ate);
  const linhas = rankingObras(noPeriodo, periodo.de, periodo.ate);
  const vazio = noPeriodo.length === 0;
  const nomeObra = (id: string) => base.obraNome.get(id) ?? id;

  return (
    <>
      <TituloAba titulo="Obras" descricao="Consumo e custo de combustível por obra no período" />

      <BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} ocultar={["fornecedores"]} />

      <GradeKpis className="mb-4">
        <KpiAnalitico
          titulo="Volume total"
          valor={formatarLitros(kpis.volume)}
          detalhe="no período"
          delta={comparavel ? kpis.deltaVolume : undefined}
          serie={kpis.sparkVolume}
          explicacao="Soma de litros das saídas no período (modo e filtros)."
          vazio={vazio}
        />
        <KpiAnalitico
          titulo="Custo total"
          valor={<MoneyText valor={kpis.custo} />}
          detalhe="no período"
          delta={comparavel ? kpis.deltaCusto : undefined}
          altaRuim
          serie={kpis.sparkCusto}
          explicacao="Soma do valor total das saídas no período. Alta de custo em vermelho."
          vazio={vazio}
        />
        <KpiAnalitico
          titulo="Obras ativas"
          valor={formatarContagem(kpis.qtdObras)}
          detalhe="com ao menos uma saída no período"
          delta={comparavel && kpis.chipObras.tipo === "percentual" ? kpis.chipObras.valor : undefined}
          diferenca={comparavel ? textoDiferenca(kpis.chipObras) : undefined}
          explicacao="Obras distintas com pelo menos uma saída no período."
          vazio={vazio}
        />
        <KpiAnalitico
          titulo="Top obra"
          valor={kpis.topObraId ? nomeObra(kpis.topObraId) : "—"}
          detalhe={
            kpis.topObraId
              ? [formatarLitros(kpis.topLitros), kpis.topPct > 0 ? `${formatarPct(kpis.topPct, 0)} do total` : null]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          explicacao="Obra com mais litros consumidos no período."
          vazio={!kpis.topObraId}
        />
      </GradeKpis>

      {linhas.length === 0 ? (
        <EmptyState titulo="Nenhuma obra com saída no período" descricao="Ajuste os filtros ou amplie o período" />
      ) : (
        <TabelaRanking
          titulo="Ranking de obras"
          subtitulo={`${plural(linhas.length, "obra", "obras")} com saída no período`}
          linhas={linhas}
          chave={(l) => l.id}
          cabecalhoNome="Obra"
          nome={(l) => nomeObra(l.id)}
          colunas={[
            { cabecalho: "Litros", celula: (l) => formatarLitros(l.litros) },
            { cabecalho: "Custo", celula: (l) => <MoneyText valor={l.custo} /> },
            { cabecalho: "R$/L", className: "text-muted-foreground", celula: (l) => formatarRPorL(l.rPorL) },
            { cabecalho: "Equip.", celula: (l) => l.qtdEquipamentos },
            {
              cabecalho: "% do total",
              alinhar: "esquerda",
              className: "w-44",
              celula: (l) => <BarraPercentual pct={l.pctTotal} />,
            },
            {
              cabecalho: "Tend.",
              alinhar: "esquerda",
              className: "w-20",
              celula: (l) => <CelulaTendencia serie={l.spark} suficiente={temPontosDeTendencia(l.spark)} />,
            },
          ]}
        />
      )}
    </>
  );
}
