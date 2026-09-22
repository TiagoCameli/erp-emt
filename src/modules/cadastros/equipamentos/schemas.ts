import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/** Como o equipamento controla uso/horas. Igual ao default/check do banco. */
export const CONTROLE_POR = ["horimetro", "km", "nenhum"] as const;

export type ControlePor = (typeof CONTROLE_POR)[number];

/** Rótulo de exibição de cada forma de controle. */
export const CONTROLE_POR_CONFIG: Record<ControlePor, string> = {
  horimetro: "Horímetro",
  km: "Quilometragem",
  nenhum: "Sem controle",
};

/**
 * De quem é o equipamento. Decide ONDE mora a etapa dele no centro de custo (o
 * banco cria e move por gatilho, fn_equipamento_cria_etapa_manutencao):
 * próprio na raiz de manutenção, Colorado na obra 002, alugado sem etapa.
 */
export const PROPRIEDADES = ["propria", "colorado", "alugada"] as const;
export type Propriedade = (typeof PROPRIEDADES)[number];

export const ROTULO_PROPRIEDADE: Record<Propriedade, string> = {
  propria: "Própria da EMT",
  colorado: "Colorado",
  alugada: "Alugada de terceiro",
};

/** Onde fica o custo de cada propriedade, dito na tela ao escolher. */
export const AJUDA_PROPRIEDADE: Record<Propriedade, string> = {
  propria: "A etapa fica em Manutenção/Documentação de Equipamentos.",
  colorado: "A etapa fica na obra 002 - Equipamentos Colorado 2026.",
  alugada: "Sem etapa: o custo vai para a obra onde o equipamento trabalhou.",
};

/** Situação do equipamento. Na Fase 2 passa a acompanhar a OS. */
export const STATUS_EQUIPAMENTO = ["ativa", "em_manutencao", "fora_funcionamento"] as const;
export type StatusEquipamento = (typeof STATUS_EQUIPAMENTO)[number];

export const ROTULO_STATUS_EQUIPAMENTO: Record<StatusEquipamento, string> = {
  ativa: "Em operação",
  em_manutencao: "Em manutenção",
  fora_funcionamento: "Fora de funcionamento",
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Horímetro ou km digitado (pt-BR) em número, até 4 casas. Vazio vira
 * undefined. É o mesmo normalizador do `InputQuantidade` que o campo usa.
 */
export function medicaoParaNumero(texto: string): number | undefined {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  return normalizado === null ? undefined : Number(normalizado.replace(",", "."));
}

/** Ano mínimo aceito num equipamento. Antes disso é digitação errada. */
const ANO_MINIMO = 1950;
/** Margem de um ano à frente cobre veículos do ano seguinte. */
const ANO_MAXIMO = new Date().getFullYear() + 1;

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

/** Schema base do equipamento, compartilhado entre criar e editar (servidor). */
export const equipamentoSchema = z.object({
  codigo: textoOpcional(40),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  tipo: textoOpcional(60),
  marca: textoOpcional(60),
  modelo: textoOpcional(60),
  ano: z
    .number({ error: "Ano inválido" })
    .int({ error: "Ano inválido" })
    .min(ANO_MINIMO, { error: `O ano não pode ser anterior a ${ANO_MINIMO}` })
    .max(ANO_MAXIMO, { error: `O ano não pode passar de ${ANO_MAXIMO}` })
    .optional(),
  placa: textoOpcional(10),
  controlePor: z.enum(CONTROLE_POR, { error: "Forma de controle inválida" }),
  propriedade: z.enum(PROPRIEDADES, { error: "Escolha de quem é o equipamento" }),
  status: z.enum(STATUS_EQUIPAMENTO, { error: "Situação inválida" }),
  medicaoInicial: z
    .number({ error: "Medição inválida" })
    .min(0, { error: "A medição não pode ser negativa" })
    .max(9999999999.9999, { error: "Medição acima do permitido" })
    .optional(),
  numeroSerie: textoOpcional(80),
  dataAquisicao: z.string().regex(DATA_ISO, { error: "Data inválida" }).optional(),
  dataVenda: z.string().regex(DATA_ISO, { error: "Data inválida" }).optional(),
  ativo: z.boolean(),
}).refine(
  (dados) => !dados.dataAquisicao || !dados.dataVenda || dados.dataVenda >= dados.dataAquisicao,
  { error: "A venda não pode ser antes da aquisição", path: ["dataVenda"] },
);

export type EquipamentoInput = z.infer<typeof equipamentoSchema>;

/**
 * Schema do formulário (client). Campos texto continuam string (sem transform)
 * para casar input e output do react-hook-form. A coerção real (vazio para
 * null, número, etc) acontece no servidor com equipamentoSchema.
 */
export const equipamentoFormSchema = z.object({
  codigo: z.string().trim().max(40, { error: "Máximo de 40 caracteres" }),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  tipo: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
  marca: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
  modelo: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
  ano: z
    .string()
    .trim()
    .refine(
      (valor) => {
        if (valor === "") return true;
        const numero = Number(valor);
        return (
          Number.isInteger(numero) &&
          numero >= ANO_MINIMO &&
          numero <= ANO_MAXIMO
        );
      },
      { error: `Informe um ano entre ${ANO_MINIMO} e ${ANO_MAXIMO}` },
    ),
  placa: z.string().trim().max(10, { error: "Máximo de 10 caracteres" }),
  controlePor: z.enum(CONTROLE_POR, { error: "Forma de controle inválida" }),
  propriedade: z.enum(PROPRIEDADES, { error: "Escolha de quem é o equipamento" }),
  status: z.enum(STATUS_EQUIPAMENTO, { error: "Situação inválida" }),
  medicaoInicial: z
    .string()
    .trim()
    .refine((valor) => valor === "" || medicaoParaNumero(valor) !== undefined, {
      error: `Informe a medição com até ${CASAS_TAXA} casas decimais`,
    }),
  numeroSerie: z.string().trim().max(80, { error: "Máximo de 80 caracteres" }),
  dataAquisicao: z.string().trim(),
  dataVenda: z.string().trim(),
  ativo: z.boolean(),
}).refine(
  (dados) => !dados.dataAquisicao || !dados.dataVenda || dados.dataVenda >= dados.dataAquisicao,
  { error: "A venda não pode ser antes da aquisição", path: ["dataVenda"] },
);

export type EquipamentoFormInput = z.infer<typeof equipamentoFormSchema>;

/** Schema do documento do equipamento, usado ao adicionar no drawer (servidor). */
export const documentoSchema = z.object({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  tipo: z
    .string()
    .trim()
    .min(2, { error: "O tipo precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "Máximo de 80 caracteres" }),
  descricao: textoOpcional(200),
  // Vazio vira undefined ANTES do regex: o input date manda "" quando em
  // branco, e validar o formato direto rejeitaria o vencimento opcional.
  vencimento: z.preprocess(
    (valor) =>
      typeof valor === "string" && valor.trim() === "" ? undefined : valor,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
      .optional(),
  ),
});

export type DocumentoInput = z.infer<typeof documentoSchema>;

/** Schema do formulário de documento (client): campos sempre string. */
export const documentoFormSchema = z.object({
  tipo: z
    .string()
    .trim()
    .min(2, { error: "O tipo precisa ter pelo menos 2 caracteres" })
    .max(80, { error: "Máximo de 80 caracteres" }),
  descricao: z.string().trim().max(200, { error: "Máximo de 200 caracteres" }),
  vencimento: z.string().trim(),
});

export type DocumentoFormInput = z.infer<typeof documentoFormSchema>;
