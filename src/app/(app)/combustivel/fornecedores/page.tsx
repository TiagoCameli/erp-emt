import { notFound } from "next/navigation";

import { EmptyState, GradeKpis, MoneyText } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import {
  kpisFornecedores,
  MINIMO_PONTOS_TENDENCIA,
  rankingFornecedores,
} from "@/modules/combustivel/analitico/calculo";
import { KpiAnalitico } from "@/modules/combustivel/analitico/components/kpi-analitico";
import { BarraPercentual, CelulaTendencia, TabelaRanking } from "@/modules/combustivel/analitico/components/ranking";
import {
  formatarContagem,
  formatarLitros,
  formatarRPorL,
  plural,
  textoDiferenca,
} from "@/modules/combustivel/analitico/formato";
import { carregarEntradasAnaliticas } from "@/modules/combustivel/analitico/queries";
import { BarraFiltrosCombustivel } from "@/modules/combustivel/_shared/components/barra-filtros-combustivel";
import {
  aplicarFiltroGlobalEntradas,
  filtroGlobalDaUrl,
  opcoesDoFiltroGlobal,
  periodoEfetivo,
  periodoFechado,
  type DimensaoFiltro,
} from "@/modules/combustivel/_shared/filtro-global";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import { periodoAnterior } from "@/modules/combustivel/painel/calculo";

/** Mesmo teto das outras abas analíticas (lê todas as entradas, página por página). */
export const maxDuration = 60;

/** Entrada não tem consumidor, obra nem operador: só período, combustível, fornecedor e tanque filtram. */
const OCULTAR_EM_ENTRADAS: readonly DimensaoFiltro[] = ["obras", "equipamentos", "transportadoras", "placas", "operadores"];

/**
 * Aba Fornecedores: a FornecedoresTab da origem, sobre as ENTRADAS (compras). Não depende
 * do modo: entrada não tem consumidor, como na origem (a aba aparece nos dois modos).
 *
 * As linhas não têm link: a lista de Entradas ainda não lê fornecedor nem período da URL.
 */
export default async function PaginaFornecedoresCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "combustivel.painel", "ver")) notFound();

  const hoje = dataHojeISO();
  const filtro = filtroGlobalDaUrl(await searchParams);
  // A base dá os nomes de tanque e combustível das opções da barra (é a mesma leitura cacheada das outras abas).
  const [entradas, base] = await Promise.all([carregarEntradasAnaliticas(), carregarBaseCombustivel()]);
  const opcoes = opcoesDoFiltroGlobal(base, entradas, filtro);

  // Das chaves globais, só período, combustível, fornecedor e tanque valem para entradas (como na origem).
  const noPeriodo = aplicarFiltroGlobalEntradas(entradas, filtro);
  // Sem as duas pontas não existe "período anterior de mesma duração": os deltas somem em
  // vez de comparar com um vazio e mostrar +100%. `periodo` fecha as pontas abertas na
  // extensão dos dados, para os baldes das sparklines e do ranking.
  const comparavel = periodoFechado(filtro.periodo);
  const periodo = periodoEfetivo(filtro.periodo, noPeriodo, hoje);
  const doAnterior = comparavel
    ? aplicarFiltroGlobalEntradas(entradas, filtro, periodoAnterior(periodo.de, periodo.ate))
    : [];

  const kpis = kpisFornecedores(noPeriodo, doAnterior, periodo.de, periodo.ate);
  const linhas = rankingFornecedores(noPeriodo, periodo.de, periodo.ate);
  const nomePorId = new Map(noPeriodo.map((e) => [e.fornecedorId, e.fornecedorNome]));
  const nomeFornecedor = (id: string) => nomePorId.get(id) ?? "Fornecedor não encontrado";

  return (
    <>
      <TituloAba titulo="Fornecedores" descricao="Compras de combustível por fornecedor no período" />

      <BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} ocultar={OCULTAR_EM_ENTRADAS} />

      {noPeriodo.length === 0 ? (
        <EmptyState titulo="Nenhuma entrada de combustível no período" descricao="Ajuste o período ou os filtros" />
      ) : (
        <>
          <GradeKpis className="mb-4">
            <KpiAnalitico
              titulo="Volume comprado"
              valor={formatarLitros(kpis.volume)}
              detalhe="no período"
              delta={comparavel ? kpis.deltaVolume : undefined}
              serie={kpis.sparkVolume}
              explicacao="Soma de litros das entradas no período (compras de combustível)."
            />
            <KpiAnalitico
              titulo="Custo das compras"
              valor={<MoneyText valor={kpis.custo} />}
              detalhe="no período"
              delta={comparavel ? kpis.deltaCusto : undefined}
              altaRuim
              serie={kpis.sparkCusto}
              explicacao="Soma do valor total das entradas no período. Alta de custo em vermelho."
            />
            <KpiAnalitico
              titulo="Fornecedores ativos"
              valor={formatarContagem(kpis.qtdFornecedores)}
              detalhe="com ao menos uma compra no período"
              delta={comparavel && kpis.chipFornecedores.tipo === "percentual" ? kpis.chipFornecedores.valor : undefined}
              diferenca={comparavel ? textoDiferenca(kpis.chipFornecedores) : undefined}
              explicacao="Fornecedores distintos que aparecem em entradas no período."
            />
            <KpiAnalitico
              titulo="Melhor preço"
              valor={kpis.melhorFornecedorId ? formatarRPorL(kpis.melhorRPorL) : "—"}
              detalhe={
                kpis.melhorFornecedorId
                  ? nomeFornecedor(kpis.melhorFornecedorId)
                  : kpis.qtdFornecedores < 2
                    ? "precisa de 2 ou mais fornecedores para comparar"
                    : undefined
              }
              explicacao="R$/L médio ponderado do fornecedor mais barato no período. Só com 2 ou mais fornecedores."
            />
          </GradeKpis>

          {linhas.length === 0 ? (
            <EmptyState titulo="Nenhuma entrada com fornecedor no período" descricao="As entradas do período estão sem fornecedor" />
          ) : (
            <TabelaRanking
              titulo="Ranking de fornecedores"
              subtitulo={`${plural(linhas.length, "fornecedor", "fornecedores")} no período`}
              linhas={linhas}
              chave={(l) => l.id}
              cabecalhoNome="Fornecedor"
              nome={(l) => nomeFornecedor(l.id)}
              colunas={[
                { cabecalho: "Compras", celula: (l) => l.qtdCompras },
                { cabecalho: "Litros", celula: (l) => formatarLitros(l.litros) },
                { cabecalho: "Custo", celula: (l) => <MoneyText valor={l.custo} /> },
                { cabecalho: "R$/L mín", className: "text-muted-foreground", celula: (l) => formatarRPorL(l.rPorLMin) },
                { cabecalho: "R$/L médio", className: "font-semibold", celula: (l) => formatarRPorL(l.rPorLMedio) },
                { cabecalho: "R$/L máx", className: "text-muted-foreground", celula: (l) => formatarRPorL(l.rPorLMax) },
                {
                  cabecalho: "% do total",
                  alinhar: "esquerda",
                  className: "w-40",
                  celula: (l) => <BarraPercentual pct={l.pctTotal} />,
                },
                {
                  cabecalho: "Tend. R$/L",
                  alinhar: "esquerda",
                  className: "w-20",
                  celula: (l) => <CelulaTendencia serie={l.spark} suficiente={l.spark.length >= MINIMO_PONTOS_TENDENCIA} />,
                },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}
