import { z } from "zod";

import {
  APLICACOES_OLEO,
  ROTULO_APLICACAO_OLEO,
  type AplicacaoOleo,
} from "@/modules/manutencao/_shared/rotulos";

/**
 * Teto do intervalo de troca, em meses. O banco só exige > 0; dez anos cobre
 * qualquer óleo e pega o erro de digitação ("60" virando "600").
 */
export const INTERVALO_MESES_MAXIMO = 120;

/**
 * Intervalo digitado em número inteiro de meses. Vazio vira null (sem
 * intervalo); texto que não é inteiro positivo até o teto vira undefined.
 * Só dígitos: "1,5", "1.000" e "abc" são recusados. Não passa pelo
 * normalizador de número digitado de propósito: ele é de decimal, e com 0 casas
 * leria "1,500" como milhar.
 */
export function intervaloMesesParaNumero(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === "") return null;
  if (!/^\d+$/.test(limpo)) return undefined;
  const numero = Number(limpo);
  if (!Number.isInteger(numero) || numero <= 0 || numero > INTERVALO_MESES_MAXIMO) {
    return undefined;
  }
  return numero;
}

const MENSAGEM_INTERVALO = `Informe o intervalo em meses, um número inteiro de 1 a ${INTERVALO_MESES_MAXIMO}`;

const nomeSchema = z
  .string()
  .trim()
  .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
  .max(120, { error: "O nome pode ter no máximo 120 caracteres" });

const aplicacaoSchema = z.enum(APLICACOES_OLEO, { error: "Escolha a aplicação do óleo" });

/** Schema do servidor: o que a action grava. */
export const tipoOleoSchema = z.object({
  nome: nomeSchema,
  aplicacao: aplicacaoSchema,
  intervaloMeses: z
    .number({ error: MENSAGEM_INTERVALO })
    .int({ error: MENSAGEM_INTERVALO })
    .min(1, { error: MENSAGEM_INTERVALO })
    .max(INTERVALO_MESES_MAXIMO, { error: MENSAGEM_INTERVALO })
    .nullable(),
  ativo: z.boolean(),
});

export type TipoOleoInput = z.infer<typeof tipoOleoSchema>;

/**
 * Schema do formulário (client). O intervalo continua texto para casar input e
 * output do react-hook-form; a conversão é `formParaTipoOleo`.
 */
export const tipoOleoFormSchema = z.object({
  nome: nomeSchema,
  aplicacao: aplicacaoSchema,
  intervaloMeses: z
    .string()
    .refine((valor) => intervaloMesesParaNumero(valor) !== undefined, {
      error: MENSAGEM_INTERVALO,
    }),
  ativo: z.boolean(),
});

export type TipoOleoFormInput = z.infer<typeof tipoOleoFormSchema>;

/** Converte o formulário validado no que a action recebe. */
export function formParaTipoOleo(valores: TipoOleoFormInput): TipoOleoInput {
  return {
    nome: valores.nome.trim(),
    aplicacao: valores.aplicacao,
    intervaloMeses: intervaloMesesParaNumero(valores.intervaloMeses) ?? null,
    ativo: valores.ativo,
  };
}

/** Chave de comparação: minúscula, sem acento, sem espaço nas pontas. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Aplicação escrita na planilha, pelo rótulo ("Hidráulico", "hidraulico") ou
 * pela chave do banco. Vazio vira "outro", o padrão da coluna. Irreconhecível
 * vira null, e a linha é recusada na prévia.
 */
export function aplicacaoDaPlanilha(texto: string): AplicacaoOleo | null {
  const procurada = chave(texto);
  if (procurada === "") return "outro";
  for (const aplicacao of APLICACOES_OLEO) {
    if (chave(aplicacao) === procurada || chave(ROTULO_APLICACAO_OLEO[aplicacao]) === procurada) {
      return aplicacao;
    }
  }
  return null;
}

/** Lista das aplicações aceitas, para a mensagem de erro da importação. */
export const APLICACOES_ACEITAS = APLICACOES_OLEO.map((a) => ROTULO_APLICACAO_OLEO[a]).join(", ");

/**
 * Cabeçalho do modelo de importação, na ordem da planilha. A action lê pelos
 * mesmos rótulos, então o modelo baixado e a leitura não saem de sincronia.
 */
export const COLUNAS_MODELO = [
  { rotulo: "Nome", exemplo: "Lubrax 15W40" },
  { rotulo: "Aplicação", exemplo: "Motor" },
  { rotulo: "Intervalo em meses", exemplo: "6" },
] as const;
