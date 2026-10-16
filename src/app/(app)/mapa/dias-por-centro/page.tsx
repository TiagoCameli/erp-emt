import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { mesHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  agruparRelatorio,
  mesDoRelatorio,
  rotuloMes,
} from "@/modules/mapa/centros";
import { carregarRelDiasCentro } from "@/modules/mapa/centros-queries";
import { RelDiasCentroTabela } from "@/modules/mapa/components/rel-dias-centro";

// Exportar monta a planilha na função desta página (src/app/max-duration-de-quem-exporta.test.ts).
export const maxDuration = 60;

const PROPRIEDADES = ["propria", "colorado", "alugada"];

/**
 * Dias de equipamento por centro de custo no mês (pedido do Tiago, 16/10/2026): em que centro cada
 * máquina do mapa terminou cada dia. Base do rateio futuro de depreciação (própria) e aluguel
 * (alugada). Os dias fecham às 23:59 de Rio Branco; o de hoje entra ao vivo.
 */
export default async function PaginaDiasPorCentro({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; propriedade?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "mapa.historico", "ver")) notFound();

  const params = await searchParams;
  const mesHoje = mesHojeISO();
  const mes = mesDoRelatorio(params.mes, mesHoje);
  const propriedade = PROPRIEDADES.includes(params.propriedade ?? "")
    ? (params.propriedade ?? "")
    : "";

  const cabecalho = (
    <PageHeader
      modulo="Mapa"
      titulo="Dias por centro de custo"
      descricao={`Em que centro de custo cada máquina do mapa terminou cada dia de ${rotuloMes(mes)}. Parada, sem obra ou atendendo vários centros conta em Equipamento Sem Alocação; fora de funcionamento não conta.`}
    />
  );

  const { linhas, erro } = await carregarRelDiasCentro(mes, propriedade);
  if (erro) {
    return (
      <>
        {cabecalho}
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar os dias por centro"
          descricao={erro}
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <RelDiasCentroTabela
        relatorio={agruparRelatorio(linhas)}
        mes={mes}
        mesHoje={mesHoje}
        propriedade={propriedade}
      />
    </>
  );
}
