import { z } from "zod";

/**
 * Schemas do lançamento financeiro manual (a pagar / a receber), com parcelas
 * e rateio por centro de custo.
 *
 * Dois pares de schema, igual ao padrão de compras/ordens:
 * - *FormSchema (client): valores monetários como string para casar com os
 *   inputs do react-hook-form. A coerção real acontece no submit.
 * - *Schema (servidor): tipos já coeridos (number), validado na Server Action
 *   antes de chamar a RPC.
 *
 * As somas (parcelas = valor, rateios = valor) são validadas no client via
 * refine para evitar uma ida ao servidor; a RPC do banco revalida por garantia.
 */

/** Centavos de tolerância na comparação de somas (erro de arredondamento). */
const TOLERANCIA = 0.005;

/** Quantas casas decimais o número tem (até 2 é o aceito pela coluna). */
function ateDuasCasas(valor: number): boolean {
  return Number.isInteger(Math.round(valor * 100));
}

/** Valor monetário NUMERIC(14,2): não negativo, no máximo 2 casas decimais. */
const valorSchema = z
  .number({ error: "Valor inválido" })
  .min(0, { error: "O valor não pode ser negativo" })
  .max(999999999999.99, { error: "Valor acima do permitido" })
  .refine(ateDuasCasas, { error: "Use no máximo 2 casas decimais" });

/** Data opcional no formato yyyy-MM-dd; string vazia vira undefined. */
const dataOpcionalSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (valor) =>
      valor === undefined || valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor),
    {
      error: "Data inválida",
    },
  )
  .transform((valor) =>
    valor === undefined || valor === "" ? undefined : valor,
  );

/** Converte string do form ("1.234,56") em número, ou NaN se inválida. */
export function paraNumero(valor: string): number {
  const limpo = valor.trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return Number.NaN;
  return Number(limpo);
}

/**
 * Texto livre opcional, com teto de caracteres. Vazio vira undefined para o
 * banco gravar null em vez de uma observação em branco. Mesma regra que a OC
 * usa nas observações dela, declarada aqui para o Financeiro não depender de
 * Compras.
 */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

// ---------------------------------------------------------------------------
// Schemas de servidor (tipos coeridos, validados na action)
// ---------------------------------------------------------------------------

/**
 * Parcela validada no servidor.
 *
 * Sem número da parcela de propósito: quem numera é o banco. fn_salvar_lancamento
 * renumera por vencimento (parcela 1 é a que vence primeiro, desempate por
 * valor), igual à ordem de compra e ao diálogo "Definir parcelas". A posição da
 * linha no formulário não decide nada, então nem viaja até o banco.
 */
export const parcelaSchema = z.object({
  valor: valorSchema,
  dataVencimento: dataOpcionalSchema,
});

export type ParcelaInput = z.infer<typeof parcelaSchema>;

/** Rateio por centro de custo validado no servidor. */
export const rateioSchema = z.object({
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
  valor: valorSchema,
});

export type RateioInput = z.infer<typeof rateioSchema>;

/**
 * Lançamento validado no servidor. A soma das parcelas precisa bater com o
 * valor e, quando há rateio, a soma do rateio também. A RPC revalida.
 */
export const lancamentoSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Tipo inválido" }),
    fornecedorId: z.uuid({ error: "Fornecedor inválido" }).optional(),
    categoriaId: z.uuid({ error: "Categoria inválida" }).optional(),
    /**
     * Forma de pagamento: em conta a pagar é ela que decide o caminho (fila de
     * aprovação, direto para Pagamentos ou já quitado no cartão). Opcional no
     * schema porque conta a receber não usa; a tela exige em conta a pagar.
     */
    formaPagamentoId: z
      .uuid({ error: "Forma de pagamento inválida" })
      .optional(),
    /**
     * Condição de pagamento: opcional, é ela que define as parcelas quando o
     * usuário manda gerar. Lançamento sem condição continua válido (parcela
     * única digitada na mão é o caso mais comum).
     */
    condicaoPagamentoId: z
      .uuid({ error: "Condição de pagamento inválida" })
      .optional(),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(500, { error: "Máximo de 500 caracteres" }),
    valor: valorSchema.refine((v) => v > 0, {
      error: "O valor precisa ser maior que zero",
    }),
    /** O fato: data da compra (a pagar) ou do documento (a receber). */
    dataCompra: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data da compra" }),
    /** Mês de referência: DATE no dia 1, igual ao que o banco guarda. */
    mesCompetencia: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-01$/, { error: "Informe o mês de referência" }),
    dataVencimento: dataOpcionalSchema,
    /** Texto livre: o combinado, o que a nota não diz. Só no detalhe. */
    observacoes: textoOpcional(2000),
    parcelas: z
      .array(parcelaSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    rateios: z.array(rateioSchema),
  })
  .refine(
    (dados) => {
      const soma = dados.parcelas.reduce((total, p) => total + p.valor, 0);
      return Math.abs(soma - dados.valor) <= TOLERANCIA;
    },
    {
      error: "A soma das parcelas precisa ser igual ao valor",
      path: ["parcelas"],
    },
  )
  .refine(
    (dados) => {
      if (dados.rateios.length === 0) return true;
      const soma = dados.rateios.reduce((total, r) => total + r.valor, 0);
      return Math.abs(soma - dados.valor) <= TOLERANCIA;
    },
    { error: "A soma do rateio precisa ser igual ao valor", path: ["rateios"] },
  );

export type LancamentoInput = z.infer<typeof lancamentoSchema>;

// ---------------------------------------------------------------------------
// Schemas de formulário (client, valores como string)
// ---------------------------------------------------------------------------

/** Refine reaproveitado em valores monetários string (vazio = inválido). */
function valorStringValido(valor: string): boolean {
  const numero = paraNumero(valor);
  return valor.trim() !== "" && !Number.isNaN(numero) && numero >= 0;
}

/**
 * Parcela no formulário. Valor como string; vencimento opcional.
 *
 * O valor pode chegar vazio aqui de propósito: com UMA parcela a tabela não
 * aparece na tela e quem manda são os campos Valor e Vencimento do cabeçalho,
 * então a linha escondida fica sem preencher. Com duas ou mais, a exigência de
 * valor volta, e ela mora no superRefine do formulário, que é quem sabe quantas
 * parcelas existem e consegue apontar o erro na linha certa da tabela.
 */
export const parcelaFormSchema = z.object({
  valor: z.string().trim(),
  dataVencimento: z.string().trim(),
});

export type ParcelaFormInput = z.infer<typeof parcelaFormSchema>;

/** Rateio no formulário. Centro de custo + valor como string. */
export const rateioFormSchema = z.object({
  centroCustoId: z.uuid({ error: "Selecione o centro de custo" }),
  valor: z
    .string()
    .trim()
    .refine(valorStringValido, { error: "Informe um valor válido" }),
});

export type RateioFormInput = z.infer<typeof rateioFormSchema>;

/**
 * Formulário do lançamento (client). As somas são validadas aqui via refine,
 * com a tolerância de centavos, antes de chamar a action.
 */
export const lancamentoFormSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Selecione o tipo" }),
    fornecedorId: z.uuid().optional(),
    categoriaId: z.uuid().optional(),
    formaPagamentoId: z.union([z.literal(""), z.uuid()]).optional(),
    /** Vazio = sem condição, igual ao Combobox quando nada foi escolhido. */
    condicaoPagamentoId: z.union([z.literal(""), z.uuid()]).optional(),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(500, { error: "Máximo de 500 caracteres" }),
    valor: z
      .string()
      .trim()
      .refine((v) => valorStringValido(v) && paraNumero(v) > 0, {
        error: "Informe um valor maior que zero",
      }),
    dataCompra: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data da compra" }),
    /** Mês do input type="month" (yyyy-MM). Vira yyyy-MM-01 no servidor. */
    mesCompetencia: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, { error: "Informe o mês de referência" }),
    dataVencimento: z.string().trim(),
    observacoes: z
      .string()
      .trim()
      .max(2000, { error: "Máximo de 2000 caracteres" }),
    parcelas: z
      .array(parcelaFormSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    rateios: z.array(rateioFormSchema),
  })
  /**
   * Parcelas: só há o que conferir a partir de DUAS.
   *
   * Com uma parcela, a tabela nem aparece no formulário e a parcela é montada no
   * envio a partir do cabeçalho (valor total e campo Vencimento), então a soma
   * fecha por construção e a linha escondida não precisa de valor. Exigir valor
   * nela travaria o formulário num campo que ninguém vê.
   */
  .superRefine((dados, ctx) => {
    if (dados.parcelas.length < 2) return;

    dados.parcelas.forEach((parcela, indice) => {
      if (!valorStringValido(parcela.valor)) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um valor válido",
          path: ["parcelas", indice, "valor"],
        });
      }
    });

    const valor = paraNumero(dados.valor);
    if (Number.isNaN(valor)) return;
    const soma = dados.parcelas.reduce(
      (total, p) =>
        total + (Number.isNaN(paraNumero(p.valor)) ? 0 : paraNumero(p.valor)),
      0,
    );
    if (Math.abs(soma - valor) > TOLERANCIA) {
      ctx.addIssue({
        code: "custom",
        message: "A soma das parcelas precisa ser igual ao valor",
        path: ["parcelas"],
      });
    }
  })
  .refine(
    (dados) => {
      if (dados.rateios.length === 0) return true;
      const valor = paraNumero(dados.valor);
      if (Number.isNaN(valor)) return true;
      const soma = dados.rateios.reduce(
        (total, r) =>
          total + (Number.isNaN(paraNumero(r.valor)) ? 0 : paraNumero(r.valor)),
        0,
      );
      return Math.abs(soma - valor) <= TOLERANCIA;
    },
    { error: "A soma do rateio precisa ser igual ao valor", path: ["rateios"] },
  );

export type LancamentoFormInput = z.infer<typeof lancamentoFormSchema>;

export { TOLERANCIA as TOLERANCIA_SOMA };

// ---------------------------------------------------------------------------
// Valores de filtro da listagem (aqui, e não em queries.ts, porque a tabela é
// Client Component e não pode importar de um arquivo "server-only")
// ---------------------------------------------------------------------------

/**
 * Origens possíveis de um lançamento. Espelha o check do banco
 * (lancamentos_origem_check): só 'oc', 'manual' e 'diaria' existem. Cotação não
 * gera lançamento direto, ela vira ordem de compra primeiro.
 */
export const ORIGENS_LANCAMENTO = ["oc", "manual", "diaria"] as const;

export type OrigemLancamento = (typeof ORIGENS_LANCAMENTO)[number];

export const ROTULO_ORIGEM_LANCAMENTO: Record<OrigemLancamento, string> = {
  oc: "Ordem de compra",
  manual: "Manual",
  diaria: "Diária",
};

/**
 * Estado da revisão de um lançamento a pagar, como filtro próprio. Antes viajava
 * dentro do filtro de status com os pseudo-valores 'em_revisao' e 'sem_conta',
 * o que misturava duas perguntas diferentes ("em que ponto o lançamento está?" e
 * "a conta bancária das parcelas já foi escolhida?") no mesmo seletor.
 *
 * em_revisao é status de parcela (voltou para ajuste); os outros três são
 * derivados da conta bancária das parcelas ainda não pagas, iguais ao que a
 * coluna "Revisão" da lista mostra.
 */
export const FILTROS_REVISAO = [
  "em_revisao",
  "sem_conta",
  "parcial",
  "revisado",
  "nao_revisado",
] as const;

export type FiltroRevisao = (typeof FILTROS_REVISAO)[number];

export const ROTULO_FILTRO_REVISAO: Record<FiltroRevisao, string> = {
  em_revisao: "Com parcela em revisão",
  sem_conta: "Sem conta bancária",
  parcial: "Conta parcial",
  revisado: "Revisado",
  // O complemento de "revisado", que é a pergunta que se faz mais vezes por dia:
  // "o que ainda falta escolher conta?". Sem ele, responder isso exigia olhar
  // "sem conta" e "conta parcial" em duas passadas, e o filtro é de escolha única.
  //
  // Não inclui lançamento sem nenhuma parcela a pagar (já quitado): ele não está
  // revisado, mas também não está esperando nada, e apareceria só para atrapalhar
  // quem está atrás de pendência.
  nao_revisado: "Não revisado",
};
