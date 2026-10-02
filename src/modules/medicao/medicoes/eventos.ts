import type { EventoTrilha, TipoEventoTrilha } from "@/components/canonicos/trilha";
import { rotuloStatusMedicao } from "@/modules/medicao/_shared/rotulos";

import type { EventoMedicao } from "./tipos";

export type { EventoMedicao } from "./tipos";

/**
 * Eventos gravados em `mc_medicao_eventos`: `abrir` (Fase 4), `carga` (carga inicial de L09/L10) e
 * os do ciclo da Fase 5 (fechar, versao, reabrir, enviar, nova_revisao, aprovar, aprovar_revisao,
 * revisao_pos) e os do reajuste da Fase 6 (reajuste, reajuste_excluido). Mesmo molde de `financeiro/pagamentos/eventos.ts`.
 */
const EVENTOS: Record<string, { titulo: string; tipo: TipoEventoTrilha }> = {
  abrir: { titulo: "Medição aberta", tipo: "criacao" },
  fechar: { titulo: "Medição fechada para conferência", tipo: "edicao" },
  versao: { titulo: "Planilha da medição trocada", tipo: "edicao" },
  reabrir: { titulo: "Medição reaberta", tipo: "rejeicao" },
  enviar: { titulo: "Revisão enviada ao contratante", tipo: "documento" },
  nova_revisao: { titulo: "Nova revisão aberta", tipo: "rejeicao" },
  aprovar: { titulo: "Medição aprovada", tipo: "aprovacao" },
  aprovar_revisao: { titulo: "Revisão pós-aprovação aprovada", tipo: "aprovacao" },
  revisao_pos: { titulo: "Revisão pós-aprovação aberta", tipo: "desaprovacao" },
  carga: { titulo: "Medição trazida na carga inicial", tipo: "criacao" },
  reajuste: { titulo: "Reajuste registrado", tipo: "documento" },
  reajuste_excluido: { titulo: "Relatório de reajuste excluído", tipo: "rejeicao" },
};

/**
 * Converte um evento da medição num `EventoTrilha` do componente canônico. A descrição junta o
 * motivo gravado pelo banco (que já traz a REVnn) e a mudança de status, quando houve.
 */
export function eventoMedicaoParaTrilha(evento: EventoMedicao): EventoTrilha {
  const conhecido = EVENTOS[evento.evento];
  const partes: string[] = [];
  if (evento.motivo) partes.push(evento.motivo);
  if (evento.deStatus && evento.paraStatus && evento.deStatus !== evento.paraStatus) {
    partes.push(`de ${rotuloStatusMedicao(evento.deStatus)} para ${rotuloStatusMedicao(evento.paraStatus)}`);
  }
  return {
    id: evento.id,
    data: evento.criadoEm,
    titulo: conhecido?.titulo ?? evento.evento,
    descricao: partes.length > 0 ? partes.join(" · ") : undefined,
    usuario: evento.usuarioNome ?? undefined,
    tipo: conhecido?.tipo ?? "outro",
  };
}
