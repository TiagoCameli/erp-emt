import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";

/**
 * Exibição da OS: equipamento, propriedade e o valor com as 4 casas.
 * Módulo puro (sem "use client" e sem server-only).
 */

export const PROPRIEDADES_EQUIPAMENTO = ["propria", "colorado", "alugada"] as const;
export type PropriedadeEquipamento = (typeof PROPRIEDADES_EQUIPAMENTO)[number];

/** Rótulo curto de quem é o equipamento, para caber ao lado do nome na lista. */
export const ROTULO_PROPRIEDADE_CURTO: Record<PropriedadeEquipamento, string> = {
  propria: "Próprio",
  colorado: "Colorado",
  alugada: "Alugado",
};

export function rotuloPropriedade(propriedade: string | null | undefined): string {
  if (!propriedade) return "";
  return (ROTULO_PROPRIEDADE_CURTO as Record<string, string>)[propriedade] ?? propriedade;
}

/** "EQ-012 Escavadeira 320 (ABC1D23)", sem pedaço vazio. */
export function rotuloEquipamento(equipamento: {
  codigo: string | null;
  descricao: string;
  placa?: string | null;
}): string {
  const partes = [equipamento.codigo?.trim(), equipamento.descricao.trim()].filter(
    (parte): parte is string => Boolean(parte),
  );
  const nome = partes.join(" ");
  const placa = equipamento.placa?.trim();
  return placa ? `${nome} (${placa})` : nome;
}

const formatadorOperacional = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: CASAS_VALOR_OPERACIONAL,
});

/**
 * R$ com até 4 casas: "R$ 6,3947", "R$ 10,00". É o custo unitário e o valor das
 * linhas da OS, que o banco guarda com 4 casas (CASAS_VALOR_OPERACIONAL). O
 * MoneyText corta em 2, então no detalhe a linha usa este.
 */
export function formatarValorOperacional(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return formatadorOperacional.format(0);
  }
  return formatadorOperacional.format(valor);
}

const ESCALA = 10 ** CASAS_VALOR_OPERACIONAL;

/**
 * Soma de valores de 4 casas sem erro de ponto flutuante: soma em inteiros de
 * décimo de milésimo e divide no fim. Somar reais direto numa lista de centenas
 * de OS erra a última casa.
 */
export function somarValoresOperacionais(valores: readonly number[]): number {
  let total = 0;
  for (const valor of valores) {
    if (Number.isFinite(valor)) total += Math.round(valor * ESCALA);
  }
  return total / ESCALA;
}

/** NUMERIC chega do PostgREST como número ou como string: um lugar só converte. */
export function paraNumeroDoBanco(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(numero) ? numero : 0;
}

/** Igual ao de cima, mas preserva o "não informado" (medição vazia). */
export function paraNumeroOuNulo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(numero) ? numero : null;
}
