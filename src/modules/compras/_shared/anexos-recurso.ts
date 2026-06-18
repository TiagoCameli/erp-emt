import type { RecursoId } from "@/config/recursos";

/**
 * Mapa de tabela de registro para o recurso de Compras que governa seus anexos.
 * Vive fora do arquivo 'use server' porque arquivos de Server Actions não podem
 * exportar constantes (só funções async).
 */
const RECURSO_POR_TABELA = {
  pedidos: "compras.pedidos",
  cotacoes: "compras.cotacoes",
  ordens_compra: "compras.ordens",
  recebimentos: "compras.recebimentos",
} as const satisfies Record<string, RecursoId>;

/** Tabelas de Compras que aceitam anexos. */
export type TabelaAnexo = keyof typeof RECURSO_POR_TABELA;

/**
 * Recurso de permissão dono dos anexos da tabela. Lança se a tabela não
 * for de Compras, para nenhuma tela pendurar anexo em registro indevido.
 */
export function recursoDaTabelaAnexo(tabela: string): RecursoId {
  const recurso = RECURSO_POR_TABELA[tabela as TabelaAnexo];
  if (!recurso) throw new Error(`Tabela sem anexos de compras: ${tabela}`);
  return recurso;
}
