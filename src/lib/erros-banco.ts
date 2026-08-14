/**
 * Tradução de erro do Postgres em mensagem que o usuário entende, para as
 * travas de sanidade do que multiplica salário (Bloco 8b, Task 5): o teto de
 * 100% na soma dos percentuais de provisão e de encargo, e o piso de zero no
 * salário do colaborador.
 *
 * Módulo PURO de propósito — sem `"use server"` e sem `"server-only"`, ao
 * contrário de `@/lib/erros` — para o Vitest importar a tradução direto, no
 * mesmo padrão de `@/modules/cadastros/_shared/exclusao`. Sem isto a trava
 * dispara e a tela mostra "Não foi possível salvar. Tente novamente", um retry
 * que nunca funciona: foi exatamente o defeito que a revisão da Task 1 achou.
 */

/** Formato mínimo do erro devolvido pelo supabase-js (PostgrestError e RPC). */
export interface ErroDeBanco {
  code?: string;
  message?: string;
}

/** SQLSTATE de `raise exception` de plpgsql sem `using errcode`. */
const RAISE_EXCEPTION = "P0001";

/** SQLSTATE de violação de check constraint. */
const CHECK_VIOLATION = "23514";

/** Check do salário: o nome vem dentro da mensagem do 23514. */
const CHECK_SALARIO = "colaboradores_salario_nao_negativo";

/**
 * Mensagem do check `colaboradores_salario_nao_negativo`. Diferente das travas
 * de soma, o 23514 não traz texto aproveitável ("new row for relation
 * \"colaboradores\" violates check constraint ..."), então a frase é nossa.
 */
export const ERRO_SALARIO_NEGATIVO =
  "O salário não pode ser negativo. Informe 0 ou deixe em branco enquanto não houver salário definido";

/**
 * Só devolve `erro.message` ao usuário quando é um `raise exception` nosso
 * (`P0001`, o default do plpgsql sem `using errcode`). É o caso das travas de
 * soma, e a mensagem delas é a única coisa que diz o que fazer ("as outras
 * provisões ativas somam 80%, e esta acrescentaria 30%"). Qualquer outro código
 * (permission denied, violação de RLS, erro de conexão) é infraestrutura e não
 * pode vazar para a tela: volta o fallback.
 *
 * Mesma regra das cópias locais de `rh/folha/actions.ts` e
 * `rh/adiantamentos/actions.ts` — aqui em módulo puro, onde dá para testar.
 */
export function mensagemDeNegocio(
  erro: ErroDeBanco | null | undefined,
  fallback: string,
): string {
  if (erro?.code === RAISE_EXCEPTION && erro.message) return erro.message;
  return fallback;
}

/**
 * Traduz o 23514 do check do salário, e só ele: `colaboradores` tem outros
 * checks (cnh_categoria, escolaridade, estado_civil, raca_cor, tipo_conta,
 * vinculo) e trocar a mensagem de todos por "o salário não pode ser negativo"
 * mentiria. Devolve `null` quando o erro é outro, e aí o chamador mantém a
 * mensagem genérica — mesmo contrato de `traduzErroExclusao`.
 */
export function traduzErroSalario(
  erro: ErroDeBanco | null | undefined,
): string | null {
  if (!erro) return null;
  const mensagem = erro.message ?? "";
  const ehCheck = erro.code === CHECK_VIOLATION || mensagem.includes(CHECK_VIOLATION);
  if (!ehCheck) return null;
  if (!mensagem.includes(CHECK_SALARIO)) return null;
  return ERRO_SALARIO_NEGATIVO;
}
