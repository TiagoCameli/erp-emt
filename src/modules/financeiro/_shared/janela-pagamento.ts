/**
 * Regras puras da janela de pagamento: a data programada é a data em que o
 * pagamento está autorizado, definida por quem aprova.
 *
 * Sem React, sem Supabase, sem fuso. Datas em "YYYY-MM-DD", onde comparação por
 * string já dá igualdade e ordem. O dia da semana sai de `Date.UTC` justamente
 * para não depender do fuso da máquina: "2026-09-21" é domingo em qualquer
 * lugar do mundo, porque aqui é data civil e não instante.
 *
 * A MESMA regra vive na `fn_pagar_parcela` no banco, que é a barreira real.
 * O que está aqui serve para a tela avisar antes e para os testes.
 */

/** Como a data programada limita o pagamento (Administração > Configurações). */
export type JanelaPagamento = "exata" | "a_partir";

export const JANELA_PADRAO: JanelaPagamento = "exata";

export const ROTULO_JANELA: Record<JanelaPagamento, string> = {
  exata: "Pagar somente na data autorizada",
  a_partir: "Pagar a partir da data autorizada",
};

export const AJUDA_JANELA: Record<JanelaPagamento, string> = {
  exata:
    "O pagamento só entra na data exata. Se a data passar, a parcela sai da fila e precisa de nova autorização.",
  a_partir:
    "O pagamento entra na data autorizada ou depois dela. Data que passou continua liberada.",
};

/** De onde veio a data programada, para a tela não mostrar número sem história. */
export type OrigemDataProgramada = "vencimento" | "aprovacao" | "reprogramacao";

export const ROTULO_ORIGEM_DATA: Record<OrigemDataProgramada, string> = {
  vencimento: "vencimento da parcela",
  aprovacao: "definida na aprovação",
  reprogramacao: "reprogramada",
};

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dia da semana de uma data ISO, ou null se a string não for uma data ISO. */
export function diaDaSemana(dataISO: string): string | null {
  if (!ISO.test(dataISO)) return null;
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Date.UTC aceita 31/02 e rola para março: recusa data que não existe.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }
  return DIAS[data.getUTCDay()];
}

/**
 * Aviso de fim de semana para o modal de aprovação. Avisa, nunca bloqueia:
 * pode existir motivo legítimo para programar num sábado, e a decisão é de quem
 * aprova. Feriado não entra aqui porque o sistema não tem cadastro de feriado, e
 * inventar calendário seria pior que não avisar.
 */
export function avisoFimDeSemana(dataISO: string): string | null {
  const dia = diaDaSemana(dataISO);
  if (dia !== "sábado" && dia !== "domingo") return null;
  const [, mes, diaMes] = dataISO.split("-");
  return `${diaMes}/${mes} é ${dia}. Confira se o pagamento pode sair nesse dia.`;
}

/**
 * Programação vencida: a data autorizada passou sem pagamento. Só existe na
 * janela "exata"; em "a_partir" data passada é justamente o que libera pagar.
 *
 * É derivado de propósito, não é status gravado: status gravado precisaria de
 * um job para virar à meia-noite e sairia de sincronia com o banco.
 */
export function programacaoVencida(
  dataProgramada: string | null,
  hojeISO: string,
  janela: JanelaPagamento = JANELA_PADRAO,
): boolean {
  if (janela === "a_partir") return false;
  if (!dataProgramada) return false;
  return dataProgramada < hojeISO;
}

/** A parcela aprovada pode ser paga na data informada? */
export function podePagarEm(
  dataProgramada: string | null,
  dataPagamentoISO: string,
  janela: JanelaPagamento = JANELA_PADRAO,
): boolean {
  if (!dataProgramada) return false;
  return janela === "a_partir"
    ? dataPagamentoISO >= dataProgramada
    : dataPagamentoISO === dataProgramada;
}

function paraBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Mensagem de bloqueio, no mesmo texto que a `fn_pagar_parcela` levanta, para a
 * tela não dizer uma coisa e o banco outra. Null quando o pagamento é permitido.
 */
export function motivoBloqueioPagamento(
  dataProgramada: string | null,
  dataPagamentoISO: string,
  janela: JanelaPagamento = JANELA_PADRAO,
): string | null {
  if (!dataProgramada) {
    return "Esta parcela está aprovada sem data programada: reprograme a data antes de pagar";
  }
  if (podePagarEm(dataProgramada, dataPagamentoISO, janela)) return null;

  if (janela === "a_partir") {
    return `Pagamento autorizado a partir de ${paraBR(dataProgramada)}.`;
  }
  return dataPagamentoISO < dataProgramada
    ? `Pagamento autorizado para ${paraBR(dataProgramada)}.`
    : `A data autorizada (${paraBR(dataProgramada)}) passou: reprograme a data antes de pagar.`;
}
