import { EQUIPAMENTO_DESCONHECIDO, type Modo, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * As contas da Visão Geral da origem (v2/visao-geral: KpisRow, MixCombustivel,
 * TopEquipamentos, TopCarretas, CustoPorObra), sobre as saídas do recorte: o modo
 * (próprios ou carretas) e o período. Módulo puro, testado em calculo.test.ts.
 *
 * Mesmas fórmulas da origem: volume = soma dos litros, custo = soma do valor total das
 * saídas DO MODO (no modo carretas, é o valor das saídas de carreta), R$/L = custo ÷
 * volume, consumidores distintos sem o sentinela (próprios) ou por placa (carretas),
 * deltas contra o período anterior de mesma duração com `pctChange` da origem.
 *
 * Diferença só de aritmética: as somas são em inteiros de décimo de milésimo
 * (`somarValoresOperacionais`), porque o banco guarda 4 casas e somar centenas de
 * saídas em float erra a última. O número é o mesmo da origem sem o ruído.
 */

const somar = somarValoresOperacionais;

/** A origem: ((atual - anterior) / anterior) × 100; base zero dá 0 ou 100. */
export function pctChange(atual: number, anterior: number): number {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return ((atual - anterior) / anterior) * 100;
}

/** O período anterior de mesma duração (dias inclusivos), terminando na véspera do início. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dia = (texto: string) => {
    const [a, m, d] = texto.split("-").map(Number);
    return Date.UTC(a!, m! - 1, d!);
  };
  const DIA = 86_400_000;
  const duracao = Math.round((dia(ate) - dia(de)) / DIA) + 1;
  const novoAte = dia(de) - DIA;
  const novoDe = novoAte - (duracao - 1) * DIA;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { de: iso(novoDe), ate: iso(novoAte) };
}

/** Quem é o consumidor da saída no modo (a chave dos KPIs da origem). */
function chaveConsumidor(s: SaidaBase, modo: Modo): string | null {
  if (modo === "proprios") return s.equipamentoId && s.equipamentoId !== EQUIPAMENTO_DESCONHECIDO ? s.equipamentoId : null;
  return (s.placa || "").trim() || null;
}

export interface KpisPainel {
  volume: number;
  custo: number;
  /** custo ÷ volume (0 sem volume). */
  rPorL: number;
  qtdConsumidores: number;
  /** Equipamento (id) ou placa com mais litros; null sem consumidor. */
  maiorChave: string | null;
  maiorLitros: number;
  /** % do volume do maior consumidor. */
  maiorPct: number;
  deltaVolume: number;
  deltaCusto: number;
  /** 0 quando o período anterior não tem R$/L. */
  deltaRpL: number;
  deltaConsumidores: number;
  /** Diferenças absolutas, para quando a base anterior é pequena (< 5) e o % engana. */
  diffVolume: number;
  diffConsumidores: number;
  qtdSaidasAnt: number;
  qtdConsumidoresAnt: number;
  qtdSaidas: number;
  /** Saídas no sentinela ("Outros"), para o aviso da origem (SentinelBanner). */
  qtdSentinela: number;
  /** Litros no sentinela: o aviso da origem aparece acima de 10% do volume. */
  volumeSentinela: number;
}

/** O SentinelBanner da origem aparece quando mais de 10% do volume está sem equipamento. */
export const LIMIAR_AVISO_SENTINELA_PCT = 10;

/**
 * O chip de tendência da origem (`pickTrend`): com base anterior menor que 5, o % engana
 * (0 para 1 é +100%), então mostra a diferença absoluta; senão, o %.
 */
export function tendencia(
  delta: number,
  baseAnterior: number,
  diferenca: number,
): { tipo: "absoluto"; valor: number } | { tipo: "percentual"; valor: number } {
  if (baseAnterior < 5 && Math.abs(diferenca) > 0) return { tipo: "absoluto", valor: diferenca };
  return { tipo: "percentual", valor: delta };
}

export function calcularKpis(noPeriodo: readonly SaidaBase[], anterior: readonly SaidaBase[], modo: Modo): KpisPainel {
  const volume = somar(noPeriodo.map((s) => s.litros));
  const custo = somar(noPeriodo.map((s) => s.valorTotal));
  const porConsumidor = new Map<string, number[]>();
  for (const s of noPeriodo) {
    const chave = chaveConsumidor(s, modo);
    if (!chave) continue;
    const lista = porConsumidor.get(chave) ?? [];
    lista.push(s.litros);
    porConsumidor.set(chave, lista);
  }
  let maiorChave: string | null = null;
  let maiorLitros = 0;
  // A origem percorre o Map em ordem de inserção e troca só com "maior que": no empate fica o primeiro.
  for (const [chave, litros] of porConsumidor) {
    const total = somar(litros);
    if (total > maiorLitros) {
      maiorLitros = total;
      maiorChave = chave;
    }
  }

  const volumeAnt = somar(anterior.map((s) => s.litros));
  const custoAnt = somar(anterior.map((s) => s.valorTotal));
  const consumidoresAnt = new Set(anterior.map((s) => chaveConsumidor(s, modo)).filter((c): c is string => c !== null));
  const rPorL = volume > 0 ? custo / volume : 0;
  const rPorLAnt = volumeAnt > 0 ? custoAnt / volumeAnt : 0;

  return {
    volume,
    custo,
    rPorL,
    qtdConsumidores: porConsumidor.size,
    maiorChave,
    maiorLitros,
    maiorPct: volume > 0 ? (maiorLitros / volume) * 100 : 0,
    deltaVolume: pctChange(volume, volumeAnt),
    deltaCusto: pctChange(custo, custoAnt),
    deltaRpL: rPorLAnt > 0 ? pctChange(rPorL, rPorLAnt) : 0,
    deltaConsumidores: pctChange(porConsumidor.size, consumidoresAnt.size),
    diffVolume: somar([volume, -volumeAnt]),
    diffConsumidores: porConsumidor.size - consumidoresAnt.size,
    qtdSaidasAnt: anterior.length,
    qtdConsumidoresAnt: consumidoresAnt.size,
    qtdSaidas: noPeriodo.length,
    qtdSentinela: noPeriodo.filter((s) => s.equipamentoId === EQUIPAMENTO_DESCONHECIDO).length,
    volumeSentinela: somar(noPeriodo.filter((s) => s.equipamentoId === EQUIPAMENTO_DESCONHECIDO).map((s) => s.litros)),
  };
}

export interface LinhaPainel {
  id: string;
  litros: number;
  custo: number;
  qtd: number;
  /** % do total da métrica do quadro (litros no mix, custo nas obras). */
  pct: number;
}

function agrupar(saidas: readonly SaidaBase[], chave: (s: SaidaBase) => string | null) {
  const grupos = new Map<string, SaidaBase[]>();
  for (const s of saidas) {
    const id = chave(s);
    if (id === null) continue;
    const lista = grupos.get(id) ?? [];
    lista.push(s);
    grupos.set(id, lista);
  }
  return [...grupos.entries()].map(([id, lista]) => ({
    id,
    litros: somar(lista.map((s) => s.litros)),
    custo: somar(lista.map((s) => s.valorTotal)),
    qtd: lista.length,
  }));
}

/** MixCombustivel: litros e custo por combustível, % dos litros, maior primeiro. */
export function mixCombustivel(saidas: readonly SaidaBase[]): LinhaPainel[] {
  const linhas = agrupar(saidas, (s) => s.tipoCombustivel || "_outros");
  const total = somar(linhas.map((l) => l.litros));
  return linhas
    .map((l) => ({ ...l, pct: total > 0 ? (l.litros / total) * 100 : 0 }))
    .sort((a, b) => b.litros - a.litros);
}

/** Id do grupo "Não identificado" no top de equipamentos (o `_naoid` da origem). */
export const ID_NAO_IDENTIFICADO = "_naoid";

/**
 * TopEquipamentos (próprios) ou TopCarretas (placa), os 10 com mais litros. O sentinela
 * entra como "Não identificado", como na origem.
 */
export function topConsumidores(saidas: readonly SaidaBase[], modo: Modo, topN = 10): LinhaPainel[] {
  const chave =
    modo === "proprios"
      ? (s: SaidaBase) => (s.equipamentoId === EQUIPAMENTO_DESCONHECIDO ? ID_NAO_IDENTIFICADO : s.equipamentoId)
      : (s: SaidaBase) => (s.placa || "").trim() || null;
  const linhas = agrupar(saidas, chave);
  const total = somar(linhas.map((l) => l.litros));
  return linhas
    .map((l) => ({ ...l, pct: total > 0 ? (l.litros / total) * 100 : 0 }))
    .sort((a, b) => b.litros - a.litros)
    .slice(0, topN);
}

/** Id do grupo "Sem obra" (o `_sem` da origem). */
export const ID_SEM_OBRA = "_sem";

/** CustoPorObra: custo por obra (a saída inteira na obra dela), % do custo, maior primeiro. */
export function custoPorObra(saidas: readonly SaidaBase[]): LinhaPainel[] {
  const linhas = agrupar(saidas, (s) => s.obraId ?? ID_SEM_OBRA);
  const total = somar(linhas.map((l) => l.custo));
  return linhas
    .sort((a, b) => b.custo - a.custo)
    .map((l) => ({ ...l, pct: total > 0 ? (l.custo / total) * 100 : 0 }));
}

/** Nível em % da capacidade (acima de 100 aparece como está: é sinal de cadastro errado). Sem capacidade, null. */
export function percentualDoTanque(nivel: number, capacidade: number): number | null {
  if (!(capacidade > 0)) return null;
  return Math.round((nivel / capacidade) * 1000) / 10;
}
