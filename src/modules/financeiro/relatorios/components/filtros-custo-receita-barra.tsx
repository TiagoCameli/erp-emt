"use client";

import {
  BarraFiltrosConfiguravel,
  FiltroSelectMulti,
  useFiltrosUrl,
  type FiltroDaBarra,
} from "@/components/canonicos";
import { FiltroJanelaMeses } from "@/modules/financeiro/relatorios/components/filtro-janela-meses";
import { escritaDaJanela } from "@/modules/financeiro/relatorios/filtros-periodo";
import type { CentroCustoOpcao } from "@/modules/financeiro/lancamentos/queries";
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
import type { FiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";
import { PARAMS_DE_NAVEGACAO } from "@/modules/financeiro/relatorios/relatorios";

export interface FiltrosCustoReceitaBarraProps {
  filtros: FiltrosCustoReceita;
  /** Raízes e etapas, numa lista só. Ver `listarCentrosCustoParaFiltro`. */
  centrosCusto: CentroCustoOpcao[];
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
 * 3. **O tempo é UM filtro só: a régua de mês de referência**, a mesma de
 *    Lançamentos. Até 19/09/2026 eram três trilhos para a mesma pergunta (uma
 *    lista de meses avulsos, um campo De e um campo Até), e os dois lados
 *    brigavam: marcar mês apagava a janela, que ficava à vista, vazia e inerte.
 *    O print que o Tiago mandou é justamente esse pedaço da barra.
 */
export function FiltrosCustoReceitaBarra({
  filtros,
  centrosCusto,
}: FiltrosCustoReceitaBarraProps) {
  // `naoSaoFiltro` preserva o `rel` no "Limpar filtros": ele diz qual relatório
  // está aberto, e apagá-lo devolvia a pessoa ao Fluxo de caixa.
  const { setMuitos, limparTodos } = useFiltrosUrl({
    naoSaoFiltro: PARAMS_DE_NAVEGACAO,
  });

  const opcoesCentro = opcoesDeRaiz(centrosCusto);

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

  filtrosDaBarra.push({
    id: "mes_ref",
    rotulo: "Mês de referência",
    fixo: true,
    temValor: filtros.de !== "" || filtros.ate !== "",
    // `mes_ref` é apagado junto: quem chegou por link do formato antigo e limpa
    // o filtro não pode ficar com os meses presos na URL, invisíveis na barra.
    onLimpar: () =>
      setMuitos({ modo: null, de: null, ate: null, mes_ref: null }),
    elemento: (
      <FiltroJanelaMeses
        de={filtros.de}
        ate={filtros.ate}
        // A MESMA escrita dos outros relatórios de competência, de propósito: os
        // parâmetros de tempo têm nome igual nos quatro para que trocar de
        // relatório na barra de cima mantenha o recorte em vez de jogá-lo fora.
        // Esta tela ignora o `modo` na leitura (aqui janela vazia já é "todos os
        // meses"), mas quem sair daqui para o DRE leva a janela junto.
        //
        // `mes_ref` vai junto no lixo: é o formato antigo da mesma pergunta, e
        // dois filtros para uma pergunta só é o caminho para eles discordarem.
        onJanelaChange={(de, ate) =>
          setMuitos({ ...escritaDaJanela(de, ate), mes_ref: null })
        }
      />
    ),
  });

  return (
    <BarraFiltrosConfiguravel
      onLimparFiltros={limparTodos}
      idTabela="relatorio-custo-receita"
      filtros={filtrosDaBarra}
    />
  );
}
