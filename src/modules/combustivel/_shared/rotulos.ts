/**
 * Domínios do Combustível, espelhando os CHECKs de 20260924100000_fase3_combustivel_banco.sql.
 * Módulo puro (sem "use client" e sem server-only): serve tela, schema e action.
 */

export const ORIGENS_SAIDA = ["tanque", "dinheiro", "requisicao"] as const;
export type OrigemSaida = (typeof ORIGENS_SAIDA)[number];
export const ROTULO_ORIGEM_SAIDA: Record<OrigemSaida, string> = {
  tanque: "Tanque",
  dinheiro: "Dinheiro (posto)",
  requisicao: "Requisição (posto)",
};

export const TIPOS_CONSUMIDOR = ["equipamento_proprio", "carreta_transportadora"] as const;
export type TipoConsumidor = (typeof TIPOS_CONSUMIDOR)[number];
export const ROTULO_TIPO_CONSUMIDOR: Record<TipoConsumidor, string> = {
  equipamento_proprio: "Equipamento",
  carreta_transportadora: "Carreta de transportadora",
};

export const CANAIS = ["computador", "celular", "migracao"] as const;
export type Canal = (typeof CANAIS)[number];
export const ROTULO_CANAL: Record<Canal, string> = {
  computador: "Computador",
  celular: "Celular",
  migracao: "Migração",
};

export const TIPOS_MOVIMENTO = [
  "credito_frete",
  "credito_abastecimento_transterra",
  "debito_abastecimento_transterra",
  "debito_abastecimento_emt",
  "debito_pagamento_frete",
  "ajuste_manual_credito",
  "ajuste_manual_debito",
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];
export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  credito_frete: "Crédito de frete",
  credito_abastecimento_transterra: "Crédito do dono do tanque",
  debito_abastecimento_transterra: "Débito de abastecimento em tanque externo",
  debito_abastecimento_emt: "Débito de abastecimento em tanque da EMT",
  debito_pagamento_frete: "Pagamento de frete",
  ajuste_manual_credito: "Ajuste a crédito",
  ajuste_manual_debito: "Ajuste a débito",
};

/**
 * Litros sempre com 2 casas na tela (nível, saldo, movimento). Na origem, arredondar para
 * inteiro escondia volume real: o tanque tinha 155,6 L, a tela mostrava 156, a pessoa digitava
 * 156 e a trava de saldo recusava sem explicar.
 */
export function formatarLitros(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  return `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
}

// ---------------------------------------------------------------------------
// Data e hora em Rio Branco
// ---------------------------------------------------------------------------

/**
 * Rio Branco é UTC-5 o ano todo (sem horário de verão). O campo `datetime-local` devolve
 * "AAAA-MM-DDTHH:MM" sem fuso; é hora de Rio Branco, e o banco guarda timestamptz.
 */
const FUSO = "-05:00";
const DATA_HORA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-09-23T14:30" (Rio Branco) -> "2026-09-23T14:30:00-05:00". Inválido -> null. */
export function dataHoraLocalParaIso(valor: string): string | null {
  const m = DATA_HORA_LOCAL.exec(valor.trim());
  if (!m) return null;
  const [, ano, mes, dia, hora, minuto, segundo] = m;
  const iso = `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo ?? "00"}${FUSO}`;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  // Rejeita 31/02 e afins: o Date "corrige" para outro dia calado.
  const volta = isoParaDataHoraLocal(data.toISOString());
  return volta === `${ano}-${mes}-${dia}T${hora}:${minuto}` ? iso : null;
}

/** Instante (ISO com qualquer fuso) -> "AAAA-MM-DDTHH:MM" em Rio Branco, para o campo. */
export function isoParaDataHoraLocal(iso: string): string {
  const data = new Date(iso);
  const riobranco = new Date(data.getTime() - 5 * 60 * 60 * 1000);
  return riobranco.toISOString().slice(0, 16);
}

/** Agora, em Rio Branco, no formato do campo. */
export function agoraDataHoraLocal(agora: Date = new Date()): string {
  return isoParaDataHoraLocal(agora.toISOString());
}

/** Instante -> "23/09/2026 14:30" em Rio Branco. */
export function formatarDataHoraRioBranco(iso: string | null | undefined): string {
  if (!iso) return "";
  const local = isoParaDataHoraLocal(iso);
  const [data, hora] = local.split("T");
  const [ano, mes, dia] = data!.split("-");
  return `${dia}/${mes}/${ano} ${hora}`;
}
