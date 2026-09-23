import { z } from "zod";

import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { dataHoraLocalParaIso } from "@/modules/combustivel/_shared/rotulos";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Schemas da entrada de combustível. Dois níveis, como no Almoxarifado:
 *
 * - `entradaFormSchema`: o que o react-hook-form guarda. Número é TEXTO cru
 *   ("1234,5678"), que é o que `InputQuantidade`/`InputPreco` escrevem, e a data é
 *   o "AAAA-MM-DDTHH:MM" do campo `datetime-local` (hora de Rio Branco). Sem
 *   `.default()`: entrada e saída do zod têm de ser o mesmo tipo.
 * - `entradaSchema`: o que a Server Action recebe, com número de verdade e a data
 *   em ISO com fuso. O servidor valida de novo.
 *
 * Quantidade é na unidade do insumo (galão de Arla, litro de diesel); os litros
 * quem converte é o banco (`fn_comb_litros_da_entrada`). O valor é o total da NF,
 * com as 4 casas do Combustível (`CASAS_VALOR_OPERACIONAL`).
 */

/** Teto das colunas NUMERIC(14,4): 10 dígitos inteiros. */
export const TETO_NUMERIC_14_4 = 9_999_999_999.9999;

export function temCasasDemais(valor: number, casas: number): boolean {
  const escala = 10 ** casas;
  return Math.abs(Math.round(valor * escala) - valor * escala) > 1e-6;
}

/** Arredonda como o `round` do Postgres (meio para longe do zero). */
export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  const sinal = valor < 0 ? -1 : 1;
  return (sinal * Math.round(Math.abs(valor) * fator * (1 + Number.EPSILON))) / fator;
}

/** Id opcional no formulário: "" é "nenhum". */
function idOpcionalForm(mensagem: string) {
  return z
    .string()
    .trim()
    .refine((valor) => valor === "" || z.guid().safeParse(valor).success, { error: mensagem });
}

/** Texto numérico do formulário com regra de mínimo. */
export function numeroTexto(
  casas: number,
  mensagem: string,
  minimo: "positivo" | "naoNegativo",
) {
  return z
    .string()
    .trim()
    .refine(
      (texto) => {
        const numero = textoParaNumero(texto, casas);
        if (numero === null) return false;
        if (numero > TETO_NUMERIC_14_4) return false;
        return minimo === "positivo" ? numero > 0 : numero >= 0;
      },
      { error: mensagem },
    );
}

/** Data e hora do campo `datetime-local`, lida como Rio Branco. */
export const dataHoraFormSchema = z
  .string()
  .trim()
  .refine((valor) => dataHoraLocalParaIso(valor) !== null, { error: "Informe a data e a hora" });

/** Instante ISO com fuso (o que a action recebe). */
export const dataHoraIsoSchema = z
  .string()
  .trim()
  .refine((valor) => /[+-]\d{2}:\d{2}$|Z$/.test(valor) && !Number.isNaN(new Date(valor).getTime()), {
    error: "Data e hora inválidas",
  });

export function numeroSchema(casas: number, rotulo: string, minimo: "positivo" | "naoNegativo") {
  return z
    .number({ error: `${rotulo} inválido` })
    .refine((valor) => Number.isFinite(valor), { error: `${rotulo} inválido` })
    .refine((valor) => (minimo === "positivo" ? valor > 0 : valor >= 0), {
      error: minimo === "positivo" ? `${rotulo} precisa ser maior que zero` : `${rotulo} não pode ser negativo`,
    })
    .refine((valor) => valor <= TETO_NUMERIC_14_4, { error: `${rotulo} acima do permitido` })
    .refine((valor) => !temCasasDemais(valor, casas), {
      error: `${rotulo} aceita no máximo ${casas} casas decimais`,
    });
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

export const entradaFormSchema = z.object({
  tanqueId: z.string().trim().min(1, { error: "Selecione o tanque" }),
  insumoId: z.string().trim().min(1, { error: "Selecione o combustível" }),
  quantidade: numeroTexto(
    CASAS_TAXA,
    `Informe a quantidade maior que zero, com até ${CASAS_TAXA} casas`,
    "positivo",
  ),
  valorTotal: numeroTexto(
    CASAS_VALOR_OPERACIONAL,
    `Informe o valor da nota, com até ${CASAS_VALOR_OPERACIONAL} casas`,
    "naoNegativo",
  ),
  fornecedorId: idOpcionalForm("Fornecedor inválido"),
  notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
  dataHora: dataHoraFormSchema,
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }),
});
export type EntradaFormInput = z.infer<typeof entradaFormSchema>;

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export const entradaSchema = z.strictObject({
  tanqueId: z.guid({ error: "Selecione o tanque" }),
  insumoId: z.guid({ error: "Selecione o combustível" }),
  quantidade: numeroSchema(CASAS_TAXA, "Quantidade", "positivo"),
  valorTotal: numeroSchema(CASAS_VALOR_OPERACIONAL, "Valor", "naoNegativo"),
  fornecedorId: z.guid({ error: "Fornecedor inválido" }).nullable(),
  notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }).nullable(),
  dataHora: dataHoraIsoSchema,
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }).nullable(),
});
export type EntradaInput = z.infer<typeof entradaSchema>;

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** Formulário validado -> o que a action recebe. */
export function entradaDoForm(form: EntradaFormInput): EntradaInput {
  return {
    tanqueId: form.tanqueId,
    insumoId: form.insumoId,
    quantidade: textoParaNumero(form.quantidade, CASAS_TAXA) ?? 0,
    valorTotal: textoParaNumero(form.valorTotal, CASAS_VALOR_OPERACIONAL) ?? 0,
    fornecedorId: textoOuNulo(form.fornecedorId),
    notaFiscal: textoOuNulo(form.notaFiscal),
    dataHora: dataHoraLocalParaIso(form.dataHora) ?? "",
    observacoes: textoOuNulo(form.observacoes),
  };
}

// ---------------------------------------------------------------------------
// Prévia (só mostra; quem grava é o banco)
// ---------------------------------------------------------------------------

/**
 * Litros da entrada: quantidade × litros por unidade do insumo (galão de Arla =
 * 20), igual a `fn_comb_litros_da_entrada`. Sem fator, a unidade já é litro.
 */
export function litrosDaEntrada(quantidade: number, litrosPorUnidade: number | null): number {
  return arredondar(quantidade * (litrosPorUnidade ?? 1), CASAS_TAXA);
}

/** Preço por litro da entrada (o preço da camada no PEPS). Sem litros, nulo. */
export function precoPorLitro(valorTotal: number, litros: number): number | null {
  if (!(litros > 0)) return null;
  return arredondar(valorTotal / litros, CASAS_TAXA);
}
