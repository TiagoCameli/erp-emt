import type { RevisaoMedicao } from "./tipos";

/**
 * Passos do ciclo da medição (Fase 5) que a tela oferece, pelo status da medição, pela revisão
 * corrente e pelas permissões de `medicao.medicoes`. Espelha as regras das RPCs (contexto-comum.md):
 * a tela só mostra o botão que o banco aceitaria, e quem confere de novo (status travado com
 * `for update`, permissão, contrato) é sempre a RPC. Puro, para a página calcular no servidor.
 */

export type PassoCiclo = "fechar" | "reabrir" | "ajuste" | "enviar" | "nova_revisao" | "aprovar" | "revisar_aprovada";

export interface PermissoesCiclo {
  editar: boolean;
  aprovar: boolean;
  desaprovar: boolean;
}

/** A revisão em aberto ou enviada de maior número: o mesmo critério de `fn_mc_revisao_corrente`. */
export function revisaoCorrente(revisoes: RevisaoMedicao[]): RevisaoMedicao | null {
  let corrente: RevisaoMedicao | null = null;
  for (const r of revisoes) {
    if ((r.status === "em_aberto" || r.status === "enviada") && (corrente === null || r.numero > corrente.numero)) corrente = r;
  }
  return corrente;
}

type Corrente = Pick<RevisaoMedicao, "status" | "fase"> | null;

export function passosDaMedicao(status: string, corrente: Corrente, p: PermissoesCiclo): PassoCiclo[] {
  const passos: PassoCiclo[] = [];
  const emAberto = corrente?.status === "em_aberto";
  const enviada = corrente?.status === "enviada";
  const pos = corrente?.fase === "pos_aprovacao";

  if (status === "aberta") {
    if (p.editar) passos.push("fechar");
  } else if (status === "em_conferencia") {
    if (p.editar) {
      passos.push("reabrir");
      if (emAberto) passos.push("ajuste", "enviar");
    }
  } else if (status === "enviada") {
    if (enviada) {
      if (p.editar) passos.push("nova_revisao");
      if (p.aprovar) passos.push("aprovar");
    }
  } else if (status === "aprovada") {
    if (corrente === null) {
      if (p.desaprovar) passos.push("revisar_aprovada");
    } else if (pos && emAberto) {
      if (p.editar) passos.push("ajuste", "enviar");
    } else if (pos && enviada) {
      if (p.editar) passos.push("nova_revisao");
      if (p.aprovar) passos.push("aprovar");
    }
  }
  return passos;
}
