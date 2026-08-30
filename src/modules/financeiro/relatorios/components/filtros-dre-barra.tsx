"use client";

import { BarraFiltrosConfiguravel, useFiltrosUrl } from "@/components/canonicos";
import { camposDePeriodo } from "@/modules/financeiro/relatorios/components/filtros-periodo-barra";
import type { PeriodoNaUrl } from "@/modules/financeiro/relatorios/filtros-periodo";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do DRE gerencial: o período, nos três modos.
 *
 * A `fn_rel_dre` recebe `p_inicio` e `p_fim` desde sempre e a tela só oferecia um
 * seletor de mês — trimestre e ano, que é o que o plano mestre pede de um DRE,
 * não tinham como ser pedidos. Aqui não há filtro de dimensão: o DRE agrupa por
 * categoria e a função não recebe nada além das duas datas.
 *
 * `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório está
 * aberto, e apagá-lo devolveria a pessoa ao Fluxo de caixa.
 */
export function FiltrosDreBarra({ filtros }: { filtros: PeriodoNaUrl }) {
  const { get, setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-dre"
      filtros={camposDePeriodo({
        escolha: filtros,
        mesNaUrl: get("mes") !== null,
        setMuitos,
      })}
    />
  );
}
