import { notFound } from "next/navigation";

import { GradeKpis, KPICard, SecaoDetalhe } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { modoDaUrl } from "@/modules/combustivel/anomalias/base";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { AnomaliasTabela } from "@/modules/combustivel/anomalias/components/anomalias-tabela";
import { SemSuprimentoTabela } from "@/modules/combustivel/anomalias/components/sem-suprimento-tabela";
import type { DetectorId, Severidade } from "@/modules/combustivel/anomalias/detect";
import { carregarAnomalias, listarSemSuprimento } from "@/modules/combustivel/anomalias/queries";
import { situacaoDaUrl } from "@/modules/combustivel/anomalias/schemas";
import { periodoDaUrl, ultimosDias } from "@/modules/combustivel/relatorios/periodo";

/**
 * A detecção lê todas as saídas (o D3 e o D5 olham o banco inteiro, como na origem),
 * página por página: passa do teto padrão da Vercel (10 a 15s).
 */
export const maxDuration = 60;

/** Padrão da origem: os últimos 30 dias (preset "ultimos_30"). */
const DIAS_PADRAO = 30;

const SEVERIDADES: readonly Severidade[] = ["critical", "warning", "info"];
const DETECTORES: readonly DetectorId[] = ["D1", "D2", "D3", "D4", "D5"];

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

/**
 * Anomalias do combustível: a aba Anomalias da origem (detecção D1 a D5 sobre as saídas
 * do modo e do período) e as saídas sem suprimento do PEPS. Conferir, revisar e atribuir
 * equipamento pedem combustivel.anomalias/editar (na origem, corrigir_anomalias_combustivel).
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
  const modo = modoDaUrl(params.modo);
  const situacao = situacaoDaUrl(params.situacao);
  const revisao = situacaoDaUrl(params.revisao);
  const severidadeUrl = primeiro(params.severidade);
  const detectorUrl = primeiro(params.detector);
  const severidade = (SEVERIDADES as readonly string[]).includes(severidadeUrl) ? (severidadeUrl as Severidade) : "";
  const detector = (DETECTORES as readonly string[]).includes(detectorUrl) ? (detectorUrl as DetectorId) : "";

  const [resultado, semSuprimento] = await Promise.all([carregarAnomalias(periodo, modo), listarSemSuprimento()]);
  const semSuprimentoPendentes = semSuprimento.filter((linha) => linha.revisao === null).length;
  const criticas = resultado.anomalias.filter((a) => a.severity === "critical" && a.conferencia === null).length;
  const semEquipamento = resultado.anomalias.filter((a) => a.detector === "D1" && a.conferencia === null).length;

  return (
    <>
      <TituloAba
        titulo="Anomalias"
        descricao="Saídas e estados fora do padrão no período, e saídas que pediram mais do que o tanque tinha"
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
          detalhe="Possíveis saídas duplicadas"
        />
        <KPICard
          titulo="Sem equipamento identificado"
          valor={<span className="tabular-nums">{semEquipamento}</span>}
          detalhe="Saídas lançadas em Outros"
        />
        <KPICard
          titulo="Sem suprimento para revisar"
          valor={<span className="tabular-nums">{semSuprimentoPendentes}</span>}
          detalhe={`${semSuprimento.length - semSuprimentoPendentes} já revisadas`}
        />
      </GradeKpis>

      <div className="flex flex-col gap-6">
        <SecaoDetalhe titulo="Saídas fora do padrão">
          <AnomaliasTabela
            anomalias={resultado.anomalias}
            situacao={situacao}
            severidade={severidade}
            detector={detector}
            de={periodo.de}
            ate={periodo.ate}
            podeEditar={podeEditar}
            veAbastecimentos={veAbastecimentos}
            equipamentos={resultado.equipamentos}
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
