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
  arredondar,
  dataHoraFormSchema,
  dataHoraIsoSchema,
  numeroSchema,
  numeroTexto,
  TETO_NUMERIC_14_4,
} from "@/modules/combustivel/entradas/schemas";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Abastecimento (saída de combustível): formulário, o que a action recebe, as
 * regras de consumidor × origem e o `p_dados` da `fn_comb_salvar_saida`.
 *
 * As regras espelham a RPC e os gatilhos (20260924100000_fase3_combustivel_banco.sql),
 * para a tela recusar antes de ir ao banco. Quem decide continua sendo o banco:
 *
 * - equipamento próprio nunca usa tanque externo;
 * - carreta em tanque externo tem dois preços (o cobrado da transportadora e o que
 *   o dono do tanque cobra da EMT) e a taxa por litro;
 * - carreta em tanque da EMT: preço opcional (vazio = o PEPS das camadas que ela
 *   consumiu, calculado pela RPC);
 * - dinheiro e requisição (posto): preço por litro digitado; requisição tem pago;
 * - equipamento próprio no tanque: preço é do PEPS, a tela não pede.
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
  /** Obra (centro raiz) da alocação a 100%. Nulo: sem alocação. */
  obraId: z.guid({ error: "Obra inválida" }).nullable(),
  /** Edição de saída com várias alocações (migração): mantém as que existem. */
  manterAlocacoes: z.boolean(),
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }).nullable(),
});
export type SaidaInput = z.infer<typeof saidaSchema>;

/** O que as regras precisam saber do banco (a action lê de lá; a tela, das opções). */
export interface ContextoSaida {
  tanqueExterno: boolean;
  /** O equipamento tem etapa no centro de custo (próprio, Colorado). Alugado não tem. */
  equipamentoTemEtapa: boolean;
}

export interface ProblemaSaida {
  campo: keyof SaidaFormInput;
  mensagem: string;
}

export function ehPosto(origem: OrigemSaida): boolean {
  return origem === "dinheiro" || origem === "requisicao";
}

/**
 * Precisa informar o combustível: posto e tanque externo (não têm estoque). No
 * tanque da EMT o gatilho grava o combustível do tanque na data.
 */
export function pedeCombustivel(origem: OrigemSaida, tanqueExterno: boolean): boolean {
  return origem !== "tanque" || tanqueExterno;
}

/** Regras de consumidor × origem. Lista vazia: pode ir ao banco. */
export function regrasSaida(d: SaidaInput, ctx: ContextoSaida): ProblemaSaida[] {
  const problemas: ProblemaSaida[] = [];
  const noTanque = d.origem === "tanque";
  const externo = noTanque && ctx.tanqueExterno;
  const carreta = d.tipoConsumidor === "carreta_transportadora";

  if (noTanque && !d.tanqueId) problemas.push({ campo: "tanqueId", mensagem: "Selecione o tanque" });

  if (carreta) {
    if (!d.transportadoraId) problemas.push({ campo: "transportadoraId", mensagem: "Selecione a transportadora" });
    if (externo && d.precoCombustivel === null) {
      problemas.push({ campo: "precoCombustivel", mensagem: "Informe o preço cobrado da transportadora" });
    }
  } else {
    if (!d.equipamentoId) problemas.push({ campo: "equipamentoId", mensagem: "Selecione o equipamento" });
    if (externo) {
      problemas.push({ campo: "tanqueId", mensagem: "Tanque externo é só para carreta de transportadora" });
    }
    if (!ctx.equipamentoTemEtapa && !d.obraId && !d.manterAlocacoes) {
      problemas.push({ campo: "obraId", mensagem: "Equipamento sem etapa própria: informe a obra onde ele trabalhou" });
    }
  }

  if (ehPosto(d.origem) && d.precoUnitario === null) {
    problemas.push({ campo: "precoUnitario", mensagem: "Informe o preço por litro" });
  }
  if (pedeCombustivel(d.origem, ctx.tanqueExterno) && !d.insumoId) {
    problemas.push({ campo: "insumoId", mensagem: "Selecione o combustível" });
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

/**
 * O `p_dados` da RPC. Manda `null` explícito no que não se aplica: a edição grava
 * cada coluna com o que chega, então um preço de carreta esquecido no formulário
 * de quem trocou para equipamento ficaria gravado.
 */
export function montarDadosSaida(
  d: SaidaInput,
  ctx: { tanqueExterno: boolean; alocacoesOriginais?: readonly AlocacaoOriginal[] },
): DadosSaidaRpc {
  const noTanque = d.origem === "tanque";
  const externo = noTanque && ctx.tanqueExterno;
  const carreta = d.tipoConsumidor === "carreta_transportadora";
  const requisicao = d.origem === "requisicao";

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
    preco_combustivel: carreta && noTanque ? d.precoCombustivel : null,
    // Vazio = o mesmo preço cobrado da transportadora (o dono repassa sem margem).
    preco_proprietario: carreta && externo ? (d.precoProprietario ?? d.precoCombustivel) : null,
    taxa_litro: carreta && noTanque ? (d.taxaLitro ?? 0) : 0,
    preco_unitario: ehPosto(d.origem) ? d.precoUnitario : null,
    pago: requisicao ? d.pago : false,
    pago_em: requisicao && d.pago ? d.pagoEm : null,
    medicao: carreta ? null : d.medicao,
    tipo_medicao: carreta || d.medicao === null ? null : d.tipoMedicao,
    data: d.dataHora,
    canal: "computador",
    observacoes: d.observacoes,
    alocacoes: alocacoesDa(d, ctx.alocacoesOriginais ?? []),
  };
}

/**
 * Prévia do valor, igual à RPC: posto = litros × preço; carreta com preço =
 * litros × (preço + taxa). Nulo quando é o PEPS que decide (equipamento no
 * tanque, carreta em tanque da EMT sem preço). Só mostra, nada daqui é gravado.
 */
export function previaValorSaida(dados: DadosSaidaRpc): number | null {
  if (ehPosto(dados.origem)) {
    return dados.preco_unitario === null ? null : arredondar(dados.litros * dados.preco_unitario, CASAS_TAXA);
  }
  if (dados.tipo_consumidor === "carreta_transportadora" && dados.preco_combustivel !== null) {
    return arredondar(dados.litros * (dados.preco_combustivel + dados.taxa_litro), CASAS_TAXA);
  }
  return null;
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
  equipamentoTemEtapa: z.boolean(),
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
  const problemas = regrasSaida(saidaDoForm(form), {
    tanqueExterno: form.tanqueExterno,
    equipamentoTemEtapa: form.equipamentoTemEtapa,
  });
  for (const problema of problemas) {
    ctx.addIssue({ code: "custom", path: [problema.campo], message: problema.mensagem });
  }
});
