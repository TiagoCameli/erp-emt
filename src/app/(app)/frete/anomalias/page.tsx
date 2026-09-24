import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AnomaliasFreteTabela } from "@/modules/frete/anomalias/components/anomalias-frete-tabela";
import { DETECTORES, SEVERIDADES, type DetectorId, type Severidade } from "@/modules/frete/anomalias/detect";
import { carregarAnomaliasFrete } from "@/modules/frete/anomalias/queries";
import { situacaoDaUrl } from "@/modules/frete/anomalias/schemas";
import { diaValido } from "@/modules/combustivel/relatorios/periodo";

/** A detecção lê todos os fretes e pedidos, página por página. */
export const maxDuration = 60;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

/**
 * Anomalias do Frete: a aba Anomalias da origem (regras F1 a F6 sobre todos os fretes
 * ativos). Conferir pede frete.anomalias/editar.
 */
export default async function PaginaAnomaliasFrete({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.anomalias", "ver")) notFound();

  const podeEditar = temPermissao(usuario, "frete.anomalias", "editar");
  const veFretes = temPermissao(usuario, "frete.fretes", "ver");

  const params = await searchParams;
  const situacao = situacaoDaUrl(params.situacao);
  const severidadeUrl = primeiro(params.severidade);
  const regraUrl = primeiro(params.regra);
  const severidade = (SEVERIDADES as readonly string[]).includes(severidadeUrl) ? (severidadeUrl as Severidade) : "";
  const regra = (DETECTORES as readonly string[]).includes(regraUrl) ? (regraUrl as DetectorId) : "";
  const de = diaValido(primeiro(params.de)) ?? "";
  const ate = diaValido(primeiro(params.ate)) ?? "";

  const { anomalias } = await carregarAnomaliasFrete();
  const abertas = anomalias.filter((a) => a.conferencia === null);
  const verificadas = anomalias.length - abertas.length;
  const criticas = abertas.filter((a) => a.severity === "critical").length;
  const saldoNegativo = abertas.filter((a) => a.detector === "F3").length;

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Anomalias"
        descricao="Fretes fora do padrão: preço, pedido, saldo na pedreira, duplicidade, cadastro e chegada"
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Anomalias em aberto"
          valor={<span className="tabular-nums">{abertas.length}</span>}
          detalhe={`${verificadas} ${verificadas === 1 ? "verificada" : "verificadas"}`}
        />
        <KPICard
          titulo="Críticas em aberto"
          valor={<span className="tabular-nums">{criticas}</span>}
          detalhe="Possíveis fretes duplicados"
        />
        <KPICard
          titulo="Saldo negativo na pedreira"
          valor={<span className="tabular-nums">{saldoNegativo}</span>}
          detalhe="Transportado acima do pedido"
        />
      </GradeKpis>

      <AnomaliasFreteTabela
        anomalias={anomalias}
        situacao={situacao}
        severidade={severidade}
        regra={regra}
        de={de}
        ate={ate}
        podeEditar={podeEditar}
        veFretes={veFretes}
      />
    </>
  );
}
