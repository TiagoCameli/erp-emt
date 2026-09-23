/**
 * Cálculo puro dos tanques, só para MOSTRAR. Quem decide nível, PEPS e trava é
 * o banco (`fn_comb_recalcular_nivel`, `fn_comb_saldo_minimo`). Sem React, sem
 * "use server", sem server-only: serve tela e Vitest.
 */

/**
 * Nível em percentual da capacidade, de 0 a 100, para a barra. Sem capacidade
 * (0) não há régua: devolve null e a tela mostra só os litros. Acima da
 * capacidade (capacidade reduzida depois da entrada) a barra para em 100.
 */
export function percentualDoNivel(nivel: number, capacidade: number): number | null {
  if (!(capacidade > 0)) return null;
  const percentual = (Math.max(nivel, 0) / capacidade) * 100;
  return Math.min(percentual, 100);
}

export type TipoMovimentoTanque =
  | "entrada"
  | "abastecimento"
  | "transferencia_enviada"
  | "transferencia_recebida"
  | "esvaziamento";

export const ROTULO_MOVIMENTO_TANQUE: Record<TipoMovimentoTanque, string> = {
  entrada: "Entrada",
  abastecimento: "Abastecimento",
  transferencia_enviada: "Transferência enviada",
  transferencia_recebida: "Transferência recebida",
  esvaziamento: "Esvaziamento",
};

/** Movimento cru, com os litros sempre positivos. O sinal vem do tipo. */
export interface MovimentoTanque {
  id: string;
  tipo: TipoMovimentoTanque;
  dataHora: string;
  /** Desempate no mesmo instante: ordem de inserção. */
  criadoEm: string;
  litros: number;
  descricao: string;
}

export interface MovimentoComNivel extends MovimentoTanque {
  /** Litros com sinal: + entra, - sai. */
  delta: number;
  /** Nível do tanque logo depois deste movimento. */
  nivelDepois: number;
}

function ehEntrada(tipo: TipoMovimentoTanque): boolean {
  return tipo === "entrada" || tipo === "transferencia_recebida";
}

/**
 * Linha do tempo do tanque com o nível corrido, da mais antiga para a mais
 * recente. No mesmo instante, as SAÍDAS vêm antes das entradas: é a ordem da
 * trava de saldo do banco (`fn_comb_saldo_minimo`), então o nível que a tela
 * mostra é o mesmo que o banco confere. Depois, ordem de inserção e id.
 */
export function linhaDoTempo(movimentos: readonly MovimentoTanque[]): MovimentoComNivel[] {
  const ordenados = [...movimentos].sort((a, b) => {
    const porData = Date.parse(a.dataHora) - Date.parse(b.dataHora);
    if (porData !== 0) return porData;
    const porSentido = Number(ehEntrada(a.tipo)) - Number(ehEntrada(b.tipo));
    if (porSentido !== 0) return porSentido;
    const porCriacao = Date.parse(a.criadoEm) - Date.parse(b.criadoEm);
    if (porCriacao !== 0) return porCriacao;
    return a.id.localeCompare(b.id);
  });

  let nivel = 0;
  return ordenados.map((movimento) => {
    const delta = ehEntrada(movimento.tipo) ? movimento.litros : -movimento.litros;
    // Soma em décimos de milésimo (4 casas) para 0,1 + 0,2 não virar 0,30000000000000004.
    nivel = Math.round((nivel + delta) * 10_000) / 10_000;
    return { ...movimento, delta, nivelDepois: nivel };
  });
}
