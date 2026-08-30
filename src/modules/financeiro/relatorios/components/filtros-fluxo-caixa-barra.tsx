"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelect,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import {
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
  MODOS_FLUXO,
  type FiltrosFluxoCaixa,
  type ModoFluxo,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do Fluxo de caixa: a janela de meses.
 *
 * O padrão é a janela de doze meses para cada lado do mês corrente, e ele é o
 * ponto do filtro: sem janela, `fn_rel_fluxo_caixa()` devolve todo mês com
 * parcela e o gráfico desenhava 78 colunas indo até 05/2031 — as prestações dos
 * financiamentos. "Tudo" continua a um clique para quem quer o horizonte inteiro.
 *
 * Os parâmetros são `fluxo_modo`, `fluxo_de` e `fluxo_ate`, e não os `modo`/`de`/
 * `ate` dos relatórios de competência: aqui o mês é o do pagamento ou do
 * vencimento (regime de caixa), então herdar a janela de outro relatório ao trocar
 * de aba filtraria uma dimensão pela outra sem a tela dizer nada.
 */
const ROTULO_MODO: Record<ModoFluxo, string> = {
  janela: `${MESES_PARA_TRAS} meses atrás e ${MESES_PARA_FRENTE} à frente`,
  periodo: "Período",
  total: "Tudo",
};

export function FiltrosFluxoCaixaBarra({
  filtros,
}: {
  filtros: FiltrosFluxoCaixa;
}) {
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  /**
   * Troca o modo e apaga as pontas na MESMA navegação quando elas deixam de
   * valer. Em duas escritas, o `fluxo_de` fica pendurado na URL e volta a
   * recortar o gráfico sozinho quando a pessoa retornar ao modo período.
   */
  function trocarModo(modo: string) {
    const mudancas: Record<string, string | null> = {
      fluxo_modo: modo === "janela" ? null : modo,
    };
    if (modo !== "periodo") {
      mudancas.fluxo_de = null;
      mudancas.fluxo_ate = null;
    }
    setMuitos(mudancas);
  }

  const filtrosDaBarra: FiltroDaBarra[] = [
    {
      id: "fluxo_modo",
      rotulo: "Janela",
      fixo: true,
      // Só conta como filtro fora do padrão: com a janela de sempre, o botão
      // "Limpar filtros" ofereceria apagar uma escolha que ninguém fez.
      temValor: filtros.modo !== "janela",
      onLimpar: () =>
        setMuitos({ fluxo_modo: null, fluxo_de: null, fluxo_ate: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.modo}
          onValorChange={trocarModo}
          opcoes={MODOS_FLUXO.map((modo) => ({
            valor: modo,
            rotulo: ROTULO_MODO[modo],
          }))}
          todosRotulo={ROTULO_MODO.janela}
        />
      ),
    },
  ];

  if (filtros.modo === "periodo") {
    filtrosDaBarra.push(
      {
        id: "fluxo_de",
        rotulo: "De",
        fixo: true,
        temValor: filtros.de !== "",
        onLimpar: () => setMuitos({ fluxo_de: null }),
        elemento: (
          <FiltroMes
            rotulo="De"
            valor={filtros.de}
            onValorChange={(valor) => setMuitos({ fluxo_de: valor || null })}
          />
        ),
      },
      {
        id: "fluxo_ate",
        rotulo: "Até",
        fixo: true,
        temValor: filtros.ate !== "",
        onLimpar: () => setMuitos({ fluxo_ate: null }),
        elemento: (
          <FiltroMes
            rotulo="Até"
            valor={filtros.ate}
            onValorChange={(valor) => setMuitos({ fluxo_ate: valor || null })}
          />
        ),
      },
    );
  }

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-fluxo-caixa"
      filtros={filtrosDaBarra}
    />
  );
}
