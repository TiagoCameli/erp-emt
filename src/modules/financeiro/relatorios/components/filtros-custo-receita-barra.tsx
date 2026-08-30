"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroMes,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import type { CentroCustoOpcao } from "@/modules/financeiro/lancamentos/queries";
import {
  escreverListaNaUrl,
  MAX_ITENS_FILTRO,
} from "@/modules/financeiro/_shared/listas-na-url";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import {
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/_shared/centro-custo/filtro";
import {
  MAX_MESES,
  type FiltrosCustoReceita,
} from "@/modules/financeiro/relatorios/filtros-custo-receita";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

const MOTIVO_PERIODO_DESABILITADO =
  "Há mês de referência marcado, e o mês marcado manda. Limpe os meses para voltar a usar a janela.";

export interface FiltrosCustoReceitaBarraProps {
  filtros: FiltrosCustoReceita;
  /** Só os meses que TÊM lançamento, em ordem crescente (yyyy-MM). */
  mesesDisponiveis: string[];
  /** Raízes e etapas, numa lista só. Ver `listarCentrosCustoParaFiltro`. */
  centrosCusto: CentroCustoOpcao[];
  periodoDesabilitado: boolean;
}

/**
 * Barra de filtros do relatório de Custo x receita.
 *
 * Três coisas aqui não são enfeite:
 *
 * 1. **Dois seletores de centro**, um para o custo e um para a receita, com o
 *    MESMO cadastro nos dois. É o pedido, e a base explica: sete centros têm
 *    custo e receita zero (carretas, equipamentos, escritório, casas), então
 *    comparar "o custo da obra mais o das máquinas dela" contra "a receita da
 *    obra" precisa dos dois lados soltos.
 * 2. **Cada lado escolhe em dois campos: a raiz e, quando ela tem, a etapa.** O
 *    campo de etapa nasce escondido e aparece só quando a raiz escolhida tem
 *    filho. É o conserto do que o Tiago pegou em 27/08/2026: com tudo num campo
 *    só, 61 das 76 opções eram equipamentos da mesma raiz e a lista desenhava
 *    sessenta e uma linhas idênticas, "Manutenção/Docume…", porque o nome que as
 *    distinguia vinha depois do corte do seletor.
 * 3. **A janela apaga quando há mês marcado.** O campo continua visível, com o
 *    motivo no title, em vez de sumir: filtro que desaparece deixa a pessoa
 *    procurando, e filtro que fica valendo em silêncio faz ela desconfiar do
 *    número.
 *
 * Os meses oferecidos são só os que existem em lançamento não cancelado. Um
 * calendário aberto deixaria escolher março de 2019 e ler "sem dados" como
 * resposta, quando a resposta é "esse mês não existe nesta base".
 */
export function FiltrosCustoReceitaBarra({
  filtros,
  mesesDisponiveis,
  centrosCusto,
  periodoDesabilitado,
}: FiltrosCustoReceitaBarraProps) {
  // `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório
  // está aberto, e apagá-lo devolvia a pessoa ao Fluxo de caixa.
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  const opcoesCentro = opcoesDeRaiz(centrosCusto);

  // Do mês mais novo para o mais velho: quem abre o seletor quer o mês recente.
  const opcoesMes = [...mesesDisponiveis].reverse().map((mes) => ({
    valor: mes,
    rotulo: rotuloMes(mes),
  }));

  /**
   * Troca as raízes de um lado e, na MESMA navegação, apaga as etapas que
   * ficaram órfãs.
   *
   * Em duas navegações o `etapa_custo` velho fica pendurado na URL, invisível
   * (o campo some junto com a raiz) e vivo — e volta a recortar o relatório
   * sozinho quando alguém remarcar a raiz depois. É a mesma regra que a troca de
   * modo do relatório de custo por centro já segue.
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

  const nomesEtapaCusto = rotuloDasEtapas(centrosCusto, filtros.centrosCusto);
  const nomesEtapaReceita = rotuloDasEtapas(
    centrosCusto,
    filtros.centrosReceita,
  );

  const filtrosDaBarra: FiltroDaBarra[] = [
    {
      id: "centro_custo",
      rotulo: "Centros do custo",
      fixo: true,
      temValor: filtros.centrosCusto.length > 0,
      onLimpar: () => setMuitos({ centro_custo: null, etapa_custo: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.centrosCusto}
          onValoresChange={(ids) =>
            trocarRaizes(
              "centro_custo",
              "etapa_custo",
              filtros.etapasCusto,
              ids,
            )
          }
          maximo={MAX_ITENS_FILTRO}
          opcoes={opcoesCentro}
          todosRotulo="Todos os centros"
        />
      ),
    },
  ];

  // Só entra na barra quando há o que escolher. Fixo, ele ficaria vazio e inerte
  // em quase toda abertura da tela: das 15 raízes que os relatórios oferecem,
  // uma só tem filho hoje.
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
    rotulo: "Centros da receita",
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

  filtrosDaBarra.push(
    {
      id: "mes_ref",
      rotulo: "Meses de referência",
      fixo: true,
      temValor: filtros.meses.length > 0,
      onLimpar: () => setMuitos({ mes_ref: null }),
      elemento: (
        <FiltroSelectMulti
          valores={filtros.meses}
          onValoresChange={(meses) =>
            setMuitos({ mes_ref: escreverListaNaUrl(meses, MAX_MESES) })
          }
          maximo={MAX_MESES}
          opcoes={opcoesMes}
          todosRotulo="Todos os meses"
        />
      ),
    },
    {
      id: "de",
      rotulo: "De",
      temValor: filtros.de !== "",
      onLimpar: () => setMuitos({ de: null }),
      elemento: (
        <FiltroMes
          rotulo="De"
          valor={filtros.de}
          desabilitado={periodoDesabilitado}
          motivo={MOTIVO_PERIODO_DESABILITADO}
          onValorChange={(valor) => setMuitos({ de: valor || null })}
        />
      ),
    },
    {
      id: "ate",
      rotulo: "Até",
      temValor: filtros.ate !== "",
      onLimpar: () => setMuitos({ ate: null }),
      elemento: (
        <FiltroMes
          rotulo="Até"
          valor={filtros.ate}
          desabilitado={periodoDesabilitado}
          motivo={MOTIVO_PERIODO_DESABILITADO}
          onValorChange={(valor) => setMuitos({ ate: valor || null })}
        />
      ),
    },
  );

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-custo-receita"
      filtros={filtrosDaBarra}
    />
  );
}
