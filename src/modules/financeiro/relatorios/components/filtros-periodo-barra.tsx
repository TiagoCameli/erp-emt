"use client";

import type { FiltroDaBarra } from "@/components/canonicos";
import { FiltroJanelaMeses } from "@/modules/financeiro/relatorios/components/filtro-janela-meses";
import {
  escritaDaJanela,
  janelaDoPeriodo,
  type PeriodoNaUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * O campo de PERÍODO DE COMPETÊNCIA da barra de filtros, montado uma vez só.
 *
 * Três relatórios oferecem a mesma escolha de tempo (DRE gerencial, Custo por
 * grupo de insumo e o Custo por centro de custo, que tem um quarto modo próprio),
 * e a parte que não pode divergir entre eles não é o desenho: é a REGRA DE
 * ESCRITA, que mora em `escritaDaJanela`. Régua limpa significa SEM LIMITE, que
 * nesta URL é `modo=total` e não a ausência dos parâmetros — que cai no padrão, o
 * mês corrente.
 *
 * ## Era um seletor de modo mais dois campos de mês
 *
 * Até 19/09/2026 o tempo ocupava três trilhos: um seletor "Um mês / Período /
 * Tudo" e, conforme o modo, um `input type="month"` ou dois. O Tiago pediu a
 * troca com o print do Custo x receita: "filtro de mês e data nos relatórios
 * devem funcionar do mesmo jeito que funciona na área de lançamentos".
 *
 * A régua faz os três modos sem seletor nenhum: clicar num bloco é "um mês",
 * arrastar é "período", e o X é "tudo". Os três continuam na URL do mesmo jeito,
 * porque as RPCs e o drill já leem `modo`, `mes`, `de` e `ate`.
 *
 * Devolve `FiltroDaBarra[]` em vez de renderizar a barra inteira porque cada
 * relatório tem os filtros DELE depois deste, e a barra canônica é uma só.
 */
export function camposDePeriodo({
  escolha,
  mesNaUrl,
  modoNaUrl,
  setMuitos,
}: {
  escolha: PeriodoNaUrl;
  /**
   * O `mes` está ESCRITO na URL?
   *
   * Precisa vir de fora porque `escolha.mes` já nasce preenchido com o mês
   * corrente quando a URL não diz nada, e sem essa distinção o botão "Limpar
   * filtros" apareceria em toda abertura da tela — oferecendo apagar uma escolha
   * que ninguém fez.
   */
  mesNaUrl: boolean;
  /** O `modo` está ESCRITO na URL? Mesma razão do `mesNaUrl`. */
  modoNaUrl: boolean;
  /** O `setMuitos` do `useFiltrosUrl` da tela: uma escrita por interação. */
  setMuitos: (mudancas: Record<string, string | null>) => void;
}): FiltroDaBarra[] {
  const janela = janelaDoPeriodo(escolha);

  return [
    {
      id: "periodo",
      rotulo: "Mês de referência",
      fixo: true,
      // Conta como filtro quando a URL DIZ alguma coisa. `escolha.mes` sozinho
      // não serve: ele nasce no mês corrente em toda abertura da tela.
      temValor: mesNaUrl || modoNaUrl || escolha.de !== "" || escolha.ate !== "",
      onLimpar: () =>
        setMuitos({ modo: null, mes: null, de: null, ate: null }),
      elemento: (
        <FiltroJanelaMeses
          de={janela.de}
          ate={janela.ate}
          onJanelaChange={(de, ate) => setMuitos(escritaDaJanela(de, ate))}
        />
      ),
    },
  ];
}
