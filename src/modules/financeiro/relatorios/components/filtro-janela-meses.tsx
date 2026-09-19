"use client";

import { FiltroMesPeriodo } from "@/components/canonicos";

export interface FiltroJanelaMesesProps {
  /** Primeiro mês da janela, `yyyy-MM`. Vazio = sem limite desse lado. */
  de: string;
  /** Último mês da janela, `yyyy-MM`. Vazio = sem limite desse lado. */
  ate: string;
  /** Recebe as duas pontas juntas, em `yyyy-MM`. Uma navegação só. */
  onJanelaChange: (de: string, ate: string) => void;
  rotulo?: string;
}

/**
 * A régua de mês de referência dos RELATÓRIOS.
 *
 * É o canônico `FiltroMesPeriodo` (o mesmo de Lançamentos, régua de anos,
 * trimestres e meses num popover) com um adaptador de formato: a régua fala
 * `yyyy-MM-01`, que é o dia que a coluna `mes_competencia` guarda, e a URL dos
 * relatórios guarda `yyyy-MM` desde sempre, porque lá o mês vinha de um
 * `input type="month"`.
 *
 * O adaptador mora aqui, e não no canônico, por dois motivos. O canônico é usado
 * por telas que comparam as duas pontas entre si e contra a coluna do banco, e
 * um segundo formato de entrada abriria a porta para elas divergirem. E trocar o
 * formato da URL dos relatórios quebraria todo link salvo e todo drill que já
 * escreve `de=2026-08`.
 *
 * Pedido do Tiago em 19/09/2026, com o print do Custo x receita: "filtro de mês
 * e data nos relatórios devem funcionar do mesmo jeito que funciona na área de
 * lançamentos". Antes daqui cada relatório tinha DOIS ou TRÊS trilhos para a
 * mesma pergunta (um seletor de modo, um campo De e um campo Até nativos), e ler
 * "de ---- até ----" em dois campos vazios não diz que o relatório está mostrando
 * tudo.
 */
export function FiltroJanelaMeses({
  de,
  ate,
  onJanelaChange,
  rotulo,
}: FiltroJanelaMesesProps) {
  return (
    <FiltroMesPeriodo
      de={de === "" ? "" : `${de}-01`}
      ate={ate === "" ? "" : `${ate}-01`}
      onPeriodoChange={(novoDe, novoAte) =>
        onJanelaChange(novoDe.slice(0, 7), novoAte.slice(0, 7))
      }
      rotulo={rotulo}
    />
  );
}
