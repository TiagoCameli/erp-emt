"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroPeriodo,
  useFiltrosUrl,
} from "@/components/canonicos";
import {
  CHAVE_ATE_INVESTIMENTOS,
  CHAVE_DE_INVESTIMENTOS,
  type PeriodoInvestimentos,
} from "@/modules/financeiro/relatorios/investimentos";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do relatório de Investimentos: o período do MOVIMENTO.
 *
 * O período recorta o que foi aplicado e resgatado, e os meses da série. A
 * posição de cada aplicação continua sendo o histórico inteiro (aplicado menos
 * resgatado, a regra do Tiago): saldo não tem período.
 */
export function FiltrosInvestimentosBarra({
  periodo,
}: {
  periodo: PeriodoInvestimentos;
}) {
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-investimentos"
      filtros={[
        {
          id: "periodo",
          rotulo: "Período do movimento",
          fixo: true,
          temValor: periodo.de !== "" || periodo.ate !== "",
          onLimpar: () =>
            setMuitos({
              [CHAVE_DE_INVESTIMENTOS]: null,
              [CHAVE_ATE_INVESTIMENTOS]: null,
            }),
          elemento: (
            <FiltroPeriodo
              de={periodo.de}
              ate={periodo.ate}
              rotulo="Período do movimento"
              onPeriodoChange={(de, ate) =>
                setMuitos({
                  [CHAVE_DE_INVESTIMENTOS]: de === "" ? null : de,
                  [CHAVE_ATE_INVESTIMENTOS]: ate === "" ? null : ate,
                })
              }
            />
          ),
        },
      ]}
    />
  );
}
