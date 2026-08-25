import { z } from "zod";

import { CASAS_DINHEIRO, CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { casasDecimais, paraNumero } from "@/modules/rh/percentual";

/* ------------------------------------------------------------------ */
/* Gerar folha                                                        */
/* ------------------------------------------------------------------ */

/** Competência da folha: 1º dia do mês, yyyy-MM-01, obrigatória. */
const competenciaSchema = z
  .string()
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-01$/.test(valor), {
    error: "Informe a competência (mês)",
  });

/**
 * Schema de servidor da geração da folha. Os encargos deixaram de ser um % global
 * digitado: agora vêm discriminados da config (folha_encargos ativos) dentro da
 * fn_gerar_folha, então a geração só precisa da competência.
 */
export const gerarFolhaSchema = z.object({
  competencia: competenciaSchema,
});

export type GerarFolhaInput = z.infer<typeof gerarFolhaSchema>;

/** Schema do formulário (client): mês yyyy-MM. */
export const gerarFolhaFormSchema = z.object({
  /** Mês do input type="month" (yyyy-MM). Vira yyyy-MM-01 no input de servidor. */
  competencia: z
    .string()
    .trim()
    .refine((valor) => /^\d{4}-\d{2}$/.test(valor), {
      error: "Informe o mês da competência",
    }),
});

export type GerarFolhaFormInput = z.infer<typeof gerarFolhaFormSchema>;

/** Converte o formulário da folha no input de servidor. */
export function gerarFolhaFormParaInput(
  dados: GerarFolhaFormInput,
): GerarFolhaInput {
  return {
    competencia: `${dados.competencia}-01`,
  };
}

/* ------------------------------------------------------------------ */
/* Editar o item de um colaborador na folha                           */
/* ------------------------------------------------------------------ */

/**
 * Teto de NUMERIC(14,2): 12 dígitos inteiros. Acima disso o banco recusa com
 * "numeric field overflow", que na tela vira erro genérico — a trava aqui diz
 * o que aconteceu.
 */
const DINHEIRO_MAX = 999999999999.99;

/**
 * Dinheiro obrigatório NUMERIC(14,2): aceita a string digitada no formulário
 * (pt-BR) ou o número já convertido (reparse na Server Action, que valida de
 * novo o Input já processado). Não negativo, no máximo 2 casas — a coluna
 * arredonda sem avisar, e arredondar salário sem avisar é o tipo de erro que
 * só aparece no holerite do mês seguinte.
 *
 * Usa o `paraNumero` de `rh/percentual`, que valida o agrupamento do ponto de
 * milhar: sem isso "2.5" viraria 25 caladamente, dez vezes o digitado.
 */
const dinheiroSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") {
      ctx.addIssue({ code: "custom", message: "Informe o valor" });
      return z.NEVER;
    }
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, { error: "O valor não pode ser negativo" })
  .refine((valor) => valor <= DINHEIRO_MAX, {
    error: "Valor acima do permitido",
  })
  .refine((valor) => casasDecimais(valor) <= CASAS_DINHEIRO, {
    error: `O valor aceita no máximo ${CASAS_DINHEIRO} casas decimais`,
  });

/**
 * Mesmo dinheiro, mas o campo vazio vale ZERO em vez de erro. É o schema da
 * gratificação: "sem gratificação" e "R$ 0,00" são a mesma coisa, e obrigar o
 * preenchimento faria a tela pedir um zero para toda pessoa que não tem
 * gratificação — que é a maioria.
 *
 * Salário base NÃO usa este: lá o campo vazio é erro de propósito, porque
 * apagar o salário e ele virar R$ 0,00 calado é como se paga alguém a menos.
 */
const dinheiroComZeroSchema = z
  .union([z.string(), z.number()])
  .transform((valor) =>
    typeof valor === "string" && valor.trim() === "" ? 0 : valor,
  )
  .pipe(dinheiroSchema);

/** Percentual NUMERIC(7,4) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual DESCONTADO DO SALÁRIO desta pessoa, opcional de um jeito
 * específico: vazio (ou null) não é erro nem zero — é "esta pessoa não tem
 * desconto". Zero e vazio são valores DIFERENTES aqui, e é essa distinção que
 * deixa a tela dizer as duas coisas: "o desconto dele é 0%, declarado" e "ele
 * não tem desconto nenhum".
 *
 * Não reusa o `percentualSchema` de `rh/percentual` porque aquele exige o campo
 * preenchido ("Informe o percentual"), o oposto do que se quer aqui. As três
 * travas de faixa e de casas são as mesmas.
 */
const percentualIndividualSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return null;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return null;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Percentual inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor === null || valor >= 0, {
    error: "O percentual não pode ser negativo",
  })
  .refine((valor) => valor === null || valor <= PERCENTUAL_MAX, {
    error: "O percentual vai de 0 a 100",
  })
  .refine((valor) => valor === null || casasDecimais(valor) <= CASAS_TAXA, {
    error: `O percentual aceita no máximo ${CASAS_TAXA} casas decimais`,
  });

/**
 * Alteração de UMA linha da folha em rascunho. Só três campos: é o que a
 * `fn_editar_item_folha` sabe recalcular sem mexer na cascata de adiantamento.
 *
 * Salário base e gratificação não podem ser os dois zero — uma linha de R$ 0,00
 * não representa nada na folha, e quem não entra nela sai pelo cadastro, não
 * por um item zerado. A mesma trava existe no banco, e as duas concordam de
 * propósito: a daqui dá a mensagem no formulário, a de lá vale para qualquer
 * outro caminho de escrita.
 */
export const editarItemFolhaSchema = z
  .object({
    itemId: idSchemaCom("Item da folha inválido"),
    salarioBase: dinheiroSchema,
    gratificacao: dinheiroComZeroSchema,
    descontoPercentual: percentualIndividualSchema,
  })
  .refine((dados) => dados.salarioBase > 0 || dados.gratificacao > 0, {
    error:
      "Salário base e gratificação não podem ser os dois zero. Se a pessoa não entra nesta folha, ajuste o cadastro dela e regere",
    path: ["salarioBase"],
  });

export type EditarItemFolhaInput = z.infer<typeof editarItemFolhaSchema>;
