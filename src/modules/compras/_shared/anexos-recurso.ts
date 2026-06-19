import type { Acao, RecursoId } from "@/config/recursos";

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

/**
 * Ação exigida para anexar/remover anexos da tabela. Em geral é 'editar', mas
 * recebimento não tem fluxo de editar na Fase 2: quem cria o recebimento anexa
 * a NF logo em seguida, então o anexo segue a permissão de 'criar'. Mantém a
 * UI (liberada por podeCriar) e a Server Action concordando.
 */
export function acaoDoAnexo(tabela: string): Acao {
  return tabela === "recebimentos" ? "criar" : "editar";
}
