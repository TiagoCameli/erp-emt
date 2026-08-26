/**
 * Conversão entre HORAS não trabalhadas e VALOR do desconto, nos dois sentidos.
 * Sem React, sem `use server`.
 *
 * O pedido do Tiago (26/08/2026): "eu posso tanto colocar o desconto de faltas
 * pelas horas não trabalhadas como pelo valor das horas e o app deve fazer o
 * cálculo inverso".
 *
 * QUEM MANDA CONTINUA SENDO O VALOR. As horas são um atalho para preencher o
 * valor e um registro do motivo do desconto ("foram 8 horas"), não uma fórmula
 * que o sistema reaplica. Isso é deliberado e vem de um erro que já custou um
 * centavo em produção: 7,5% de R$ 1.621,00 dá 121,575 — a metade exata — e o
 * contracheque desceu para 121,57 enquanto o sistema subia para 121,58. Quando o
 * número tem de casar com um documento emitido por outro sistema, ele entra
 * digitado. Por isso as duas colunas convivem sem invariante entre elas: o
 * contracheque pode legitimamente dizer "8h, R$ 64,83", e o sistema tem de
 * conseguir gravar os dois números como vieram.
 */

/**
 * Horas de trabalho no mês, para converter salário em valor-hora.
 *
 * FIXO EM 200 PARA TODOS, por decisão do Tiago em 26/08/2026 ("coloque 200h
 * fixas para todos por agora") — o "por agora" está no pedido dele. As jornadas
 * cadastradas hoje seriam 225h (Padrão EMT, 45h/semana, 41 pessoas) e 220h
 * (Padrão EMT 2, 44h/semana, 4 pessoas), e 14 pessoas não têm jornada nenhuma;
 * 200 fixo atravessa os três casos sem depender de cadastro.
 *
 * Quando virar configurável, este é o único lugar a mudar no app — e o gêmeo
 * dele no banco está em `fn_editar_item_folha`, marcado com o mesmo comentário.
 */
export const HORAS_MES = 200;

/** Converte reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Valor de uma hora de trabalho: salário base ÷ 200.
 *
 * A base é o SALÁRIO BASE, sem gratificação — a mesma base do desconto e da
 * provisão em toda a folha. Devolve com as casas que a divisão der, sem
 * arredondar: quem arredonda é quem multiplica, uma vez só, no fim.
 */
export function valorDaHora(salarioBase: number): number {
  if (salarioBase <= 0) return 0;
  return salarioBase / HORAS_MES;
}

/**
 * Horas → valor. É o sentido "faltou 8 horas, quanto desconto?".
 *
 * Arredonda em 2 casas UMA vez, no fim, porque é isso que vai para o campo de
 * dinheiro. O resultado é uma SUGESTÃO editável: se o contracheque disser outro
 * centavo, quem vale é o contracheque.
 */
export function valorDasHoras(salarioBase: number, horas: number): number {
  if (salarioBase <= 0 || horas <= 0) return 0;
  // A divisão por 200 vem ANTES do arredondamento: arredondar o produto e só
  // então dividir devolvia R$ 100,0157 em vez de R$ 100,02, porque o `round`
  // caía em centavos de HORA e não em centavos de real. Mesmo tropeço da prévia
  // do percentual, e de novo foi o teste que pegou.
  return Math.round((centavos(salarioBase) * horas) / HORAS_MES) / 100;
}

/**
 * Valor → horas. É o sentido inverso: "descontei R$ 100, quantas horas dá?".
 *
 * Arredonda em 2 casas de hora (o que a coluna `numeric(8,2)` guarda). A volta
 * NÃO é exata: 12,34 h × R$ 8,105 dá R$ 100,02, e não os R$ 100,00 de onde saiu.
 * Isso é da natureza da conversão, e é mais um motivo para o valor ser a fonte
 * da verdade — a tela nunca reescreve o valor a partir das horas que ela mesma
 * derivou.
 */
export function horasDoValor(salarioBase: number, valor: number): number {
  const hora = valorDaHora(salarioBase);
  if (hora <= 0 || valor <= 0) return 0;
  return Math.round((valor / hora) * 100) / 100;
}
