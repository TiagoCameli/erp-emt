/**
 * Limite de tamanho de anexo, em UM lugar só.
 *
 * Este arquivo é importado pelo `next.config.ts`, pelo servidor e por component
 * de cliente ao mesmo tempo, então NÃO pode importar nada: nem `server-only`,
 * nem React, nem env. É constante pura de propósito.
 *
 * O arquivo atravessa três limites e o menor manda:
 *
 * 1. O que a tela recusa antes de gastar upload (este número).
 * 2. `experimental.serverActions.bodySizeLimit` no `next.config.ts`. Sem
 *    configurar, o Next corta o CORPO da requisição em 1 MB e devolve
 *    "Body exceeded 1 MB limit" ANTES da action rodar — a permissão nem é
 *    checada, o arquivo nem chega.
 * 3. O teto de payload de function da Vercel, ~4,5 MB. Esse não é
 *    configurável: acima dele a borda responde 413 FUNCTION_PAYLOAD_TOO_LARGE
 *    e a function nem é invocada.
 *
 * Por isso 4 MB e não os 25 MB que a tela anunciava: 25 MB nunca funcionaram,
 * a Vercel não deixa. Para passar disso, o binário precisa ir do navegador
 * direto para o Storage por URL assinada, sem atravessar a server action.
 */
export const ANEXO_TAMANHO_MAXIMO_MB = 4;

/** Igual ao limite do arquivo em bytes, para as contas de validação. */
export const ANEXO_TAMANHO_MAXIMO_BYTES = ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024;

/**
 * Sobra para o resto do multipart: nome do arquivo, campos entidade e
 * entidadeId, e as fronteiras de cada parte. O corpo é sempre um pouco maior
 * que o arquivo, e é o CORPO que o Next mede.
 */
const FOLGA_DO_ENVELOPE_BYTES = 64 * 1024;

/** O que vai em `experimental.serverActions.bodySizeLimit`. */
export const ANEXO_BODY_LIMITE_BYTES =
  ANEXO_TAMANHO_MAXIMO_BYTES + FOLGA_DO_ENVELOPE_BYTES;
