import type { EventoTrilha, TipoEventoTrilha } from "@/components/canonicos/trilha";
import { ROTULO_STATUS_OS, STATUS_OS, type StatusOs } from "@/modules/manutencao/_shared/rotulos";

/**
 * Histórico de status da OS (os_transicoes) no formato da Trilha canônica.
 * Módulo puro, testado em trilha.test.ts.
 */

export interface TransicaoOs {
  id: string;
  statusDe: string | null;
  statusPara: string;
  motivo: string | null;
  usuarioNome: string | null;
  criadoEm: string;
}

function rotulo(status: string | null): string {
  if (status && (STATUS_OS as readonly string[]).includes(status)) {
    return ROTULO_STATUS_OS[status as StatusOs];
  }
  return status ?? "";
}

function tipoDoEvento(de: string | null, para: string): TipoEventoTrilha {
  if (de === null) return "criacao";
  if (para === "concluida") return "aprovacao";
  if (para === "cancelada") return "rejeicao";
  if (de === "concluida" && para === "aberta") return "desaprovacao";
  return "edicao";
}

function titulo(de: string | null, para: string): string {
  if (de === null) return "OS aberta";
  if (de === "concluida" && para === "aberta") return "OS reaberta";
  if (para === "em_execucao") return "Execução iniciada";
  if (para === "concluida") return "OS concluída";
  if (para === "cancelada") return "OS cancelada";
  return `${rotulo(de)} para ${rotulo(para)}`;
}

export function eventosDaTrilhaOs(transicoes: readonly TransicaoOs[]): EventoTrilha[] {
  return transicoes.map((transicao) => {
    const dePara =
      transicao.statusDe === null
        ? `Status: ${rotulo(transicao.statusPara)}`
        : `${rotulo(transicao.statusDe)} para ${rotulo(transicao.statusPara)}`;
    return {
      id: transicao.id,
      data: transicao.criadoEm,
      titulo: titulo(transicao.statusDe, transicao.statusPara),
      descricao: transicao.motivo ? `${dePara}. Motivo: ${transicao.motivo}` : dePara,
      usuario: transicao.usuarioNome ?? undefined,
      tipo: tipoDoEvento(transicao.statusDe, transicao.statusPara),
    };
  });
}
