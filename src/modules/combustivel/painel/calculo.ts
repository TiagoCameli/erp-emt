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

// ---------------------------------------------------------------------------
// Sparklines, evolução, heatmap, fornecedores e últimas saídas (v2/visao-geral)
// ---------------------------------------------------------------------------

/** "AAAA-MM-DD" -> milissegundos UTC do dia (calendário puro, sem fuso). */
function diaUtc(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a!, m! - 1, d!);
}

const UM_DIA = 86_400_000;

function isoDoDia(tempo: number): string {
  return new Date(tempo).toISOString().slice(0, 10);
}

/** Os dias de [de, ate], inclusivos. */
export function diasDoPeriodo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let t = diaUtc(de), fim = diaUtc(ate); t <= fim; t += UM_DIA) dias.push(isoDoDia(t));
  return dias;
}

/**
 * O `bucketByDia` da origem: um valor por dia do período, zero no dia sem saída (a série
 * fica contínua). O dia é o do relógio de parede da saída.
 */
export function serieDiaria(
  saidas: readonly SaidaBase[],
  de: string,
  ate: string,
  valor: (s: SaidaBase) => number,
): number[] {
  const porDia = new Map<string, number[]>();
  for (const s of saidas) {
    const dia = s.data.slice(0, 10);
    if (dia < de || dia > ate) continue;
    const lista = porDia.get(dia) ?? [];
    lista.push(valor(s));
    porDia.set(dia, lista);
  }
  return diasDoPeriodo(de, ate).map((dia) => somar(porDia.get(dia) ?? []));
}

export interface SparksKpis {
  volume: number[];
  custo: number[];
  /** R$/L por dia, SEM os dias zerados (dia sem saída puxaria a linha para zero). */
  rPorL: number[];
  /** Média do R$/L diário; 0 esconde o chip do R$/L, como na origem. */
  mediaRpL: number;
}

/** As sparklines dos KPIs da origem (KpisRow): volume, custo e R$/L por dia. */
export function sparksDosKpis(saidas: readonly SaidaBase[], de: string, ate: string): SparksKpis {
  const volume = serieDiaria(saidas, de, ate, (s) => s.litros);
  const custo = serieDiaria(saidas, de, ate, (s) => s.valorTotal);
  const rPorL = volume
    .map((litros, i) => (litros > 0 ? (custo[i] ?? 0) / litros : 0))
    .filter((v) => Number.isFinite(v) && v > 0);
  const mediaRpL = rPorL.length > 0 ? rPorL.reduce((acc, v) => acc + v, 0) / rPorL.length : 0;
  return { volume, custo, rPorL, mediaRpL };
}

/** A sparkline só aparece com 4+ pontos acima de zero (menos que isso é ruído), como na origem. */
export function sparkVisivel(serie: readonly number[] | undefined): boolean {
  return (serie ?? []).filter((v) => v > 0).length >= 4;
}

export type Granularidade = "dia" | "semana" | "mes";

/**
 * A granularidade automática da Evolução temporal (origem): até 92 dias (qualquer
 * trimestre), por dia; até 731 (dois anos), por semana; acima, por mês.
 */
export function autoGranularidade(de: string, ate: string): Granularidade {
  const dias = Math.round((diaUtc(ate) - diaUtc(de)) / UM_DIA) + 1;
  if (dias > 731) return "mes";
  if (dias > 92) return "semana";
  return "dia";
}

export interface BaldeEvolucao {
  /** Dia, segunda-feira da semana ou "AAAA-MM". */
  chave: string;
  rotulo: string;
  /** Início e fim do balde (a semana e o mês podem passar das pontas do período). */
  de: string;
  ate: string;
  litros: number;
  custo: number;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "dd/mm". */
function diaMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Segunda-feira da semana (semana ISO começa na segunda, como a origem). */
export function inicioDaSemana(dia: string): string {
  const t = diaUtc(dia);
  const recuo = (new Date(t).getUTCDay() + 6) % 7;
  return isoDoDia(t - recuo * UM_DIA);
}

function fimDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  return isoDoDia(Date.UTC(a!, m!, 0));
}

/**
 * O `bucketize` da origem (EvolucaoTemporal): litros e custo por dia, semana ou mês, com os
 * baldes vazios do período já criados (o eixo não pula dia sem saída).
 */
export function evolucaoTemporal(
  saidas: readonly SaidaBase[],
  de: string,
  ate: string,
  granularidade: Granularidade,
): BaldeEvolucao[] {
  const baldes = new Map<string, { balde: BaldeEvolucao; litros: number[]; custo: number[] }>();
  const chaveDoDia = (dia: string) =>
    granularidade === "dia" ? dia : granularidade === "semana" ? inicioDaSemana(dia) : dia.slice(0, 7);

  for (const dia of diasDoPeriodo(de, ate)) {
    const chave = chaveDoDia(dia);
    if (baldes.has(chave)) continue;
    let balde: BaldeEvolucao;
    if (granularidade === "dia") {
      balde = { chave, rotulo: diaMes(dia), de: dia, ate: dia, litros: 0, custo: 0 };
    } else if (granularidade === "semana") {
      const fim = isoDoDia(diaUtc(chave) + 6 * UM_DIA);
      balde = { chave, rotulo: `${diaMes(chave)}–${diaMes(fim)}`, de: chave, ate: fim, litros: 0, custo: 0 };
    } else {
      const rotulo = `${MESES_CURTOS[Number(dia.slice(5, 7)) - 1]}/${dia.slice(2, 4)}`;
      balde = { chave, rotulo, de: `${chave}-01`, ate: fimDoMes(dia), litros: 0, custo: 0 };
    }
    baldes.set(chave, { balde, litros: [], custo: [] });
  }

  for (const s of saidas) {
    const alvo = baldes.get(chaveDoDia(s.data.slice(0, 10)));
    if (!alvo) continue;
    alvo.litros.push(s.litros);
    alvo.custo.push(s.valorTotal);
  }

  return [...baldes.values()]
    .map(({ balde, litros, custo }) => ({ ...balde, litros: somar(litros), custo: somar(custo) }))
    .sort((a, b) => a.de.localeCompare(b.de));
}

export interface HeatmapDiaHora {
  /** [dia da semana 0=domingo..6=sábado][hora 0..23] = quantidade de saídas. */
  matriz: number[][];
  maximo: number;
}

/**
 * O DiaHoraHeatmap da origem: quantas saídas por dia da semana × hora, no relógio de parede
 * (a origem lia `new Date(data)` de um texto sem fuso, que é o relógio de parede também).
 */
export function heatmapDiaHora(saidas: readonly SaidaBase[]): HeatmapDiaHora {
  const matriz = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let maximo = 0;
  for (const s of saidas) {
    const dia = s.data.slice(0, 10);
    const hora = Number(s.data.slice(11, 13));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || s.data.length < 13 || !Number.isInteger(hora) || hora < 0 || hora > 23) {
      continue;
    }
    const linha = matriz[new Date(diaUtc(dia)).getUTCDay()]!;
    linha[hora] = (linha[hora] ?? 0) + 1;
    if (linha[hora]! > maximo) maximo = linha[hora]!;
  }
  return { matriz, maximo };
}

/** O mínimo de uma entrada para o R$/L por fornecedor. */
export interface EntradaParaPreco {
  fornecedorId: string | null;
  litros: number;
  valorTotal: number;
}

export interface PrecoFornecedor {
  id: string;
  litros: number;
  custo: number;
  /** custo ÷ litros. */
  rPorL: number;
  qtd: number;
}

/**
 * O CustoPorFornecedor da origem (das ENTRADAS, não das saídas): R$/L de cada fornecedor,
 * do mais barato ao mais caro, e a média ponderada do período (total R$ ÷ total L), que é
 * a linha tracejada. Entrada sem fornecedor fica fora das barras e da média.
 */
export function precoPorFornecedor(entradas: readonly EntradaParaPreco[]): {
  linhas: PrecoFornecedor[];
  media: number;
} {
  const grupos = new Map<string, EntradaParaPreco[]>();
  for (const e of entradas) {
    if (!e.fornecedorId) continue;
    const lista = grupos.get(e.fornecedorId) ?? [];
    lista.push(e);
    grupos.set(e.fornecedorId, lista);
  }
  const linhas = [...grupos.entries()].map(([id, lista]) => {
    const litros = somar(lista.map((e) => e.litros));
    const custo = somar(lista.map((e) => e.valorTotal));
    return { id, litros, custo, rPorL: litros > 0 ? custo / litros : 0, qtd: lista.length };
  });
  linhas.sort((a, b) => a.rPorL - b.rPorL);
  const totalLitros = somar(linhas.map((l) => l.litros));
  const totalCusto = somar(linhas.map((l) => l.custo));
  return { linhas, media: totalLitros > 0 ? totalCusto / totalLitros : 0 };
}

/**
 * As `n` saídas mais recentes (UltimosAbastecimentosTable). No mesmo relógio de parede, a
 * de id maior primeiro, para a ordem não mudar entre um carregamento e outro.
 */
export function ultimasSaidas<T extends SaidaBase>(saidas: readonly T[], n = 10): T[] {
  return [...saidas].sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id)).slice(0, n);
}

/**
 * O `niceMax` da origem: um teto de eixo "redondo" com folga de ~10% (200 -> 250,
 * 8470 -> 10000, 0 -> 1).
 */
export function niceMax(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) return 1;
  const comFolga = valor * 1.1;
  const base = 10 ** Math.floor(Math.log10(comFolga));
  const relativo = comFolga / base;
  for (const passo of [1, 2, 2.5, 5, 10]) if (relativo <= passo) return passo * base;
  return 10 * base;
}

/** Os três tamanhos de barra da Evolução temporal, prontos (o botão Dia/Semana/Mês só troca). */
export function evolucaoNasTresGranularidades(
  saidas: readonly SaidaBase[],
  de: string,
  ate: string,
): Record<Granularidade, BaldeEvolucao[]> {
  return {
    dia: evolucaoTemporal(saidas, de, ate, "dia"),
    semana: evolucaoTemporal(saidas, de, ate, "semana"),
    mes: evolucaoTemporal(saidas, de, ate, "mes"),
  };
}
