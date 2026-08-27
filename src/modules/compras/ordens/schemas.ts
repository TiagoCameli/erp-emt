import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema, idSchemaCom } from "@/lib/id";
import {
  paraNumero,
  totalEmCentavos,
  type AjustesDaOrdem,
} from "@/modules/compras/ordens/calculo";

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
 * Quantidade NUMERIC(14,4): positiva, no máximo 4 casas. A trava de casas é
 * necessária porque o banco arredonda silenciosamente ao gravar na coluna:
 * sem ela, uma entrada como 1.23456 seria aceita aqui e gravada como 1.2346,
 * divergindo do valor que o usuário digitou. O teto é o da coluna (14,4).
 */
const quantidadeSchema = z
  .number({ error: "Quantidade inválida" })
  .positive({ error: "A quantidade precisa ser maior que zero" })
  .max(9999999999.9999, { error: "Quantidade acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `A quantidade aceita no máximo ${CASAS_TAXA} casas decimais`,
  });

/**
 * Preço unitário NUMERIC(14,4): não negativo, no máximo 4 casas. Mesma razão
 * da trava acima. São 4 e não 2 porque preço é TAXA, não valor: diesel é
 * vendido a R$ 6,3947 o litro, e cortar em 6,39 erra o total por item.
 */
const precoSchema = z
  .number({ error: "Preço inválido" })
  .min(0, { error: "O preço não pode ser negativo" })
  .max(9999999999.9999, { error: "Preço acima do permitido" })
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `O preço aceita no máximo ${CASAS_TAXA} casas decimais`,
  });

/**
 * Descrição da compra: obrigatória. É ela que vai para o lançamento financeiro
 * e, junto com a categoria, classifica o custo no DRE. Sem descrição o
 * relatório vira uma lista de "Ordem de compra OC-XXXX" sem significado.
 */
const descricaoSchema = z
  .string()
  .trim()
  .min(3, { error: "Descreva a compra em pelo menos 3 caracteres" })
  .max(500, { error: "A descrição aceita no máximo 500 caracteres" });

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
  insumoId: idSchemaCom("Insumo inválido"),
  quantidade: quantidadeSchema,
  precoUnitario: precoSchema,
  centroCustoId: idSchemaCom("Centro de custo inválido"),
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
  /**
   * De qual FORMA de pagamento esta parcela sai. A ordem pode ser paga por
   * várias (20/08/2026), e é o `forma_pagamento_id` que liga a parcela ao bloco
   * — `fn_salvar_parcelas_oc` resolve o id do bloco a partir dele.
   */
  formaPagamentoId: idSchemaCom("Forma de pagamento inválida").optional(),
});

export type OcParcelaInput = z.infer<typeof ocParcelaSchema>;

/**
 * Uma forma de pagamento da ordem, com quanto sai por ela.
 *
 * Modelo de duas camadas, igual ao do lançamento: aqui ficam as formas com o
 * valor de cada uma, e cada parcela diz de qual forma é. A soma das formas fecha
 * com o total da ordem, e as parcelas de cada forma fecham com o valor dela.
 *
 * Diferente do lançamento, a OC NÃO tem trava contínua no banco: o `valor_total`
 * é derivado dos itens, então a conferência acontece ao salvar e de novo na
 * aprovação — que é como as parcelas da OC já se comportavam.
 */
export const ocFormaSchema = z.object({
  formaPagamentoId: idSchemaCom("Escolha a forma de pagamento"),
  /**
   * Qual cartão pagou esta parte, quando a forma é cartão de crédito.
   *
   * Opcional AQUI e obrigatório no banco: só o banco sabe o TIPO da forma, e é
   * `trg_oc_formas_cartao` que exige o cartão quando o tipo é cartao_credito e o
   * recusa quando não é. Repetir essa decisão aqui exigiria consultar
   * `formas_pagamento` dentro de um schema, que é onde a regra deixaria de ter
   * um dono só.
   */
  cartaoId: idSchemaCom("Cartão inválido").optional(),
  valor: z
    .number({ error: "Valor da forma inválido" })
    .positive({ error: "O valor da forma precisa ser maior que zero" })
    .max(999999999999.99, { error: "Valor de forma acima do permitido" })
    .refine((valor) => casasDecimais(valor) <= 2, {
      error: "O valor da forma aceita no máximo 2 casas decimais",
    }),
});

export type OcFormaInput = z.infer<typeof ocFormaSchema>;

/** Centavos inteiros: comparar dinheiro somado em float mente. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Um ajuste do rodapé no SERVIDOR. Sempre positivo, inclusive o desconto: quem
 * põe o sinal de menos é a conta, não o valor guardado.
 */
function ajusteSchema(nome: string) {
  return z
    .number({ error: `${nome} inválido` })
    .min(0, { error: `${nome} não pode ser negativo` })
    .max(999999999999.99, { error: `${nome} acima do permitido` })
    .refine((valor) => casasDecimais(valor) <= 2, {
      error: `${nome} aceita no máximo 2 casas decimais`,
    })
    .default(0);
}

/**
 * Um ajuste do rodapé no FORMULÁRIO: texto, porque é o que o InputMoeda guarda
 * ("1.234,56"). Campo vazio vale zero — a maioria das ordens não tem ajuste
 * nenhum, e obrigar a digitar "0,00" em quatro campos seria pior.
 */
const ajusteFormSchema = z
  .string()
  .trim()
  .refine((valor) => casasDecimaisTexto(valor) <= 2, {
    error: "O valor aceita no máximo 2 casas decimais",
  });

/** Os ajustes do formulário (texto) na forma que o cálculo entende (número). */
export function ajustesDoForm(form: {
  frete?: string;
  outrasDespesas?: string;
  impostos?: string;
  desconto?: string;
}): AjustesDaOrdem {
  return {
    frete: paraNumero(form.frete ?? ""),
    outrasDespesas: paraNumero(form.outrasDespesas ?? ""),
    impostos: paraNumero(form.impostos ?? ""),
    desconto: paraNumero(form.desconto ?? ""),
  };
}

/** Schema da OC validado no servidor (criar e editar). */
export const ordemCompraSchema = z
  .object({
    fornecedorId: idSchemaCom("Fornecedor inválido"),
    condicaoPagamentoId: idSchemaCom("Escolha a condição de pagamento"),
    cotacaoId: idSchemaCom("Cotação inválida").optional(),
    /**
     * Obrigatória: o tipo da forma é o que decide se o pagamento passa pela
     * fila de aprovação, nasce aprovado (dinheiro) ou nasce quitado (cartão).
     */
    formaPagamentoId: idSchemaCom("Escolha a forma de pagamento"),
    /** O fato: quando a compra aconteceu. A data de criação é do sistema. */
    dataCompra: dataSchema("Data da compra inválida"),
    /** Mês em que a obra usou o material: define em que mês o custo entra. */
    mesCompetencia: mesSchema,
    /** O que foi comprado, em uma linha. Vai para o lançamento financeiro. */
    descricao: descricaoSchema,
    /** Categoria financeira do custo: é ela que classifica a compra no DRE. */
    categoriaId: idSchemaCom("Escolha a categoria do custo"),
    /**
     * Número do documento do fornecedor: nota fiscal, boleto, recibo, contrato.
     * Opcional e sem unicidade, porque o mesmo número repete entre fornecedores
     * e o mesmo boleto pode cobrir duas compras. Quem confirma o número
     * definitivo é o recebimento, que sobrescreve o que foi digitado aqui.
     */
    numeroDocumento: textoOpcional(60),
    observacoes: textoOpcional(2000),
    /**
     * Os quatro ajustes do rodapé. Somam ao total, menos o desconto, que
     * subtrai — a mesma conta de `fn_total_da_oc` no banco. O desconto NÃO é
     * aplicado item a item: ele entra no total, e a aprovação o distribui
     * proporcionalmente entre os centros de custo, porque o rateio usa
     * `bruto_da_fatia * valor_total / soma_dos_brutos`.
     */
    frete: ajusteSchema("Frete"),
    outrasDespesas: ajusteSchema("Outras despesas"),
    impostos: ajusteSchema("Impostos"),
    desconto: ajusteSchema("Desconto"),
    itens: z
      .array(ocItemSchema)
      .min(1, { error: "Adicione ao menos um item à ordem de compra" }),
    /** Opcional: OC sem parcelas gera lançamento sem parcela definida. */
    parcelas: z.array(ocParcelaSchema).default([]),
    /**
     * As formas de pagamento da ordem e quanto sai por cada uma. Ao menos uma:
     * é o TIPO da forma que decide o caminho do pagamento (fila de aprovação,
     * direto, ou já quitado no cartão), e ordem sem forma nenhuma deixaria essa
     * decisão sem dono.
     */
    formas: z
      .array(ocFormaSchema)
      .min(1, { error: "Escolha a forma de pagamento" }),
  })
  .superRefine((ordem, ctx) => {
    // O total é o que o BANCO vai gravar: itens + frete + outras + impostos
    // − desconto. Antes esta conta era só a soma dos itens, e isso já era um
    // desalinhamento à espera de acontecer: `fn_salvar_parcelas_oc` sempre
    // conferiu formas e parcelas contra `valor_total`, que inclui os ajustes.
    // Enquanto a tela não deixava editar ajuste ninguém batia nisso; com o
    // desconto editável, toda ordem com desconto seria recusada pelo banco
    // depois de passar aqui.
    const total = totalEmCentavos(ordem.itens, ordem);

    // Desconto maior que o resto deixaria a ordem negativa. Barrar aqui é o que
    // sobra: o banco não tem CHECK de total não-negativo, porque a edição passa
    // por um instante sem itens em que o total fica negativo de forma legítima.
    if (total < 0) {
      ctx.addIssue({
        code: "custom",
        message: `O desconto é maior que a ordem: sobraria ${formatarDiferenca(total / 100)}`,
        path: ["desconto"],
      });
      return;
    }

    // As formas fecham com o total da ordem. Vale sempre, inclusive sem
    // parcela: é a divisão do que vai ser pago, e ela não depende de existir
    // parcelamento.
    const somaFormas = ordem.formas.reduce(
      (soma, forma) => soma + emCentavos(forma.valor),
      0,
    );
    if (somaFormas !== total) {
      ctx.addIssue({
        code: "custom",
        message: "A soma das formas precisa fechar com o total da ordem",
        path: ["formas"],
      });
    }

    const ids = ordem.formas.map((forma) => forma.formaPagamentoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message:
          "A mesma forma aparece duas vezes: some os valores numa linha só",
        path: ["formas"],
      });
    }

    // Com DUAS ou mais formas, parcela deixa de ser opcional. Quem tem
    // vencimento e quem se paga é a PARCELA: sem ela a parte em boleto não entra
    // na fila e a parte em dinheiro não tem o que baixar. E depois de aprovada,
    // lançamento de OC só edita parcelas pelo diálogo, que recusa lançamento de
    // várias formas — a divisão ficaria declarada e não pagável.
    // `fn_salvar_parcelas_oc` recusa igual.
    if (ordem.formas.length > 1 && ordem.parcelas.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "Ordem paga por mais de uma forma precisa de parcelas: diga quando e por qual forma cada parte sai",
        path: ["parcelas"],
      });
    }

    if (ordem.parcelas.length === 0) return;

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

    // Com DUAS ou mais formas, cada parcela diz de qual é e as parcelas de cada
    // forma fecham com o valor dela. Com uma só isso é automático: a tela
    // preenche, e a soma já foi conferida contra o total acima.
    if (ordem.formas.length < 2) return;

    const conhecidas = new Set(ids);
    ordem.parcelas.forEach((parcela, i) => {
      if (
        !parcela.formaPagamentoId ||
        !conhecidas.has(parcela.formaPagamentoId)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Diga por qual forma de pagamento esta parcela sai",
          path: ["parcelas", i, "formaPagamentoId"],
        });
      }
    });

    ordem.formas.forEach((forma, i) => {
      const soma = ordem.parcelas
        .filter((p) => p.formaPagamentoId === forma.formaPagamentoId)
        .reduce((total_, p) => total_ + emCentavos(p.valor), 0);
      if (soma !== emCentavos(forma.valor)) {
        ctx.addIssue({
          code: "custom",
          message: "As parcelas desta forma não fecham com o valor dela",
          path: ["formas", i, "valor"],
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
  insumoId: idSchemaCom("Selecione o insumo"),
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
    .refine((valor) => casasDecimaisTexto(valor) <= CASAS_TAXA, {
      error: `A quantidade aceita no máximo ${CASAS_TAXA} casas decimais`,
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
    .refine((valor) => casasDecimaisTexto(valor) <= CASAS_TAXA, {
      error: `O preço aceita no máximo ${CASAS_TAXA} casas decimais`,
    }),
});

export type OcInsumoFormInput = z.infer<typeof ocInsumoFormSchema>;

/**
 * Grupo de centro de custo com seus insumos (client). A hierarquia da tela é
 * centro de custo > insumos. Um insumo não repete dentro do mesmo grupo.
 */
export const ocGrupoCentroCustoFormSchema = z
  .object({
    centroCustoId: idSchemaCom("Selecione o centro de custo"),
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
    fornecedorId: idSchemaCom("Selecione o fornecedor"),
    condicaoPagamentoId: idSchemaCom("Escolha a condição de pagamento"),
    cotacaoId: idSchema.optional(),
    /**
     * A forma de pagamento NÃO é campo deste formulário: quem manda é
     * `formas[0]`, que é o Combobox que a tela mostra. O cabeçalho da OC é
     * DERIVADO dela no submit (`aoEnviar`), e no banco quem reescreve é
     * `fn_salvar_parcelas_oc`.
     *
     * Ela já foi um campo aqui, exigido por `idSchemaCom`, e ficou exigida depois
     * que a divisão por formas mudou a tela. Nenhum controle a preenchia, então
     * toda OC nova era recusada pelo `handleSubmit` por um campo que não existe
     * na tela — e como não existe, o erro não aparecia em lugar nenhum: clicar em
     * "Criar ordem" não fazia nada, calado. A última OC criada antes disso foi em
     * 20/08/2026 21:10 UTC, sete minutos antes do deploy.
     *
     * Campo que a tela não preenche não pode ser campo do formulário. Quem
     * garante que existe uma forma escolhida é o `superRefine` lá embaixo, com o
     * erro caindo em `formas.0.formaPagamentoId`, que TEM lugar na tela.
     */
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
    /** Mesma trava do servidor: a descrição classifica a compra no DRE. */
    descricao: descricaoSchema,
    categoriaId: idSchemaCom("Selecione a categoria do custo"),
    /** Número do documento do fornecedor. Vazio no form = null no banco. */
    numeroDocumento: z
      .string()
      .trim()
      .max(60, { error: "Máximo de 60 caracteres" }),
    observacoes: z
      .string()
      .trim()
      .max(2000, { error: "Máximo de 2000 caracteres" }),
    /** Ajustes do rodapé, em texto. Vazio vale zero. */
    frete: ajusteFormSchema,
    outrasDespesas: ajusteFormSchema,
    impostos: ajusteFormSchema,
    desconto: ajusteFormSchema,
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
        /** Vazio = nenhuma forma escolhida, igual ao Combobox sem seleção. */
        formaPagamentoId: z.string().trim(),
      }),
    ),
    /**
     * Formas de pagamento (client). Nasce com UMA, em branco: é o caso comum, e
     * ela aparece como um Combobox só, sem coluna de valor (ela vale o total).
     * "Dividir entre formas" abre a segunda.
     */
    formas: z.array(
      z.object({
        formaPagamentoId: z.string().trim(),
        /** Vazio = nenhum cartão escolhido, igual ao Combobox sem seleção. */
        cartaoId: z.string().trim(),
        valor: z.string().trim(),
      }),
    ),
  })
  .superRefine((form, ctx) => {
    const emCentavosDoTexto = (texto: string) =>
      Math.round(paraNumero(texto ?? "") * 100);

    // Itens do formulário na forma que o cálculo entende. A conta em si mora em
    // `totalEmCentavos`, uma só, para a prévia da tela e a validação nunca
    // discordarem — antes eram duas fórmulas diferentes no mesmo arquivo.
    const itensDoForm = form.centrosCusto.flatMap((grupo) =>
      grupo.insumos.map((insumo) => ({
        quantidade: paraNumero(insumo.quantidade ?? ""),
        precoUnitario: paraNumero(insumo.precoUnitario ?? ""),
      })),
    );
    const ajustes = ajustesDoForm(form);
    const totalDosItens = totalEmCentavos(itensDoForm, ajustes);

    if (totalDosItens < 0) {
      ctx.addIssue({
        code: "custom",
        message: `O desconto é maior que a ordem: sobraria ${formatarDiferenca(totalDosItens / 100)}`,
        path: ["desconto"],
      });
      return;
    }

    // A primeira forma precisa estar escolhida sempre: é o tipo dela que decide
    // o caminho do pagamento, e ordem sem forma deixaria essa decisão sem dono.
    if (form.formas.length === 0 || !form.formas[0]?.formaPagamentoId) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha a forma de pagamento",
        path: ["formas", 0, "formaPagamentoId"],
      });
    }

    // A partir de DUAS: cada linha precisa de valor, a soma fecha com o total, e
    // as parcelas de cada forma fecham com o valor dela. Com uma só, ela vale o
    // total e a coluna de valor não está na tela.
    if (form.formas.length > 1) {
      form.formas.forEach((forma, i) => {
        if (!forma.formaPagamentoId) {
          ctx.addIssue({
            code: "custom",
            message: "Escolha a forma",
            path: ["formas", i, "formaPagamentoId"],
          });
        }
        if (emCentavosDoTexto(forma.valor) <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "Informe um valor maior que zero",
            path: ["formas", i, "valor"],
          });
        }
      });

      const ids = form.formas.map((forma) => forma.formaPagamentoId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          message:
            "A mesma forma aparece duas vezes: some os valores numa linha só",
          path: ["formas"],
        });
      }

      const somaFormas = form.formas.reduce(
        (soma, forma) => soma + emCentavosDoTexto(forma.valor),
        0,
      );
      if (somaFormas !== totalDosItens) {
        const diferenca = (totalDosItens - somaFormas) / 100;
        ctx.addIssue({
          code: "custom",
          message:
            diferenca > 0
              ? `Faltam ${formatarDiferenca(diferenca)} para as formas fecharem com o total`
              : `As formas passam ${formatarDiferenca(-diferenca)} do total`,
          path: ["formas"],
        });
      }

      // Dividiu, então parcela deixa de ser opcional: é a parcela que tem
      // vencimento e é ela que se paga. Sem esta mensagem, o erro que apareceria
      // era "as parcelas desta forma não fecham com o valor dela" contra uma
      // lista vazia — verdade inútil para quem nem chegou nas parcelas.
      if (form.parcelas.length === 0) {
        ctx.addIssue({
          code: "custom",
          message:
            "Dividiu entre formas: informe as parcelas e diga por qual forma cada uma sai",
          path: ["parcelas"],
        });
      } else {
        const conhecidas = new Set(ids);
        form.parcelas.forEach((parcela, i) => {
          if (!conhecidas.has(parcela.formaPagamentoId)) {
            ctx.addIssue({
              code: "custom",
              message: "Escolha a forma desta parcela",
              path: ["parcelas", i, "formaPagamentoId"],
            });
          }
        });

        form.formas.forEach((forma, i) => {
          const soma = form.parcelas
            .filter((p) => p.formaPagamentoId === forma.formaPagamentoId)
            .reduce((total_, p) => total_ + emCentavosDoTexto(p.valor), 0);
          if (soma !== emCentavosDoTexto(forma.valor)) {
            ctx.addIssue({
              code: "custom",
              message: "As parcelas desta forma não fecham com o valor dela",
              path: ["formas", i, "valor"],
            });
          }
        });
      }
    }

    if (form.parcelas.length === 0) return;

    // As parcelas fecham com o total DA ORDEM, ajustes incluídos: é contra ele
    // que `fn_salvar_parcelas_oc` confere no banco. Mesma variável de cima,
    // mesma conta -- duplicar aqui foi o que deixou as duas fórmulas
    // divergirem no passado.
    const total = totalDosItens;
    const somaParcelas = form.parcelas.reduce(
      (soma, parcela) => soma + emCentavosDoTexto(parcela.valor),
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

/**
 * O schema do formulário COM a exigência do cartão nas formas de cartão.
 *
 * Por que é uma função e não mais uma regra dentro do `superRefine` acima: a
 * regra depende do TIPO da forma escolhida, e o tipo não está no formulário —
 * está no catálogo de `formas_pagamento`, que a tela recebe por prop. Um schema
 * estático não tem como saber que "aquele uuid ali" é cartão de crédito.
 *
 * A tela monta o `Set` dos ids de forma do tipo cartão e memoiza o schema. O
 * `ordemCompraFormSchema` de cima continua existindo sem esta regra: é o que os
 * testes das outras regras usam, e é o mesmo objeto quando o conjunto é vazio.
 *
 * O banco exige a mesma coisa por `trg_oc_formas_cartao`. Aqui é só para o erro
 * cair no campo, em vez de voltar do servidor como texto solto.
 */
export function ordemCompraFormSchemaCom(
  formasDeCartao: ReadonlySet<string>,
) {
  return ordemCompraFormSchema.superRefine((form, ctx) => {
    form.formas.forEach((forma, i) => {
      if (!formasDeCartao.has(forma.formaPagamentoId)) return;
      if (forma.cartaoId) return;
      ctx.addIssue({
        code: "custom",
        message: "Escolha o cartão que pagou",
        path: ["formas", i, "cartaoId"],
      });
    });
  });
}

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
