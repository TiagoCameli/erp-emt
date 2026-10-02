import type { StatusPadrao } from "@/components/canonicos";
import type { StatusRecibo } from "@/modules/rh/ferias/recibo-schemas";

/**
 * Status do recibo no vocabulário do `StatusBadge`.
 *
 * `sem_recibo` não é um status da máquina padrão do ERP: é a ausência de
 * recibo. Usa o cinza de rascunho e um rótulo próprio, porque pintá-lo de
 * pendente faria parecer que há algo esperando aprovação quando não há nada.
 */
export const STATUS_RECIBO_INFO: Record<
  StatusRecibo,
  { rotulo: string; badge: StatusPadrao }
> = {
  sem_recibo: { rotulo: "Sem recibo", badge: "rascunho" },
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  pendente_aprovacao: {
    rotulo: "Pendente de aprovação",
    badge: "pendente_aprovacao",
  },
  aprovado: { rotulo: "Aprovado", badge: "aprovado" },
};

/** "Férias de FULANO, 02/03 a 31/03/2026". Título da tela do recibo. */
export function rotuloRecibo(
  nome: string,
  dataInicio: string | null,
  dataFim: string | null,
): string {
  if (!dataInicio || !dataFim) return `Férias de ${nome}`;
  const [, mesI, diaI] = dataInicio.split("-");
  const [anoF, mesF, diaF] = dataFim.split("-");
  return `Férias de ${nome}, ${diaI}/${mesI} a ${diaF}/${mesF}/${anoF}`;
}

/**
 * Vencimento do recibo quando ninguém escolheu data: dois dias antes do início
 * do gozo, o mesmo `data_inicio - 2` da fn_aprovar_recibo_ferias. Datas civis
 * em UTC, sem fuso na conta.
 */
export function vencimentoPadraoRecibo(dataInicio: string): string {
  const [ano, mes, dia] = dataInicio.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia - 2)).toISOString().slice(0, 10);
}
