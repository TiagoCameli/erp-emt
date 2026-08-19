/**
 * Regras puras da exceção "pagou fora da data autorizada".
 *
 * A data autorizada é a `data_programada` da parcela, definida por quem aprova.
 * Pagar em outra data deixou de ser recusa e passou a ser exceção auditada: o
 * banco (`fn_pagar_parcela`) exige motivo e grava o evento
 * `pagou_fora_da_janela`. O que está aqui serve para a tela pedir o motivo
 * antes de mandar, e para o rótulo dizer de quanto é a diferença.
 *
 * Datas em "YYYY-MM-DD". A comparação é textual (ISO ordena como data) e a
 * contagem de dias passa por `Date.UTC`, nunca por `new Date(string)` com fuso
 * local: a base exibe em America/Rio_Branco (UTC-5), e um dia de diferença
 * viraria zero ou dois. É a mesma técnica de `diasAtras` em `@/lib/formatadores`,
 * que não serve aqui porque conta sempre contra hoje.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * O pagamento está fora da data autorizada?
 *
 * Sem data autorizada é `false` de propósito: o banco recusa esse caso por
 * outro motivo ("aprovada sem data programada: reprograme a data antes de
 * pagar"), e pedir motivo aqui trocaria a mensagem certa por uma errada.
 * Data do pagamento ainda vazia (o input `type="date"` limpo) também é `false`:
 * não há o que comparar, e o campo de motivo não deve aparecer sozinho.
 */
export function foraDaJanela(
  dataPagamento: string,
  dataAutorizada: string | null,
): boolean {
  if (!dataAutorizada || !ISO.test(dataAutorizada)) return false;
  if (!ISO.test(dataPagamento)) return false;
  return dataPagamento !== dataAutorizada;
}

/**
 * "adiantado em 3 dias" / "atrasado em 1 dia", para o rótulo do campo de motivo
 * dizer o tamanho da exceção que o operador está registrando. Datas iguais (ou
 * fora do formato) devolvem string vazia: quem chama só usa isto quando
 * `foraDaJanela` é verdadeiro.
 */
export function textoDaDiferenca(
  dataPagamento: string,
  dataAutorizada: string,
): string {
  if (!ISO.test(dataPagamento) || !ISO.test(dataAutorizada)) return "";

  const informada = Date.parse(`${dataPagamento}T00:00:00Z`);
  const autorizada = Date.parse(`${dataAutorizada}T00:00:00Z`);
  if (Number.isNaN(informada) || Number.isNaN(autorizada)) return "";

  const dias = Math.round((informada - autorizada) / UM_DIA);
  if (dias === 0) return "";

  const quantidade = Math.abs(dias);
  const plural = quantidade === 1 ? "dia" : "dias";
  return `${dias < 0 ? "adiantado" : "atrasado"} em ${quantidade} ${plural}`;
}
