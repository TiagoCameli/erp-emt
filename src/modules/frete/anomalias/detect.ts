/**
 * Detector de anomalias do Frete, portado LINHA A LINHA de
 * Gestao_Obras/src/components/frete/anomalias/detect.ts (Tiago: "exatamente igual, só
 * mude o que for necessário"). Função pura, sem banco.
 *
 *   F1 preço fora do padrão   R$/t do material a mais de R$ 0,10 de TODO preço de pedido   atenção
 *   F2 sem pedido             frete de material de pedreira sem pedido do material        atenção
 *   F3 saldo negativo         Σ pedido − Σ transportado < −0,1 t, cumulativo              atenção
 *   F4 duplicado              NF repetida, ou placa + peso + material + data              crítica
 *   F5 cadastro incompleto    sem peso/valor de material (grave), NF, placa, pedreira     atenção ou informação
 *   F6 sem chegada            frete de material sem chegada há mais de 7 dias             informação
 *
 * Igual à origem: os recortes (F1, F2, F4, F5, F6 sobre `fretesNoPeriodo`; F3 sobre
 * `fretesTodos`), a transferência fora de F1/F2/F3/F6 e com regras próprias no F5, as
 * tolerâncias, a ordem (severidade, depois data desc) e os ids determinísticos.
 *
 * O que muda por necessidade:
 * - "Origem casa com fornecedor" vira `pedreiraId` (o fornecedor da localidade de origem,
 *   `localidades.fornecedor_id`), resolvido por quem monta a entrada. O saldo vem de
 *   `_shared/pedreira.ts`, a mesma conta do painel.
 * - Id do F3: a origem separava pedreira e material por "\x00", que o Postgres não aceita
 *   em texto (a conferência mora numa coluna `text`). Aqui é `F3-<pedreira>-<material>`.
 * - "Hoje" é o dia de Rio Branco (a origem usava a data UTC, que no Acre vira o dia
 *   seguinte depois das 19h); quem chama passa `dataHojeISO()`.
 * - Exibição: dinheiro em R$ 1.234,56 e datas em dd/mm/aaaa (a origem mostrava
 *   "R$ 121.98" e "2026-06-01"). O texto das mensagens é o da origem.
 */

import { formatarBRL } from "@/lib/formatadores";
import {
  agregarPedidos,
  agregarTransporte,
  apenasFretesDePedreira,
  chavePedreira,
  ehTransferencia,
  LIMITE_SALDO_NEGATIVO_TONELADAS,
  saldosEmToneladas,
  type AgregadoDosPedidos,
  type PedidoDaPedreira,
} from "@/modules/frete/_shared/pedreira";

export type Severidade = "info" | "warning" | "critical";
export type DetectorId = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";

export const DETECTORES: readonly DetectorId[] = ["F1", "F2", "F3", "F4", "F5", "F6"];
export const SEVERIDADES: readonly Severidade[] = ["critical", "warning", "info"];

export interface AnomaliaFrete {
  id: string;
  severity: Severidade;
  detector: DetectorId;
  title: string;
  description: string;
  affectedFreteIds: string[];
  affectedFornecedorId?: string;
  affectedInsumoId?: string;
  /** Dia AAAA-MM-DD da anomalia (hoje no F3). */
  data: string;
  acaoSugerida?: string;
}

/** O que o detector lê de um frete. */
export interface FreteDeteccao {
  id: string;
  tipo: string;
  /** Dia da saída, AAAA-MM-DD. */
  data: string;
  dataChegada: string | null;
  /** Fornecedor da localidade de origem; null = a origem não casa com fornecedor. */
  pedreiraId: string | null;
  /** Nome da localidade de origem (a origem usava o texto quando faltava o nome do fornecedor). */
  origemNome: string;
  destinoNome: string;
  insumoId: string;
  peso: number;
  valorMaterial: number;
  notaFiscal: string | null;
  placaCarreta: string | null;
}

export interface DetectFreteInput {
  fretesNoPeriodo: readonly FreteDeteccao[];
  fretesTodos: readonly FreteDeteccao[];
  /** Todos (referência de preço e quantidade), já sem os excluídos. */
  pedidos: readonly PedidoDaPedreira[];
  insumoNome: ReadonlyMap<string, string>;
  fornecedorNome: ReadonlyMap<string, string>;
  hoje: string;
}

export const PRECO_TOL = 0.1;
export const F6_DIAS = 7;
const SEVERITY_ORDER: Record<Severidade, number> = { critical: 0, warning: 1, info: 2 };

export const SEVERITY_LABEL: Record<Severidade, string> = {
  critical: "Crítica",
  warning: "Atenção",
  info: "Informação",
};

export const FRETE_DETECTOR_LABEL: Record<DetectorId, string> = {
  F1: "Preço de material fora do padrão",
  F2: "Frete de material sem pedido",
  F3: "Saldo negativo na pedreira",
  F4: "Frete duplicado",
  F5: "Cadastro incompleto",
  F6: "Frete sem chegada",
};

/** Dias entre dois AAAA-MM-DD, arredondado (a origem media em meia-noite local). */
export function diasEntre(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function diaBR(dia: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.split("-").reverse().join("/") : dia;
}

function numeroBR(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

interface Ctx {
  input: DetectFreteInput;
  pedidos: AgregadoDosPedidos;
  pedreiraNoPeriodo: FreteDeteccao[];
  pedreiraTodos: FreteDeteccao[];
}

function nomeDaPedreira(ctx: Ctx, fornId: string, frete?: FreteDeteccao): string {
  return ctx.input.fornecedorNome.get(fornId) ?? (frete?.origemNome || fornId);
}

function detectF1(ctx: Ctx): AnomaliaFrete[] {
  const out: AnomaliaFrete[] = [];
  for (const f of ctx.pedreiraNoPeriodo) {
    if (!f.insumoId || !(f.peso > 0) || !(f.valorMaterial > 0)) continue;
    const fornId = f.pedreiraId;
    if (!fornId) continue; // origem sem pedreira -> F5
    const info = ctx.pedidos.porChave.get(chavePedreira(fornId, f.insumoId));
    if (!info || info.precos.length === 0) continue; // sem pedido -> F2
    const unit = f.valorMaterial / f.peso;
    if (info.precos.some((pr) => Math.abs(pr - unit) <= PRECO_TOL)) continue;
    const matNome = ctx.input.insumoNome.get(f.insumoId) ?? f.insumoId;
    const fornNome = nomeDaPedreira(ctx, fornId, f);
    out.push({
      id: `F1-${f.id}`,
      severity: "warning",
      detector: "F1",
      title: `Preço de ${matNome} fora do padrão (${fornNome})`,
      description: `Nota ${f.notaFiscal || "s/ NF"}: ${formatarBRL(unit)}/t. Pedidos de ${matNome} nessa pedreira: ${info.precos.map((p) => formatarBRL(p)).join(", ")}.`,
      affectedFreteIds: [f.id],
      affectedFornecedorId: fornId,
      affectedInsumoId: f.insumoId,
      data: f.data,
      acaoSugerida: "Conferir o valor de material na nota fiscal; se estiver errado, editar o frete.",
    });
  }
  return out;
}

function detectF2(ctx: Ctx): AnomaliaFrete[] {
  const out: AnomaliaFrete[] = [];
  for (const f of ctx.pedreiraNoPeriodo) {
    if (!f.insumoId) continue;
    const fornId = f.pedreiraId;
    if (!fornId) continue; // origem sem pedreira -> F5
    const info = ctx.pedidos.porChave.get(chavePedreira(fornId, f.insumoId));
    if (info && info.precos.length > 0) continue; // tem pedido -> ok (ou F1)
    const matNome = ctx.input.insumoNome.get(f.insumoId) ?? f.insumoId;
    const fornNome = nomeDaPedreira(ctx, fornId, f);
    out.push({
      id: `F2-${f.id}`,
      severity: "warning",
      detector: "F2",
      title: `${matNome} transportado sem pedido (${fornNome})`,
      description: `Nota ${f.notaFiscal || "s/ NF"}: não há pedido de ${matNome} cadastrado para ${fornNome}.`,
      affectedFreteIds: [f.id],
      affectedFornecedorId: fornId,
      affectedInsumoId: f.insumoId,
      data: f.data,
      acaoSugerida: "Cadastrar o pedido de material correspondente, ou conferir a origem do frete.",
    });
  }
  return out;
}

function detectF3(ctx: Ctx): AnomaliaFrete[] {
  // Saldo cumulativo: todos os fretes de material com peso, o mesmo agregado do painel.
  const transporte = agregarTransporte(
    ctx.pedreiraTodos
      .filter((f) => f.peso > 0)
      .map((f) => ({ tipo: f.tipo, pedreiraId: f.pedreiraId, insumoId: f.insumoId, peso: f.peso, valorTotal: 0, valorMaterial: 0 })),
  );
  const out: AnomaliaFrete[] = [];
  for (const s of saldosEmToneladas(ctx.pedidos, transporte)) {
    if (s.saldo >= LIMITE_SALDO_NEGATIVO_TONELADAS) continue; // só negativo relevante
    const matNome = ctx.input.insumoNome.get(s.insumoId) ?? s.insumoId;
    const fornNome = nomeDaPedreira(ctx, s.fornecedorId);
    out.push({
      id: `F3-${s.fornecedorId}-${s.insumoId}`,
      severity: "warning",
      detector: "F3",
      title: `Saldo negativo de ${matNome} (${fornNome})`,
      description: `Transportado ${numeroBR(s.qtdTransportada)} t, mas só ${numeroBR(s.qtdPedida)} t foram pedidas. Saldo ${numeroBR(s.saldo)} t.`,
      affectedFreteIds: [],
      affectedFornecedorId: s.fornecedorId,
      affectedInsumoId: s.insumoId,
      data: ctx.input.hoje,
      acaoSugerida: "Cadastrar pedido complementar do material, ou conferir fretes lançados a mais.",
    });
  }
  return out;
}

function detectF4(ctx: Ctx): AnomaliaFrete[] {
  const { input } = ctx;
  const out: AnomaliaFrete[] = [];
  const usados = new Set<string>();

  // (a) mesma nota fiscal em 2+ fretes
  const porNota = new Map<string, FreteDeteccao[]>();
  for (const f of input.fretesNoPeriodo) {
    const nf = (f.notaFiscal ?? "").trim();
    if (!nf) continue;
    const grupo = porNota.get(nf) ?? [];
    grupo.push(f);
    porNota.set(nf, grupo);
  }
  for (const [nf, grupo] of porNota) {
    if (grupo.length < 2) continue;
    grupo.forEach((g) => usados.add(g.id));
    out.push({
      id: `F4-nf-${nf}`,
      severity: "critical",
      detector: "F4",
      title: `Nota fiscal ${nf} repetida em ${grupo.length} fretes`,
      description: `A mesma nota fiscal aparece em ${grupo.length} lançamentos de frete. Possível duplicidade.`,
      affectedFreteIds: grupo.map((g) => g.id),
      data: grupo.map((g) => g.data).sort().at(-1) ?? input.hoje,
      acaoSugerida: "Conferir e excluir o lançamento duplicado.",
    });
  }

  // (b) mesma placa + peso + material + data
  const porCarga = new Map<string, FreteDeteccao[]>();
  for (const f of input.fretesNoPeriodo) {
    if (usados.has(f.id)) continue;
    const placa = (f.placaCarreta ?? "").trim();
    if (!placa || !(f.peso > 0)) continue;
    const chave = `${placa}|${f.peso}|${f.insumoId}|${f.data}`;
    const grupo = porCarga.get(chave) ?? [];
    grupo.push(f);
    porCarga.set(chave, grupo);
  }
  for (const [chave, grupo] of porCarga) {
    if (grupo.length < 2) continue;
    const primeiro = grupo[0]!;
    out.push({
      id: `F4-carga-${chave}`,
      severity: "critical",
      detector: "F4",
      title: `Carga repetida: ${primeiro.placaCarreta} em ${diaBR(primeiro.data)}`,
      description: `${grupo.length} fretes com mesma placa, peso (${numeroBR(primeiro.peso)} t), material e data. Possível duplicidade.`,
      affectedFreteIds: grupo.map((g) => g.id),
      data: primeiro.data,
      acaoSugerida: "Conferir e excluir o lançamento duplicado.",
    });
  }
  return out;
}

function detectF5(ctx: Ctx): AnomaliaFrete[] {
  const out: AnomaliaFrete[] = [];
  for (const f of ctx.input.fretesNoPeriodo) {
    const motivos: string[] = [];
    let grave = false;
    const transf = ehTransferencia(f);
    if (!(f.peso > 0)) {
      motivos.push("sem peso");
      grave = true;
    }
    // Valor de material, NF e pedreira só fazem sentido no frete de pedreira.
    if (!transf && !(f.valorMaterial > 0)) {
      motivos.push("sem valor de material");
      grave = true;
    }
    if (!transf && !(f.notaFiscal ?? "").trim()) motivos.push("sem nota fiscal");
    if (!(f.placaCarreta ?? "").trim()) motivos.push("sem placa");
    if (!transf && !f.pedreiraId) motivos.push("origem não casa com nenhum fornecedor");
    if (transf && !(f.destinoNome ?? "").trim()) {
      motivos.push("sem destino");
      grave = true;
    }
    if (motivos.length === 0) continue;
    out.push({
      id: `F5-${f.id}`,
      severity: grave ? "warning" : "info",
      detector: "F5",
      title: `${transf ? "Transferência" : "Frete"} com cadastro incompleto${f.notaFiscal ? ` (NF ${f.notaFiscal})` : ""}`,
      description: `Problemas: ${motivos.join(", ")}.`,
      affectedFreteIds: [f.id],
      affectedInsumoId: f.insumoId || undefined,
      data: f.data,
      acaoSugerida: "Completar o cadastro do frete.",
    });
  }
  return out;
}

function detectF6(ctx: Ctx): AnomaliaFrete[] {
  const out: AnomaliaFrete[] = [];
  for (const f of ctx.input.fretesNoPeriodo) {
    // Transferência não pergunta data de chegada.
    if (ehTransferencia(f)) continue;
    if ((f.dataChegada ?? "").trim()) continue;
    if (!f.data) continue;
    if (diasEntre(f.data, ctx.input.hoje) <= F6_DIAS) continue;
    out.push({
      id: `F6-${f.id}`,
      severity: "info",
      detector: "F6",
      title: `Frete sem chegada há mais de ${F6_DIAS} dias${f.notaFiscal ? ` (NF ${f.notaFiscal})` : ""}`,
      description: `Saída em ${diaBR(f.data)}, sem data de chegada registrada.`,
      affectedFreteIds: [f.id],
      data: f.data,
      acaoSugerida: "Registrar a data de chegada da carga.",
    });
  }
  return out;
}

export function detectAnomaliasFrete(input: DetectFreteInput): AnomaliaFrete[] {
  const ctx: Ctx = {
    input,
    pedidos: agregarPedidos(input.pedidos),
    pedreiraNoPeriodo: apenasFretesDePedreira(input.fretesNoPeriodo),
    pedreiraTodos: apenasFretesDePedreira(input.fretesTodos),
  };
  const todas = [...detectF1(ctx), ...detectF2(ctx), ...detectF3(ctx), ...detectF4(ctx), ...detectF5(ctx), ...detectF6(ctx)];
  todas.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return b.data.localeCompare(a.data);
  });
  return todas;
}
