import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
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
 * Igual à tela da origem (EntradaForm do Gestão Obras, 24/09/2026): a pessoa digita a
 * quantidade e o PREÇO UNITÁRIO; o total é quantidade × preço, exato (o banco grava
 * `p_quantidade * p_valor_unitario`, sem arredondar). Fornecedor é obrigatório.
 *
 * Quantidade é na unidade do insumo (galão de Arla, litro de diesel); os litros
 * quem converte é o banco (`fn_comb_litros_da_entrada`). O preço multiplica a
 * quantidade, então no galão de Arla é o preço do galão.
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
  valorUnitario: numeroTexto(
    CASAS_TAXA,
    `Informe o valor unitário maior que zero, com até ${CASAS_TAXA} casas`,
    "positivo",
  ),
  fornecedorId: z.string().trim().min(1, { error: "Selecione o fornecedor" }),
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
  /**
   * Sem teto de casas: na edição, o preço que a tela da origem preenche é valor ÷
   * quantidade, cheio. Se a pessoa não mexe nele, é ele que volta, e o total salvo
   * continua o mesmo (a origem guarda até 12 casas no valor). O que a pessoa DIGITA
   * passa pelo campo, que aceita 4 casas.
   */
  valorUnitario: z
    .number({ error: "Valor unitário inválido" })
    .refine((valor) => Number.isFinite(valor) && valor > 0, { error: "Valor unitário precisa ser maior que zero" })
    .refine((valor) => valor <= TETO_NUMERIC_14_4, { error: "Valor unitário acima do permitido" }),
  fornecedorId: z.guid({ error: "Selecione o fornecedor" }),
  notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }).nullable(),
  dataHora: dataHoraIsoSchema,
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }).nullable(),
});
export type EntradaInput = z.infer<typeof entradaSchema>;

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Preço unitário que a tela da origem preenche na edição: valor_total ÷ quantidade
 * (`initial.valorTotal / initial.quantidadeLitros`). Sem quantidade, zero.
 */
export function precoUnitarioDaEntrada(valorTotal: number, quantidade: number): number {
  return quantidade > 0 ? valorTotal / quantidade : 0;
}

/** O preço exato da edição e o texto em que ele aparece no campo. */
export interface PrecoDaEdicao {
  texto: string;
  valor: number;
}

/**
 * Formulário validado -> o que a action recebe. Na edição, se o campo do preço
 * continua com o texto que a tela preencheu, vai o preço exato (valor ÷ quantidade),
 * não o arredondado a 4 casas: salvar sem mexer não muda o total.
 */
export function entradaDoForm(form: EntradaFormInput, precoDaEdicao?: PrecoDaEdicao | null): EntradaInput {
  const digitado = textoParaNumero(form.valorUnitario, CASAS_TAXA) ?? 0;
  const valorUnitario =
    precoDaEdicao && form.valorUnitario.trim() === precoDaEdicao.texto ? precoDaEdicao.valor : digitado;
  return {
    tanqueId: form.tanqueId,
    insumoId: form.insumoId,
    quantidade: textoParaNumero(form.quantidade, CASAS_TAXA) ?? 0,
    valorUnitario,
    fornecedorId: form.fornecedorId,
    notaFiscal: textoOuNulo(form.notaFiscal),
    dataHora: dataHoraLocalParaIso(form.dataHora) ?? "",
    observacoes: textoOuNulo(form.observacoes),
  };
}

// ---------------------------------------------------------------------------
// Regras da tela da origem (só mostram e travam o botão; o banco confere de novo)
// ---------------------------------------------------------------------------

/** Total da entrada: quantidade × valor unitário, como a origem (`valorTotalCalc`). */
export function valorTotalEntrada(quantidade: number | null, valorUnitario: number | null): number {
  return (quantidade || 0) * (valorUnitario || 0);
}

/** O que a regra de capacidade e de mistura precisa do tanque. */
export interface TanqueDaEntrada {
  id: string;
  ehExterno: boolean;
  capacidadeLitros: number;
  nivelAtualLitros: number;
  combustivelAtualId: string | null;
}

/**
 * Espaço livre do tanque, como a origem: capacidade - nível atual + (na edição, no MESMO
 * tanque, os litros da própria entrada, que já estão no nível). Os litros são os do
 * tanque, então no galão de Arla a entrada anterior conta convertida.
 */
export function espacoDisponivel(
  tanque: TanqueDaEntrada,
  edicao: { tanqueId: string; litros: number } | null,
): number {
  const ajusteEdicao = edicao && edicao.tanqueId === tanque.id ? edicao.litros : 0;
  return tanque.capacidadeLitros - tanque.nivelAtualLitros + ajusteEdicao;
}

/**
 * Passa da capacidade? Capacidade zero é "sem capacidade cadastrada" no ERP (o banco
 * também só trava quando `capacidade_litros > 0`); na origem todo tanque tem capacidade.
 */
export function excedeCapacidade(
  tanque: TanqueDaEntrada,
  litros: number,
  edicao: { tanqueId: string; litros: number } | null,
): boolean {
  if (!(tanque.capacidadeLitros > 0)) return false;
  return litros > espacoDisponivel(tanque, edicao);
}

/**
 * Pré-checagem de mistura da origem: bloqueia se o tanque tem OUTRO combustível corrente.
 * Tanque vazio (nível <= 0) ou externo passa. Devolve o id do combustível que está no
 * tanque, ou null.
 */
export function conflitoCombustivel(tanque: TanqueDaEntrada | null, insumoId: string): string | null {
  if (!tanque || !insumoId) return null;
  if (tanque.ehExterno) return null;
  if (tanque.nivelAtualLitros <= 0) return null;
  if (!tanque.combustivelAtualId) return null;
  if (tanque.combustivelAtualId === insumoId) return null;
  return tanque.combustivelAtualId;
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
