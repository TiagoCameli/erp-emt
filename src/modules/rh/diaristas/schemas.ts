import { z } from "zod";

import { numeroPositivo, paraNumero, valorValido } from "./numero";
import { calcularPeriodo, marcacoesNoPeriodo } from "./periodo";
import { erroDoRateio } from "./rateio";

import { idSchemaCom } from "@/lib/id";

/** Competência completa: 1o dia do mês, yyyy-MM-01. */
const COMPETENCIA_REGEX = /^\d{4}-\d{2}-01$/;
/** Data da diária, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Competência (yyyy-MM-01) como MM/AAAA, para exibição. */
export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/**
 * Schema de servidor da diária por período (tipos já coeridos), validado na
 * action antes de chamar `fn_salvar_diaria`. Quantidade e total NÃO vêm daqui:
 * o banco calcula a partir dos dias. Função e obra são obrigatórias; a obra
 * vem como rateio por percentual (uma linha de 100% quando é uma obra só).
 */
export const diariaSchema = z.object({
  colaboradorId: idSchemaCom("Selecione o diarista"),
  funcaoId: idSchemaCom("Selecione a função"),
  rateio: z
    .array(
      z.object({
        centroCustoId: idSchemaCom("Escolha a obra de cada linha"),
        percentual: z.number({ error: "Percentual inválido" }),
      }),
    )
    .max(20)
    .superRefine((linhas, ctx) => {
      const erro = erroDoRateio(linhas);
      if (erro) ctx.addIssue({ code: "custom", message: erro });
    }),
  inicio: z.string().trim().regex(DATA_REGEX, { error: "Informe o início" }),
  fim: z.string().trim().regex(DATA_REGEX, { error: "Informe o fim" }),
  meias: z.array(z.string().regex(DATA_REGEX)).max(31),
  faltas: z.array(z.string().regex(DATA_REGEX)).max(31),
  valorDiaria: z
    .number({ error: "Valor inválido" })
    .refine((v) => v > 0 && valorValido(v), {
      error: "Informe o valor da diária (até 2 casas)",
    }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type DiariaInput = z.infer<typeof diariaSchema>;

/**
 * Schema do formulário (client). Valor e percentuais como string pt-BR para
 * casar com os inputs; meias e faltas são as datas marcadas na grade do
 * período. A coerção real é no submit.
 */
export const diariaFormSchema = z
  .object({
    colaboradorId: idSchemaCom("Selecione o diarista"),
    funcaoId: z.string().trim().min(1, { error: "Selecione a função" }),
    rateio: z.array(
      z.object({ centroCustoId: z.string(), percentual: z.string() }),
    ),
    inicio: z.string().trim().regex(DATA_REGEX, { error: "Informe o início" }),
    fim: z.string().trim().regex(DATA_REGEX, { error: "Informe o fim" }),
    meias: z.array(z.string()),
    faltas: z.array(z.string()),
    valorDiaria: z
      .string()
      .trim()
      .refine(numeroPositivo, { error: "Informe um valor maior que zero" }),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" }),
  })
  .superRefine((dados, ctx) => {
    const erroRateio = erroDoRateio(rateioParaNumeros(dados.rateio));
    if (erroRateio) {
      ctx.addIssue({ code: "custom", path: ["rateio"], message: erroRateio });
    }
    if (!DATA_REGEX.test(dados.inicio) || !DATA_REGEX.test(dados.fim)) return;
    const r = calcularPeriodo({
      inicio: dados.inicio,
      fim: dados.fim,
      meias: dados.meias,
      faltas: dados.faltas,
      valorDiaria: 1,
    });
    if ("erro" in r)
      ctx.addIssue({ code: "custom", path: ["fim"], message: r.erro });
  });

export type DiariaFormInput = z.infer<typeof diariaFormSchema>;

/** Linhas do rateio do formulário (strings pt-BR) em números. */
export function rateioParaNumeros(
  rateio: DiariaFormInput["rateio"],
): DiariaInput["rateio"] {
  return rateio.map((l) => ({
    centroCustoId: l.centroCustoId,
    percentual: paraNumero(l.percentual),
  }));
}

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function diariaFormParaInput(dados: DiariaFormInput): DiariaInput {
  return {
    colaboradorId: dados.colaboradorId,
    funcaoId: dados.funcaoId,
    rateio: rateioParaNumeros(dados.rateio),
    inicio: dados.inicio,
    fim: dados.fim,
    // Só o que cai dentro do período: o banco recusa marcação fora dele.
    meias: marcacoesNoPeriodo(dados.inicio, dados.fim, dados.meias),
    faltas: marcacoesNoPeriodo(dados.inicio, dados.fim, dados.faltas).filter(
      (d) => !dados.meias.includes(d),
    ),
    valorDiaria: paraNumero(dados.valorDiaria),
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}

/** Função nova criada no formulário da diária (vai pro catálogo único). */
export const novaFuncaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "Informe o nome da função" })
    .max(120, { error: "Máximo de 120 caracteres" }),
  valor: z
    .number({ error: "Valor inválido" })
    .refine((v) => v > 0 && valorValido(v), {
      error: "Informe o valor da diária (até 2 casas)",
    }),
});

export type NovaFuncaoInput = z.infer<typeof novaFuncaoSchema>;

/** Data de vencimento do fechamento, yyyy-MM-dd. */
const VENC_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema do fechamento (servidor). Gera UM lançamento a pagar somando as
 * diárias em aberto do colaborador na competência. Vencimento é opcional.
 */
/**
 * Fechamento das diárias: o que a tela precisa mandar.
 *
 * `dataVencimento` e `formaPagamentoId` são OBRIGATÓRIOS, e isso é mudança. O
 * vencimento era opcional, e foi por isso que o LAN-2026-6522 nasceu sem data:
 * a action só mandava o parâmetro quando a tela tinha valor, e a tela não tinha.
 * Campo opcional naquilo que todo lançamento precisa é um vazio esperando a vez.
 *
 * Quem escolhe a forma é quem fecha (decisão do dono): 40 dos 59 colaboradores
 * não têm dado bancário cadastrado, então derivar a forma do cadastro erraria na
 * maioria. `fn_fechar_diarias` recusa os dois vazios, então a regra vale mesmo
 * que alguém chame a action por fora da tela.
 */
export const fecharSchema = z.object({
  colaboradorId: idSchemaCom("Diarista inválido"),
  competencia: z
    .string()
    .trim()
    .regex(COMPETENCIA_REGEX, { error: "Competência inválida" }),
  dataVencimento: z
    .string()
    .trim()
    .regex(VENC_REGEX, { error: "Informe o vencimento do pagamento" }),
  formaPagamentoId: idSchemaCom("Escolha a forma de pagamento"),
});

export type FecharInput = z.infer<typeof fecharSchema>;
