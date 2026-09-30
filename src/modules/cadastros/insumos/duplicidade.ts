/**
 * Regra desde 30/09/2026: dois insumos podem ter o mesmo nome se a unidade for outra
 * ("BRITA 0" em t e "BRITA 0" em m3). Nome e unidade iguais é o mesmo material
 * cadastrado duas vezes, e isso o cadastro recusa. Módulo puro: a action consulta o
 * banco e decide com estas funções.
 *
 * O banco ainda não tem índice único para isso: a carga da origem trouxe pares
 * repetidos, que precisam ser unificados antes (as OCs e fretes apontam para eles).
 */

/** Nome para comparar: sem caixa e com espaço único ("Brita  0 " = "brita 0"). */
export function nomeComparavel(nome: string): string {
  return nome.toLowerCase().replace(/\s+/g, " ").trim();
}

export function chaveNomeUnidade(nome: string, unidadeId: string): string {
  return `${nomeComparavel(nome)}|${unidadeId}`;
}

export interface InsumoExistente {
  id: string;
  nome: string;
  unidade_id: string;
}

/** Algum insumo, fora o que está sendo editado, já tem este nome nesta unidade? */
export function haRepetido(
  existentes: readonly InsumoExistente[],
  nome: string,
  unidadeId: string,
  ignorarId?: string,
): boolean {
  const chave = chaveNomeUnidade(nome, unidadeId);
  return existentes.some((e) => e.id !== ignorarId && chaveNomeUnidade(e.nome, e.unidade_id) === chave);
}

/**
 * Padrão do `ilike` que traz os candidatos: curingas do texto escapados e cada trecho
 * de espaço virando `%`, para "BRITA  0" achar "BRITA 0". Traz a mais ("BRITA 10"),
 * e `haRepetido` filtra depois.
 */
export function padraoIlikeCandidatos(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((parte) => parte.replace(/[\\%_]/g, (c) => `\\${c}`))
    .join("%");
}

export const MENSAGEM_REPETIDO =
  "Já existe um insumo com este nome nesta unidade. Nome igual só vale com unidade diferente";
