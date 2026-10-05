/**
 * O "Incluir investimentos" das telas de custo, na URL.
 *
 * Desde a decisão D3 (03/10/2026) o CAPEX (Aquisição de Equipamento,
 * Investimentos, Compra de Terreno: R$ 5.210.383,43 em jan-set/2026) tem
 * natureza própria e fica FORA do custo das obras. A pergunta "quanto a obra
 * custou, contando a máquina que comprei para ela" continua legítima, e é ela
 * que o checkbox responde: ligado, a família `fn_rel_custo_*` recebe
 * `p_incluir_investimento = true` e cada total sobe exatamente o CAPEX.
 *
 * Um parâmetro só, com o MESMO nome nas quatro telas (Custo por centro, Custo
 * por grupo, Custo x receita e o Painel de Gestão). Trocar de relatório pela
 * barra de cima mantém a escolha, e o link do cartão "Custo do mês" do Painel
 * leva o recorte para o relatório sem tradução nenhuma.
 *
 * Desligado é a AUSÊNCIA do parâmetro, nunca `=0`: é o padrão do banco, e um
 * link antigo (sem ele) continua abrindo o número que sempre abriu.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** O nome do parâmetro na URL. */
export const PARAM_INCLUIR_INVESTIMENTO = "com_investimento";

/** Liga só no literal "1": qualquer outro texto é URL mal montada. */
export function lerIncluirInvestimento(
  valor: string | string[] | undefined,
): boolean {
  return valor === "1";
}

/** O que escrever na URL ao marcar ou desmarcar (null remove o parâmetro). */
export function escritaIncluirInvestimento(marcado: boolean): {
  [PARAM_INCLUIR_INVESTIMENTO]: string | null;
} {
  return { [PARAM_INCLUIR_INVESTIMENTO]: marcado ? "1" : null };
}

/**
 * O pedaço do recorte que vai no título da aba exportada.
 *
 * Só aparece quando LIGADO: a planilha sem sufixo é o padrão do sistema, e quem
 * a recebe por e-mail precisa saber quando o número traz máquina e terreno
 * dentro, porque ele não fecha com o DRE nem com o custo de outra exportação.
 */
export function sufixoInvestimento(incluir: boolean): string {
  return incluir ? " · com investimentos" : "";
}
