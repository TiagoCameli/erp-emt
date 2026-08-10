/**
 * Tabelas de cadastro que a função fn_restaurar_cadastro sabe reinserir.
 * Espelha a allowlist da migration (fn_recurso_do_cadastro).
 *
 * `obras` tem tratamento especial na função do banco: reinserir a obra faz o
 * trigger criar um centro de custo raiz novo, então o snapshot do centro vai
 * embutido na mesma entrada da lixeira (chave centro_custo_raiz) e é aplicado
 * sobre esse centro recém-criado. O par volta sempre junto.
 *
 * Equipamentos continuam de fora: têm o mesmo problema de trigger e ainda não
 * foram tratados.
 */
export const TABELAS_RESTAURAVEIS = [
  "unidades_medida",
  "categorias_insumo",
  "clientes",
  "fornecedores",
  "insumos",
  "colaboradores",
  "obras",
  "centros_custo",
] as const;

export function tabelaRestauravel(tabela: string): boolean {
  return (TABELAS_RESTAURAVEIS as readonly string[]).includes(tabela);
}
