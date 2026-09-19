"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import { FiltroJanelaMeses } from "@/modules/financeiro/relatorios/components/filtro-janela-meses";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import {
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import type {
  FiltrosFluxoCaixa,
  JanelaFluxo,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do Fluxo de caixa: a janela de meses e os centros de cada
 * lado do caixa.
 *
 * O padrão da janela é doze meses para cada lado do mês corrente, e ele é o
 * ponto do filtro: sem janela, `fn_rel_fluxo_caixa()` devolve todo mês com
 * parcela e o gráfico desenhava 78 colunas indo até 05/2031 — as prestações dos
 * financiamentos. "Tudo" continua a um clique para quem quer o horizonte inteiro:
 * é o X da régua, que desde 19/09/2026 substitui o seletor de modo e os dois
 * campos de mês (pedido do Tiago, o mesmo filtro de Lançamentos).
 *
 * Os parâmetros da janela são `fluxo_modo`, `fluxo_de` e `fluxo_ate`, e não os
 * `modo`/`de`/`ate` dos relatórios de competência: aqui o mês é o do pagamento ou
 * do vencimento (regime de caixa), então herdar a janela de outro relatório ao
 * trocar de aba filtraria uma dimensão pela outra sem a tela dizer nada.
 *
 * Os de CENTRO são, ao contrário, os MESMOS do Custo x receita (`centro_custo`,
 * `etapa_custo`, `centro_receita`, `etapa_receita`): centro de custo quer dizer a
 * mesma coisa nos dois relatórios, então trocar de aba mantendo a obra escolhida
 * é o comportamento certo. Ver o cabeçalho de `filtros-fluxo-caixa.ts`.
 *
 * ## Saída é custo, entrada é receita
 *
 * O rótulo diz os dois nomes de propósito. "Centro de custo" é o vocabulário do
 * cadastro; "saídas" é o que a barra do gráfico mostra. Sem os dois, quem olha o
 * gráfico não sabe qual dos dois seletores mexe em qual barra.
 *
 * ## Cada lado escolhe em dois campos: a raiz e, quando ela tem, a etapa
 *
 * O campo de etapa entra na barra só quando alguma raiz escolhida tem filho — das
 * 15 raízes que os relatórios oferecem, duas têm. Fixo, ele ficaria vazio e inerte
 * em quase toda abertura da tela. É a mesma escada dos outros filtros de centro do
 * app, e o módulo puro dela é `_shared/centro-custo/filtro.ts`.
 */
export interface FiltrosFluxoCaixaBarraProps {
  filtros: FiltrosFluxoCaixa;
  /**
   * A janela que o gráfico está mostrando, já resolvida pelo modo (yyyy-MM).
   *
   * Vem pronta do servidor porque no modo padrão ela é RELATIVA ao mês corrente,
   * e recalculá-la aqui com o relógio do navegador faria a régua e o gráfico
   * discordarem na virada do mês.
   */
  janela: JanelaFluxo;
  /** Raízes e etapas, numa lista só. Ver `listarCentrosCustoParaFiltro`. */
  centrosCusto: CentroCustoOpcao[];
}

export function FiltrosFluxoCaixaBarra({
  filtros,
  janela,
  centrosCusto,
}: FiltrosFluxoCaixaBarraProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  /**
   * Escreve a janela da régua numa navegação só.
   *
   * Régua limpa significa SEM LIMITE, que aqui é `fluxo_modo=total` — e não a
   * ausência dos parâmetros, que cai no padrão (a janela de doze meses para cada
   * lado). Escrever nada faria o X da régua devolver a pessoa ao padrão em vez de
   * abrir o fluxo inteiro.
   */
  function escreverJanela(de: string, ate: string) {
    const semLimite = de === "" && ate === "";
    setMuitos({
      fluxo_modo: semLimite ? "total" : "periodo",
      fluxo_de: de === "" ? null : de,
      fluxo_ate: ate === "" ? null : ate,
    });
  }

  /**
   * Troca as raízes de um lado e, na MESMA navegação, apaga as etapas que
   * ficaram órfãs.
   *
   * Em duas navegações o `etapa_custo` velho fica pendurado na URL, invisível (o
   * campo some junto com a raiz) e vivo — e volta a recortar o relatório sozinho
   * quando alguém remarcar a raiz depois. Mesma regra do Custo x receita.
   */
  function trocarRaizes(
    chaveCentro: string,
    chaveEtapa: string,
    etapasAtuais: string[],
    ids: string[],
  ) {
    setMuitos({
      [chaveCentro]: escreverListaNaUrl(ids),
      [chaveEtapa]: escreverListaNaUrl(
        etapasValidas(centrosCusto, ids, etapasAtuais),
      ),
    });
  }

  const opcoesCentro = opcoesDeRaiz(centrosCusto);
  const nomesEtapaCusto = rotuloDasEtapas(centrosCusto, filtros.centrosCusto);
  const nomesEtapaReceita = rotuloDasEtapas(
    centrosCusto,
    filtros.centrosReceita,
  );

  const filtrosDaBarra: FiltroDaBarra[] = [
    {
      id: "fluxo_periodo",
      rotulo: "Janela",
      fixo: true,
      // Só conta como filtro fora do padrão: com a janela de sempre, o botão
      // "Limpar filtros" ofereceria apagar uma escolha que ninguém fez. E é a
      // ele que a pessoa volta ao limpar, e não a "tudo": o padrão desta tela é
      // a janela relativa de doze meses para cada lado do mês corrente.
      temValor: filtros.modo !== "janela",
      onLimpar: () =>
        setMuitos({ fluxo_modo: null, fluxo_de: null, fluxo_ate: null }),
      elemento: (
        <FiltroJanelaMeses
          rotulo="Janela"
          // A régua mostra a janela EFETIVA, inclusive no modo padrão, em que ela
          // é calculada a partir do mês corrente. Mostrá-la vazia diria que o
          // fluxo está inteiro na tela quando ele está recortado em 25 meses.
          de={janela.de ?? ""}
          ate={janela.ate ?? ""}
          onJanelaChange={escreverJanela}
        />
      ),
    },
  ];

  filtrosDaBarra.push({
    id: "centro_custo",
    rotulo: "Centros de custo (saídas)",
    fixo: true,
    temValor: filtros.centrosCusto.length > 0,
    onLimpar: () => setMuitos({ centro_custo: null, etapa_custo: null }),
    elemento: (
      <FiltroSelectMulti
        valores={filtros.centrosCusto}
        onValoresChange={(ids) =>
          trocarRaizes("centro_custo", "etapa_custo", filtros.etapasCusto, ids)
        }
        maximo={MAX_ITENS_FILTRO}
        opcoes={opcoesCentro}
        todosRotulo="Todos os centros"
      />
    ),
  });

  if (temEtapasParaEscolher(centrosCusto, filtros.centrosCusto)) {
    filtrosDaBarra.push({
      id: "etapa_custo",
      rotulo: `${nomesEtapaCusto.rotulo} do custo`,
      fixo: true,
      temValor: filtros.etapasCusto.length > 0,
      onLimpar: () => setMuitos({ etapa_custo: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.etapasCusto}
          onValoresChange={(ids) =>
            setMuitos({ etapa_custo: escreverListaNaUrl(ids) })
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesDeEtapa(centrosCusto, filtros.centrosCusto)}
          todosRotulo={nomesEtapaCusto.todos}
        />
      ),
    });
  }

  filtrosDaBarra.push({
    id: "centro_receita",
    rotulo: "Centros de receita (entradas)",
    fixo: true,
    temValor: filtros.centrosReceita.length > 0,
    onLimpar: () => setMuitos({ centro_receita: null, etapa_receita: null }),
    elemento: (
      <FiltroSelectMulti
        valores={filtros.centrosReceita}
        onValoresChange={(ids) =>
          trocarRaizes(
            "centro_receita",
            "etapa_receita",
            filtros.etapasReceita,
            ids,
          )
        }
        maximo={MAX_ITENS_FILTRO}
        opcoes={opcoesCentro}
        todosRotulo="Todos os centros"
      />
    ),
  });

  if (temEtapasParaEscolher(centrosCusto, filtros.centrosReceita)) {
    filtrosDaBarra.push({
      id: "etapa_receita",
      rotulo: `${nomesEtapaReceita.rotulo} da receita`,
      fixo: true,
      temValor: filtros.etapasReceita.length > 0,
      onLimpar: () => setMuitos({ etapa_receita: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.etapasReceita}
          onValoresChange={(ids) =>
            setMuitos({ etapa_receita: escreverListaNaUrl(ids) })
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesDeEtapa(centrosCusto, filtros.centrosReceita)}
          todosRotulo={nomesEtapaReceita.todos}
        />
      ),
    });
  }

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-fluxo-caixa"
      filtros={filtrosDaBarra}
    />
  );
}
