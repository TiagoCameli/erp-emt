import type { RecursoId } from "@/config/recursos";

/**
 * Quem vê e quem restaura o quê na Lixeira do Combustível. Módulo puro, testado.
 *
 * Na origem eram duas ações globais (`ver_lixeira_combustivel` e
 * `restaurar_lixeira_combustivel`). No ERP cada recurso tem a sua permissão:
 * - VER a seção: `ver` no recurso E `ver` na Lixeira (administracao.lixeira).
 * - RESTAURAR: `editar` na Lixeira E `excluir` no recurso, exatamente o que a action de
 *   restaurar de cada módulo confere (e o que a `fn_comb_restaurar` confere de novo).
 */

export const TIPOS_LIXEIRA = ["saida", "entrada", "transferencia", "esvaziamento"] as const;
export type TipoLixeira = (typeof TIPOS_LIXEIRA)[number];

export const RECURSO_DO_TIPO: Record<TipoLixeira, RecursoId> = {
  saida: "combustivel.saidas",
  entrada: "combustivel.entradas",
  transferencia: "combustivel.transferencias",
  esvaziamento: "combustivel.esvaziamentos",
};

export type PermissoesLixeira = Record<TipoLixeira, { ver: boolean; restaurar: boolean }>;

type Pode = (recurso: RecursoId, acao: "ver" | "editar" | "excluir") => boolean;

export function permissoesDaLixeira(pode: Pode): PermissoesLixeira {
  const veLixeira = pode("administracao.lixeira", "ver");
  const editaLixeira = pode("administracao.lixeira", "editar");
  const resultado = {} as PermissoesLixeira;
  for (const tipo of TIPOS_LIXEIRA) {
    const recurso = RECURSO_DO_TIPO[tipo];
    resultado[tipo] = {
      ver: veLixeira && pode(recurso, "ver"),
      restaurar: editaLixeira && pode(recurso, "excluir"),
    };
  }
  // Restaurar sem ver a seção não tem botão onde aparecer.
  for (const tipo of TIPOS_LIXEIRA) resultado[tipo].restaurar &&= resultado[tipo].ver;
  return resultado;
}

export function veAlgumaSecao(permissoes: PermissoesLixeira): boolean {
  return TIPOS_LIXEIRA.some((tipo) => permissoes[tipo].ver);
}
