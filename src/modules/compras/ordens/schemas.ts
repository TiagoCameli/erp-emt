import { z } from "zod";

import { dataHojeISO } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";

/** R$ 1.234,56 para as mensagens de erro do formulário. */
function formatarDiferenca(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Status de ordem de compra, igual ao check do banco. O app só transita
 * rascunho > pendente_aprovacao > aprovado/rejeitado e cancelado. `pago`
 * é cascata automática (banco) quando o lançamento da OC quita todas as
 * parcelas (Bug #5 QA) — não é uma transição que a UI dispara.
 */
export const STATUS_OC = [
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
  "rejeitado",
  "cancelado",
  "recebido",
  "pago",
] as const;

export type StatusOcSchema = (typeof STATUS_OC)[number];

/**
 * Quantas casas decimais um número tem, contando pela representação decimal
 * (sem notação científica: os valores desta tela nunca chegam nessa faixa).
 */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Quantidade NUMERIC(14,3): positiva, no máximo 3 casas. A trava de casas é
 * necessária porque o banco arredonda silenciosamente ao gravar na coluna
 * (14,3): sem ela, uma entrada como 1.2345 seria aceita aqui e gravada como
 * 1.235, divergindo do valor que o usuário digitou.
 */
const quantidadeSchema = z
  .number({ error: "Quantidade inválida" })
  .positive({ error: "A quantidade precisa ser maior que zero" })
  .max(99999999999.999, { error: "Quantidade acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= 3, {
    error: "A quantidade aceita no máximo 3 casas decimais",
  });

/**
 * Preço unitário NUMERIC(14,2): não negativo, no máximo 2 casas. Mesma razão
 * da trava acima: a coluna (14,2) arredonda sem avisar.
 */
const precoSchema = z
  .number({ error: "Preço inválido" })
  .min(0, { error: "O preço não pode ser negativo" })
  .max(999999999999.99, { error: "Preço acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= 2, {
    error: "O preço aceita no máximo 2 casas decimais",
  });

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

/** Item da OC validado no servidor: tipos já coeridos. */
export const ocItemSchema = z.object({
  insumoId: z.uuid({ error: "Insumo inválido" }),
  quantidade: quantidadeSchema,
  precoUnitario: precoSchema,
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
});

export type OcItemInput = z.infer<typeof ocItemSchema>;

/** Data yyyy-mm-dd. */
const dataSchema = (rotulo: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: rotulo });

/**
 * Mês de referência no servidor: DATE normalizado no dia 1 (yyyy-MM-01), igual
 * ao que o banco guarda e checa. Mesmo padrão da competência da folha (RH).
 */
const mesSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-01$/, { error: "Informe o mês de referência" });

/**
 * Parcela da OC validada no servidor. Valor NUMERIC(14,2) positivo, como a
 * coluna e o check da tabela oc_parcelas. A numeração não vem daqui: quem
 * numera é fn_salvar_parcelas_oc, pela ordem de vencimento.
 */
export const ocParcelaSchema = z.object({
  dataVencimento: dataSchema("Informe a data de vencimento da parcela"),
  valor: z
    .number({ error: "Valor da parcela inválido" })
    .positive({ error: "O valor da parcela precisa ser maior que zero" })
    .max(999999999999.99, { error: "Valor de parcela acima do permitido" })
    .refine((valor) => casasDecimais(valor) <= 2, {
      error: "O valor da parcela aceita no máximo 2 casas decimais",
    }),
});

export type OcParcelaInput = z.infer<typeof ocParcelaSchema>;

/** Centavos inteiros: comparar dinheiro somado em float mente. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Schema da OC validado no servidor (criar e editar). */
export const ordemCompraSchema = z
  .object({
    fornecedorId: z.uuid({ error: "Fornecedor inválido" }),
    condicaoPagamentoId: z.uuid({ error: "Escolha a condição de pagamento" }),
    cotacaoId: z.uuid({ error: "Cotação inválida" }).optional(),
    /**
     * Obrigatória: o tipo da forma é o que decide se o pagamento passa pela
     * fila de aprovação, nasce aprovado (dinheiro) ou nasce quitado (cartão).
     */
    formaPagamentoId: z.uuid({ error: "Escolha a forma de pagamento" }),
    /** O fato: quando a compra aconteceu. A data de criação é do sistema. */
    dataCompra: dataSchema("Data da compra inválida"),
    /** Mês em que a obra usou o material: define em que mês o custo entra. */
    mesCompetencia: mesSchema,
    observacoes: textoOpcional(2000),
    itens: z
      .array(ocItemSchema)
      .min(1, { error: "Adicione ao menos um item à ordem de compra" }),
    /** Opcional: OC sem parcelas gera lançamento sem parcela definida. */
    parcelas: z.array(ocParcelaSchema).default([]),
  })
  .superRefine((ordem, ctx) => {
    if (ordem.parcelas.length === 0) return;

    const total = ordem.itens.reduce(
      (soma, item) => soma + emCentavos(item.quantidade * item.precoUnitario),
      0,
    );
    const somaParcelas = ordem.parcelas.reduce(
      (soma, parcela) => soma + emCentavos(parcela.valor),
      0,
    );

    if (somaParcelas !== total) {
      ctx.addIssue({
        code: "custom",
        message: "A soma das parcelas precisa fechar com o total da ordem",
        path: ["parcelas"],
      });
    }

    ordem.parcelas.forEach((parcela, i) => {
      if (parcela.dataVencimento < ordem.dataCompra) {
        ctx.addIssue({
          code: "custom",
          message: "A parcela não pode vencer antes da emissão da ordem",
          path: ["parcelas", i, "dataVencimento"],
        });
      }
    });
  });

export type OrdemCompraInput = z.infer<typeof ordemCompraSchema>;

/**
 * Casas decimais de um número digitado no form (string, vírgula ou ponto
 * como separador). Contado sobre o texto, não sobre o número convertido:
 * evita qualquer artefato de arredondamento de ponto flutuante na contagem.
 */
function casasDecimaisTexto(valor: string): number {
  const normalizado = valor.replace(",", ".");
  const ponto = normalizado.indexOf(".");
  return ponto === -1 ? 0 : normalizado.length - ponto - 1;
}

/**
 * Insumo-linha no formulário (client), dentro de um grupo de centro de custo.
 * Quantidade e preço continuam como string para casar input/output do
 * react-hook-form; a coerção real acontece no submit antes de chamar a action.
 * As travas de casas decimais espelham quantidadeSchema/precoSchema do
 * servidor (mesma razão: o banco arredonda silenciosamente ao gravar), só
 * que aqui já na tela, antes de bater no servidor.
 */
export const ocInsumoFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  quantidade: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero > 0;
      },
      { error: "Informe uma quantidade maior que zero" },
    )
    .refine((valor) => casasDecimaisTexto(valor) <= 3, {
      error: "A quantidade aceita no máximo 3 casas decimais",
    }),
  precoUnitario: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero >= 0;
      },
      { error: "Informe um preço válido" },
    )
    .refine((valor) => casasDecimaisTexto(valor) <= 2, {
      error: "O preço aceita no máximo 2 casas decimais",
    }),
});

export type OcInsumoFormInput = z.infer<typeof ocInsumoFormSchema>;

/**
 * Grupo de centro de custo com seus insumos (client). A hierarquia da tela é
 * centro de custo > insumos. Um insumo não repete dentro do mesmo grupo.
 */
export const ocGrupoCentroCustoFormSchema = z
  .object({
    centroCustoId: z.uuid({ error: "Selecione o centro de custo" }),
    insumos: z
      .array(ocInsumoFormSchema)
      .min(1, { error: "Adicione ao menos um insumo neste centro de custo" }),
  })
  .superRefine((grupo, ctx) => {
    const vistos = new Set<string>();
    grupo.insumos.forEach((insumo, i) => {
      if (!insumo.insumoId) return;
      if (vistos.has(insumo.insumoId)) {
        ctx.addIssue({
          code: "custom",
          message: "Insumo repetido neste centro de custo",
          path: ["insumos", i, "insumoId"],
        });
      }
      vistos.add(insumo.insumoId);
    });
  });

export type OcGrupoCentroCustoFormInput = z.infer<
  typeof ocGrupoCentroCustoFormSchema
>;

/**
 * Schema do formulário da OC (client). Os itens são agrupados por centro de
 * custo; cada centro aparece uma única vez. No submit os grupos são achatados
 * na lista plana de itens que a action espera (ver ordemCompraSchema).
 */
export const ordemCompraFormSchema = z
  .object({
    fornecedorId: z.uuid({ error: "Selecione o fornecedor" }),
    condicaoPagamentoId: z.uuid({ error: "Escolha a condição de pagamento" }),
    cotacaoId: z.uuid().optional(),
    formaPagamentoId: z.uuid({ error: "Escolha a forma de pagamento" }),
    dataCompra: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data da compra" })
      .refine((valor) => valor <= dataHojeISO(), {
        error: "A data da compra não pode ser no futuro",
      }),
    /** Mês do input type="month" (yyyy-MM). Vira yyyy-MM-01 no servidor. */
    mesCompetencia: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, { error: "Informe o mês de referência" }),
    observacoes: z
      .string()
      .trim()
      .max(2000, { error: "Máximo de 2000 caracteres" }),
    centrosCusto: z
      .array(ocGrupoCentroCustoFormSchema)
      .min(1, { error: "Adicione ao menos um centro de custo" })
      .superRefine((grupos, ctx) => {
        const vistos = new Set<string>();
        grupos.forEach((grupo, i) => {
          if (!grupo.centroCustoId) return;
          if (vistos.has(grupo.centroCustoId)) {
            ctx.addIssue({
              code: "custom",
              message: "Centro de custo repetido",
              path: [i, "centroCustoId"],
            });
          }
          vistos.add(grupo.centroCustoId);
        });
      }),
    /**
     * Parcelas (client): opcional. Lista vazia significa "definir depois no
     * lançamento". Com parcelas preenchidas, a soma precisa fechar com o total
     * dos itens — a checagem está no superRefine do formulário inteiro, porque
     * ela depende dos itens.
     */
    parcelas: z.array(
      z.object({
        dataVencimento: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe o vencimento" }),
        valor: z
          .string()
          .trim()
          .refine(
            (valor) => {
              const numero = Number(valor.replace(",", "."));
              return valor !== "" && !Number.isNaN(numero) && numero > 0;
            },
            { error: "Informe um valor maior que zero" },
          )
          .refine((valor) => casasDecimaisTexto(valor) <= 2, {
            error: "O valor aceita no máximo 2 casas decimais",
          }),
      }),
    ),
  })
  .superRefine((form, ctx) => {
    if (form.parcelas.length === 0) return;

    // Total dos itens e soma das parcelas em centavos inteiros: comparar
    // dinheiro somado em float acusaria diferença que não existe.
    const emCentavosTexto = (texto: string) =>
      Math.round(paraNumero(texto ?? "") * 100);

    const total = form.centrosCusto.reduce(
      (soma, grupo) =>
        soma +
        grupo.insumos.reduce(
          (subtotal, insumo) =>
            subtotal +
            Math.round(
              paraNumero(insumo.quantidade ?? "") *
                paraNumero(insumo.precoUnitario ?? "") *
                100,
            ),
          0,
        ),
      0,
    );
    const somaParcelas = form.parcelas.reduce(
      (soma, parcela) => soma + emCentavosTexto(parcela.valor),
      0,
    );

    if (somaParcelas !== total) {
      const diferenca = (total - somaParcelas) / 100;
      ctx.addIssue({
        code: "custom",
        message:
          diferenca > 0
            ? `Faltam ${formatarDiferenca(diferenca)} para as parcelas fecharem com o total`
            : `As parcelas passam ${formatarDiferenca(-diferenca)} do total`,
        path: ["parcelas"],
      });
    }

    form.parcelas.forEach((parcela, i) => {
      if (
        parcela.dataVencimento !== "" &&
        form.dataCompra !== "" &&
        parcela.dataVencimento < form.dataCompra
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Não pode vencer antes da data da compra",
          path: ["parcelas", i, "dataVencimento"],
        });
      }
    });
  });

export type OrdemCompraFormInput = z.infer<typeof ordemCompraFormSchema>;

// ---------------------------------------------------------------------------
// Recebimento da OC (Task 6): confirma a NF e gera as parcelas do a_pagar
// pela condição de pagamento. Mesmo par de schema server/form do resto do
// módulo (ver ocItemSchema/ocInsumoFormSchema acima).
// ---------------------------------------------------------------------------

/** Nº da NF: texto obrigatório, até 60 caracteres. */
const numeroNfSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o número da nota fiscal" })
  .max(60, { error: "Máximo de 60 caracteres" });

/** Valor da NF NUMERIC(14,2): maior que zero. */
const valorNfSchema = z
  .number({ error: "Valor da nota fiscal inválido" })
  .positive({ error: "O valor da nota fiscal precisa ser maior que zero" })
  .max(999999999999.99, { error: "Valor acima do permitido" });

/** Data do recebimento: yyyy-mm-dd. */
const dataRecebimentoSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data do recebimento" });

/**
 * Recebimento validado no servidor: nº NF, valor e data que a RPC
 * fn_registrar_recebimento usa para confirmar o lançamento previsto e gerar
 * as parcelas do a_pagar pela condição de pagamento da OC.
 */
export const recebimentoSchema = z.object({
  numeroNf: numeroNfSchema,
  valorNf: valorNfSchema,
  dataRecebimento: dataRecebimentoSchema,
});

export type RecebimentoInput = z.infer<typeof recebimentoSchema>;

/** Formulário de recebimento (client): valor como string pra casar com o input. */
export const recebimentoFormSchema = z.object({
  numeroNf: z
    .string()
    .trim()
    .min(1, { error: "Informe o número da nota fiscal" })
    .max(60, { error: "Máximo de 60 caracteres" }),
  valorNf: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero > 0;
      },
      { error: "Informe um valor de nota fiscal maior que zero" },
    ),
  dataRecebimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data do recebimento" }),
});

export type RecebimentoFormInput = z.infer<typeof recebimentoFormSchema>;
