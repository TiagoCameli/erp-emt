/**
 * Tabelas de cadastro que a função fn_restaurar_cadastro sabe reinserir.
 * Espelha a allowlist da migration (fn_recurso_do_cadastro): só cadastros
 * folha, sem trigger que gere outros registros. Obras, equipamentos e
 * centros de custo não entram (na Fase 1 só desativam, nunca vão à lixeira).
 */
export const TABELAS_RESTAURAVEIS = [
  "unidades_medida",
  "categorias_insumo",
  "clientes",
  "fornecedores",
  "insumos",
  "depositos",
  "colaboradores",
] as const;

export function tabelaRestauravel(tabela: string): boolean {
  return (TABELAS_RESTAURAVEIS as readonly string[]).includes(tabela);
}
