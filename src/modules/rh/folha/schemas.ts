import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
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

/**
 * VALOR descontado do salário desta pessoa, em reais. Vazio e null valem os
 * dois zero: "sem desconto" é R$ 0,00, e não existe mais um segundo jeito de
 * dizer a mesma coisa.
 *
 * Era percentual até 26/08/2026, e a troca não foi cosmética. 7,5% sobre o
 * salário mínimo de R$ 1.621,00 dá 121,575 — exatamente a metade do centavo,
 * onde nenhuma regra de arredondamento é "a certa". O banco subia para 121,58 e
 * o contracheque descia para 121,57, e a folha do sistema divergia da folha real
 * por um centavo por pessoa. Quem decide esse centavo é o sistema que emite o
 * contracheque, então o número entra digitado em vez de calculado.
 *
 * Duas casas, não quatro: isto é dinheiro que alguém deixa de receber, não uma
 * taxa que multiplica (`docs/PLANO-ERP-EMT.md`, regra de ouro 3).
 */
const descontoSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor) => {
    if (valor === null) return 0;
    return typeof valor === "string" && valor.trim() === "" ? 0 : valor;
  })
  .pipe(dinheiroSchema);

/**
 * HORAS não trabalhadas que motivaram o desconto. Opcional de um jeito
 * específico: vazio é `null`, e null significa "o desconto foi digitado em reais
 * sem dizer o motivo" — diferente de `0`, que é "declarei zero hora".
 *
 * O teto de 200 é o mês inteiro (`HORAS_MES` em `horas-e-valor.ts`, e o mesmo
 * número no CHECK da coluna): mais que isso é erro de digitação, não falta.
 *
 * Duas casas de hora, porque meia hora e 15 minutos (0,25) são faltas reais.
 */
const descontoHorasSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return null;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return null;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Horas inválidas" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor === null || valor >= 0, {
    error: "As horas não podem ser negativas",
  })
  .refine((valor) => valor === null || valor <= 200, {
    error: "As horas não trabalhadas vão de 0 a 200 (o mês inteiro)",
  })
  .refine((valor) => valor === null || casasDecimais(valor) <= 2, {
    error: "As horas aceitam no máximo 2 casas decimais",
  });

/**
 * HORAS trabalhadas do mês (normais ou extras). Diferente de
 * `descontoHorasSchema`: ali o vazio é `null` porque "sem motivo declarado" é um
 * estado; aqui vazio é 0, porque "não trabalhou hora extra" é zero hora.
 *
 * O teto de 744 é o mês inteiro sem dormir (31 × 24). Não é jornada, é
 * impossibilidade: serve para pegar dedo escorregado (2000 no lugar de 200), não
 * para julgar escala de trabalho — quem faz isso é o apontamento. O mesmo número
 * está na `fn_editar_item_folha`.
 */
const HORAS_MAX = 744;

const horasTrabalhadasSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return 0;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return 0;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Horas inválidas" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, { error: "As horas não podem ser negativas" })
  .refine((valor) => valor <= HORAS_MAX, {
    error: `As horas vão de 0 a ${HORAS_MAX} (o mês inteiro, 24h por dia)`,
  })
  .refine((valor) => casasDecimais(valor) <= 2, {
    error: "As horas aceitam no máximo 2 casas decimais",
  });

/**
 * Alteração de UMA linha da folha em rascunho.
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
    // Obrigatório, e é o ponto: item da folha sem centro de custo passa batido
    // até a aprovação e morre lá, longe de onde daria para resolver. Regra de
    // ouro do projeto — nenhum custo existe sem centro de custo.
    centroCustoId: idSchemaCom("Escolha o centro de custo desta linha"),
    salarioBase: dinheiroSchema,
    gratificacao: dinheiroComZeroSchema,
    horasNormais: horasTrabalhadasSchema,
    horasExtras: horasTrabalhadasSchema,
    // Entra no custo da empresa e no líquido. Existe como campo próprio para não
    // ser preciso inflar o salário base para pagar um extra, o que erraria a
    // base do encargo e da provisão.
    valorExtras: dinheiroComZeroSchema,
    desconto: descontoSchema,
    descontoHoras: descontoHorasSchema,
  })
  .refine((dados) => dados.salarioBase > 0 || dados.gratificacao > 0, {
    error:
      "Salário base e gratificação não podem ser os dois zero. Se a pessoa não entra nesta folha, ajuste o cadastro dela e regere",
    path: ["salarioBase"],
  });

export type EditarItemFolhaInput = z.infer<typeof editarItemFolhaSchema>;

/* ------------------------------------------------------------------ */
/* Data de vencimento da folha                                        */
/* ------------------------------------------------------------------ */

/**
 * Vencimento escolhido para a folha: yyyy-MM-dd, ou string vazia para limpar.
 *
 * Vazio vira `null`, e null no banco significa "cai no dia de pagamento dos
 * parâmetros". Sem essa conversão o `<input type="date">` esvaziado mandaria
 * `""`, o Postgres recusaria a data e o campo ficaria preso no valor antigo sem
 * ninguém entender por quê.
 *
 * O ano tem 4 dígitos por regra do schema: `<input type="date">` deixa digitar
 * ano 0026 e mandaria uma data quase dois milênios no passado. Quem recusa de
 * fato é a função no banco (vencimento anterior à competência), mas data
 * absurda tem de morrer antes de virar chamada de rede.
 */
export const vencimentoFolhaSchema = z.object({
  folhaId: idSchemaCom("Folha inválida"),
  data: z
    .string()
    .trim()
    .refine((valor) => valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor), {
      error: "Informe uma data válida",
    })
    .transform((valor) => (valor === "" ? null : valor)),
});

export type VencimentoFolhaInput = z.input<typeof vencimentoFolhaSchema>;
