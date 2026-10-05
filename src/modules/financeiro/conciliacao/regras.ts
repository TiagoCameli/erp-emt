/**
 * Regras de conciliação por histórico (Bloco H, 05/10/2026). Módulo puro: a
 * mesma normalização e a mesma escolha de regra que o banco faz em
 * `fn_conciliacao_aplicar_regras`, para a tela mostrar "Regra: <nome>" antes
 * de aplicar. Quem aplica é sempre o banco.
 */

export type AcaoRegra = "transferencia" | "lancar" | "apelido";

export interface RegraConciliacao {
  id: string;
  contaBancariaId: string | null;
  nome: string;
  /** Já normalizado (o banco recusa padrão fora da normalização). */
  padrao: string;
  sentido: "credito" | "debito" | null;
  acao: AcaoRegra;
  contaContraparteId: string | null;
  fornecedorId: string | null;
  categoriaId: string | null;
  centroCustoId: string | null;
  automatica: boolean;
  ativa: boolean;
  vezesAplicada: number;
  ultimaAplicacao: string | null;
}

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";

/**
 * Sem acento, maiúsculas, espaços simples. Igual a
 * `fn_conciliacao_normalizar_historico`: troca só os acentos do português,
 * caractere a caractere, e mantém a pontuação.
 */
export function normalizarHistorico(texto: string | null | undefined): string {
  if (!texto) return "";
  let saida = "";
  for (const c of texto) {
    const i = COM_ACENTO.indexOf(c);
    saida += i >= 0 ? SEM_ACENTO[i] : c;
  }
  return saida.toUpperCase().replace(/\s+/g, " ").trim();
}

/** A regra vale para este movimento? Mesma conta (ou geral), sentido, texto. */
export function regraCasa(
  regra: RegraConciliacao,
  movimento: { contaBancariaId: string; valor: number; memo: string | null },
): boolean {
  if (!regra.ativa || regra.acao === "apelido") return false;
  if (regra.contaBancariaId && regra.contaBancariaId !== movimento.contaBancariaId) return false;
  const sentido = movimento.valor >= 0 ? "credito" : "debito";
  if (regra.sentido && regra.sentido !== sentido) return false;
  return normalizarHistorico(movimento.memo).includes(regra.padrao);
}

/** A primeira que casa: a da conta antes da geral, depois pelo nome. */
export function regraDoMovimento(
  regras: readonly RegraConciliacao[],
  movimento: { contaBancariaId: string; valor: number; memo: string | null },
): RegraConciliacao | null {
  const ordem = [...regras].sort(
    (a, b) =>
      Number(a.contaBancariaId === null) - Number(b.contaBancariaId === null) ||
      (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0) ||
      a.id.localeCompare(b.id),
  );
  return ordem.find((r) => regraCasa(r, movimento)) ?? null;
}

/**
 * Texto da regra sugerido a partir de um histórico ("Criar regra a partir
 * deste"): o maior trecho sem data, hora e número (no empate, o último). Precisa ser um pedaço
 * contínuo do histórico, porque a regra compara por "contém".
 *
 * "TARIFA PACOTE DE SERVIÇOS - COBRANÇA REFERENTE 05/09/2025" vira
 * "TARIFA PACOTE DE SERVICOS - COBRANCA REFERENTE".
 */
export function padraoDoHistorico(memo: string | null): string {
  const trechos = normalizarHistorico(memo)
    .split(/\S*\d\S*/)
    .map((t) => t.trim().replace(/^[\s\-.,:/]+|[\s\-.,:/]+$/g, "").trim())
    .filter((t) => t.length >= 3);
  // Empate: o último trecho, onde o banco escreve o nome.
  return trechos.reduce((maior, t) => (t.length >= maior.length ? t : maior), "");
}
