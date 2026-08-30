"use client";

import * as React from "react";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelect,
  useFiltrosUrl,
  type FiltroDaBarra,
  type OpcaoFiltro,
} from "@/components/canonicos";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  etapasDaRaiz,
  rotuloDaEtapa,
  valorAoEscolherEtapa,
  resolverSelecao,
} from "@/modules/_shared/centro-custo/selecao";
import {
  opcoesDeRaiz,
  rotuloDasEtapas,
} from "@/modules/_shared/centro-custo/filtro";
import type { ValoresFiltrosPainel } from "@/modules/gestao/filtros";
import type { OpcaoPainel } from "@/modules/gestao/queries";

/** Largura do seletor de nome comprido (obra tem nome de contrato inteiro). */
const LARGURA_NOME = "max-w-[18rem]";

export interface PainelFiltrosProps {
  valores: ValoresFiltrosPainel;
  /** Raízes e etapas, para a escada de dois campos. */
  centros: CentroCustoOpcao[];
  categorias: OpcaoPainel[];
}

/**
 * Barra de filtros do painel de Gestão: obra, período por mês de referência e
 * categoria financeira.
 *
 * Usa a `BarraFiltrosConfiguravel`, que é a mesma barra das tabelas (mesmo menu
 * "Filtros", mesma persistência por usuário no banco) para a tela que não tem um
 * DataTable onde os filtros possam morar. O painel é gráfico e cartão, então é
 * exatamente esse caso.
 *
 * Trocar filtro NÃO zera página nenhuma aqui: o painel não tem paginação.
 */
export function PainelFiltros({
  valores,
  centros,
  categorias,
}: PainelFiltrosProps) {
  const { setMuitos, limparTodos } = useFiltrosUrl();

  /**
   * A escada de centro de custo, aqui em ESCOLHA ÚNICA.
   *
   * O painel guarda um id só em `centro=` e manda esse id para as RPCs, que
   * agrupam pelo centro escolhido mais fundo. Então os dois campos são uma
   * VISTA do mesmo parâmetro, igual ao formulário de rateio: a raiz enquanto
   * nenhuma etapa foi escolhida, a etapa quando foi. Nenhum link antigo do
   * painel muda de significado.
   */
  const { raizId, etapaId } = resolverSelecao(centros, valores.centro);

  const opcoesCentro = React.useMemo<OpcaoFiltro[]>(
    () => opcoesDeRaiz(centros),
    [centros],
  );

  // Sem `useMemo` de propósito: o React Compiler recusa preservar memoização
  // manual apoiada num valor desestruturado de chamada (`raizId`) e desliga a
  // otimização do componente INTEIRO. São 64 etapas no pior caso, num filtro
  // que só re-renderiza quando a URL muda -- o custo é zero e a alternativa
  // custaria a memoização de tudo o mais nesta barra.
  const etapas = etapasDaRaiz(centros, raizId);

  const opcoesEtapa: OpcaoFiltro[] = etapas.map((etapa) => ({
    valor: etapa.id,
    rotulo: etapa.codigo ? `${etapa.codigo} · ${etapa.nome}` : etapa.nome,
  }));

  // O rótulo do campo é SINGULAR (a escolha é de um só) e o "todos" vem do
  // módulo do filtro, que já sabe que etapa é "todas as" e equipamento é "todos
  // os". Concatenar um "s" aqui escreveria "Todos os etapas".
  const nomeEtapa = rotuloDaEtapa(centros, raizId);
  const todosEtapa = rotuloDasEtapas(centros, raizId ? [raizId] : []).todos;

  const opcoesCategoria = React.useMemo<OpcaoFiltro[]>(
    () =>
      categorias.map((categoria) => ({
        valor: categoria.id,
        rotulo: categoria.nome,
      })),
    [categorias],
  );

  /** Seletor de valor único preso a um parâmetro da URL. */
  function selecao(config: {
    /** Id do filtro na barra, e chave da URL quando `onValor` não vem. */
    chave: string;
    rotulo: string;
    valor: string;
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
    /** Escrita própria, para os dois campos da escada de centro de custo. */
    onValor?: (valor: string) => void;
    onLimpar?: () => void;
  }): FiltroDaBarra {
    return {
      id: config.chave,
      rotulo: config.rotulo,
      temValor: config.valor !== "",
      onLimpar: config.onLimpar ?? (() => setMuitos({ [config.chave]: null })),
      elemento: (
        <FiltroSelect
          valor={config.valor}
          onValorChange={(valor) =>
            config.onValor
              ? config.onValor(valor)
              : setMuitos({ [config.chave]: valor === "" ? null : valor })
          }
          opcoes={config.opcoes}
          placeholder={config.rotulo}
          todosRotulo={config.todosRotulo}
          className={LARGURA_NOME}
        />
      ),
    };
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

  const filtros: FiltroDaBarra[] = [
    selecao({
      chave: "centro",
      // "Obra" era o rótulo, mas a lista sempre teve a manutenção e o escritório
      // dentro. Com a escada abrindo os equipamentos embaixo, chamar de obra
      // ficaria errado em voz alta.
      rotulo: "Centro de custo",
      valor: raizId,
      opcoes: opcoesCentro,
      todosRotulo: "Todos os centros de custo",
      // Trocar a raiz descarta a etapa na MESMA navegação: ela pertencia à raiz
      // anterior, e um par impossível ficaria pendurado na URL.
      onValor: (valor) => setMuitos({ centro: valor === "" ? null : valor }),
    }),
    // O segundo degrau, só quando a raiz escolhida tem o que oferecer.
    ...(etapas.length > 0
      ? [
          selecao({
            chave: "etapa",
            rotulo: nomeEtapa,
            valor: etapaId,
            opcoes: opcoesEtapa,
            todosRotulo: todosEtapa,
            // Esvaziar a etapa devolve para a raiz, nunca para vazio: é a mesma
            // regra do formulário de rateio, e sem ela limpar o detalhe apagaria
            // o recorte inteiro do painel.
            onValor: (valor) =>
              setMuitos({ centro: valorAoEscolherEtapa(raizId, valor) }),
            // Limpar este campo NÃO apaga `centro=`: devolve o painel para a
            // raiz. A chave dele na URL não existe -- os dois campos são vista
            // de um parâmetro só.
            onLimpar: () => setMuitos({ centro: raizId || null }),
          }),
        ]
      : []),
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
    selecao({
      chave: "categoria",
      rotulo: "Categoria",
      valor: valores.categoria,
      opcoes: opcoesCategoria,
      todosRotulo: "Todas as categorias",
    }),
  ];

  return (
    <div className="mb-4">
      <BarraFiltrosConfiguravel onLimparFiltros={limparTodos} idTabela="gestao.painel" filtros={filtros} />
    </div>
  );
}
