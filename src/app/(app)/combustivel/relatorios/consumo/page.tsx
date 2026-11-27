import { notFound } from "next/navigation";

import { EmptyState, GradeKpis } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { BarraFiltrosCombustivel } from "@/modules/combustivel/_shared/components/barra-filtros-combustivel";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { filtroGlobalDaUrl, SEM_LIMITE } from "@/modules/combustivel/_shared/filtro-global";
import { KpiAnalitico } from "@/modules/combustivel/analitico/components/kpi-analitico";
import { ConsumoTabela } from "@/modules/combustivel/consumo/components/consumo-tabela";
import { montarRelatorioConsumo } from "@/modules/combustivel/consumo/servico";
import { carregarOpcoesFiltroGlobal } from "@/modules/combustivel/painel/queries";

/** Lê todas as saídas e os trechos (página por página) e exporta o Excel: passa do teto padrão da Vercel. */
export const maxDuration = 60;

function numero(valor: number | null, casas: number): string {
  return valor === null
    ? "Sem trecho"
    : valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Relatórios > Consumo: quanto cada carreta, carro e máquina consome de verdade, pelas
 * leituras do odômetro e do horímetro no abastecimento. Filtros globais do Combustível.
 */
export default async function PaginaConsumoCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.relatorios", "ver")) notFound();

  const filtro = filtroGlobalDaUrl(await searchParams);
  const [relatorio, opcoes] = await Promise.all([
    montarRelatorioConsumo(filtro, filtro.periodo ?? SEM_LIMITE),
    carregarOpcoesFiltroGlobal(filtro, "saidas"),
  ]);
  const frota = relatorio.medias.find((m) => m.grupo === "Frota") ?? null;
  const comDestaque = relatorio.linhas.filter((l) => l.destaque).length;
  const pctSemLeitura =
    relatorio.abastecimentos > 0 ? Math.round((relatorio.semLeitura / relatorio.abastecimentos) * 100) : 0;

  return (
    <>
      <TituloAba
        titulo="Consumo"
        descricao="Litros por km e por hora de cada carreta, carro e máquina, pelas leituras do painel no abastecimento"
      />
      <BarraFiltrosCombustivel filtro={filtro} opcoes={opcoes} ocultar={["fornecedores"]} />

      {relatorio.abastecimentos === 0 ? (
        <EmptyState titulo="Nenhum abastecimento no recorte" descricao="Ajuste o período ou os filtros" />
      ) : (
        <>
          <GradeKpis id="combustivel.consumo.indicadores" titulo="Indicadores" className="mb-4">
            <KpiAnalitico
              titulo="Frota em km"
              valor={`${numero(frota?.kmPorL ?? null, 2)} km/L`}
              detalhe={`${numero(frota?.lPorKm ?? null, 3)} L/km`}
              explicacao="Soma dos litros dos trechos válidos dividida pelos km rodados, de todos os veículos do recorte."
            />
            <KpiAnalitico
              titulo="Frota em horas"
              valor={`${numero(frota?.lPorH ?? null, 2)} L/h`}
              detalhe={`${numero(frota?.h ?? null, 1)} h trabalhadas`}
              explicacao="Soma dos litros dos trechos com horímetro dividida pelas horas."
            />
            <KpiAnalitico
              titulo="Sem leitura"
              valor={`${pctSemLeitura}%`}
              detalhe={`${relatorio.semLeitura} de ${relatorio.abastecimentos} abastecimentos`}
              explicacao="Abastecimentos sem odômetro nem horímetro: valem para estoque e custo, mas ficam fora do consumo."
            />
            <KpiAnalitico
              titulo="Acima da própria média"
              valor={String(comDestaque)}
              detalhe={`mais de ${relatorio.config.desvioPercentual}% acima dos últimos ${relatorio.config.janelaMeses} meses`}
              explicacao={`Compara o L/km e o L/h do período com a média do mesmo veículo na janela, com pelo menos ${relatorio.config.minTrechos} trechos válidos.`}
            />
          </GradeKpis>
          <ConsumoTabela linhas={relatorio.linhas} medias={relatorio.medias} />
        </>
      )}
    </>
  );
}
