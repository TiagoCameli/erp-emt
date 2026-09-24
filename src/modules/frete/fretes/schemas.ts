import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Schemas e contas do frete (aba Fretes), iguais ao FreteForm da origem
 * (Gestão Obras, components/frete/FreteForm.tsx + schemas/frete/frete.schema.ts).
 *
 * Dois níveis, como no Combustível:
 * - `freteFormSchema`: o que o react-hook-form guarda (número é TEXTO cru "1234,5678",
 *   o que InputQuantidade/InputPreco escrevem). As mensagens são as da origem.
 * - `freteSchema`: o que a Server Action recebe, com número de verdade.
 *
 * As contas são as da origem, sem arredondar: valor total = peso × km × R$/t·km e preço
 * do material = valor unitário × peso (zero na transferência). Quem grava é a
 * `fn_frete_salvar`, que refaz as duas contas; a tela só mostra.
 *
 * Módulo puro: serve tela, action e teste.
 */

export const TIPOS_FRETE = ["material", "transferencia"] as const;
export type TipoFrete = (typeof TIPOS_FRETE)[number];

export const ROTULO_TIPO_FRETE: Record<TipoFrete, string> = {
  material: "Material",
  transferencia: "Transferência",
};

/** Leitura tolerante da origem: ausente ou desconhecido é material. */
export function tipoDoFrete(tipo: string | null | undefined): TipoFrete {
  return tipo === "transferencia" ? "transferencia" : "material";
}

/** "2026-09-20" -> "20/09/2026" (a data de negócio, sem fuso). */
export function diaBR(dia: string | null | undefined): string {
  if (!dia) return "";
  return dia.slice(0, 10).split("-").reverse().join("/");
}

/** "Frete NF 123" ou "Frete" (o título do drawer da origem). */
export function tituloDoFrete(frete: { notaFiscal: string | null }): string {
  return frete.notaFiscal ? `Frete NF ${frete.notaFiscal}` : "Frete";
}

/** Placa da carreta da origem: vazia, ou ABC-1D34 / ABC1234 / ABC-1234. */
export const REGEX_PLACA = /^$|^[A-Z]{3}-?\d[A-Z\d]\d{2}$/i;

/** Teto das colunas NUMERIC(14,4). */
export const TETO_NUMERIC_14_4 = 9_999_999_999.9999;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function dataIsoValida(valor: string): boolean {
  if (!DATA_ISO.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// ---------------------------------------------------------------------------
// Contas (as da origem)
// ---------------------------------------------------------------------------

/** Valor total do frete: KM × Peso × R$/TKM, exato. */
export function valorTotalFrete(peso: number | null, km: number | null, valorTkm: number | null): number {
  const p = Number.isFinite(peso) ? (peso as number) : 0;
  const k = Number.isFinite(km) ? (km as number) : 0;
  const t = Number.isFinite(valorTkm) ? (valorTkm as number) : 0;
  return p * k * t;
}

/** Preço do material: Valor unitário × Peso; zero na transferência. */
export function valorMaterialFrete(tipo: TipoFrete, valorUnitario: number | null, peso: number | null): number {
  if (tipo === "transferencia") return 0;
  const vu = Number.isFinite(valorUnitario) ? (valorUnitario as number) : 0;
  const p = Number.isFinite(peso) ? (peso as number) : 0;
  return vu * p;
}

/**
 * Valor unitário que a edição da origem preenche: valor_material ÷ peso, quando os dois
 * existem (FreteForm.tsx:76-79). Sem eles, nulo (campo vazio).
 */
export function valorUnitarioDaEdicao(valorMaterial: number, peso: number): number | null {
  return valorMaterial && peso ? valorMaterial / peso : null;
}

/** Preço unitário da lista: valor do material ÷ peso, zero sem peso (FreteListV2). */
export function precoUnitarioMaterial(valorMaterial: number, peso: number): number {
  return peso > 0 ? valorMaterial / peso : 0;
}

/** t·km do frete: km × peso (a memória de cálculo "TKM = km × peso"). */
export function tkmDoFrete(km: number, peso: number): number {
  return km * peso;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

function textoPositivo(obrigatorio: string, maiorQueZero: string) {
  return z
    .string()
    .trim()
    .superRefine((texto, ctx) => {
      if (texto === "") {
        ctx.addIssue({ code: "custom", message: obrigatorio });
        return;
      }
      const numero = textoParaNumero(texto, CASAS_TAXA);
      if (numero === null) {
        ctx.addIssue({ code: "custom", message: `Informe um número com até ${CASAS_TAXA} casas decimais` });
        return;
      }
      if (!(numero > 0)) ctx.addIssue({ code: "custom", message: maiorQueZero });
      else if (numero > TETO_NUMERIC_14_4) ctx.addIssue({ code: "custom", message: "Número acima do permitido" });
    });
}

export const freteFormSchema = z
  .object({
    tipo: z.enum(TIPOS_FRETE),
    data: z.string().trim().min(1, { error: "Data de saída obrigatória" }),
    /** Não é campo visível (como na origem): vem da edição ou da primeira foto da chegada. */
    dataChegada: z.string(),
    obraId: z.string(),
    origemId: z.string().trim().min(1, { error: "Origem obrigatória" }),
    destinoId: z.string().trim().min(1, { error: "Destino obrigatório" }),
    transportadoraId: z.string().trim().min(1, { error: "Selecione a transportadora" }),
    motorista: z.string().trim().min(2, { error: "Nome do motorista" }),
    insumoId: z.string().trim().min(1, { error: "Selecione o material" }),
    peso: textoPositivo("Peso obrigatório", "Peso deve ser > 0"),
    km: textoPositivo("KM obrigatório", "KM deve ser > 0"),
    valorTkm: textoPositivo("R$/TKM obrigatório", "R$/TKM deve ser > 0"),
    valorUnitarioMaterial: z
      .string()
      .trim()
      .refine(
        (texto) => {
          if (texto === "") return true;
          const numero = textoParaNumero(texto, CASAS_TAXA);
          return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
        },
        { error: "Valor unitário deve ser ≥ 0" },
      ),
    notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
    notaFiscal2: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
    placa: z
      .string()
      .trim()
      .refine((valor) => REGEX_PLACA.test(valor), { error: "Placa inválida (ex: ABC-1D34)" }),
    observacoes: z.string().max(500, { error: "Máximo 500 caracteres" }),
  })
  .superRefine((valores, ctx) => {
    if (valores.tipo === "material" && !valores.obraId) {
      ctx.addIssue({ code: "custom", path: ["obraId"], message: "Selecione a obra" });
    }
  });
export type FreteFormInput = z.infer<typeof freteFormSchema>;

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const dataSchema = z.string().refine(dataIsoValida, { error: "Data de saída obrigatória" });

function numeroPositivo(mensagem: string) {
  return z
    .number({ error: mensagem })
    .refine((valor) => Number.isFinite(valor) && valor > 0, { error: mensagem })
    .refine((valor) => valor <= TETO_NUMERIC_14_4, { error: "Número acima do permitido" })
    .refine((valor) => Math.abs(Math.round(valor * 10 ** CASAS_TAXA) - valor * 10 ** CASAS_TAXA) < 1e-6, {
      error: `Aceita no máximo ${CASAS_TAXA} casas decimais`,
    });
}

export const freteSchema = z
  .strictObject({
    tipo: z.enum(TIPOS_FRETE),
    data: dataSchema,
    dataChegada: z.string().refine(dataIsoValida, { error: "Data de chegada inválida" }).nullable(),
    centroCustoId: z.guid({ error: "Selecione a obra" }).nullable(),
    origemLocalidadeId: z.guid({ error: "Origem obrigatória" }),
    destinoLocalidadeId: z.guid({ error: "Destino obrigatório" }),
    transportadoraId: z.guid({ error: "Selecione a transportadora" }),
    motorista: z.string().trim().min(2, { error: "Nome do motorista" }),
    placaCarreta: z
      .string()
      .trim()
      .refine((valor) => REGEX_PLACA.test(valor), { error: "Placa inválida (ex: ABC-1D34)" })
      .nullable(),
    insumoId: z.guid({ error: "Selecione o material" }),
    pesoToneladas: numeroPositivo("Peso deve ser > 0"),
    kmRodados: numeroPositivo("KM deve ser > 0"),
    valorTkm: numeroPositivo("R$/TKM deve ser > 0"),
    /**
     * Sem teto de casas: na edição, o unitário que a origem preenche é valor ÷ peso,
     * cheio. Se a pessoa não mexe nele, é ele que volta (o que ela DIGITA passa pelo
     * campo, que aceita 4 casas).
     */
    valorUnitarioMaterial: z
      .number({ error: "Valor unitário deve ser ≥ 0" })
      .refine((valor) => Number.isFinite(valor) && valor >= 0, { error: "Valor unitário deve ser ≥ 0" }),
    notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }).nullable(),
    notaFiscal2: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }).nullable(),
    observacoes: z.string().max(500, { error: "Máximo 500 caracteres" }).nullable(),
  })
  .superRefine((valores, ctx) => {
    if (valores.tipo === "material" && !valores.centroCustoId) {
      ctx.addIssue({ code: "custom", path: ["centroCustoId"], message: "Selecione a obra" });
    }
  });
export type FreteInput = z.infer<typeof freteSchema>;

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** O unitário exato da edição e o texto em que ele aparece no campo. */
export interface UnitarioDaEdicao {
  texto: string;
  valor: number;
}

/**
 * O unitário exato da edição, se o campo ainda mostra o número que a tela preencheu
 * (compara o NÚMERO: o campo de preço reescreve "80" como "80,00"). Senão, nulo.
 */
export function unitarioEfetivo(texto: string, unitarioDaEdicao?: UnitarioDaEdicao | null): number | null {
  if (!unitarioDaEdicao) return null;
  const digitado = textoParaNumero(texto ?? "", CASAS_TAXA);
  const preenchido = textoParaNumero(unitarioDaEdicao.texto, CASAS_TAXA);
  return digitado !== null && digitado === preenchido ? unitarioDaEdicao.valor : null;
}

/**
 * Formulário validado -> o que a action recebe. Transferência não leva NF nem valor do
 * material (FreteForm.tsx:176-205). Na edição, se o campo do unitário continua com o
 * texto que a tela preencheu, vai o unitário exato (valor ÷ peso).
 */
export function freteDoForm(form: FreteFormInput, unitarioDaEdicao?: UnitarioDaEdicao | null): FreteInput {
  const transferencia = form.tipo === "transferencia";
  const digitado = textoParaNumero(form.valorUnitarioMaterial, CASAS_TAXA) ?? 0;
  const valorUnitario = unitarioEfetivo(form.valorUnitarioMaterial, unitarioDaEdicao) ?? digitado;
  return {
    tipo: form.tipo,
    data: form.data,
    dataChegada: form.dataChegada ? form.dataChegada : null,
    centroCustoId: form.obraId ? form.obraId : null,
    origemLocalidadeId: form.origemId,
    destinoLocalidadeId: form.destinoId,
    transportadoraId: form.transportadoraId,
    motorista: form.motorista.trim(),
    placaCarreta: textoOuNulo(form.placa.toUpperCase()),
    insumoId: form.insumoId,
    pesoToneladas: textoParaNumero(form.peso, CASAS_TAXA) ?? 0,
    kmRodados: textoParaNumero(form.km, CASAS_TAXA) ?? 0,
    valorTkm: textoParaNumero(form.valorTkm, CASAS_TAXA) ?? 0,
    valorUnitarioMaterial: transferencia ? 0 : valorUnitario,
    notaFiscal: transferencia ? null : textoOuNulo(form.notaFiscal),
    notaFiscal2: transferencia ? null : textoOuNulo(form.notaFiscal2),
    observacoes: textoOuNulo(form.observacoes),
  };
}

/** As chaves que a `fn_frete_salvar` lê de `p_dados`. */
export interface DadosFreteRpc {
  tipo: TipoFrete;
  data: string;
  data_chegada: string | null;
  centro_custo_id: string | null;
  origem_localidade_id: string;
  destino_localidade_id: string;
  transportadora_id: string;
  motorista: string;
  placa_carreta: string | null;
  insumo_id: string;
  peso_toneladas: number;
  km_rodados: number;
  valor_tkm: number;
  valor_unitario_material: number;
  nota_fiscal: string | null;
  nota_fiscal2: string | null;
  observacoes: string | null;
}

export function dadosDaRpc(d: FreteInput): DadosFreteRpc {
  return {
    tipo: d.tipo,
    data: d.data,
    data_chegada: d.dataChegada,
    centro_custo_id: d.centroCustoId,
    origem_localidade_id: d.origemLocalidadeId,
    destino_localidade_id: d.destinoLocalidadeId,
    transportadora_id: d.transportadoraId,
    motorista: d.motorista,
    placa_carreta: d.placaCarreta,
    insumo_id: d.insumoId,
    peso_toneladas: d.pesoToneladas,
    km_rodados: d.kmRodados,
    valor_tkm: d.valorTkm,
    valor_unitario_material: d.valorUnitarioMaterial,
    nota_fiscal: d.notaFiscal,
    nota_fiscal2: d.notaFiscal2,
    observacoes: d.observacoes,
  };
}

/** Aviso fixo da transferência (o da origem, sem travessão). */
export const AVISO_TRANSFERENCIA =
  "Transferência de material. Não desconta saldo de pedreira: só gera crédito para a transportadora.";

/** Limite de fotos da chegada e de arquivos do frete (AnexosUploader da origem). */
export const MAXIMO_ANEXOS_FRETE = 8;
