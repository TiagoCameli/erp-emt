import { z } from "zod";

import { idSchema, idSchemaCom } from "@/lib/id";
import {
  STATUS_LANCAMENTO,
  type StatusLancamento,
  type TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

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
  /**
   * De qual FORMA esta parcela é. Obrigatório quando o lançamento declara formas,
   * e ausente quando não declara nenhuma (caminho antigo, que o banco continua
   * aceitando). Quem cobra é o superRefine do lançamento, que é quem sabe se há
   * formas.
   */
  formaPagamentoId: idSchemaCom("Forma de pagamento inválida").optional(),
});

export type ParcelaInput = z.infer<typeof parcelaSchema>;

/** Rateio por centro de custo validado no servidor. */
export const rateioSchema = z.object({
  centroCustoId: idSchemaCom("Centro de custo inválido"),
  valor: valorSchema,
});

export type RateioInput = z.infer<typeof rateioSchema>;

/**
 * Uma forma de pagamento do lançamento, com quanto sai por ela.
 *
 * O lançamento pode ser pago por VÁRIAS formas (pedido do Tiago, 20/08/2026), e o
 * modelo é de duas camadas: aqui ficam as formas com o valor de cada uma, e cada
 * parcela diz de qual forma ela é. A soma das formas fecha com o valor do
 * lançamento, e as parcelas de cada forma fecham com o valor daquela forma — as
 * duas somas também são travadas no banco, por constraint trigger.
 */
export const formaPagamentoLancamentoSchema = z.object({
  formaPagamentoId: idSchemaCom("Forma de pagamento inválida"),
  valor: valorSchema.refine((v) => v > 0, {
    error: "O valor da forma precisa ser maior que zero",
  }),
});

export type FormaPagamentoLancamentoInput = z.infer<
  typeof formaPagamentoLancamentoSchema
>;

/**
 * Lançamento validado no servidor. A soma das parcelas precisa bater com o
 * valor e, quando há rateio, a soma do rateio também. A RPC revalida.
 */
export const lancamentoSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Tipo inválido" }),
    fornecedorId: idSchemaCom("Fornecedor inválido").optional(),
    /**
     * Quem está pagando, no a receber: sai do cadastro Cadastros > Clientes.
     * Opcional no schema porque conta a pagar não usa (lá quem paga é a EMT e o
     * outro lado é o fornecedor); a tela exige no a receber.
     */
    clienteId: idSchemaCom("Cliente inválido").optional(),
    /**
     * Conta em que o dinheiro vai entrar, no a receber. Não é a mesma coisa que a
     * conta do a pagar: lá ela é escolhida na revisão e é ela que decide se o
     * lançamento já nasce aprovado ou quitado. Aqui é só o destino esperado, e o
     * banco ignora este campo quando o tipo é a_pagar.
     */
    contaBancariaId: idSchemaCom("Conta bancária inválida").optional(),
    categoriaId: idSchemaCom("Categoria inválida").optional(),
    /**
     * Forma de pagamento: em conta a pagar é ela que decide o caminho (fila de
     * aprovação, direto para Pagamentos ou já quitado no cartão). Opcional no
     * schema porque conta a receber não usa; a tela exige em conta a pagar.
     */
    formaPagamentoId: idSchemaCom("Forma de pagamento inválida").optional(),
    /**
     * Condição de pagamento: opcional, é ela que define as parcelas quando o
     * usuário manda gerar. Lançamento sem condição continua válido (parcela
     * única digitada na mão é o caso mais comum).
     */
    condicaoPagamentoId: idSchemaCom("Condição de pagamento inválida").optional(),
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
    /**
     * Número do documento do fornecedor: nota fiscal, boleto, recibo. Opcional
     * e sem unicidade, mesma regra da OC. Não confundir com o `numero` do
     * lançamento, que é o número interno e quem gera é o banco.
     */
    numeroDocumento: textoOpcional(60),
    /** Texto livre: o combinado, o que a nota não diz. Só no detalhe. */
    observacoes: textoOpcional(2000),
    parcelas: z
      .array(parcelaSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    /**
     * Sempre pelo menos um centro de custo: é a mesma exigência que
     * fn_salvar_lancamento faz no banco. Declarada aqui para o erro sair da
     * action com mensagem nossa em vez de subir o raise do Postgres.
     */
    rateios: z
      .array(rateioSchema)
      .min(1, { error: "Escolha o centro de custo" }),
    /**
     * As formas de pagamento e quanto sai por cada uma. Vazio é válido: é o
     * lançamento que não declara forma, que o banco aceita e roteia como
     * bancário (vai para a fila de aprovação).
     */
    formas: z.array(formaPagamentoLancamentoSchema),
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
      const soma = dados.rateios.reduce((total, r) => total + r.valor, 0);
      return Math.abs(soma - dados.valor) <= TOLERANCIA;
    },
    { error: "A soma do rateio precisa ser igual ao valor", path: ["rateios"] },
  )
  /**
   * As formas de pagamento, quando existem: as mesmas três regras que
   * fn_salvar_lancamento cobra no banco, repetidas aqui para o erro sair da
   * Server Action com mensagem nossa em vez de subir o raise do Postgres.
   *
   * Recebimento não tem forma: a forma diz como a EMT PAGA, e num recebível quem
   * paga é o cliente. O que o recebimento tem é conta de destino.
   */
  .superRefine((dados, ctx) => {
    if (dados.tipo === "a_receber" && dados.formas.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Recebimento não tem forma de pagamento",
        path: ["formas"],
      });
      return;
    }
    if (dados.formas.length === 0) return;

    const soma = dados.formas.reduce((total, f) => total + f.valor, 0);
    if (Math.abs(soma - dados.valor) > TOLERANCIA) {
      ctx.addIssue({
        code: "custom",
        message: "A soma das formas de pagamento precisa ser igual ao valor",
        path: ["formas"],
      });
    }

    const ids = dados.formas.map((f) => f.formaPagamentoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "A mesma forma aparece duas vezes: some os valores numa linha só",
        path: ["formas"],
      });
    }

    // Toda parcela tem de dizer de qual forma ela é, e as parcelas de cada forma
    // fecham com o valor dela. Sem a segunda, "R$ 6.000 no boleto" poderia ter
    // R$ 4.000 de parcelas sem se contradizer em lugar nenhum.
    const conhecidas = new Set(ids);
    dados.parcelas.forEach((parcela, indice) => {
      if (
        !parcela.formaPagamentoId ||
        !conhecidas.has(parcela.formaPagamentoId)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Diga por qual forma de pagamento esta parcela sai",
          path: ["parcelas", indice, "formaPagamentoId"],
        });
      }
    });

    for (const forma of dados.formas) {
      const somaDaForma = dados.parcelas
        .filter((p) => p.formaPagamentoId === forma.formaPagamentoId)
        .reduce((total, p) => total + p.valor, 0);
      if (Math.abs(somaDaForma - forma.valor) > TOLERANCIA) {
        ctx.addIssue({
          code: "custom",
          message:
            "As parcelas de cada forma precisam fechar com o valor da forma",
          path: ["formas"],
        });
        break;
      }
    }
  })
  /**
   * O que só o a receber exige. Mesma regra que fn_salvar_lancamento aplica no
   * banco, repetida aqui para o erro chegar no campo em vez de vir como toast
   * cru vindo do Postgres.
   */
  .superRefine((dados, ctx) => {
    if (dados.tipo !== "a_receber") return;
    if (!dados.numeroDocumento) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o número do documento",
        path: ["numeroDocumento"],
      });
    }
    if (!dados.contaBancariaId) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha a conta em que o dinheiro vai entrar",
        path: ["contaBancariaId"],
      });
    }
    if (!dados.clienteId) {
      ctx.addIssue({
        code: "custom",
        message: "Informe quem está pagando",
        path: ["clienteId"],
      });
    }
  });

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
  /** Vazio = nenhuma forma escolhida, igual ao Combobox sem seleção. */
  formaPagamentoId: z.string().trim(),
});

export type ParcelaFormInput = z.infer<typeof parcelaFormSchema>;

/**
 * Uma forma de pagamento no formulário. Valor como string, igual às parcelas e
 * ao rateio, para casar input e output do react-hook-form.
 *
 * O valor pode chegar vazio de propósito: com UMA forma a coluna de valor não
 * aparece na tela (ela vale o total do lançamento), mesmo tratamento da parcela
 * única e do centro de custo único. A exigência volta a partir de duas, e mora no
 * superRefine, que é quem sabe quantas linhas existem.
 */
export const formaFormSchema = z.object({
  formaPagamentoId: idSchemaCom("Selecione a forma de pagamento"),
  valor: z.string().trim(),
});

export type FormaFormInput = z.infer<typeof formaFormSchema>;

/**
 * Rateio no formulário. Centro de custo + valor como string.
 *
 * O valor pode chegar vazio aqui de propósito, mesma razão de `parcelaFormSchema`:
 * com UM centro de custo a coluna de valor não aparece na tela e o rateio vale o
 * total do lançamento. A exigência de valor volta a partir de dois, e mora no
 * superRefine do formulário, que é quem sabe quantas linhas existem e consegue
 * apontar o erro na linha certa.
 */
export const rateioFormSchema = z.object({
  centroCustoId: idSchemaCom("Selecione o centro de custo"),
  valor: z.string().trim(),
});

export type RateioFormInput = z.infer<typeof rateioFormSchema>;

/**
 * Formulário do lançamento (client). As somas são validadas aqui via refine,
 * com a tolerância de centavos, antes de chamar a action.
 */
export const lancamentoFormSchema = z
  .object({
    tipo: z.enum(["a_pagar", "a_receber"], { error: "Selecione o tipo" }),
    fornecedorId: idSchema.optional(),
    /** Vazio = ninguém escolhido, igual ao Combobox sem seleção. */
    clienteId: z.union([z.literal(""), idSchema]).optional(),
    contaBancariaId: z.union([z.literal(""), idSchema]).optional(),
    categoriaId: idSchema.optional(),
    formaPagamentoId: z.union([z.literal(""), idSchema]).optional(),
    /** Vazio = sem condição, igual ao Combobox quando nada foi escolhido. */
    condicaoPagamentoId: z.union([z.literal(""), idSchema]).optional(),
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
    /** Número do documento do fornecedor. Vazio no form = null no banco. */
    numeroDocumento: z
      .string()
      .trim()
      .max(60, { error: "Máximo de 60 caracteres" }),
    observacoes: z
      .string()
      .trim()
      .max(2000, { error: "Máximo de 2000 caracteres" }),
    parcelas: z
      .array(parcelaFormSchema)
      .min(1, { error: "Adicione ao menos uma parcela" }),
    rateios: z.array(rateioFormSchema),
    /**
     * As formas de pagamento. No a pagar a tela nasce com UMA (que é o caso
     * esmagadoramente mais comum) e o botão "Dividir entre formas" acrescenta as
     * outras. No a receber fica vazio: recebimento não tem forma.
     */
    formas: z.array(formaFormSchema),
  })
  /**
   * Parcelas: só há o que conferir a partir de DUAS.
   *
   * Com uma parcela, a tabela nem aparece no formulário e a parcela é montada no
   * envio a partir do cabeçalho (valor total e campo Vencimento), então a soma
   * fecha por construção e a linha escondida não precisa de valor. Exigir valor
   * nela travaria o formulário num campo que ninguém vê.
   */
  /**
   * As formas de pagamento no formulário.
   *
   * Com UMA forma nada é cobrado: ela vale o total, a coluna de valor não está na
   * tela e a soma fecha por construção — mesmo tratamento da parcela única e do
   * centro de custo único. A partir de DUAS, três coisas passam a valer: cada
   * linha precisa de valor, a soma delas fecha com o total, e as parcelas de cada
   * forma fecham com o valor daquela forma.
   */
  .superRefine((dados, ctx) => {
    if (dados.formas.length === 0) return;

    const valor = paraNumero(dados.valor);

    if (dados.formas.length < 2) {
      // Com uma forma só, a única exigência é a parcela apontar para ela — e a
      // tela faz isso sozinha. Nada a cobrar aqui.
      return;
    }

    dados.formas.forEach((forma, indice) => {
      if (!valorStringValido(forma.valor)) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um valor válido",
          path: ["formas", indice, "valor"],
        });
      }
    });

    const ids = dados.formas.map((f) => f.formaPagamentoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "A mesma forma aparece duas vezes: some os valores numa linha só",
        path: ["formas"],
      });
    }

    if (!Number.isNaN(valor)) {
      const soma = dados.formas.reduce(
        (total, f) =>
          total + (Number.isNaN(paraNumero(f.valor)) ? 0 : paraNumero(f.valor)),
        0,
      );
      if (Math.abs(soma - valor) > TOLERANCIA) {
        ctx.addIssue({
          code: "custom",
          message: "A soma das formas precisa ser igual ao valor do lançamento",
          path: ["formas"],
        });
      }
    }

    // Cada parcela aponta uma forma, e as parcelas de cada forma fecham com ela.
    const conhecidas = new Set(ids);
    dados.parcelas.forEach((parcela, indice) => {
      if (!conhecidas.has(parcela.formaPagamentoId)) {
        ctx.addIssue({
          code: "custom",
          message: "Escolha a forma desta parcela",
          path: ["parcelas", indice, "formaPagamentoId"],
        });
      }
    });

    for (const [indice, forma] of dados.formas.entries()) {
      const somaDaForma = dados.parcelas
        .filter((p) => p.formaPagamentoId === forma.formaPagamentoId)
        .reduce(
          (total, p) =>
            total + (Number.isNaN(paraNumero(p.valor)) ? 0 : paraNumero(p.valor)),
          0,
        );
      const alvo = Number.isNaN(paraNumero(forma.valor))
        ? 0
        : paraNumero(forma.valor);
      if (Math.abs(somaDaForma - alvo) > TOLERANCIA) {
        ctx.addIssue({
          code: "custom",
          message: "As parcelas desta forma não fecham com o valor dela",
          path: ["formas", indice, "valor"],
        });
      }
    }
  })
  /**
   * O que só o a receber exige, no formulário: pagador, conta de destino e
   * número do documento. Fica num superRefine (e não como campo obrigatório no
   * objeto) porque a mesma tela serve os dois tipos, e um `min(1)` fixo travaria
   * o lançamento a pagar em três campos que ele não tem.
   */
  .superRefine((dados, ctx) => {
    if (dados.tipo !== "a_receber") return;
    if (!dados.clienteId) {
      ctx.addIssue({
        code: "custom",
        message: "Informe quem está pagando",
        path: ["clienteId"],
      });
    }
    if (!dados.contaBancariaId) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha a conta em que o dinheiro vai entrar",
        path: ["contaBancariaId"],
      });
    }
    if (dados.numeroDocumento.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "Informe o número do documento",
        path: ["numeroDocumento"],
      });
    }
  })
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
  /**
   * Centro de custo: sempre pelo menos UM, e a partir de dois a soma tem de
   * fechar.
   *
   * Obrigatório porque o banco já obriga: `fn_salvar_lancamento` recusa lista
   * vazia com "Escolha o centro de custo: nenhum custo existe sem centro de
   * custo". O formulário dizia "Opcional" e deixava enviar, então quem lançava
   * sem centro levava o erro cru do Postgres num toast, sem campo apontado.
   *
   * Com UM centro a coluna de valor não aparece na tela (ele vale o total do
   * lançamento) e a soma fecha por construção, igual à parcela única.
   */
  .superRefine((dados, ctx) => {
    if (dados.rateios.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha o centro de custo",
        path: ["rateios"],
      });
      return;
    }
    if (dados.rateios.length < 2) return;

    dados.rateios.forEach((rateio, indice) => {
      if (!valorStringValido(rateio.valor)) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um valor válido",
          path: ["rateios", indice, "valor"],
        });
      }
    });

    const valor = paraNumero(dados.valor);
    if (Number.isNaN(valor)) return;
    const soma = dados.rateios.reduce(
      (total, r) =>
        total + (Number.isNaN(paraNumero(r.valor)) ? 0 : paraNumero(r.valor)),
      0,
    );
    if (Math.abs(soma - valor) > TOLERANCIA) {
      ctx.addIssue({
        code: "custom",
        message: "A soma do rateio precisa ser igual ao valor",
        path: ["rateios"],
      });
    }
  });

export type LancamentoFormInput = z.infer<typeof lancamentoFormSchema>;

export { TOLERANCIA as TOLERANCIA_SOMA };

// ---------------------------------------------------------------------------
// Valores de filtro da listagem (aqui, e não em queries.ts, porque a tabela é
// Client Component e não pode importar de um arquivo "server-only")
// ---------------------------------------------------------------------------

/**
 * Origens possíveis de um lançamento. Espelha o check do banco
 * (lancamentos_origem_check). Cotação não gera lançamento direto, ela vira
 * ordem de compra primeiro.
 *
 * As três últimas são do RH e só nascem por função definer: 'folha' é o líquido
 * de um colaborador, 'folha_guia' é a guia de um grupo de recolhimento (INSS,
 * FGTS, IRRF) e 'adiantamento' é o adiantamento pago no mês. Nenhuma delas se
 * exclui pelo Financeiro (a fn_excluir_lancamento recusa), então aparecem aqui
 * só como filtro e rótulo de leitura.
 */
export const ORIGENS_LANCAMENTO = [
  "oc",
  "manual",
  "diaria",
  "folha",
  "folha_guia",
  "adiantamento",
] as const;

export type OrigemLancamento = (typeof ORIGENS_LANCAMENTO)[number];

export const ROTULO_ORIGEM_LANCAMENTO: Record<OrigemLancamento, string> = {
  oc: "Ordem de compra",
  manual: "Manual",
  diaria: "Diária",
  folha: "Folha de pagamento",
  folha_guia: "Guia da folha",
  adiantamento: "Adiantamento",
};

/**
 * Rótulo pt-BR da origem de um lançamento, com fallback pro valor cru: o
 * campo `origem` chega das telas como `string` solto (não o union), então
 * qualquer valor fora do catálogo (não deveria acontecer, dado o check do
 * banco) ainda mostra algo em vez de quebrar.
 */
export function rotuloOrigemLancamento(origem: string): string {
  return origem in ROTULO_ORIGEM_LANCAMENTO
    ? ROTULO_ORIGEM_LANCAMENTO[origem as OrigemLancamento]
    : origem;
}

/**
 * Rótulo do status de um lançamento COM o tipo, que é o que a tela mostra.
 *
 * Todo lançamento nasce com status 'a_pagar' (em aberto), inclusive recebível;
 * para uma conta a receber o rótulo correto é "A receber", não "A pagar". A
 * regra vive aqui, e não dentro da célula da tabela, porque a exportação para
 * Excel precisa dizer a mesma coisa que a lista: rótulo divergente entre tela e
 * planilha é um relatório que contradiz o sistema.
 */
export function rotuloStatusLancamento(
  status: StatusLancamento,
  tipo: TipoLancamento,
): string {
  if (tipo === "a_receber") {
    if (status === "a_pagar") return "A receber";
    // Recebível quitado é RECEBIDO, não "pago": quem paga é o cliente, e a aba
    // Recebimentos usa esta mesma função para rotular a linha.
    if (status === "pago") return "Recebido";
  }
  return STATUS_LANCAMENTO[status].rotulo;
}

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

/**
 * Situação de atraso do lançamento, derivada das PARCELAS em aberto.
 *
 * Não confundir com o filtro de "Período de vencimento" (venc_de/venc_ate), que
 * olha a coluna `data_vencimento` do cabeçalho do lançamento. Este aqui responde
 * "está atrasado?" pelas parcelas, que é onde o pagamento acontece e é a mesma
 * regra do cartão "Vencido" do cabeçalho: um lançamento de três parcelas com uma
 * atrasada está vencido, mesmo que o vencimento do cabeçalho ainda esteja longe.
 *
 * `a_vencer` é o complemento útil: tem saldo em aberto e nada estourou ainda.
 * Quitado não entra em nenhum dos dois (para isso existe o filtro de status).
 */
export const FILTROS_ATRASO = ["vencido", "a_vencer"] as const;

export type FiltroAtraso = (typeof FILTROS_ATRASO)[number];

export const ROTULO_FILTRO_ATRASO: Record<FiltroAtraso, string> = {
  vencido: "Com parcela vencida",
  a_vencer: "Em aberto, sem atraso",
};

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
