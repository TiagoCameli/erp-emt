"use client";

import { BarraFiltrosConfiguravel, useFiltrosUrl } from "@/components/canonicos";
import { camposDePeriodo } from "@/modules/financeiro/relatorios/components/filtros-periodo-barra";
import type { PeriodoNaUrl } from "@/modules/financeiro/relatorios/filtros-periodo";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do ranking de fornecedores: o período, que recorta o
 * lançado (mês de referência) e o pago (data do pagamento). O em aberto é a
 * posição de hoje e não muda com ele.
 *
 * `naoSaoFiltro` preserva o `rel` no "Limpar filtros", como no DRE.
 */
export function FiltrosRankingFornecedoresBarra({ filtros }: { filtros: PeriodoNaUrl }) {
  const { get, setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-ranking-fornecedores"
      filtros={camposDePeriodo({
        escolha: filtros,
        mesNaUrl: get("mes") !== null,
        modoNaUrl: get("modo") !== null,
        setMuitos,
      }).map((campo) => ({
        ...campo,
        // O padrão daqui é o ano corrente, que já chega com `de`/`ate`
        // preenchidos: só conta como filtro o que a URL escreveu.
        temValor: ["mes", "modo", "de", "ate"].some((p) => get(p) !== null),
      }))}
    />
  );
}
