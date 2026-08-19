/**
 * Limites de tamanho de upload, em UM lugar só.
 *
 * Este arquivo é importado pelo `next.config.ts`, pelo servidor e por component
 * de cliente ao mesmo tempo, então NÃO pode importar nada: nem `server-only`,
 * nem React, nem env. É constante pura de propósito.
 *
 * São DOIS limites, com donos diferentes, e confundir os dois foi o que deixou
 * a tela prometendo 25 MB enquanto o Next cortava em 1 MB:
 *
 * 1. `ANEXO_TAMANHO_MAXIMO_MB` — o anexo. O binário NÃO passa mais pela server
 *    action: o navegador manda direto para o Storage do Supabase por URL
 *    assinada, então o teto da function da Vercel (~4,5 MB de payload) deixou
 *    de valer aqui. Quem recusa arquivo grande agora é o próprio bucket, pelo
 *    `file_size_limit` — servidor de verdade, não promessa de tela.
 * 2. `BODY_MAXIMO_SERVER_ACTION_BYTES` — o corpo das server actions que ainda
 *    carregam arquivo pequeno (importação de OFX, planilha de cadastro). Esse
 *    continua preso ao teto da Vercel, que não é configurável: medido contra a
 *    produção em 19/08/2026, 4.300.000 bytes passam e 4.500.000 voltam 413
 *    FUNCTION_PAYLOAD_TOO_LARGE.
 */
export const ANEXO_TAMANHO_MAXIMO_MB = 25;

/** Igual ao limite do anexo em bytes, para as contas de validação. */
export const ANEXO_TAMANHO_MAXIMO_BYTES = ANEXO_TAMANHO_MAXIMO_MB * 1024 * 1024;

/**
 * Corpo máximo de uma server action (`experimental.serverActions.bodySizeLimit`).
 *
 * Não é o limite do anexo: é o que sobra para OFX e planilha, que ainda sobem
 * por FormData. Sem configurar, o padrão do Next é 1 MB e o extrato de um mês
 * já passa disso. Fica abaixo do teto da Vercel de propósito.
 */
export const BODY_MAXIMO_SERVER_ACTION_BYTES = 4 * 1024 * 1024;
