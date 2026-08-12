/**
 * Travas de edição do nó de centro de custo.
 *
 * Existia um único conceito de "nó gerido" que misturava quatro coisas: nível 1,
 * centro de sistema, etapa de equipamento e raiz de obra. Ele governava ao mesmo
 * tempo se o nó desativa e se o nome edita, e por isso travava o nome de coisas
 * que deviam poder ser renomeadas (Escritório Central, Manutenção de
 * equipamentos).
 *
 * A pergunta certa para o NOME é outra: esse nome é meu ou é espelho de outro
 * cadastro? Módulo puro, para servidor e UI decidirem igual.
 */

/** Campos que dizem de onde vem o nome do nó. */
export interface OrigemDoNome {
  obra_id: string | null;
  equipamento_id: string | null;
}

/**
 * True quando o nome do nó é espelho de outro cadastro e por isso não se edita
 * aqui: raiz de obra segue o nome da obra (o trigger sincroniza no rename) e
 * etapa de equipamento segue o nome do equipamento. Editar aqui só criaria
 * divergência até o próximo rename da origem.
 *
 * Centro de sistema (Escritório Central, Manutenção de equipamentos) NÃO entra:
 * o nome é dele mesmo, ninguém o sobrescreve, e renomear é legítimo.
 */
export function nomeVemDeOutroCadastro(no: OrigemDoNome): boolean {
  return no.obra_id !== null || no.equipamento_id !== null;
}

/** Onde renomear, quando o nome é espelho. Texto para a UI explicar. */
export function ondeRenomear(no: OrigemDoNome): string | null {
  if (no.obra_id !== null) {
    return "Este nome espelha o da obra. Renomeie a obra em Cadastros > Obras, que o centro acompanha.";
  }
  if (no.equipamento_id !== null) {
    return "Este nome espelha o do equipamento. Renomeie o equipamento em Cadastros > Equipamentos.";
  }
  return null;
}
