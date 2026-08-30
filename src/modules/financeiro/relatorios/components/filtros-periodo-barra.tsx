"use client";

import { FiltroMes, FiltroSelect, type FiltroDaBarra } from "@/components/canonicos";
import {
  MODOS_PERIODO,
  type ModoPeriodo,
  type PeriodoNaUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * Os campos de PERÍODO DE COMPETÊNCIA da barra de filtros, montados uma vez só.
 *
 * Três relatórios oferecem a mesma escolha de tempo (DRE gerencial, Custo por
 * grupo de insumo e o Custo por centro de custo, que tem um quarto modo próprio),
 * e a parte que não pode divergir entre eles não é o desenho: é a REGRA DE
 * ESCRITA. Trocar de modo tem que apagar, na MESMA navegação, o que não pertence
 * ao modo novo — em duas navegações o `de`/`ate` fica pendurado na URL e volta
 * sozinho quando a pessoa retorna ao modo período, recortando o relatório por uma
 * janela que ninguém escolheu.
 *
 * Devolve `FiltroDaBarra[]` em vez de renderizar a barra inteira porque cada
 * relatório tem os filtros DELE depois destes, e a barra canônica é uma só.
 */

const ROTULO_MODO: Record<ModoPeriodo, string> = {
  mes: "Um mês",
  periodo: "Período",
  total: "Tudo",
};

export function camposDePeriodo({
  escolha,
  mesNaUrl,
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
  /** O `setMuitos` do `useFiltrosUrl` da tela: uma escrita por interação. */
  setMuitos: (mudancas: Record<string, string | null>) => void;
}): FiltroDaBarra[] {
  /**
   * Troca o modo e limpa, na mesma navegação, só o que não pertence ao modo novo.
   *
   * Só o que não pertence: quem sai de "período" para "um mês" e volta encontra
   * as datas onde deixou, em vez de digitá-las de novo.
   */
  function trocarModo(modo: string) {
    const mudancas: Record<string, string | null> = {
      modo: modo === "mes" ? null : modo,
    };
    if (modo !== "periodo") {
      mudancas.de = null;
      mudancas.ate = null;
    }
    setMuitos(mudancas);
  }

  const campos: FiltroDaBarra[] = [
    {
      id: "modo",
      rotulo: "Período",
      fixo: true,
      // O modo conta como filtro quando não é o padrão: é ele que faz o botão
      // "Limpar filtros" aparecer num DRE apurado por trimestre ou por ano.
      temValor: escolha.modo !== "mes",
      onLimpar: () => setMuitos({ modo: null, de: null, ate: null }),
      elemento: (
        <FiltroSelect
          valor={escolha.modo}
          onValorChange={trocarModo}
          opcoes={MODOS_PERIODO.map((modo) => ({
            valor: modo,
            rotulo: ROTULO_MODO[modo],
          }))}
          todosRotulo={ROTULO_MODO.mes}
        />
      ),
    },
  ];

  if (escolha.modo === "mes") {
    campos.push({
      id: "mes",
      rotulo: "Mês",
      fixo: true,
      temValor: mesNaUrl,
      onLimpar: () => setMuitos({ mes: null }),
      elemento: (
        <FiltroMes
          valor={escolha.mes}
          onValorChange={(valor) => setMuitos({ mes: valor || null })}
        />
      ),
    });
  }

  if (escolha.modo === "periodo") {
    campos.push(
      {
        id: "de",
        rotulo: "De",
        fixo: true,
        temValor: escolha.de !== "",
        onLimpar: () => setMuitos({ de: null }),
        elemento: (
          <FiltroMes
            rotulo="De"
            valor={escolha.de}
            onValorChange={(valor) => setMuitos({ de: valor || null })}
          />
        ),
      },
      {
        id: "ate",
        rotulo: "Até",
        fixo: true,
        temValor: escolha.ate !== "",
        onLimpar: () => setMuitos({ ate: null }),
        elemento: (
          <FiltroMes
            rotulo="Até"
            valor={escolha.ate}
            onValorChange={(valor) => setMuitos({ ate: valor || null })}
          />
        ),
      },
    );
  }

  return campos;
}
