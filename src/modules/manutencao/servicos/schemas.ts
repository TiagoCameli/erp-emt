import { z } from "zod";

import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { idSchema, idSchemaCom } from "@/lib/id";
import {
  PRIORIDADES_OS,
  TIPOS_OS,
  UNIDADES_OLEO,
} from "@/modules/manutencao/_shared/rotulos";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Schemas do caderno de serviços. Dois de cada:
 *
 * - o do FORMULÁRIO guarda número como texto ("1234,5"), que é o que o
 *   InputQuantidade e o InputPreco escrevem. Sem `.default()` e sem
 *   `.optional()` em campo de texto: com eles a entrada do zod difere da saída e
 *   o react-hook-form passa a brigar com o campo;
 * - o do SERVIDOR recebe número, e é o que a Server Action valida de novo.
 *
 * Custo não aparece em schema nenhum: quem calcula é o gatilho do banco.
 */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Teto das colunas NUMERIC(14,4): 10 dígitos inteiros. */
const TETO_NUMERICO = 9_999_999_999.9999;

const TEXTO_CURTO = 200;
const TEXTO_LONGO = 4000;

function temCasasDemais(valor: number, casas: number): boolean {
  const escala = 10 ** casas;
  return Math.abs(Math.round(valor * escala) - valor * escala) > 1e-6;
}

/** Campo numérico opcional do formulário: vazio passa; preenchido tem que ser número ≥ 0. */
function textoNumericoOpcional(casas: number, mensagem: string) {
  return z
    .string()
    .trim()
    .refine((texto) => texto === "" || textoParaNumero(texto, casas) !== null, {
      error: mensagem,
    });
}

/** Campo numérico obrigatório do formulário. */
function textoNumericoObrigatorio(
  casas: number,
  vazio: string,
  invalido: string,
  minimo: "positivo" | "naoNegativo",
) {
  return z
    .string()
    .trim()
    .min(1, { error: vazio })
    .refine(
      (texto) => {
        const numero = textoParaNumero(texto, casas);
        if (numero === null) return false;
        return minimo === "positivo" ? numero > 0 : numero >= 0;
      },
      { error: invalido },
    );
}

function numeroServidor(casas: number, mensagem: string) {
  return z
    .number({ error: mensagem })
    .finite({ error: mensagem })
    .min(0, { error: mensagem })
    .max(TETO_NUMERICO, { error: "Número acima do permitido" })
    .refine((valor) => !temCasasDemais(valor, casas), {
      error: `Use no máximo ${casas} casas decimais`,
    });
}

// ---------------------------------------------------------------------------
// Cabeçalho da OS
// ---------------------------------------------------------------------------

export const osFormSchema = z
  .object({
    equipamentoId: z.string().min(1, { error: "Escolha o equipamento" }),
    /**
     * Preenchido pela tela ao escolher o equipamento: alugado não tem etapa no
     * centro de custo, e a OS precisa saber em qual obra ele trabalha.
     */
    exigeCentroCusto: z.boolean(),
    centroCustoId: z.string(),
    tipo: z.enum(TIPOS_OS, { error: "Escolha o tipo da OS" }),
    prioridade: z.enum(PRIORIDADES_OS, { error: "Escolha a prioridade" }),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Descreva o serviço" })
      .max(TEXTO_LONGO, { error: `Máximo de ${TEXTO_LONGO} caracteres` }),
    defeitoReportado: z.string().trim().max(TEXTO_LONGO, { error: `Máximo de ${TEXTO_LONGO} caracteres` }),
    causaRaiz: z.string().trim().max(TEXTO_LONGO, { error: `Máximo de ${TEXTO_LONGO} caracteres` }),
    observacoes: z.string().trim().max(TEXTO_LONGO, { error: `Máximo de ${TEXTO_LONGO} caracteres` }),
    dataAbertura: z.string().trim().regex(DATA_ISO, { error: "Informe a data de abertura" }),
    medicaoAbertura: textoNumericoOpcional(CASAS_TAXA, "Medição inválida: use número com até 4 casas"),
  })
  .refine((dados) => !dados.exigeCentroCusto || dados.centroCustoId !== "", {
    error: "Equipamento alugado: escolha a obra onde ele trabalha",
    path: ["centroCustoId"],
  });

export type OsFormInput = z.infer<typeof osFormSchema>;

export const osSalvarSchema = z.object({
  equipamentoId: idSchemaCom("Escolha o equipamento"),
  centroCustoId: idSchemaCom("Centro de custo inválido").nullable(),
  tipo: z.enum(TIPOS_OS, { error: "Tipo de OS inválido" }),
  prioridade: z.enum(PRIORIDADES_OS, { error: "Prioridade inválida" }),
  descricao: z.string().trim().min(1, { error: "Descreva o serviço" }).max(TEXTO_LONGO),
  defeitoReportado: z.string().trim().max(TEXTO_LONGO).nullable(),
  causaRaiz: z.string().trim().max(TEXTO_LONGO).nullable(),
  observacoes: z.string().trim().max(TEXTO_LONGO).nullable(),
  dataAbertura: z.string().regex(DATA_ISO, { error: "Informe a data de abertura" }),
  medicaoAbertura: numeroServidor(CASAS_TAXA, "Medição inválida").nullable(),
});

export type OsSalvarInput = z.infer<typeof osSalvarSchema>;

function vazioParaNulo(texto: string): string | null {
  const limpo = texto.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Formulário validado para a entrada da action. O centro de custo só vai quando
 * o equipamento exige (alugado): para próprio e Colorado o banco usa a etapa, e
 * mandar um centro escolhido à mão ali seria um dado que ninguém lê.
 */
export function osFormParaEntrada(form: OsFormInput): OsSalvarInput {
  const medicao = form.medicaoAbertura.trim();
  return {
    equipamentoId: form.equipamentoId,
    centroCustoId: form.exigeCentroCusto && form.centroCustoId !== "" ? form.centroCustoId : null,
    tipo: form.tipo,
    prioridade: form.prioridade,
    descricao: form.descricao.trim(),
    defeitoReportado: vazioParaNulo(form.defeitoReportado),
    causaRaiz: vazioParaNulo(form.causaRaiz),
    observacoes: vazioParaNulo(form.observacoes),
    dataAbertura: form.dataAbertura,
    medicaoAbertura: medicao === "" ? null : textoParaNumero(medicao, CASAS_TAXA),
  };
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

export const motivoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o motivo" })
  .max(TEXTO_CURTO * 5, { error: "Motivo longo demais" });

export const concluirSchema = z.object({
  dataConclusao: z.string().regex(DATA_ISO, { error: "Informe a data de conclusão" }),
  medicaoConclusao: numeroServidor(CASAS_TAXA, "Medição inválida").nullable(),
});

export type ConcluirInput = z.infer<typeof concluirSchema>;

export const concluirFormSchema = z.object({
  dataConclusao: z.string().trim().regex(DATA_ISO, { error: "Informe a data de conclusão" }),
  medicaoConclusao: textoNumericoOpcional(
    CASAS_TAXA,
    "Medição de conclusão inválida: use número com até 4 casas",
  ),
});
export type ConcluirFormInput = z.infer<typeof concluirFormSchema>;

/**
 * Valida o que foi digitado no diálogo de conclusão (data e medição em texto) e
 * devolve a entrada da action, ou a mensagem do primeiro problema.
 */
export function validarConclusao(
  dataConclusao: string,
  medicaoTexto: string,
): { ok: true; dados: ConcluirInput } | { ok: false; erro: string } {
  const data = dataConclusao.trim();
  if (!DATA_ISO.test(data)) return { ok: false, erro: "Informe a data de conclusão" };
  const medicao = medicaoTexto.trim();
  let medicaoConclusao: number | null = null;
  if (medicao !== "") {
    medicaoConclusao = textoParaNumero(medicao, CASAS_TAXA);
    if (medicaoConclusao === null) {
      return { ok: false, erro: "Medição de conclusão inválida: use número com até 4 casas" };
    }
  }
  return { ok: true, dados: { dataConclusao: data, medicaoConclusao } };
}

// ---------------------------------------------------------------------------
// Linhas: peça, óleo, terceiro
// ---------------------------------------------------------------------------

/**
 * Peça e óleo escolhem UM par depósito × insumo da lista de saldos, então o
 * formulário guarda a chave do par ("depositoId:insumoId").
 */
export function chaveSaldo(depositoId: string, insumoId: string): string {
  return `${depositoId}:${insumoId}`;
}

export function lerChaveSaldo(chave: string): { depositoId: string; insumoId: string } | null {
  const [depositoId, insumoId, sobra] = chave.split(":");
  if (sobra !== undefined || !depositoId || !insumoId) return null;
  if (!idSchema.safeParse(depositoId).success || !idSchema.safeParse(insumoId).success) return null;
  return { depositoId, insumoId };
}

const QUANTIDADE_FORM = textoNumericoObrigatorio(
  CASAS_TAXA,
  "Informe a quantidade",
  "Quantidade inválida: maior que zero, até 4 casas",
  "positivo",
);

export const pecaFormSchema = z.object({
  saldo: z.string().min(1, { error: "Escolha a peça e o depósito" }),
  quantidade: QUANTIDADE_FORM,
  observacoes: z.string().trim().max(TEXTO_CURTO * 5, { error: "Máximo de 1000 caracteres" }),
});
export type PecaFormInput = z.infer<typeof pecaFormSchema>;

export const pecaSchema = z.object({
  osId: idSchemaCom("OS inválida"),
  depositoId: idSchemaCom("Escolha o depósito"),
  insumoId: idSchemaCom("Escolha a peça"),
  quantidade: numeroServidor(CASAS_TAXA, "Quantidade inválida").refine((q) => q > 0, {
    error: "A quantidade precisa ser maior que zero",
  }),
  observacoes: z.string().trim().max(TEXTO_CURTO * 5).nullable(),
});
export type PecaInput = z.infer<typeof pecaSchema>;

export const oleoFormSchema = z.object({
  saldo: z.string().min(1, { error: "Escolha o óleo e o depósito" }),
  quantidade: QUANTIDADE_FORM,
  unidade: z.enum(UNIDADES_OLEO, { error: "Escolha a unidade" }),
});
export type OleoFormInput = z.infer<typeof oleoFormSchema>;

export const oleoSchema = z.object({
  osId: idSchemaCom("OS inválida"),
  tipoOleoId: idSchemaCom("Tipo de óleo inválido"),
  depositoId: idSchemaCom("Escolha o depósito"),
  insumoId: idSchemaCom("Escolha o óleo"),
  quantidade: numeroServidor(CASAS_TAXA, "Quantidade inválida").refine((q) => q > 0, {
    error: "A quantidade precisa ser maior que zero",
  }),
  unidade: z.enum(UNIDADES_OLEO, { error: "Unidade inválida" }),
});
export type OleoInput = z.infer<typeof oleoSchema>;

export const terceiroFormSchema = z.object({
  fornecedorId: z.string().min(1, { error: "Escolha o fornecedor do serviço" }),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o serviço do terceiro" })
    .max(TEXTO_LONGO, { error: `Máximo de ${TEXTO_LONGO} caracteres` }),
  valor: textoNumericoObrigatorio(
    CASAS_VALOR_OPERACIONAL,
    "Informe o valor do serviço",
    "Valor inválido: não negativo, até 4 casas",
    "naoNegativo",
  ),
  notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
});
export type TerceiroFormInput = z.infer<typeof terceiroFormSchema>;

export const terceiroSchema = z.object({
  osId: idSchemaCom("OS inválida"),
  fornecedorId: idSchemaCom("Escolha o fornecedor do serviço"),
  descricao: z.string().trim().min(1, { error: "Descreva o serviço do terceiro" }).max(TEXTO_LONGO),
  valor: numeroServidor(CASAS_VALOR_OPERACIONAL, "Valor inválido"),
  notaFiscal: z.string().trim().max(60).nullable(),
});
export type TerceiroInput = z.infer<typeof terceiroSchema>;

export const TIPOS_LINHA_OS = ["peca", "oleo", "terceiro"] as const;
export type TipoLinhaOs = (typeof TIPOS_LINHA_OS)[number];

export const removerLinhaSchema = z.object({
  osId: idSchemaCom("OS inválida"),
  tipo: z.enum(TIPOS_LINHA_OS, { error: "Tipo de linha inválido" }),
  linhaId: idSchemaCom("Linha inválida"),
});
export type RemoverLinhaInput = z.infer<typeof removerLinhaSchema>;

/** Terceiro validado no formulário para a entrada da action. */
export function terceiroFormParaEntrada(osId: string, form: TerceiroFormInput): TerceiroInput | null {
  const valor = textoParaNumero(form.valor, CASAS_VALOR_OPERACIONAL);
  if (valor === null) return null;
  return {
    osId,
    fornecedorId: form.fornecedorId,
    descricao: form.descricao.trim(),
    valor,
    notaFiscal: vazioParaNulo(form.notaFiscal),
  };
}

/** Peça validada no formulário para a entrada da action. */
export function pecaFormParaEntrada(osId: string, form: PecaFormInput): PecaInput | null {
  const par = lerChaveSaldo(form.saldo);
  const quantidade = textoParaNumero(form.quantidade, CASAS_TAXA);
  if (!par || quantidade === null) return null;
  return { osId, ...par, quantidade, observacoes: vazioParaNulo(form.observacoes) };
}

/** Óleo validado no formulário para a entrada da action (o tipo vem do item). */
export function oleoFormParaEntrada(
  osId: string,
  tipoOleoId: string,
  form: OleoFormInput,
): OleoInput | null {
  const par = lerChaveSaldo(form.saldo);
  const quantidade = textoParaNumero(form.quantidade, CASAS_TAXA);
  if (!par || quantidade === null) return null;
  return { osId, tipoOleoId, ...par, quantidade, unidade: form.unidade };
}
