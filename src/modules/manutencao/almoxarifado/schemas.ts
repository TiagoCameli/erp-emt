import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { paraNumero } from "@/modules/manutencao/almoxarifado/calculo";

/**
 * Schemas do almoxarifado de peças. Dois níveis, como na OC:
 *
 * - `*FormSchema`: o que o react-hook-form guarda. Número é TEXTO cru
 *   ("1234,5678"), porque é assim que `InputQuantidade`/`InputPreco` trabalham.
 *   Sem `.default()` nenhum: entrada e saída do zod têm de ser o mesmo tipo, senão
 *   o RHF passa a exigir campo em linha nova.
 * - `*Schema`: o que a Server Action recebe, com número de verdade. A tela
 *   converte com `*DoForm`, e o servidor valida de novo (nunca confia na tela).
 */

/** Teto de NUMERIC(14,4): 10 dígitos inteiros. */
const TETO_NUMERIC_14_4 = 9999999999.9999;

/** Casas decimais de um número pela sua representação (sem notação científica). */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/** Data yyyy-mm-dd (coluna `date`). */
const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data" });

/** Texto opcional: vazio continua "" aqui; a conversão para null é da action. */
function textoLivre(maximo: number) {
  return z.string().trim().max(maximo, { error: `Máximo de ${maximo} caracteres` });
}

/** Id opcional no formulário: "" é "nenhum". */
function idOpcional(mensagem: string) {
  return z
    .string()
    .trim()
    .refine((valor) => valor === "" || z.guid().safeParse(valor).success, {
      error: mensagem,
    });
}

// ---------------------------------------------------------------------------
// Números: texto no formulário, número na action
// ---------------------------------------------------------------------------

/** Quantidade digitada: maior que zero, até 4 casas. */
function quantidadeTexto(rotulo: string) {
  return z.string().trim().refine(
    (valor) => {
      const numero = paraNumero(valor, CASAS_TAXA);
      return numero !== null && numero > 0 && numero <= TETO_NUMERIC_14_4;
    },
    { error: `Informe ${rotulo} maior que zero, com até ${CASAS_TAXA} casas` },
  );
}

/** Preço digitado: zero ou mais, até 4 casas. */
function precoTexto() {
  return z.string().trim().refine(
    (valor) => {
      const numero = paraNumero(valor, CASAS_TAXA);
      return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
    },
    { error: `Informe o valor unitário, com até ${CASAS_TAXA} casas` },
  );
}

/** Estoque digitado e OPCIONAL: vazio é "sem limite"; senão zero ou mais. */
function estoqueTexto(rotulo: string) {
  return z.string().trim().refine(
    (valor) => {
      if (valor === "") return true;
      const numero = paraNumero(valor, CASAS_TAXA);
      return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
    },
    { error: `O ${rotulo} precisa ser um número, com até ${CASAS_TAXA} casas` },
  );
}

const quantidadeNumero = z
  .number({ error: "Quantidade inválida" })
  .positive({ error: "A quantidade precisa ser maior que zero" })
  .max(TETO_NUMERIC_14_4, { error: "Quantidade acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `A quantidade aceita no máximo ${CASAS_TAXA} casas decimais`,
  });

const precoNumero = z
  .number({ error: "Valor unitário inválido" })
  .min(0, { error: "O valor unitário não pode ser negativo" })
  .max(TETO_NUMERIC_14_4, { error: "Valor unitário acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `O valor unitário aceita no máximo ${CASAS_TAXA} casas decimais`,
  });

const estoqueNumero = z
  .number({ error: "Estoque inválido" })
  .min(0, { error: "O estoque não pode ser negativo" })
  .max(TETO_NUMERIC_14_4, { error: "Estoque acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `O estoque aceita no máximo ${CASAS_TAXA} casas decimais`,
  })
  .nullable();

/** Texto já validado pelo form em número (o refine garante que não é null). */
function numeroDoTexto(texto: string): number {
  return paraNumero(texto, CASAS_TAXA) ?? Number.NaN;
}

/** Texto opcional do form em número ou null. */
function numeroOuNulo(texto: string): number | null {
  if (texto.trim() === "") return null;
  return numeroDoTexto(texto);
}

// ---------------------------------------------------------------------------
// Depósito
// ---------------------------------------------------------------------------

export const depositoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  endereco: textoLivre(300),
  ativo: z.boolean(),
});

export type DepositoInput = z.infer<typeof depositoSchema>;

// ---------------------------------------------------------------------------
// Peça do almoxarifado (almoxarifado_itens)
// ---------------------------------------------------------------------------

export const pecaFormSchema = z
  .object({
    insumoId: idSchemaCom("Selecione o insumo"),
    tipoOleoId: idOpcional("Tipo de óleo inválido"),
    estoqueMinimo: estoqueTexto("estoque mínimo"),
    estoqueMaximo: estoqueTexto("estoque máximo"),
    equipamentoIds: z.array(z.guid({ error: "Equipamento inválido" })),
    observacoes: textoLivre(1000),
    ativo: z.boolean(),
  })
  .superRefine((dados, contexto) => {
    const minimo = paraNumero(dados.estoqueMinimo, CASAS_TAXA);
    const maximo = paraNumero(dados.estoqueMaximo, CASAS_TAXA);
    if (minimo !== null && maximo !== null && maximo < minimo) {
      contexto.addIssue({
        code: "custom",
        path: ["estoqueMaximo"],
        message: "O estoque máximo não pode ser menor que o mínimo",
      });
    }
  });

export type PecaFormInput = z.infer<typeof pecaFormSchema>;

export const pecaSchema = z
  .object({
    insumoId: idSchemaCom("Selecione o insumo"),
    tipoOleoId: z.guid({ error: "Tipo de óleo inválido" }).nullable(),
    estoqueMinimo: estoqueNumero,
    estoqueMaximo: estoqueNumero,
    equipamentoIds: z.array(z.guid({ error: "Equipamento inválido" })).max(500, {
      error: "Equipamentos demais numa peça só",
    }),
    observacoes: z.string().trim().max(1000).nullable(),
    ativo: z.boolean(),
  })
  .refine(
    (dados) =>
      dados.estoqueMinimo === null ||
      dados.estoqueMaximo === null ||
      dados.estoqueMaximo >= dados.estoqueMinimo,
    { error: "O estoque máximo não pode ser menor que o mínimo", path: ["estoqueMaximo"] },
  );

export type PecaInput = z.infer<typeof pecaSchema>;

/** Formulário validado para o contrato da action. */
export function pecaDoForm(form: PecaFormInput): PecaInput {
  const observacoes = form.observacoes.trim();
  return {
    insumoId: form.insumoId,
    tipoOleoId: form.tipoOleoId === "" ? null : form.tipoOleoId,
    estoqueMinimo: numeroOuNulo(form.estoqueMinimo),
    estoqueMaximo: numeroOuNulo(form.estoqueMaximo),
    // Sem repetição: marcar o mesmo equipamento duas vezes não é informação.
    equipamentoIds: [...new Set(form.equipamentoIds)],
    observacoes: observacoes === "" ? null : observacoes,
    ativo: form.ativo,
  };
}

// ---------------------------------------------------------------------------
// Entrada por NF (N linhas numa chamada só)
// ---------------------------------------------------------------------------

export const itemEntradaFormSchema = z.object({
  insumoId: idSchemaCom("Selecione o insumo"),
  quantidade: quantidadeTexto("a quantidade"),
  valorUnitario: precoTexto(),
});

export type ItemEntradaFormInput = z.infer<typeof itemEntradaFormSchema>;

export const entradaFormSchema = z.object({
  depositoId: idSchemaCom("Selecione o depósito"),
  fornecedorId: idSchemaCom("Selecione o fornecedor"),
  notaFiscal: textoLivre(60),
  data: dataSchema,
  observacoes: textoLivre(1000),
  itens: z.array(itemEntradaFormSchema).min(1, { error: "Informe ao menos um item" }),
});

export type EntradaFormInput = z.infer<typeof entradaFormSchema>;

export const entradaSchema = z.object({
  depositoId: idSchemaCom("Selecione o depósito"),
  fornecedorId: idSchemaCom("Selecione o fornecedor"),
  notaFiscal: z.string().trim().max(60),
  data: dataSchema,
  observacoes: z.string().trim().max(1000),
  itens: z
    .array(
      z.object({
        insumoId: idSchemaCom("Selecione o insumo"),
        quantidade: quantidadeNumero,
        valorUnitario: precoNumero,
      }),
    )
    .min(1, { error: "Informe ao menos um item" })
    .max(200, { error: "Itens demais numa entrada só" }),
});

export type EntradaInput = z.infer<typeof entradaSchema>;

/** Formulário validado para o contrato da action. */
export function entradaDoForm(form: EntradaFormInput): EntradaInput {
  return {
    depositoId: form.depositoId,
    fornecedorId: form.fornecedorId,
    notaFiscal: form.notaFiscal.trim(),
    data: form.data,
    observacoes: form.observacoes.trim(),
    itens: form.itens.map((item) => ({
      insumoId: item.insumoId,
      quantidade: numeroDoTexto(item.quantidade),
      valorUnitario: numeroDoTexto(item.valorUnitario),
    })),
  };
}

/**
 * Corpo `p_itens` da `fn_almox_registrar_entrada`, nos nomes que a função lê
 * (`insumo_id`, `quantidade`, `valor_unitario`).
 */
export function itensParaRpc(itens: EntradaInput["itens"]) {
  return itens.map((item) => ({
    insumo_id: item.insumoId,
    quantidade: item.quantidade,
    valor_unitario: item.valorUnitario,
  }));
}

// ---------------------------------------------------------------------------
// Edição de uma linha de entrada (fn_almox_editar_entrada)
// ---------------------------------------------------------------------------

/** O que a RPC deixa mudar: depósito e insumo ficam (mudariam outro saldo). */
export const edicaoEntradaFormSchema = z.object({
  fornecedorId: idSchemaCom("Selecione o fornecedor"),
  notaFiscal: textoLivre(60),
  data: dataSchema,
  quantidade: quantidadeTexto("a quantidade"),
  valorUnitario: precoTexto(),
});

export type EdicaoEntradaFormInput = z.infer<typeof edicaoEntradaFormSchema>;

export const edicaoEntradaSchema = z.object({
  fornecedorId: idSchemaCom("Selecione o fornecedor"),
  notaFiscal: z.string().trim().max(60),
  data: dataSchema,
  quantidade: quantidadeNumero,
  valorUnitario: precoNumero,
});

export type EdicaoEntradaInput = z.infer<typeof edicaoEntradaSchema>;

export function edicaoEntradaDoForm(form: EdicaoEntradaFormInput): EdicaoEntradaInput {
  return {
    fornecedorId: form.fornecedorId,
    notaFiscal: form.notaFiscal.trim(),
    data: form.data,
    quantidade: numeroDoTexto(form.quantidade),
    valorUnitario: numeroDoTexto(form.valorUnitario),
  };
}
