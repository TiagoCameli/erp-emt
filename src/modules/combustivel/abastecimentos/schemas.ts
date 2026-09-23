import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import {
  dataHoraLocalParaIso,
  ORIGENS_SAIDA,
  TIPOS_CONSUMIDOR,
  type OrigemSaida,
  type TipoConsumidor,
} from "@/modules/combustivel/_shared/rotulos";
import {
  dataHoraFormSchema,
  dataHoraIsoSchema,
  numeroSchema,
  numeroTexto,
  TETO_NUMERIC_14_4,
} from "@/modules/combustivel/entradas/schemas";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Abastecimento (saída de combustível): formulário, o que a action recebe, as regras e o
 * `p_dados` da `fn_comb_salvar_saida`.
 *
 * Tiago, 24/09/2026: "tudo do combustivel tem que ser exatamente igual no app gestao
 * obras". As regras são as do SaidaCombustivelForm da origem (schema + submit):
 *
 * - equipamento próprio exige o equipamento; carreta exige a transportadora;
 * - origem tanque exige o tanque;
 * - dinheiro e requisição: preço por litro digitado (> 0);
 * - carreta no tanque: preço do combustível obrigatório (> 0); unitário = preço + taxa;
 * - equipamento próprio no tanque: unitário = preço médio do tanque (o FIFO em TS);
 * - taxa só conta na carreta; o combustível é sempre obrigatório;
 * - a obra é sempre obrigatória. Na origem é obra + etapa; a etapa da origem não tem
 *   equivalente no ERP (virou `etapa_legado`), então é a obra a 100%.
 *
 * Preço e taxa são TAXA (4 casas, `CASAS_TAXA`); litros também.
 */

export const TIPOS_MEDICAO = ["horimetro", "km"] as const;
export type TipoMedicao = (typeof TIPOS_MEDICAO)[number];

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// O que a action recebe
// ---------------------------------------------------------------------------

const precoOpcional = (rotulo: string) => numeroSchema(CASAS_TAXA, rotulo, "naoNegativo").nullable();

export const saidaSchema = z.strictObject({
  origem: z.enum(ORIGENS_SAIDA, { error: "Origem inválida" }),
  tipoConsumidor: z.enum(TIPOS_CONSUMIDOR, { error: "Consumidor inválido" }),
  tanqueId: z.guid({ error: "Tanque inválido" }).nullable(),
  equipamentoId: z.guid({ error: "Equipamento inválido" }).nullable(),
  transportadoraId: z.guid({ error: "Transportadora inválida" }).nullable(),
  placa: z.string().trim().max(20, { error: "Placa com no máximo 20 caracteres" }).nullable(),
  motorista: z.string().trim().max(120, { error: "Motorista com no máximo 120 caracteres" }).nullable(),
  insumoId: z.guid({ error: "Combustível inválido" }).nullable(),
  litros: numeroSchema(CASAS_TAXA, "Litros", "positivo"),
  precoCombustivel: precoOpcional("Preço"),
  precoProprietario: precoOpcional("Preço do dono do tanque"),
  taxaLitro: precoOpcional("Taxa por litro"),
  precoUnitario: precoOpcional("Preço por litro"),
  pago: z.boolean(),
  pagoEm: z.string().regex(DATA_ISO, { error: "Data do pagamento inválida" }).nullable(),
  medicao: numeroSchema(CASAS_TAXA, "Medição", "naoNegativo").nullable(),
  tipoMedicao: z.enum(TIPOS_MEDICAO).nullable(),
  dataHora: dataHoraIsoSchema,
  /** Obra (centro raiz) da alocação a 100%. */
  obraId: z.guid({ error: "Obra inválida" }).nullable(),
  /** Edição de saída com várias alocações (migração): mantém as que existem. */
  manterAlocacoes: z.boolean(),
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }).nullable(),
});
export type SaidaInput = z.infer<typeof saidaSchema>;

export interface ProblemaSaida {
  campo: keyof SaidaFormInput;
  mensagem: string;
}

export function ehPosto(origem: OrigemSaida): boolean {
  return origem === "dinheiro" || origem === "requisicao";
}

/**
 * Regras do schema da origem (`saidaCombustivel.schema.ts`). Lista vazia: pode ir ao
 * banco. As travas que dependem de consulta (saldo na data, combustível do tanque) são da
 * tela e da action.
 */
export function regrasSaida(d: SaidaInput): ProblemaSaida[] {
  const problemas: ProblemaSaida[] = [];
  const noTanque = d.origem === "tanque";
  const carreta = d.tipoConsumidor === "carreta_transportadora";

  if (!carreta && !d.equipamentoId) problemas.push({ campo: "equipamentoId", mensagem: "Selecione o equipamento" });
  if (!d.obraId && !d.manterAlocacoes) problemas.push({ campo: "obraId", mensagem: "Selecione a obra" });
  if (carreta && !d.transportadoraId) problemas.push({ campo: "transportadoraId", mensagem: "Selecione a transportadora" });
  if (noTanque && !d.tanqueId) problemas.push({ campo: "tanqueId", mensagem: "Selecione o tanque" });
  if (!d.insumoId) problemas.push({ campo: "insumoId", mensagem: "Selecione o combustível" });
  if (!noTanque && !((d.precoUnitario ?? 0) > 0)) {
    problemas.push({ campo: "precoUnitario", mensagem: "Informe o preço por litro, maior que zero" });
  }
  if (carreta && noTanque && !((d.precoCombustivel ?? 0) > 0)) {
    problemas.push({ campo: "precoCombustivel", mensagem: "Informe o preço cobrado da transportadora, maior que zero" });
  }
  if (d.medicao !== null && !carreta && d.tipoMedicao === null) {
    problemas.push({ campo: "medicao", mensagem: "Este equipamento não tem horímetro nem hodômetro" });
  }
  return problemas;
}

// ---------------------------------------------------------------------------
// p_dados da fn_comb_salvar_saida
// ---------------------------------------------------------------------------

export interface AlocacaoOriginal {
  centroCustoId: string;
  percentual: number;
  etapaLegado: string | null;
}

export interface AlocacaoRpc {
  centro_custo_id: string;
  percentual: number;
  etapa_legado?: string;
}

export interface DadosSaidaRpc {
  origem: OrigemSaida;
  tipo_consumidor: TipoConsumidor;
  tanque_id: string | null;
  equipamento_id: string | null;
  transportadora_id: string | null;
  placa: string | null;
  motorista: string | null;
  insumo_id: string | null;
  litros: number;
  preco_combustivel: number | null;
  preco_proprietario: number | null;
  taxa_litro: number;
  preco_unitario: number | null;
  /** Snapshot do preço médio do tanque (o FIFO em TS da origem). Só na origem tanque. */
  preco_medio_tanque: number | null;
  pago: boolean;
  pago_em: string | null;
  medicao: number | null;
  tipo_medicao: TipoMedicao | null;
  data: string;
  canal: "computador";
  observacoes: string | null;
  alocacoes: AlocacaoRpc[];
}

function alocacoesDa(d: SaidaInput, originais: readonly AlocacaoOriginal[]): AlocacaoRpc[] {
  if (d.manterAlocacoes && originais.length > 0) {
    return originais.map((a) => ({
      centro_custo_id: a.centroCustoId,
      percentual: a.percentual,
      ...(a.etapaLegado ? { etapa_legado: a.etapaLegado } : {}),
    }));
  }
  if (!d.obraId) return [];
  // A etapa da origem (texto) sobrevive à edição quando a obra não mudou.
  const mesma = originais.length === 1 && originais[0].centroCustoId === d.obraId ? originais[0] : null;
  return [
    {
      centro_custo_id: d.obraId,
      percentual: 100,
      ...(mesma?.etapaLegado ? { etapa_legado: mesma.etapaLegado } : {}),
    },
  ];
}

export interface ContextoDadosSaida {
  tanqueExterno: boolean;
  /**
   * Preço médio do tanque (o `precoMedioTanque` da origem): o FIFO em TS, ou o snapshot
   * salvo na edição que não trocou tanque nem origem. Só vale na origem tanque.
   */
  precoMedioTanque: number;
  alocacoesOriginais?: readonly AlocacaoOriginal[];
}

/**
 * Taxa efetiva: só a carreta paga taxa (`taxaEfetiva` da origem). Na origem ela vai no
 * payload da carreta em qualquer origem, mas só soma no preço da carreta no tanque.
 */
export function taxaEfetiva(d: Pick<SaidaInput, "tipoConsumidor" | "taxaLitro">): number {
  return d.tipoConsumidor === "carreta_transportadora" ? (d.taxaLitro ?? 0) : 0;
}

/**
 * Preço unitário do submit da origem:
 *   carreta + tanque  -> preço do combustível + taxa
 *   próprio + tanque  -> preço médio do tanque + taxa (zero)
 *   dinheiro/requisição -> o digitado
 */
export function precoUnitarioSaida(d: SaidaInput, precoMedioTanque: number): number {
  const taxa = taxaEfetiva(d);
  if (d.tipoConsumidor === "carreta_transportadora" && d.origem === "tanque") return (d.precoCombustivel ?? 0) + taxa;
  if (d.origem === "tanque") return precoMedioTanque + taxa;
  return d.precoUnitario ?? 0;
}

/** Valor da saída como a origem: litros × preço unitário, sem arredondar. */
export function valorSaida(d: SaidaInput, precoMedioTanque: number): number {
  return d.litros * precoUnitarioSaida(d, precoMedioTanque);
}

/**
 * O `p_dados` da RPC, com os campos do payload da origem. Manda `null` explícito no que
 * não se aplica: a edição grava cada coluna com o que chega.
 */
export function montarDadosSaida(d: SaidaInput, ctx: ContextoDadosSaida): DadosSaidaRpc {
  const noTanque = d.origem === "tanque";
  const externo = noTanque && ctx.tanqueExterno;
  const carreta = d.tipoConsumidor === "carreta_transportadora";
  const requisicao = d.origem === "requisicao";

  // `precoCombustivel` da origem: carreta = o digitado; próprio no tanque = o preço médio;
  // posto = o digitado. Carreta no posto não tem o campo na tela: vai nulo.
  const precoCombustivel = carreta
    ? noTanque
      ? d.precoCombustivel
      : null
    : noTanque
      ? ctx.precoMedioTanque
      : d.precoUnitario;

  return {
    origem: d.origem,
    tipo_consumidor: d.tipoConsumidor,
    tanque_id: noTanque ? d.tanqueId : null,
    equipamento_id: carreta ? null : d.equipamentoId,
    transportadora_id: carreta ? d.transportadoraId : null,
    placa: carreta ? d.placa : null,
    motorista: carreta ? d.motorista : null,
    insumo_id: d.insumoId,
    litros: d.litros,
    preco_combustivel: precoCombustivel,
    // Tanque de dono externo: o que o dono cobra. Vazio = o preço cobrado da transportadora
    // (a origem preenche o campo com ele enquanto está vazio).
    preco_proprietario: externo ? (d.precoProprietario ?? d.precoCombustivel) : null,
    taxa_litro: taxaEfetiva(d),
    preco_unitario: ehPosto(d.origem) ? d.precoUnitario : precoUnitarioSaida(d, ctx.precoMedioTanque),
    preco_medio_tanque: noTanque ? ctx.precoMedioTanque : null,
    pago: requisicao ? d.pago : false,
    pago_em: requisicao && d.pagoEm ? d.pagoEm : null,
    medicao: carreta ? null : d.medicao,
    tipo_medicao: carreta || d.medicao === null ? null : d.tipoMedicao,
    data: d.dataHora,
    canal: "computador",
    observacoes: d.observacoes,
    alocacoes: alocacoesDa(d, ctx.alocacoesOriginais ?? []),
  };
}

// ---------------------------------------------------------------------------
// Regras de tela da origem que pedem consulta (a tela e a action usam)
// ---------------------------------------------------------------------------

/**
 * Regra do snapshot da origem (HF.11): na edição que NÃO trocou tanque nem origem, e com
 * snapshot salvo > 0, o preço médio é o salvo; senão, o FIFO corrente.
 */
export function usaSnapshotSalvo(
  salvo: { tanqueId: string | null; origem: string; precoMedioTanque: number | null } | null,
  atual: { tanqueId: string | null; origem: OrigemSaida },
): boolean {
  if (!salvo) return false;
  return salvo.tanqueId === atual.tanqueId && salvo.origem === atual.origem && (salvo.precoMedioTanque ?? 0) > 0;
}

/**
 * Combustível da saída diferente do que está no tanque da EMT (`tipoIncompativel` da
 * origem). Tanque externo, sem tanque ou tanque sem entrada não bloqueiam.
 */
export function tipoIncompativel(params: {
  origem: OrigemSaida;
  tanqueEhExterno: boolean;
  temTanque: boolean;
  tipoDoTanque: string;
  tipoDaSaida: string | null;
}): boolean {
  return (
    params.origem === "tanque" &&
    params.temTanque &&
    !params.tanqueEhExterno &&
    !!params.tipoDoTanque &&
    !!params.tipoDaSaida &&
    params.tipoDaSaida !== params.tipoDoTanque
  );
}

/** Saldo insuficiente na data (`saldoInsuficiente` da origem): só tanque da EMT. */
export function saldoInsuficiente(params: {
  origem: OrigemSaida;
  temTanque: boolean;
  tanqueEhExterno: boolean;
  litros: number;
  saldoNaData: number;
}): boolean {
  return params.origem === "tanque" && params.temTanque && !params.tanqueEhExterno && params.litros > params.saldoNaData;
}

/** Os avisos de conferência da origem (F5.B.2): volume e valor altos. */
export function avisosDeConferencia(litros: number, valor: number): string[] {
  const avisos: string[] = [];
  if (litros >= 1000) avisos.push(`${litros.toLocaleString("pt-BR")} L é um volume alto: confirme antes de salvar`);
  if (valor >= 10000) {
    avisos.push(
      `${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} é um valor alto: confirme antes de salvar`,
    );
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

const numeroOpcionalTexto = (mensagem: string) =>
  z
    .string()
    .trim()
    .refine(
      (texto) => {
        if (texto === "") return true;
        const numero = textoParaNumero(texto, CASAS_TAXA);
        return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
      },
      { error: mensagem },
    );

const CAMPOS_FORM = z.object({
  origem: z.enum(ORIGENS_SAIDA),
  tipoConsumidor: z.enum(TIPOS_CONSUMIDOR),
  tanqueId: z.string().trim(),
  equipamentoId: z.string().trim(),
  transportadoraId: z.string().trim(),
  placa: z.string().trim().max(20, { error: "Placa com no máximo 20 caracteres" }),
  motorista: z.string().trim().max(120, { error: "Motorista com no máximo 120 caracteres" }),
  insumoId: z.string().trim(),
  litros: numeroTexto(CASAS_TAXA, `Informe os litros maiores que zero, com até ${CASAS_TAXA} casas`, "positivo"),
  precoCombustivel: numeroOpcionalTexto(`Preço com até ${CASAS_TAXA} casas`),
  precoProprietario: numeroOpcionalTexto(`Preço com até ${CASAS_TAXA} casas`),
  taxaLitro: numeroOpcionalTexto(`Taxa com até ${CASAS_TAXA} casas`),
  precoUnitario: numeroOpcionalTexto(`Preço com até ${CASAS_TAXA} casas`),
  pago: z.boolean(),
  pagoEm: z.string().trim().refine((v) => v === "" || DATA_ISO.test(v), { error: "Data do pagamento inválida" }),
  medicao: numeroOpcionalTexto(`Medição com até ${CASAS_TAXA} casas`),
  /** Vem do equipamento (controle por horímetro ou km). "" quando não controla. */
  tipoMedicao: z.string(),
  dataHora: dataHoraFormSchema,
  obraId: z.string().trim(),
  manterAlocacoes: z.boolean(),
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }),
  /** Contexto, preenchido pela tela a partir das opções. O servidor relê do banco. */
  tanqueExterno: z.boolean(),
});
export type SaidaFormInput = z.infer<typeof CAMPOS_FORM>;

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

function numeroOuNulo(valor: string): number | null {
  return valor.trim() === "" ? null : textoParaNumero(valor, CASAS_TAXA);
}

/** Formulário -> o que a action recebe. */
export function saidaDoForm(form: SaidaFormInput): SaidaInput {
  const tipoMedicao = (TIPOS_MEDICAO as readonly string[]).includes(form.tipoMedicao)
    ? (form.tipoMedicao as TipoMedicao)
    : null;
  return {
    origem: form.origem,
    tipoConsumidor: form.tipoConsumidor,
    tanqueId: form.origem === "tanque" ? textoOuNulo(form.tanqueId) : null,
    equipamentoId: textoOuNulo(form.equipamentoId),
    transportadoraId: textoOuNulo(form.transportadoraId),
    placa: textoOuNulo(form.placa)?.toUpperCase() ?? null,
    motorista: textoOuNulo(form.motorista),
    insumoId: textoOuNulo(form.insumoId),
    litros: textoParaNumero(form.litros, CASAS_TAXA) ?? 0,
    precoCombustivel: numeroOuNulo(form.precoCombustivel),
    precoProprietario: numeroOuNulo(form.precoProprietario),
    taxaLitro: numeroOuNulo(form.taxaLitro),
    precoUnitario: numeroOuNulo(form.precoUnitario),
    pago: form.pago,
    pagoEm: textoOuNulo(form.pagoEm),
    medicao: numeroOuNulo(form.medicao),
    tipoMedicao,
    dataHora: dataHoraLocalParaIso(form.dataHora) ?? "",
    obraId: textoOuNulo(form.obraId),
    manterAlocacoes: form.manterAlocacoes,
    observacoes: textoOuNulo(form.observacoes),
  };
}

export const saidaFormSchema = CAMPOS_FORM.superRefine((form, ctx) => {
  const problemas = regrasSaida(saidaDoForm(form));
  for (const problema of problemas) {
    ctx.addIssue({ code: "custom", path: [problema.campo], message: problema.mensagem });
  }
});
