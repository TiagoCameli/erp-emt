import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader, SecaoDetalhe } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AnomaliasTabela } from "@/modules/combustivel/anomalias/components/anomalias-tabela";
import { SemSuprimentoTabela } from "@/modules/combustivel/anomalias/components/sem-suprimento-tabela";
import { carregarAnomalias, listarSemSuprimento } from "@/modules/combustivel/anomalias/queries";
import { situacaoDaUrl } from "@/modules/combustivel/anomalias/schemas";
import { periodoDaUrl, ultimosDias } from "@/modules/combustivel/relatorios/periodo";

/**
 * A detecção lê o período e os 90 dias antes dele, página por página: num
 * período longo isso passa do teto padrão da Vercel (10 a 15s).
 */
export const maxDuration = 60;

/** Padrão da tela: os últimos 90 dias. */
const DIAS_PADRAO = 90;

/**
 * Anomalias do combustível: a detecção (D1 a D5) roda no servidor sobre as saídas
 * do período, e as saídas sem suprimento vêm do PEPS. Conferir e revisar pedem
 * combustivel.anomalias/editar (na origem qualquer usuário gravava).
 */
export default async function PaginaAnomalias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.anomalias", "ver")) notFound();

  const podeEditar = temPermissao(usuario, "combustivel.anomalias", "editar");
  const veAbastecimentos = temPermissao(usuario, "combustivel.saidas", "ver");

  const params = await searchParams;
  const periodo = periodoDaUrl(params.de, params.ate, ultimosDias(dataHojeISO(), DIAS_PADRAO));
  const situacao = situacaoDaUrl(params.situacao);
  const revisao = situacaoDaUrl(params.revisao);

  const [resultado, semSuprimento] = await Promise.all([carregarAnomalias(periodo), listarSemSuprimento()]);
  const semSuprimentoPendentes = semSuprimento.filter((linha) => linha.revisao === null).length;
  const criticas = resultado.anomalias.filter((a) => a.severidade === "critica" && a.conferencia === null).length;

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Anomalias"
        descricao="Abastecimentos fora do padrão no período e saídas que pediram mais do que o tanque tinha"
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Anomalias pendentes"
          valor={<span className="tabular-nums">{resultado.pendentes}</span>}
          detalhe={`${resultado.conferidas} já conferidas no período`}
        />
        <KPICard
          titulo="Críticas pendentes"
          valor={<span className="tabular-nums">{criticas}</span>}
          detalhe="Possíveis abastecimentos em duplicidade"
        />
        <KPICard
          titulo="Sem suprimento para revisar"
          valor={<span className="tabular-nums">{semSuprimentoPendentes}</span>}
          detalhe={`${semSuprimento.length - semSuprimentoPendentes} já revisadas`}
        />
      </GradeKpis>

      <div className="flex flex-col gap-6">
        <SecaoDetalhe titulo="Abastecimentos fora do padrão">
          <AnomaliasTabela
            anomalias={resultado.anomalias}
            situacao={situacao}
            de={periodo.de}
            ate={periodo.ate}
            podeEditar={podeEditar}
            veAbastecimentos={veAbastecimentos}
          />
        </SecaoDetalhe>

        <SecaoDetalhe titulo="Saídas sem suprimento">
          <SemSuprimentoTabela
            linhas={semSuprimento}
            revisao={revisao}
            podeEditar={podeEditar}
            veAbastecimentos={veAbastecimentos}
          />
        </SecaoDetalhe>
      </div>
    </>
  );
}
