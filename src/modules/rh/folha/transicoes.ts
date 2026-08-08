import type { StatusFolha } from "@/modules/rh/_shared/formato";

/**
 * Transições permitidas da folha, espelhando o trigger fn_guarda_status_folha
 * no banco. Fonte única do que a UI habilita; o banco recusa de novo.
 *
 * Desaprovar leva a rascunho (não a pendente_aprovacao como na OC) porque o
 * único motivo de desaprovar uma folha é corrigir os números, e corrigir exige
 * regenerar, que só acontece em rascunho.
 */
const PERMITIDAS: Record<StatusFolha, readonly StatusFolha[]> = {
  rascunho: ["pendente_aprovacao"],
  pendente_aprovacao: ["aprovado", "rascunho"],
  aprovado: ["rascunho"],
};

export function podeTransicionar(de: StatusFolha, para: StatusFolha): boolean {
  return PERMITIDAS[de].includes(para);
}
