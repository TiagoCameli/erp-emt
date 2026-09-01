"use client";

import * as React from "react";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
  type OpcaoFiltro,
} from "@/components/canonicos";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import type { ValoresFiltrosPainel } from "@/modules/gestao/filtros";
import type { OpcaoPainel } from "@/modules/gestao/queries";

export interface PainelFiltrosProps {
  valores: ValoresFiltrosPainel;
  /** Raízes e etapas, para a escada de dois campos. */
  centros: CentroCustoOpcao[];
  categorias: OpcaoPainel[];
}

/**
 * Barra de filtros do painel de Gestão: centros de custo, período por mês de
 * referência e categorias financeiras.
 *
 * Usa a `BarraFiltrosConfiguravel`, que é a mesma barra das tabelas (mesmo menu
 * "Filtros", mesma persistência por usuário no banco) para a tela que não tem um
 * DataTable onde os filtros possam morar. O painel é gráfico e cartão, então é
 * exatamente esse caso.
 *
 * ## Escolha MÚLTIPLA desde 01/09/2026
 *
 * Era escolha única até aqui, e o painel foi a última tela de custo a virar. O
 * pedido do dono foi direto ("quero poder selecionar mais de um centro de custo
 * de uma única vez"), e a comparação entre duas obras era impossível: dava para
 * ver uma, ou o total da empresa, nunca duas lado a lado.
 *
 * A escada de dois campos (raiz num, etapa no outro) e a regra de tradução para o
 * banco são as MESMAS do relatório de Custo por CC, e moram em
 * `_shared/centro-custo/filtro.ts`. Nada aqui reimplementa: um segundo jeito de
 * transformar raiz+etapa em lista de ids faria duas telas de dinheiro somarem
 * conjuntos diferentes com o mesmo filtro na cara.
 *
 * Trocar filtro NÃO zera página nenhuma aqui: o painel não tem paginação.
 */
export function PainelFiltros({
  valores,
  centros,
  categorias,
}: PainelFiltrosProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();

  const opcoesCentro = React.useMemo<OpcaoFiltro[]>(
    () => opcoesDeRaiz(centros),
    [centros],
  );

  const opcoesCategoria = React.useMemo<OpcaoFiltro[]>(
    () =>
      categorias.map((categoria) => ({
        valor: categoria.id,
        rotulo: categoria.nome,
      })),
    [categorias],
  );

  /** Escreve uma lista de ids num parâmetro, ou remove o parâmetro (= todos). */
  function trocarLista(chave: string, ids: string[]) {
    setMuitos({ [chave]: escreverListaNaUrl(ids) });
  }

  /**
   * Troca as raízes e, na MESMA navegação, apaga as etapas que ficaram órfãs.
   *
   * Em duas navegações o `etapa=<uuid>` fica pendurado na URL, invisível (o campo
   * some junto com a raiz dele) e vivo — e volta a recortar o painel sozinho
   * quando alguém remarcar aquela raiz meia hora depois.
   */
  function trocarRaizes(ids: string[]) {
    setMuitos({
      centro: escreverListaNaUrl(ids),
      etapa: escreverListaNaUrl(etapasValidas(centros, ids, valores.etapa)),
    });
  }

  /**
   * Uma ponta do período, gravada sozinha: dá para filtrar só "de" ou só "até".
   *
   * `rotuloCampo` é o que aparece ao lado do campo, e é diferente do `rotulo` do
   * menu "Filtros": os dois campos ficam lado a lado, e com o rótulo padrão do
   * FiltroMes os dois liam "Mês de referência", sem dizer qual era o começo.
   */
  function mes(config: {
    chave: string;
    rotulo: string;
    rotuloCampo: string;
    valor: string;
  }): FiltroDaBarra {
    return {
      id: config.chave,
      rotulo: config.rotulo,
      temValor: config.valor !== "",
      onLimpar: () => setMuitos({ [config.chave]: null }),
      elemento: (
        <FiltroMes
          rotulo={config.rotuloCampo}
          valor={config.valor}
          onValorChange={(novo) =>
            setMuitos({ [config.chave]: novo === "" ? null : novo })
          }
        />
      ),
    };
  }

  const nomesEtapa = rotuloDasEtapas(centros, valores.centro);

  const filtros: FiltroDaBarra[] = [
    {
      id: "centro",
      // "Obra" era o rótulo, mas a lista sempre teve a manutenção e o escritório
      // dentro. Com a escada abrindo os equipamentos embaixo, chamar de obra
      // ficaria errado em voz alta.
      rotulo: "Centro de custo",
      temValor: valores.centro.length > 0,
      onLimpar: () => setMuitos({ centro: null, etapa: null }),
      elemento: (
        <FiltroSelectMulti
          valores={valores.centro}
          onValoresChange={trocarRaizes}
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesCentro}
          todosRotulo="Todos os centros de custo"
        />
      ),
    },
  ];

  // O segundo degrau da escada só entra na barra quando há o que escolher nele.
  // Fixo, ficaria vazio e inerte em quase toda abertura da tela: das 17 raízes,
  // duas só têm filho hoje.
  if (temEtapasParaEscolher(centros, valores.centro)) {
    filtros.push({
      id: "etapa",
      rotulo: nomesEtapa.rotulo,
      fixo: true,
      temValor: valores.etapa.length > 0,
      // Limpar este campo NÃO apaga `centro=`: devolve o painel para as raízes.
      onLimpar: () => setMuitos({ etapa: null }),
      elemento: (
        <FiltroSelectMulti
          valores={valores.etapa}
          onValoresChange={(ids) => trocarLista("etapa", ids)}
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesDeEtapa(centros, valores.centro)}
          todosRotulo={nomesEtapa.todos}
        />
      ),
    });
  }

  filtros.push(
    mes({
      chave: "mes_de",
      rotulo: "Mês inicial",
      rotuloCampo: "Mês de referência de",
      valor: valores.mesDe,
    }),
    mes({
      chave: "mes_ate",
      rotulo: "Mês final",
      rotuloCampo: "até",
      valor: valores.mesAte,
    }),
    {
      id: "categoria",
      rotulo: "Categoria",
      temValor: valores.categoria.length > 0,
      onLimpar: () => setMuitos({ categoria: null }),
      elemento: (
        <FiltroSelectMulti
          valores={valores.categoria}
          onValoresChange={(ids) => trocarLista("categoria", ids)}
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesCategoria}
          todosRotulo="Todas as categorias"
        />
      ),
    },
  );

  return (
    <div className="mb-4">
      <BarraFiltrosConfiguravel
        onLimparFiltros={limparTodos}
        idTabela="gestao.painel"
        filtros={filtros}
      />
    </div>
  );
}
