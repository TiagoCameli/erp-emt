"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroSelect,
  useFiltrosUrl,
} from "@/components/canonicos";
import {
  ROTULO_SITUACAO_CREDITO,
  SITUACOES_CREDITO,
  type FiltrosCreditos,
} from "@/modules/financeiro/relatorios/filtros-creditos";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do relatório de Créditos: a situação do contrato.
 *
 * Um filtro só, e é o que a tela pedia: a tabela mistura contrato quitado com
 * contrato em aberto, e a pergunta do dia a dia ("o que ainda devo?") obrigava a
 * ler linha por linha procurando a palavra "Quitado".
 *
 * O filtro recorta a tabela E os cartões, como no resto do módulo: cartão que
 * ignora o filtro embaixo dele responde a uma pergunta que ninguém fez.
 *
 * `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório
 * está aberto, e apagá-lo devolveria a pessoa ao Fluxo de caixa.
 */
export function FiltrosCreditosBarra({ filtros }: { filtros: FiltrosCreditos }) {
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-creditos"
      filtros={[
        {
          id: "situacao",
          rotulo: "Situação",
          fixo: true,
          temValor: filtros.situacao !== "",
          onLimpar: () => setMuitos({ situacao: null }),
          elemento: (
            <FiltroSelect
              valor={filtros.situacao}
              onValorChange={(valor) =>
                setMuitos({ situacao: valor || null })
              }
              opcoes={SITUACOES_CREDITO.map((situacao) => ({
                valor: situacao,
                rotulo: ROTULO_SITUACAO_CREDITO[situacao],
              }))}
              todosRotulo="Todas as situações"
            />
          ),
        },
      ]}
    />
  );
}
