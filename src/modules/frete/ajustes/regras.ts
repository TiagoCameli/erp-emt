import type { EventoTrilha } from "@/components/canonicos/trilha";
import { formatarBRL } from "@/lib/formatadores";
import type { SinalAjuste } from "@/modules/frete/ajustes/schemas";

/**
 * Regras de tela do ajuste de saldo. Módulo puro (tela, action e teste).
 *
 * Status (CHECK de frete_ajustes): pendente_aprovacao > aprovado, ou rejeitado.
 * Desaprovar o aprovado volta a pendente (sai do saldo) e pede motivo; rejeitar
 * o pendente é fim de linha e também pede motivo. Editar, só o pendente.
 */

export const STATUS_AJUSTE = ["pendente_aprovacao", "aprovado", "rejeitado"] as const;
export type StatusAjuste = (typeof STATUS_AJUSTE)[number];
export const ROTULO_STATUS_AJUSTE: Record<StatusAjuste, string> = {
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

export function ehStatusAjuste(valor: string | null | undefined): valor is StatusAjuste {
  return (STATUS_AJUSTE as readonly string[]).includes(valor ?? "");
}

export function rotuloStatusAjuste(status: string): string {
  return ehStatusAjuste(status) ? ROTULO_STATUS_AJUSTE[status] : status;
}

export const ROTULO_SINAL: Record<SinalAjuste, string> = { credito: "Crédito", debito: "Débito" };

/** Rótulo dos botões de sinal, como a origem. */
export const ROTULO_BOTAO_SINAL: Record<SinalAjuste, string> = {
  credito: "▲ Crédito (soma)",
  debito: "▼ Débito (subtrai)",
};

export interface PermissoesAjuste {
  criar: boolean;
  aprovar: boolean;
  desaprovar: boolean;
}

export interface AcoesDoAjuste {
  editar: boolean;
  aprovar: boolean;
  rejeitar: boolean;
  desaprovar: boolean;
}

/** O que a pessoa pode fazer com o ajuste neste status. O banco confere de novo. */
export function acoesDoAjuste(status: string, permissoes: PermissoesAjuste): AcoesDoAjuste {
  const pendente = status === "pendente_aprovacao";
  return {
    editar: pendente && permissoes.criar,
    aprovar: pendente && permissoes.aprovar,
    rejeitar: pendente && permissoes.aprovar,
    desaprovar: status === "aprovado" && permissoes.desaprovar,
  };
}

/** Só o aprovado vira movimento da conta corrente. */
export function contaNoSaldo(status: string): boolean {
  return status === "aprovado";
}

/**
 * Prévia da origem: "▲ Crédito: R$ 1.000,00 será somado a Areacre.", com a
 * ressalva do ERP de que só vale depois de aprovado.
 */
export function previaDoAjuste(sinal: SinalAjuste, valor: number, transportadora: string): string {
  const cabeca = sinal === "credito" ? "▲ Crédito" : "▼ Débito";
  const verbo = sinal === "credito" ? "somado a" : "subtraído de";
  const nome = transportadora.trim() || "a transportadora";
  return `${cabeca}: ${formatarBRL(valor)} será ${verbo} ${nome} depois de aprovado.`;
}

// ---------------------------------------------------------------------------
// Trilha
// ---------------------------------------------------------------------------

type Json = string | number | boolean | null | { [chave: string]: Json | undefined } | Json[];

export interface RegistroAuditoriaAjuste {
  id: string;
  acao: string;
  usuarioNome: string | null;
  dadosAntes: Json | null;
  dadosDepois: Json | null;
  criadoEm: string;
}

function campo(dados: Json | null, nome: string): string | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const valor = dados[nome];
  return typeof valor === "string" ? valor : null;
}

/** audit_log de frete_ajustes (só quem vê a auditoria lê) em eventos da Trilha. */
export function eventosDoAuditLog(registros: readonly RegistroAuditoriaAjuste[]): EventoTrilha[] {
  return registros.map((r) => {
    const usuario = r.usuarioNome ?? undefined;
    if (r.acao === "INSERT") {
      return { id: r.id, data: r.criadoEm, titulo: "Ajuste lançado", descricao: "Pendente de aprovação", usuario, tipo: "criacao" };
    }
    if (r.acao === "DELETE") {
      return { id: r.id, data: r.criadoEm, titulo: "Ajuste excluído", usuario, tipo: "exclusao" };
    }
    const de = campo(r.dadosAntes, "status");
    const para = campo(r.dadosDepois, "status");
    const motivo = campo(r.dadosDepois, "motivo_status");
    const comMotivo = (texto: string) => (motivo ? `${texto}. Motivo: ${motivo}` : texto);
    if (de === "pendente_aprovacao" && para === "aprovado") {
      return { id: r.id, data: r.criadoEm, titulo: "Ajuste aprovado", descricao: "Entrou no saldo", usuario, tipo: "aprovacao" };
    }
    if (de === "pendente_aprovacao" && para === "rejeitado") {
      return { id: r.id, data: r.criadoEm, titulo: "Ajuste rejeitado", descricao: comMotivo("Não entra no saldo"), usuario, tipo: "rejeicao" };
    }
    if (de === "aprovado" && para === "pendente_aprovacao") {
      return { id: r.id, data: r.criadoEm, titulo: "Ajuste desaprovado", descricao: comMotivo("Saiu do saldo"), usuario, tipo: "desaprovacao" };
    }
    return { id: r.id, data: r.criadoEm, titulo: "Ajuste editado", usuario, tipo: "edicao" };
  });
}

export interface AjusteParaTrilha {
  id: string;
  status: string;
  createdAt: string;
  criadoPorNome: string | null;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  updatedAt: string;
  atualizadoPorNome: string | null;
  motivoStatus: string | null;
}

/**
 * Sem acesso ao audit_log, a Trilha sai do próprio registro: quem lançou, quem
 * aprovou e a última rejeição ou desaprovação (com o motivo). O histórico
 * completo de idas e voltas fica na Auditoria.
 */
export function eventosDoRegistro(a: AjusteParaTrilha): EventoTrilha[] {
  const eventos: EventoTrilha[] = [
    { id: `${a.id}-criacao`, data: a.createdAt, titulo: "Ajuste lançado", usuario: a.criadoPorNome ?? undefined, tipo: "criacao" },
  ];
  if (a.status === "aprovado" && a.aprovadoEm) {
    eventos.push({
      id: `${a.id}-aprovacao`,
      data: a.aprovadoEm,
      titulo: "Ajuste aprovado",
      descricao: "Entrou no saldo",
      usuario: a.aprovadoPorNome ?? undefined,
      tipo: "aprovacao",
    });
  }
  if (a.status === "rejeitado") {
    eventos.push({
      id: `${a.id}-rejeicao`,
      data: a.updatedAt,
      titulo: "Ajuste rejeitado",
      descricao: a.motivoStatus ? `Motivo: ${a.motivoStatus}` : undefined,
      usuario: a.atualizadoPorNome ?? undefined,
      tipo: "rejeicao",
    });
  }
  if (a.status === "pendente_aprovacao" && a.motivoStatus) {
    eventos.push({
      id: `${a.id}-desaprovacao`,
      data: a.updatedAt,
      titulo: "Ajuste desaprovado",
      descricao: `Motivo: ${a.motivoStatus}`,
      usuario: a.atualizadoPorNome ?? undefined,
      tipo: "desaprovacao",
    });
  }
  return eventos;
}
