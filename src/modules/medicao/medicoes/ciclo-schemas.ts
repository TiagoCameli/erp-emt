import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchema, idSchemaCom } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/**
 * Validação dos passos do ciclo da medição (Fase 5). O banco confere tudo de novo (motivo com 3
 * letras, quantidade diferente de zero e com até 4 casas, `^-?[0-9]+(\.[0-9]+)?$`); aqui só evita
 * mandar lixo e deixa a mensagem no campo.
 */

const MENSAGEM_MOTIVO = "Informe o motivo, com ao menos 3 letras";
export const MENSAGEM_QUANTIDADE_AJUSTE = "Informe a quantidade do ajuste, positiva ou negativa, até 4 casas";

/** Motivo de reabrir, nova revisão e revisar aprovada: sem espaço nas pontas, 3 letras ou mais. */
export const motivoCicloSchema = z.string().trim().min(3, MENSAGEM_MOTIVO);

/**
 * Quantidade do ajuste digitada em pt-BR ("-1.234,5") -> texto com PONTO ("-1234.5"), sem passar
 * por Number (D7). O sinal sai antes e volta depois: `normalizarNumeroDigitado` só conhece número
 * sem sinal. Zero (em qualquer escrita) volta nulo, porque o banco recusa ajuste zero.
 */
export function quantidadeAjusteParaBanco(texto: string): string | null {
  const limpo = texto.trim();
  const negativo = limpo.startsWith("-");
  const normalizado = normalizarNumeroDigitado(negativo ? limpo.slice(1) : limpo, CASAS_TAXA);
  if (normalizado === null) return null;
  const comPonto = normalizado.replace(",", ".");
  if (/^0+(\.0+)?$/.test(comPonto)) return null;
  return negativo ? `-${comPonto}` : comPonto;
}

const quantidadeAjusteSchema = z
  .string()
  .refine((t) => quantidadeAjusteParaBanco(t) !== null, MENSAGEM_QUANTIDADE_AJUSTE);

/** O que o drawer de ajuste edita (a quantidade continua como foi digitada). */
export const ajusteFormSchema = z.object({
  itemId: idSchemaCom("Escolha o serviço"),
  quantidade: quantidadeAjusteSchema,
  motivo: motivoCicloSchema,
});
export type AjusteFormInput = z.input<typeof ajusteFormSchema>;

/** Payload de `lancarAjuste`, validado de novo no servidor; a quantidade sai pronta para a RPC. */
export const lancarAjusteSchema = z.object({
  medicaoId: idSchema,
  itemId: idSchemaCom("Escolha o serviço"),
  quantidade: quantidadeAjusteSchema.transform((t) => quantidadeAjusteParaBanco(t) as string),
  motivo: motivoCicloSchema,
});
export type LancarAjusteInput = z.input<typeof lancarAjusteSchema>;
