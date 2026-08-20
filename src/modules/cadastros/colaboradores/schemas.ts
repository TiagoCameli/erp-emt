import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import {
  casasDecimais as casasDecimaisPercentual,
  paraNumero as paraNumeroPercentual,
} from "@/modules/rh/percentual";

/** Vínculos aceitos no cadastro de colaboradores (RH completo vem na Fase 7). */
export const VINCULOS = ["clt", "diarista", "terceiro"] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT",
  diarista: "Diarista",
  terceiro: "Terceiro",
};

/** Tipos de conta bancária aceitos nos dados bancários do colaborador. */
export const TIPOS_CONTA = ["corrente", "poupanca"] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
};

/** Escolaridade do colaborador (dados pessoais, RH). */
export const ESCOLARIDADES = [
  "analfabeto",
  "fundamental_incompleto",
  "fundamental_completo",
  "medio_incompleto",
  "medio_completo",
  "superior_incompleto",
  "superior_completo",
  "pos_graduacao",
  "mestrado",
  "doutorado",
] as const;
export type Escolaridade = (typeof ESCOLARIDADES)[number];

export const ROTULO_ESCOLARIDADE: Record<Escolaridade, string> = {
  analfabeto: "Analfabeto",
  fundamental_incompleto: "Fundamental incompleto",
  fundamental_completo: "Fundamental completo",
  medio_incompleto: "Médio incompleto",
  medio_completo: "Médio completo",
  superior_incompleto: "Superior incompleto",
  superior_completo: "Superior completo",
  pos_graduacao: "Pós-graduação",
  mestrado: "Mestrado",
  doutorado: "Doutorado",
};

/** Estado civil do colaborador. */
export const ESTADOS_CIVIS = [
  "solteiro",
  "casado",
  "divorciado",
  "viuvo",
  "uniao_estavel",
  "separado_judicialmente",
] as const;
export type EstadoCivil = (typeof ESTADOS_CIVIS)[number];

export const ROTULO_ESTADO_CIVIL: Record<EstadoCivil, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
  uniao_estavel: "União estável",
  separado_judicialmente: "Separado(a) judicialmente",
};

/** Raça/cor do colaborador (autodeclaração, eSocial). */
export const RACAS_COR = ["branca", "preta", "parda", "amarela", "indigena"] as const;
export type RacaCor = (typeof RACAS_COR)[number];

export const ROTULO_RACA_COR: Record<RacaCor, string> = {
  branca: "Branca",
  preta: "Preta",
  parda: "Parda",
  amarela: "Amarela",
  indigena: "Indígena",
};

/** Categoria da CNH do colaborador. */
export const CNH_CATEGORIAS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "AB",
  "AC",
  "AD",
  "AE",
] as const;
export type CnhCategoria = (typeof CNH_CATEGORIAS)[number];

export const ROTULO_CNH_CATEGORIA: Record<CnhCategoria, string> = {
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  AB: "AB",
  AC: "AC",
  AD: "AD",
  AE: "AE",
};

/** Normaliza string vazia para null (campos opcionais do formulário). */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/**
 * Mesmo `textoOpcional`, mas também aceita a chave ausente (`undefined`).
 * Usado nos campos novos de dados pessoais/eSocial: o formulário atual
 * (Task 3 ainda vai adicioná-los à tela) não os envia, então a chave precisa
 * poder faltar sem quebrar o `colaboradorSchema.parse` já existente no drawer.
 */
const textoOpcionalNovo = textoOpcional.optional();

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato aceito nos valores monetários de compras
 * (compras/ordens/calculo.ts) e financeiro (lancamentos/schemas.ts).
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/**
 * Quantas casas decimais um número tem, contando pela representação decimal
 * (sem notação científica: salário/diária nunca chegam nessa faixa).
 */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Dinheiro opcional (NUMERIC(14,2)): aceita a string digitada no formulário
 * (pt-BR, vazio = null) ou o número já convertido (reparse na Server Action,
 * que valida de novo o ColaboradorInput já processado). Não negativo, no
 * máximo 2 casas — a mesma trava do preço da OC (compras/ordens/schemas.ts),
 * porque a coluna NUMERIC(14,2) arredonda sem avisar.
 */
const dinheiroOpcionalSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((valor, ctx) => {
    if (valor === null) return null;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return null;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor === null || valor >= 0, {
    error: "O valor não pode ser negativo",
  })
  .refine((valor) => valor === null || casasDecimais(valor) <= 2, {
    error: "O valor aceita no máximo 2 casas decimais",
  });

/** Percentual NUMERIC(7,4) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual de encargo do colaborador: opcional, e o vazio tem significado —
 * `null` é "usa os encargos configurados na folha", que é diferente de 0 ("esta
 * pessoa não tem encargo"). É a distinção que deixa cadastrar um terceiro sem
 * encargo sem apagar a configuração de todo mundo.
 *
 * Usa o `paraNumero` de `rh/percentual`, e não o daqui, de propósito: aquele
 * valida o agrupamento do ponto de milhar, então "0.5" vira NaN (erro na tela)
 * em vez de 5 — dez vezes o percentual digitado, aprovado por todos os refines
 * e pelo check da coluna. Esta coluna multiplica salário dentro da folha, então
 * é o parser da folha que tem de valer aqui.
 */
const percentualOpcionalSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .transform((valor, ctx) => {
    if (valor === null) return null;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return null;
    const numero = paraNumeroPercentual(texto);
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
  .refine(
    (valor) => valor === null || casasDecimaisPercentual(valor) <= CASAS_TAXA,
    { error: `O percentual aceita no máximo ${CASAS_TAXA} casas decimais` },
  );

/** Schema do formulário de colaborador (criar e editar). */
export const colaboradorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  cpf: textoOpcional,
  funcaoId: idSchemaCom("Função inválida").nullable(),
  /**
   * Jornada de trabalho (Bloco 4, Task 3). Null = usa a jornada "Padrão EMT"
   * automaticamente, mesmo padrão de nullable de `funcaoId` acima.
   */
  jornadaId: idSchemaCom("Jornada inválida").nullable(),
  vinculo: z.enum(VINCULOS, { error: "Selecione um vínculo" }),
  obraId: idSchemaCom("Obra inválida").nullable(),
  centroCustoId: idSchemaCom("Centro de custo inválido").nullable(),
  dataAdmissao: textoOpcional,
  telefone: textoOpcional,
  ativo: z.boolean().default(true),
  salario: dinheiroOpcionalSchema,
  valorDiaria: dinheiroOpcionalSchema,
  /**
   * Gratificação salarial fixa mensal. Entra na folha somando no bruto, no
   * líquido e no custo, e FORA da base dos encargos e da provisão. Vazio vira
   * null aqui e 0 na gravação: a coluna é `not null default 0`, e um cadastro
   * sem gratificação não é "gratificação desconhecida", é zero.
   * `.optional()` porque o formulário existente não enviava esta chave.
   */
  gratificacao: dinheiroOpcionalSchema.optional(),
  /**
   * Percentual de encargo próprio desta pessoa. null/ausente = usa os encargos
   * configurados na folha. É o campo que deixa terceiro e diarista entrarem na
   * folha sem carregar encargo de CLT.
   */
  encargosPercentual: percentualOpcionalSchema.optional(),
  banco: textoOpcional,
  agencia: textoOpcional,
  conta: textoOpcional,
  tipoConta: z.enum(TIPOS_CONTA, { error: "Tipo de conta inválido" }).nullable(),
  chavePix: textoOpcional,

  // Dados pessoais / documentação / eSocial (Bloco 2). Todos opcionais: a
  // ficha completa é preenchida aos poucos, não no cadastro inicial.
  rg: textoOpcionalNovo,
  rgOrgao: textoOpcionalNovo,
  rgUf: textoOpcionalNovo,
  ctpsNumero: textoOpcionalNovo,
  ctpsSerie: textoOpcionalNovo,
  ctpsUf: textoOpcionalNovo,
  pis: textoOpcionalNovo,
  cnhNumero: textoOpcionalNovo,
  cnhCategoria: z.enum(CNH_CATEGORIAS, { error: "Categoria de CNH inválida" }).nullable().optional(),
  cnhValidade: textoOpcionalNovo,
  escolaridade: z.enum(ESCOLARIDADES, { error: "Escolaridade inválida" }).nullable().optional(),
  dataNascimento: textoOpcionalNovo,
  nomeMae: textoOpcionalNovo,
  nacionalidade: textoOpcionalNovo,
  estadoCivil: z.enum(ESTADOS_CIVIS, { error: "Estado civil inválido" }).nullable().optional(),
  racaCor: z.enum(RACAS_COR, { error: "Raça/cor inválida" }).nullable().optional(),
  tituloEleitor: textoOpcionalNovo,
  reservista: textoOpcionalNovo,
});

export type ColaboradorInput = z.infer<typeof colaboradorSchema>;
