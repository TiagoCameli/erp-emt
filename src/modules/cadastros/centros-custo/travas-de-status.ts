/**
 * Quem pode ligar e desligar um nó da árvore de centros de custo.
 *
 * Módulo puro, e não uma linha de `if` dentro da action, porque a regra vale nos
 * DOIS lados: a action recusa, e a árvore esconde o item de menu que a action
 * recusaria. Quando essa dupla mora em dois lugares, um deles envelhece — e o
 * sintoma é um menu que oferece uma ação que sempre dá erro, ou (o que
 * aconteceu aqui) uma trava de servidor sem caminho nenhum na tela.
 *
 * ## A assimetria é o ponto
 *
 * **Desativar** um centro (nível 1) ou um nó gerido é proibido por aqui: o ciclo
 * de vida deles pertence ao cadastro de origem — a Obra cria e renomeia o centro
 * raiz dela, o equipamento e o seed de sistema idem.
 *
 * **Reativar** é livre. Não apaga nada, se desfaz com um clique, e a trava
 * simétrica de antes deixava um nó inativo sem nenhum caminho de volta: em
 * 22/08/2026 o centro "Investimentos" foi desativado por acesso direto ao banco
 * (a auditoria registrou o UPDATE sem usuário) enquanto a Obra dele continuava
 * ativa, e o nó ficou na árvore, esmaecido, com um menu que não tinha o que
 * clicar.
 */

/** O que decide as travas de um nó. Os dois lados normalizam para isto. */
export interface NoParaTrava {
  /** 1 = centro (raiz), 2 = etapa, 3 = item. */
  nivel: number;
  /** Nasceu de outro cadastro: seed do sistema, equipamento ou obra. */
  gerido: boolean;
}

/**
 * Por que este nó não pode ser DESATIVADO pela árvore? `null` quando pode.
 *
 * A mensagem é a que a action devolve e o usuário lê, então ela mora aqui junto
 * da regra, e não solta no `catch` de quem chama.
 */
export function motivoParaNaoDesativar(no: NoParaTrava): string | null {
  if (no.nivel === 1) {
    return "Centros não podem ser desativados aqui. São geridos pelo sistema";
  }
  if (no.gerido) {
    return "Este nó é gerido pelo sistema e não pode ser desativado";
  }
  return null;
}

/**
 * Por que este nó não pode mudar para `ativo`? `null` quando pode.
 *
 * Ligar nunca tem impedimento; quem tem trava é desligar.
 */
export function motivoParaNaoAlternar(
  no: NoParaTrava,
  paraAtivo: boolean,
): string | null {
  return paraAtivo ? null : motivoParaNaoDesativar(no);
}
