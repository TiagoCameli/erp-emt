import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/** Tipo da leitura, igual ao CHECK de equipamento_medicoes.tipo. */
export const TIPOS_MEDICAO = ["horimetro", "km"] as const;
export type TipoMedicao = (typeof TIPOS_MEDICAO)[number];

export const ROTULO_TIPO_MEDICAO: Record<TipoMedicao, string> = {
  horimetro: "Horímetro",
  km: "Km",
};

/** Unidade curta exibida ao lado do número. */
export const UNIDADE_MEDICAO: Record<TipoMedicao, string> = {
  horimetro: "h",
  km: "km",
};

/** De onde veio a leitura, igual ao CHECK de equipamento_medicoes.origem. */
export const ORIGENS_MEDICAO = ["manual", "celular", "os", "migracao"] as const;
export type OrigemMedicao = (typeof ORIGENS_MEDICAO)[number];

export const ROTULO_ORIGEM_MEDICAO: Record<OrigemMedicao, string> = {
  manual: "Manual",
  celular: "Celular",
  os: "OS",
  migracao: "Migração",
};

/** Maior valor da coluna NUMERIC(14,4). */
export const LEITURA_MAXIMA = 9999999999.9999;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Leitura digitada (pt-BR, "12.345,5") em número, até 4 casas (CASAS_TAXA,
 * o mesmo do InputQuantidade). Vazio ou irreconhecível vira undefined.
 */
export function leituraParaNumero(texto: string): number | undefined {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  if (normalizado === null) return undefined;
  const numero = Number(normalizado.replace(",", "."));
  return Number.isFinite(numero) ? numero : undefined;
}

/** Número gravado para o texto do campo ("1234.5" vira "1234,5"), para abrir a edição. */
export function leituraParaTexto(valor: number): string {
  return String(valor).replace(".", ",");
}

/**
 * A leitura nova é menor que a última conhecida? O banco aceita (troca de painel
 * acontece), a tela só avisa. Sem leitura anterior ou sem número, não avisa.
 */
export function leituraMenorQueUltima(valor: number | undefined, ultima: number | null | undefined): boolean {
  if (valor === undefined || ultima === null || ultima === undefined) return false;
  return valor < ultima;
}

/** Data (yyyy-MM-dd) depois de hoje em Rio Branco. Comparação de string: sem fuso. */
export function dataNoFuturo(data: string, hoje: string): boolean {
  return data > hoje;
}

const MENSAGEM_LEITURA = `Informe a leitura com até ${CASAS_TAXA} casas decimais`;

const leituraFormSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe a leitura" })
  .refine((valor) => {
    const numero = leituraParaNumero(valor);
    return numero !== undefined && numero <= LEITURA_MAXIMA;
  }, { error: MENSAGEM_LEITURA });

const observacoesSchema = z.string().trim().max(500, { error: "Máximo de 500 caracteres" });

/**
 * Formulário de lançar e editar leitura (client). Campos são texto para casar
 * input e output do react-hook-form; a conversão é `formParaMedicao`.
 */
export const medicaoFormSchema = z.object({
  equipamentoId: z.string().min(1, { error: "Escolha o equipamento" }),
  data: z.string().regex(DATA_ISO, { error: "Informe a data da leitura" }),
  valor: leituraFormSchema,
  observacoes: observacoesSchema,
});

export type MedicaoFormInput = z.infer<typeof medicaoFormSchema>;

const leituraSchema = z
  .number({ error: "Leitura inválida" })
  .min(0, { error: "A leitura não pode ser negativa" })
  .max(LEITURA_MAXIMA, { error: "Leitura acima do permitido" })
  .refine((valor) => Math.round(valor * 10 ** CASAS_TAXA) / 10 ** CASAS_TAXA === valor, {
    error: MENSAGEM_LEITURA,
  });

/** Lançar leitura (servidor). */
export const registrarMedicaoSchema = z.object({
  equipamentoId: idSchemaCom("Escolha o equipamento"),
  data: z.string().regex(DATA_ISO, { error: "Data inválida" }),
  valor: leituraSchema,
  observacoes: observacoesSchema,
});

export type RegistrarMedicaoInput = z.infer<typeof registrarMedicaoSchema>;

/** Editar leitura (servidor). O equipamento não muda: a RPC só troca data, valor e observação. */
export const editarMedicaoSchema = z.object({
  id: idSchemaCom("Leitura inválida"),
  data: z.string().regex(DATA_ISO, { error: "Data inválida" }),
  valor: leituraSchema,
  observacoes: observacoesSchema,
});

export type EditarMedicaoInput = z.infer<typeof editarMedicaoSchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uuid da query string, ou undefined: valor torto nunca chega ao filtro do PostgREST. */
export function paramUuid(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/** Data yyyy-MM-dd da query string, ou undefined. */
export function paramData(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" && DATA_ISO.test(valor) ? valor : undefined;
}

/** Página da query string: 1 em diante na URL, 0 em diante no código. */
export function paramPagina(valor: string | string[] | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero - 1 : 0;
}

/** Converte o formulário validado no que a action de lançar recebe. */
export function formParaMedicao(valores: MedicaoFormInput): RegistrarMedicaoInput {
  return {
    equipamentoId: valores.equipamentoId,
    data: valores.data,
    // O schema do form já garantiu que é número; o 0 nunca é alcançado.
    valor: leituraParaNumero(valores.valor) ?? 0,
    observacoes: valores.observacoes.trim(),
  };
}
