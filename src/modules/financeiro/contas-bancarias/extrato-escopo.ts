/**
 * Contrato da URL do extrato de conta: quanto do histórico a página busca.
 *
 * Vive num módulo próprio e puro porque a página (Server Component) LÊ e o
 * seletor da tabela ESCREVE o mesmo parâmetro. Com a regra em dois lugares, o
 * seletor grava um valor que a página não reconhece e a tela volta ao padrão sem
 * dizer nada.
 *
 * POR QUE ESTE FILTRO MORA NA URL, e não em memória como os outros do extrato: é
 * o único que muda o que o SERVIDOR busca. Os demais (busca, sentido, período,
 * faixa de valor) rodam sobre as linhas que já chegaram.
 *
 * E POR QUE ELE EXISTE, que é a parte que não se adivinha do código: por VOLUME,
 * não por regra. A conta operacional (BB 102.124-9) tem 5.939 movimentos
 * registrados, dos quais 5.886 são anteriores à data de corte do saldo inicial —
 * dinheiro que JÁ ESTÁ dentro do saldo de abertura e não pode ser somado de novo.
 * Trazer os 5.939 na abertura da tela custa segundos por nada, já que a pergunta
 * de sempre é "o que mexeu no saldo que estou vendo". Quem quiser o histórico
 * inteiro pede, e as linhas antigas vêm marcadas, sem saldo acumulado próprio.
 */

/** Parâmetro da URL que carrega a escolha. */
export const PARAM_ESCOPO = "escopo";

/** Valor que pede o histórico inteiro. A ausência do parâmetro é o padrão. */
export const ESCOPO_TUDO = "tudo";

/**
 * Os dois escopos possíveis. `saldo` é o padrão e não aparece na URL: gravar o
 * padrão faria todo link de extrato carregar um parâmetro que não muda nada.
 */
export type EscopoExtrato = "saldo" | typeof ESCOPO_TUDO;

/**
 * Lê o escopo da URL. Qualquer coisa diferente de `tudo` (inclusive ausente, ou
 * lixo colado à mão) cai no padrão: escopo inválido não pode virar tela vazia.
 */
export function lerEscopoDaUrl(
  valor: string | string[] | undefined,
): EscopoExtrato {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return bruto === ESCOPO_TUDO ? ESCOPO_TUDO : "saldo";
}

/** O escopo pede o movimento anterior à data de corte? */
export function incluiAnteriores(escopo: EscopoExtrato): boolean {
  return escopo === ESCOPO_TUDO;
}
