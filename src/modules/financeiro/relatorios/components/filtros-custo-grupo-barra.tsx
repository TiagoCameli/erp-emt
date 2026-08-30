"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroSelect,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import type {
  CategoriaOpcao,
  CentroCustoOpcao,
} from "@/modules/financeiro/lancamentos/queries";
import {
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import type { FiltrosCustoGrupo } from "@/modules/financeiro/relatorios/filtros-custo-grupo";
import { camposDePeriodo } from "@/modules/financeiro/relatorios/components/filtros-periodo-barra";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

/**
 * Barra de filtros do relatório de Custo por grupo de insumo.
 *
 * Oferece os quatro controles que a `fn_rel_custo_por_grupo` sabe responder: o
 * período (nos três modos do irmão), o centro de custo em escada (raiz e etapa) e
 * a categoria financeira. Escolha SIMPLES nos três de dimensão, porque a função
 * recebe `p_centro_custo uuid` e `p_categoria uuid` no singular — a lista de
 * verdade é RPC nova, e oferecer marcação múltipla aqui exigiria somar N chamadas
 * no app em cada um dos três níveis do drill.
 *
 * `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório está
 * aberto, e apagá-lo devolveria a pessoa ao Fluxo de caixa.
 */
export function FiltrosCustoGrupoBarra({
  filtros,
  centrosCusto,
  categorias,
}: {
  filtros: FiltrosCustoGrupo;
  centrosCusto: CentroCustoOpcao[];
  categorias: CategoriaOpcao[];
}) {
  const { get, setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  const raizes = filtros.centroId ? [filtros.centroId] : [];
  const nomesEtapa = rotuloDasEtapas(centrosCusto, raizes);

  /**
   * Troca a raiz e, na MESMA navegação, apaga a etapa que ficou órfã.
   *
   * Em duas navegações o `etapa=<uuid>` fica pendurado na URL, invisível (o campo
   * some junto com a raiz dele) e vivo — e volta a recortar o relatório sozinho
   * quando alguém remarcar aquela raiz depois.
   */
  function trocarRaiz(id: string) {
    setMuitos({
      centro: id || null,
      etapa: etapasValidas(centrosCusto, id ? [id] : [], [filtros.etapaId])[0] ?? null,
    });
  }

  const filtrosDaBarra: FiltroDaBarra[] = [
    ...camposDePeriodo({
      escolha: filtros,
      mesNaUrl: get("mes") !== null,
      setMuitos,
    }),
    {
      id: "centro",
      rotulo: "Centro de custo",
      temValor: filtros.centroId !== "",
      onLimpar: () => setMuitos({ centro: null, etapa: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.centroId}
          onValorChange={trocarRaiz}
          opcoes={opcoesDeRaiz(centrosCusto)}
          todosRotulo="Todos os centros"
        />
      ),
    },
  ];

  // O segundo campo da escada só entra na barra quando há o que escolher nele:
  // das 15 raízes que os relatórios oferecem, uma só tem filho hoje.
  if (temEtapasParaEscolher(centrosCusto, raizes)) {
    filtrosDaBarra.push({
      id: "etapa",
      rotulo: nomesEtapa.rotulo,
      fixo: true,
      temValor: filtros.etapaId !== "",
      onLimpar: () => setMuitos({ etapa: null }),
      elemento: (
        <FiltroSelect
          valor={filtros.etapaId}
          onValorChange={(id) => setMuitos({ etapa: id || null })}
          opcoes={opcoesDeEtapa(centrosCusto, raizes)}
          todosRotulo={nomesEtapa.todos}
        />
      ),
    });
  }

  filtrosDaBarra.push({
    id: "categoria",
    rotulo: "Categoria",
    temValor: filtros.categoriaId !== "",
    onLimpar: () => setMuitos({ categoria: null }),
    elemento: (
      <FiltroSelect
        valor={filtros.categoriaId}
        onValorChange={(id) => setMuitos({ categoria: id || null })}
        opcoes={categorias.map((categoria) => ({
          valor: categoria.id,
          rotulo: categoria.nome,
        }))}
        todosRotulo="Todas as categorias"
      />
    ),
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-custo-grupo"
      filtros={filtrosDaBarra}
    />
  );
}
