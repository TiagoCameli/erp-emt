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
import type { ValoresFiltrosPainel } from "@/modules/gestao/filtros";
import type { OpcaoPainel } from "@/modules/gestao/queries";

/** Largura do seletor de nome comprido (obra tem nome de contrato inteiro). */
const LARGURA_NOME = "max-w-[18rem]";

export interface PainelFiltrosProps {
  valores: ValoresFiltrosPainel;
  centros: OpcaoPainel[];
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

  const opcoesCentro = React.useMemo<OpcaoFiltro[]>(
    () => centros.map((centro) => ({ valor: centro.id, rotulo: centro.nome })),
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

  /** Seletor de valor único preso a um parâmetro da URL. */
  function selecao(config: {
    chave: string;
    rotulo: string;
    valor: string;
    opcoes: OpcaoFiltro[];
    todosRotulo: string;
  }): FiltroDaBarra {
    return {
      id: config.chave,
      rotulo: config.rotulo,
      temValor: config.valor !== "",
      onLimpar: () => setMuitos({ [config.chave]: null }),
      elemento: (
        <FiltroSelect
          valor={config.valor}
          onValorChange={(valor) =>
            setMuitos({ [config.chave]: valor === "" ? null : valor })
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
      rotulo: "Obra",
      valor: valores.centro,
      opcoes: opcoesCentro,
      todosRotulo: "Todas as obras",
    }),
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
