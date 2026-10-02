import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchema } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import { comparar, lerDecimal, paraTexto, subtrair } from "@/modules/medicao/_shared/decimal";
import { ehNumeroAmbiguo } from "@/modules/medicao/_shared/numero-ambiguo";

import type { ItemMedicaoDetalhe } from "./tipos";

/**
 * Regras puras da aprovação e da comparação de revisões (Fase 5, Task 4), usadas pela tela e pela
 * action. A RPC `fn_mc_medicao_aprovar` confere tudo de novo (item da revisão enviada, zero ou mais,
 * até 4 casas) e é quem grava e recalcula glosa e valor.
 *
 * D7: as quantidades andam como TEXTO. A glosa e a diferença entre revisões são contas de
 * QUANTIDADE só para exibir, exatas (BigInt, `_shared/decimal.ts`); dinheiro nunca é calculado aqui.
 */

/** Código, descrição e unidade de um item, na ordem da planilha da medição. */
export interface RotuloItem {
  itemId: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
}

/** Uma linha de `mc_revisao_itens`: a medida congelada de um item no envio da revisão. */
export interface ItemCongelado {
  revisaoId: string;
  itemId: string;
  /** Texto do numeric, com ponto. */
  quantidade: string;
}

/** Item da revisão enviada no drawer de aprovação. */
export interface LinhaAprovacao extends RotuloItem {
  /** Medida congelada, texto do banco com ponto. */
  medida: string;
}

export const MENSAGEM_QUANTIDADE_APROVADA = "Informe zero ou mais, até 4 casas";

/**
 * Quantidade aprovada digitada (valor cru do `InputQuantidade`, "1234,5", ou pt-BR "1.234,5") ->
 * texto com PONTO para a RPC ("1234.5"). Vazio é 0 (o item vai com aprovada 0). "1.234" é recusado
 * como no colar, porque pode ser 1234 ou 1,234.
 */
export function quantidadeAprovadaParaBanco(texto: string): { valor: string } | { erro: string } {
  const limpo = (texto ?? "").trim();
  if (limpo === "") return { valor: "0" };
  if (ehNumeroAmbiguo(limpo)) {
    return {
      erro: `Número ambíguo: "${limpo}". Use vírgula decimal (${limpo.replace(".", ",")}) ou escreva sem separador de milhar (${limpo.replace(".", "")})`,
    };
  }
  const normalizado = normalizarNumeroDigitado(limpo, CASAS_TAXA);
  if (normalizado === null) return { erro: MENSAGEM_QUANTIDADE_APROVADA };
  return { valor: paraTexto(lerDecimal(normalizado.replace(",", "."))) };
}

/** Medida do banco ("28.5000") -> valor cru do campo ("28,5"), para "Aprovar tudo como medido". */
export function medidaParaCampo(medida: string): string {
  return paraTexto(lerDecimal(medida)).replace(".", ",");
}

/** Medida menos aprovada (texto do banco), só para exibir; nula quando a aprovada é inválida. */
export function glosaDoItem(medida: string, aprovada: string): string | null {
  const r = quantidadeAprovadaParaBanco(aprovada);
  if ("erro" in r) return null;
  return paraTexto(subtrair(lerDecimal(medida), lerDecimal(r.valor)));
}

/** Rótulos na ordem do detalhe (planilha da medição) e, depois, os extras que faltarem. */
export function rotulosDosItens(itens: Pick<ItemMedicaoDetalhe, "itemId" | "codigo" | "descricao" | "unidade">[], extras: RotuloItem[]): RotuloItem[] {
  const vistos = new Set<string>();
  const saida: RotuloItem[] = [];
  for (const r of [...itens, ...extras]) {
    if (vistos.has(r.itemId)) continue;
    vistos.add(r.itemId);
    saida.push({ itemId: r.itemId, codigo: r.codigo, descricao: r.descricao, unidade: r.unidade });
  }
  return saida;
}

function rotuloOuVazio(rotulos: Map<string, RotuloItem>, itemId: string): RotuloItem {
  return rotulos.get(itemId) ?? { itemId, codigo: null, descricao: null, unidade: null };
}

/** Ordena ids pela ordem dos rótulos; sem rótulo vai no fim, na ordem em que apareceu. */
function ordenarIds(ids: string[], rotulos: RotuloItem[]): string[] {
  const posicao = new Map(rotulos.map((r, i) => [r.itemId, i]));
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (posicao.get(a.id) ?? rotulos.length + a.i) - (posicao.get(b.id) ?? rotulos.length + b.i))
    .map((x) => x.id);
}

/** Os itens congelados de uma revisão, com rótulo, na ordem da planilha. */
export function linhasDaRevisao(congelados: ItemCongelado[], revisaoId: string, rotulos: RotuloItem[]): LinhaAprovacao[] {
  const porId = new Map(rotulos.map((r) => [r.itemId, r]));
  const medidas = new Map<string, string>();
  for (const c of congelados) if (c.revisaoId === revisaoId) medidas.set(c.itemId, c.quantidade);
  return ordenarIds([...medidas.keys()], rotulos).map((id) => ({ ...rotuloOuVazio(porId, id), medida: medidas.get(id) as string }));
}

export interface ResumoAprovacao {
  /** Quantidade de cada item já com ponto (vazio vira "0"). */
  itens: { itemId: string; quantidade: string }[];
  /** Mensagem por item com valor inválido; vazio quando dá para confirmar. */
  erros: Record<string, string>;
  /** Itens que vão com aprovada 0 (campo vazio ou zero). */
  zerados: LinhaAprovacao[];
  /** Itens com glosa diferente de zero (medida menos aprovada). */
  glosas: { linha: LinhaAprovacao; glosa: string }[];
  /** Itens com aprovada acima da medida (glosa negativa), com a quantidade a mais. */
  acima: { linha: LinhaAprovacao; aprovada: string; excesso: string }[];
}

/** O que a confirmação mostra antes de aprovar: zerados, glosa por item e erros de campo. */
export function resumirAprovacao(linhas: LinhaAprovacao[], valores: Record<string, string>): ResumoAprovacao {
  const resumo: ResumoAprovacao = { itens: [], erros: {}, zerados: [], glosas: [], acima: [] };
  for (const linha of linhas) {
    const r = quantidadeAprovadaParaBanco(valores[linha.itemId] ?? "");
    if ("erro" in r) {
      resumo.erros[linha.itemId] = r.erro;
      continue;
    }
    resumo.itens.push({ itemId: linha.itemId, quantidade: r.valor });
    if (r.valor === "0") resumo.zerados.push(linha);
    const medida = lerDecimal(linha.medida);
    const aprovada = lerDecimal(r.valor);
    const glosa = paraTexto(subtrair(medida, aprovada));
    if (glosa !== "0") resumo.glosas.push({ linha, glosa });
    if (comparar(aprovada, medida) > 0) resumo.acima.push({ linha, aprovada: r.valor, excesso: paraTexto(subtrair(aprovada, medida)) });
  }
  return resumo;
}

/** Uma linha da comparação: quantidade congelada em cada revisão e a diferença (para menos de). */
export interface LinhaComparacao extends RotuloItem {
  de: string;
  para: string;
  diferenca: string;
}

/** Comparação item a item de duas revisões; item ausente numa delas conta 0 nela. */
export function compararRevisoes(congelados: ItemCongelado[], deId: string, paraId: string, rotulos: RotuloItem[]): LinhaComparacao[] {
  const porId = new Map(rotulos.map((r) => [r.itemId, r]));
  const de = new Map<string, string>();
  const para = new Map<string, string>();
  const ids: string[] = [];
  for (const c of congelados) {
    // Não é "else": com a mesma revisão nos dois lados, a quantidade vai para os dois (diferença 0).
    const emDe = c.revisaoId === deId;
    const emPara = c.revisaoId === paraId;
    if (!emDe && !emPara) continue;
    if (!de.has(c.itemId) && !para.has(c.itemId)) ids.push(c.itemId);
    if (emDe) de.set(c.itemId, c.quantidade);
    if (emPara) para.set(c.itemId, c.quantidade);
  }
  return ordenarIds(ids, rotulos).map((id) => {
    const a = lerDecimal(de.get(id) ?? "0");
    const b = lerDecimal(para.get(id) ?? "0");
    return { ...rotuloOuVazio(porId, id), de: paraTexto(a), para: paraTexto(b), diferenca: paraTexto(subtrair(b, a)) };
  });
}

/** Payload de `aprovarMedicao`; as quantidades vão cruas e são convertidas no servidor. */
export const aprovarMedicaoSchema = z.object({
  id: idSchema,
  itens: z.array(z.object({ itemId: idSchema, quantidade: z.string() })).max(5000),
  tudoComoMedido: z.boolean(),
});
export type AprovarMedicaoInput = z.input<typeof aprovarMedicaoSchema>;
