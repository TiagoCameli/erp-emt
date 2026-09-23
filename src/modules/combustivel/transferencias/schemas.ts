import { z } from "zod";

import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import { dataHoraLocalParaIso } from "@/modules/combustivel/_shared/rotulos";

/**
 * Schemas da transferência entre tanques, e os blocos de campo que o
 * esvaziamento e o cadastro de tanque reaproveitam (litros e data e hora).
 *
 * Dois níveis, como no almoxarifado: o `*FormSchema` guarda número como TEXTO
 * cru ("1234,5678"), que é o que `InputQuantidade` trabalha; o `*Schema` é o
 * que a Server Action recebe, com número de verdade e a data já em ISO com o
 * fuso de Rio Branco. O servidor valida de novo (nunca confia na tela).
 *
 * Litros são NUMERIC(14,4): TAXA (multiplica o preço), 4 casas.
 */

/** Teto de NUMERIC(14,4): 10 dígitos inteiros. */
export const TETO_NUMERIC_14_4 = 9999999999.9999;

/** Casas decimais de um número pela sua representação. */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  if (texto.includes("e")) return Number.POSITIVE_INFINITY;
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Texto digitado (pt-BR) em número com até 4 casas. Passa pelo MESMO
 * normalizador dos inputs canônicos: "1.234,5" e "1234.5" dão 1234,5. Null
 * quando não é número ou tem casa demais.
 */
export function paraLitros(texto: string): number | null {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  if (normalizado === null) return null;
  const numero = Number(normalizado.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/** Número do banco para o texto cru do formulário ("1234,5678"). Nulo vira "". */
export function litrosParaTexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  const texto = valor.toFixed(CASAS_TAXA).replace(/\.?0+$/, "");
  return texto.replace(".", ",");
}

/** Litros digitados: maior que zero, até 4 casas. */
export function litrosTexto() {
  return z.string().trim().refine(
    (valor) => {
      const numero = paraLitros(valor);
      return numero !== null && numero > 0 && numero <= TETO_NUMERIC_14_4;
    },
    { error: `Informe os litros, maior que zero e com até ${CASAS_TAXA} casas` },
  );
}

/** Litros na action: número positivo, até 4 casas. */
export const litrosNumero = z
  .number({ error: "Litros inválidos" })
  .positive({ error: "Os litros precisam ser maiores que zero" })
  .max(TETO_NUMERIC_14_4, { error: "Litros acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `Os litros aceitam no máximo ${CASAS_TAXA} casas decimais`,
  });

/** Data e hora do campo `datetime-local`, em Rio Branco. */
export function dataHoraTexto() {
  return z
    .string()
    .trim()
    .refine((valor) => dataHoraLocalParaIso(valor) !== null, { error: "Informe a data e a hora" });
}

/** Data e hora na action: ISO com fuso ("2026-09-23T14:30:00-05:00"). */
export const dataHoraIso = z
  .string({ error: "Informe a data e a hora" })
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor) && !Number.isNaN(Date.parse(valor)), {
    error: "Informe a data e a hora",
  });

/** Observação livre: vazio continua "" aqui; a RPC troca por null. */
export const observacoesSchema = z
  .string()
  .trim()
  .max(1000, { error: "Máximo de 1000 caracteres" });

/**
 * Valor digitado (pt-BR) em número, com as 4 casas do Combustível
 * (`CASAS_VALOR_OPERACIONAL`). Null quando não é número ou tem casa demais.
 */
export function paraValor(texto: string): number | null {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_VALOR_OPERACIONAL);
  if (normalizado === null) return null;
  const numero = Number(normalizado.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

/** Número para o texto cru do campo de valor ("1234,5678"). Nulo vira "". */
export function valorParaTexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  const texto = valor.toFixed(CASAS_VALOR_OPERACIONAL).replace(/\.?0+$/, "");
  return texto.replace(".", ",");
}

const MENSAGEM_VALOR = `Informe o valor total, zero ou mais, com até ${CASAS_VALOR_OPERACIONAL} casas`;

/** Valor total digitado: zero ou mais (a origem aceita zero), até 4 casas. */
function valorTexto() {
  return z.string().trim().refine(
    (valor) => {
      const numero = paraValor(valor);
      return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
    },
    { error: MENSAGEM_VALOR },
  );
}

/**
 * Valor na action. Null = "não mexi": na edição o banco mantém o salvo; na
 * criação calcula pelo preço médio da origem.
 */
const valorNumero = z
  .number({ error: MENSAGEM_VALOR })
  .min(0, { error: MENSAGEM_VALOR })
  .max(TETO_NUMERIC_14_4, { error: "Valor acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_VALOR_OPERACIONAL, { error: MENSAGEM_VALOR })
  .nullable();

const MENSAGEM_MESMO_TANQUE = "A origem e o destino precisam ser tanques diferentes";

// ---------------------------------------------------------------------------
// Transferência
// ---------------------------------------------------------------------------

export const transferenciaFormSchema = z
  .object({
    origemId: idSchemaCom("Selecione o tanque de origem"),
    destinoId: idSchemaCom("Selecione o tanque de destino"),
    litros: litrosTexto(),
    valorTotal: valorTexto(),
    dataHora: dataHoraTexto(),
    observacoes: observacoesSchema,
  })
  .refine((dados) => dados.origemId !== dados.destinoId, {
    error: MENSAGEM_MESMO_TANQUE,
    path: ["destinoId"],
  });

export type TransferenciaFormInput = z.infer<typeof transferenciaFormSchema>;

export const transferenciaSchema = z
  .object({
    origemId: idSchemaCom("Selecione o tanque de origem"),
    destinoId: idSchemaCom("Selecione o tanque de destino"),
    litros: litrosNumero,
    valorTotal: valorNumero,
    dataHora: dataHoraIso,
    observacoes: observacoesSchema,
  })
  .refine((dados) => dados.origemId !== dados.destinoId, {
    error: MENSAGEM_MESMO_TANQUE,
    path: ["destinoId"],
  });

export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

/**
 * Formulário validado para o contrato da action. `enviarValor` falso (edição
 * sem mexer no valor) manda null, e o banco mantém o valor salvo.
 */
export function transferenciaDoForm(form: TransferenciaFormInput, enviarValor = true): TransferenciaInput {
  return {
    origemId: form.origemId,
    destinoId: form.destinoId,
    litros: paraLitros(form.litros) ?? Number.NaN,
    valorTotal: enviarValor ? (paraValor(form.valorTotal) ?? Number.NaN) : null,
    dataHora: dataHoraLocalParaIso(form.dataHora) ?? "",
    observacoes: form.observacoes.trim(),
  };
}
