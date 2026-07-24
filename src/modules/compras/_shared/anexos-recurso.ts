import type { Acao, RecursoId } from "@/config/recursos";

/**
 * Mapa de tabela de registro para o recurso que governa seus anexos. Espelha,
 * no TypeScript, o mapa da função public.fn_recurso_do_anexo do banco: os dois
 * têm que casar (a RLS de anexos e as policies de storage derivam a permissão
 * pela função; a Server Action deriva por este mapa). Vive fora do arquivo
 * 'use server' porque arquivos de Server Actions não podem exportar constantes
 * (só funções async).
 */
const RECURSO_POR_TABELA = {
  // Compras
  cotacoes: "compras.cotacoes",
  ordens_compra: "compras.ordens",
  // RH
  rh_documentos: "rh.documentos",
  rh_epis: "rh.epis",
  rh_ocorrencias: "rh.ocorrencias",
} as const satisfies Record<string, RecursoId>;

/** Tabelas que aceitam anexos. */
export type TabelaAnexo = keyof typeof RECURSO_POR_TABELA;

/**
 * Recurso de permissão dono dos anexos da tabela. Lança se a tabela não
 * aceita anexos, para nenhuma tela pendurar anexo em registro indevido.
 */
export function recursoDaTabelaAnexo(tabela: string): RecursoId {
  const recurso = RECURSO_POR_TABELA[tabela as TabelaAnexo];
  if (!recurso) throw new Error(`Tabela sem anexos: ${tabela}`);
  return recurso;
}

/**
 * Ação exigida para anexar/remover anexos: sempre 'editar'. Mantém a UI
 * (liberada por podeEditar) e a Server Action concordando.
 */
export function acaoDoAnexo(): Acao {
  return "editar";
}
