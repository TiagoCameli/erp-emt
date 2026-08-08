import { z } from "zod";

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de funções (cadastros/funcoes/schemas.ts)
 * e dos encargos da folha (rh/encargos/schemas.ts).
 */
function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/** Quantas casas decimais um número tem, pela representação decimal. */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Dinheiro obrigatório (NUMERIC(14,2)): aceita a string digitada no
 * formulário (pt-BR) ou o número já convertido (reparse na Server Action,
 * que valida de novo o input já processado). Diferente do salário de
 * funções, aqui não existe "sem valor": um parâmetro fiscal ou uma faixa
 * sem número não tem sentido. `minimoExclusivo` decide entre aceitar zero
 * (>= 0, ex.: parcela a deduzir) ou exigir maior que zero (> 0, ex.: o
 * limite de uma faixa). No máximo 2 casas — a coluna NUMERIC(14,2)
 * arredonda sem avisar.
 */
function criarDinheiroSchema(opts: {
  minimoExclusivo?: boolean;
  mensagemObrigatorio: string;
  mensagemMinimo: string;
}) {
  return z
    .union([z.string(), z.number()])
    .transform((valor, ctx) => {
      if (typeof valor === "number") return valor;
      const texto = valor.trim();
      if (texto === "") {
        ctx.addIssue({ code: "custom", message: opts.mensagemObrigatorio });
        return z.NEVER;
      }
      const numero = paraNumero(texto);
      if (!Number.isFinite(numero)) {
        ctx.addIssue({ code: "custom", message: "Valor inválido" });
        return z.NEVER;
      }
      return numero;
    })
    .refine((valor) => (opts.minimoExclusivo ? valor > 0 : valor >= 0), {
      error: opts.mensagemMinimo,
    })
    .refine((valor) => casasDecimais(valor) <= 2, {
      error: "O valor aceita no máximo 2 casas decimais",
    });
}

/** Percentual NUMERIC(6,3) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual (alíquota/FGTS) obrigatório: aceita a string digitada no
 * formulário (pt-BR) ou o número já convertido. Não negativo, no máximo
 * 100, no máximo 3 casas — a coluna NUMERIC(6,3) arredonda sem avisar.
 * Mesmo validador do percentual dos encargos (rh/encargos/schemas.ts).
 */
const percentualSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") {
      ctx.addIssue({ code: "custom", message: "Informe o percentual" });
      return z.NEVER;
    }
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Percentual inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, {
    error: "O percentual não pode ser negativo",
  })
  .refine((valor) => valor <= PERCENTUAL_MAX, {
    error: "O percentual vai de 0 a 100",
  })
  .refine((valor) => casasDecimais(valor) <= 3, {
    error: "O percentual aceita no máximo 3 casas decimais",
  });

/** Limite superior de uma faixa progressiva (INSS/IRRF): precisa ser > 0. */
const limiteAteSchema = criarDinheiroSchema({
  minimoExclusivo: true,
  mensagemObrigatorio: "Informe o limite da faixa",
  mensagemMinimo: "O limite da faixa precisa ser maior que zero",
});

/** Schema de uma faixa progressiva do INSS (limite + alíquota). */
export const faixaInssSchema = z.object({
  limiteAte: limiteAteSchema,
  aliquota: percentualSchema,
});

/** Saída validada (valores já números): use nas server actions. */
export type FaixaInssInput = z.infer<typeof faixaInssSchema>;

/** Entrada do formulário (valores como string): use no react-hook-form. */
export type FaixaInssFormInput = z.input<typeof faixaInssSchema>;

/** Schema de uma faixa progressiva do IRRF (limite + alíquota + parcela a deduzir). */
export const faixaIrrfSchema = z.object({
  limiteAte: limiteAteSchema,
  aliquota: percentualSchema,
  parcelaDeduzir: criarDinheiroSchema({
    mensagemObrigatorio: "Informe a parcela a deduzir",
    mensagemMinimo: "A parcela a deduzir não pode ser negativa",
  }),
});

/** Saída validada (valores já números): use nas server actions. */
export type FaixaIrrfInput = z.infer<typeof faixaIrrfSchema>;

/** Entrada do formulário (valores como string): use no react-hook-form. */
export type FaixaIrrfFormInput = z.input<typeof faixaIrrfSchema>;

/**
 * Dia do mês (1..31), opcional: ausente é o normal antes do Tiago cadastrar
 * (config vazia não pode travar o deploy). Usado tanto para o dia de
 * pagamento do salário quanto para o dia único de vencimento das guias
 * (INSS, FGTS e IRRF da folha vencem todos no mesmo dia — não existe um dia
 * por encargo, senão precisaria inventar desempate).
 */
const diaDoMesSchema = z
  .number({ error: "Dia inválido" })
  .int({ error: "O dia precisa ser um número inteiro" })
  .min(1, { error: "O dia precisa ser entre 1 e 31" })
  .max(31, { error: "O dia precisa ser entre 1 e 31" })
  .optional();

/**
 * Grupo de recolhimento do que foi retido do trabalhador (INSS ou IRRF da
 * folha, colunas folha_itens.inss/.irrf). Opcional: vazio é o normal antes do
 * cadastro, e o retido correspondente não vira guia. O nome casa por
 * igualdade exata com folha_encargos.grupo_recolhimento na geração da guia
 * (Task 4), por isso o campo é um Combobox alimentado pelos grupos já
 * cadastrados, não texto livre.
 */
const grupoRecolhimentoRetidoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o grupo ou deixe vazio" })
  .max(60, { error: "Máximo de 60 caracteres" })
  .optional();

/** Schema dos parâmetros escalares da folha (config singleton, id=1). */
export const parametrosSchema = z.object({
  irrfDeducaoPorDependente: criarDinheiroSchema({
    mensagemObrigatorio: "Informe a dedução por dependente",
    mensagemMinimo: "A dedução por dependente não pode ser negativa",
  }),
  irrfDescontoSimplificado: criarDinheiroSchema({
    mensagemObrigatorio: "Informe o desconto simplificado",
    mensagemMinimo: "O desconto simplificado não pode ser negativo",
  }),
  fgtsPercentual: percentualSchema,
  diaPagamentoSalario: diaDoMesSchema,
  diaVencimentoGuias: diaDoMesSchema,
  grupoRecolhimentoInss: grupoRecolhimentoRetidoSchema,
  grupoRecolhimentoIrrf: grupoRecolhimentoRetidoSchema,
});

/** Saída validada (valores já números): use nas server actions. */
export type ParametrosInput = z.infer<typeof parametrosSchema>;

/** Entrada do formulário (valores como string): use no react-hook-form. */
export type ParametrosFormInput = z.input<typeof parametrosSchema>;
