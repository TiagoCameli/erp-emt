/**
 * Consumo de combustível por veículo (Relatórios > Consumo). Módulo puro: página, Excel,
 * anomalias e testes.
 *
 * Regra do Tiago (27/11/2026, spec vault: projects/erp-emt/spec-odometro-consumo):
 * - o trecho é calculado no banco (`fn_comb_consumo_trechos`): dois abastecimentos SEGUIDOS
 *   do mesmo veículo dentro da janela, os dois com leitura, o segundo sem virada. Os litros
 *   do trecho são os do segundo (o primeiro só marca o ponto de partida). Abastecimento sem
 *   leitura ou virada no meio quebra o trecho: nunca se soma por cima do buraco;
 * - L/km = litros / km, km/L ao lado; L/h = litros / h; R$/km e R$/h pelo `valor_total`
 *   (o custo PEPS do abastecimento);
 * - destaque: consumo X% acima da média do próprio veículo na janela histórica, com um
 *   mínimo de trechos válidos (limites em `configuracoes`, padrão 20%, 6 meses, 3 trechos).
 *
 * Aqui só se SOMA o que o banco já cortou em trechos válidos.
 */

import type { ClasseConsumo } from "@/modules/combustivel/_shared/leituras";
import type { Anomalia } from "@/modules/combustivel/anomalias/detect";
import { mesEmRioBranco } from "@/modules/combustivel/relatorios/periodo";

/** Uma linha de `fn_comb_consumo_trechos`: um abastecimento e o trecho que ele fecha. */
export interface TrechoLinha {
  saidaId: string;
  /** "eq:<equipamento>" ou "pl:<transportadora>:<PLACA>"; null = carreta sem placa. */
  veiculoChave: string | null;
  equipamentoId: string | null;
  transportadoraId: string | null;
  placa: string;
  classe: ClasseConsumo;
  /** ISO. */
  data: string;
  litros: number;
  valorTotal: number;
  odometroKm: number | null;
  horimetroH: number | null;
  virada: boolean;
  kmTrecho: number | null;
  litrosKm: number | null;
  valorKm: number | null;
  diasKm: number | null;
  saltoKm: boolean;
  consumoForaKm: boolean;
  hTrecho: number | null;
  litrosH: number | null;
  valorH: number | null;
  diasH: number | null;
  saltoH: boolean;
  consumoForaH: boolean;
}

export interface ConfigConsumo {
  desvioPercentual: number;
  janelaMeses: number;
  minTrechos: number;
}

export const CONFIG_CONSUMO_PADRAO: ConfigConsumo = { desvioPercentual: 20, janelaMeses: 6, minTrechos: 3 };

export interface ResumoVeiculo {
  chave: string;
  equipamentoId: string | null;
  transportadoraId: string | null;
  placa: string;
  classe: ClasseConsumo;
  leituraInicialKm: number | null;
  leituraFinalKm: number | null;
  leituraInicialH: number | null;
  leituraFinalH: number | null;
  km: number;
  h: number;
  litros: number;
  litrosKm: number;
  litrosH: number;
  valorKm: number;
  valorH: number;
  trechosKm: number;
  trechosH: number;
  abastecimentos: number;
  semLeitura: number;
  lPorKm: number | null;
  kmPorL: number | null;
  lPorH: number | null;
  rPorKm: number | null;
  rPorH: number | null;
}

function razao(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function porData(a: TrechoLinha, b: TrechoLinha): number {
  return a.data === b.data ? a.saidaId.localeCompare(b.saidaId) : a.data.localeCompare(b.data);
}

/** Soma os trechos (já cortados e filtrados) de cada veículo. Ordem: mais litros primeiro. */
export function resumirPorVeiculo(trechos: readonly TrechoLinha[]): ResumoVeiculo[] {
  const grupos = new Map<string, TrechoLinha[]>();
  for (const t of trechos) {
    if (!t.veiculoChave) continue;
    const lista = grupos.get(t.veiculoChave);
    if (lista) lista.push(t);
    else grupos.set(t.veiculoChave, [t]);
  }
  const resumos: ResumoVeiculo[] = [];
  for (const [chave, lista] of grupos) {
    const ordenada = [...lista].sort(porData);
    const comKm = ordenada.filter((t) => t.odometroKm !== null);
    const comH = ordenada.filter((t) => t.horimetroH !== null);
    const primeiro = ordenada[0]!;
    let km = 0, h = 0, litrosKm = 0, litrosH = 0, valorKm = 0, valorH = 0, trechosKm = 0, trechosH = 0;
    let litros = 0, semLeitura = 0;
    for (const t of ordenada) {
      litros += t.litros;
      if (t.odometroKm === null && t.horimetroH === null) semLeitura += 1;
      if (t.kmTrecho !== null) {
        km += t.kmTrecho;
        litrosKm += t.litrosKm ?? 0;
        valorKm += t.valorKm ?? 0;
        trechosKm += 1;
      }
      if (t.hTrecho !== null) {
        h += t.hTrecho;
        litrosH += t.litrosH ?? 0;
        valorH += t.valorH ?? 0;
        trechosH += 1;
      }
    }
    resumos.push({
      chave,
      equipamentoId: primeiro.equipamentoId,
      transportadoraId: primeiro.transportadoraId,
      placa: primeiro.placa,
      classe: primeiro.classe,
      leituraInicialKm: comKm[0]?.odometroKm ?? null,
      leituraFinalKm: comKm.at(-1)?.odometroKm ?? null,
      leituraInicialH: comH[0]?.horimetroH ?? null,
      leituraFinalH: comH.at(-1)?.horimetroH ?? null,
      km,
      h,
      litros,
      litrosKm,
      litrosH,
      valorKm,
      valorH,
      trechosKm,
      trechosH,
      abastecimentos: ordenada.length,
      semLeitura,
      lPorKm: razao(litrosKm, km),
      kmPorL: razao(km, litrosKm),
      lPorH: razao(litrosH, h),
      rPorKm: razao(valorKm, km),
      rPorH: razao(valorH, h),
    });
  }
  return resumos.sort((a, b) => b.litros - a.litros || a.chave.localeCompare(b.chave));
}

export interface MediaGrupo {
  grupo: string;
  veiculos: number;
  km: number;
  h: number;
  lPorKm: number | null;
  kmPorL: number | null;
  lPorH: number | null;
  rPorKm: number | null;
  rPorH: number | null;
}

/** Média ponderada (soma de litros / soma de km) de um conjunto de veículos. */
function mediaDe(grupo: string, resumos: readonly ResumoVeiculo[]): MediaGrupo {
  const soma = (f: (r: ResumoVeiculo) => number) => resumos.reduce((t, r) => t + f(r), 0);
  const km = soma((r) => r.km), h = soma((r) => r.h);
  const litrosKm = soma((r) => r.litrosKm), litrosH = soma((r) => r.litrosH);
  return {
    grupo,
    veiculos: resumos.length,
    km,
    h,
    lPorKm: razao(litrosKm, km),
    kmPorL: razao(km, litrosKm),
    lPorH: razao(litrosH, h),
    rPorKm: razao(soma((r) => r.valorKm), km),
    rPorH: razao(soma((r) => r.valorH), h),
  };
}

/**
 * Médias por tipo: carretas, veículos leves e cada tipo de máquina (o `tipo` do cadastro),
 * e a da frota inteira por último.
 */
export function mediasPorGrupo(
  resumos: readonly ResumoVeiculo[],
  tipoDaMaquina: (r: ResumoVeiculo) => string,
): MediaGrupo[] {
  const grupos = new Map<string, ResumoVeiculo[]>();
  for (const r of resumos) {
    const nome = r.classe === "carreta" ? "Carretas" : r.classe === "veiculo_leve" ? "Veículos leves" : tipoDaMaquina(r);
    const lista = grupos.get(nome);
    if (lista) lista.push(r);
    else grupos.set(nome, [r]);
  }
  const ordem = (g: string) => (g === "Carretas" ? 0 : g === "Veículos leves" ? 1 : 2);
  const medias = [...grupos.entries()]
    .sort(([a], [b]) => ordem(a) - ordem(b) || a.localeCompare(b, "pt-BR"))
    .map(([grupo, lista]) => mediaDe(grupo, lista));
  return resumos.length > 0 ? [...medias, mediaDe("Frota", resumos)] : medias;
}

export interface Destaque {
  /** Quanto acima da média histórica do próprio veículo, em %. */
  kmPercentual: number | null;
  hPercentual: number | null;
}

/**
 * Quem consome acima da própria média histórica. Compara o L/km e o L/h do período com os
 * da janela histórica do mesmo veículo; só com `minTrechos` trechos válidos na janela.
 */
export function destaques(
  periodo: readonly ResumoVeiculo[],
  historico: readonly ResumoVeiculo[],
  config: ConfigConsumo,
): Map<string, Destaque> {
  const hist = new Map(historico.map((r) => [r.chave, r]));
  const resultado = new Map<string, Destaque>();
  for (const r of periodo) {
    const base = hist.get(r.chave);
    if (!base) continue;
    const pct = (atual: number | null, media: number | null, trechos: number) =>
      atual !== null && media !== null && media > 0 && trechos >= config.minTrechos
        ? (atual / media - 1) * 100
        : null;
    const kmPct = pct(r.lPorKm, base.lPorKm, base.trechosKm);
    const hPct = pct(r.lPorH, base.lPorH, base.trechosH);
    const kmPercentual = kmPct !== null && kmPct > config.desvioPercentual ? kmPct : null;
    const hPercentual = hPct !== null && hPct > config.desvioPercentual ? hPct : null;
    if (kmPercentual !== null || hPercentual !== null) resultado.set(r.chave, { kmPercentual, hPercentual });
  }
  return resultado;
}

export interface PontoMensal {
  /** "yyyy-MM". */
  mes: string;
  km: number;
  h: number;
  lPorKm: number | null;
  kmPorL: number | null;
  lPorH: number | null;
}

/** Evolução do consumo do veículo por mês (pelo mês do abastecimento que fecha o trecho). */
export function consumoMensal(trechos: readonly TrechoLinha[]): PontoMensal[] {
  const meses = new Map<string, { km: number; h: number; litrosKm: number; litrosH: number }>();
  for (const t of trechos) {
    if (t.kmTrecho === null && t.hTrecho === null) continue;
    const mes = mesEmRioBranco(t.data);
    const m = meses.get(mes) ?? { km: 0, h: 0, litrosKm: 0, litrosH: 0 };
    if (t.kmTrecho !== null) {
      m.km += t.kmTrecho;
      m.litrosKm += t.litrosKm ?? 0;
    }
    if (t.hTrecho !== null) {
      m.h += t.hTrecho;
      m.litrosH += t.litrosH ?? 0;
    }
    meses.set(mes, m);
  }
  return [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m]) => ({
      mes,
      km: m.km,
      h: m.h,
      lPorKm: razao(m.litrosKm, m.km),
      kmPorL: razao(m.km, m.litrosKm),
      lPorH: razao(m.litrosH, m.h),
    }));
}

function numero(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * D6 (salto de leitura) e D7 (consumo fora do padrão), um por abastecimento, no formato das
 * anomalias da origem. Os limites são os de `configuracoes`, aplicados pelo banco.
 */
export function anomaliasDeLeitura(
  trechos: readonly TrechoLinha[],
  nomeDoVeiculo: (t: TrechoLinha) => string,
  diaDe: (iso: string) => string,
): Anomalia[] {
  const anomalias: Anomalia[] = [];
  for (const t of trechos) {
    const nome = nomeDoVeiculo(t);
    const dia = diaDe(t.data);
    const base = {
      severity: "warning" as const,
      affectedSaidaIds: [t.saidaId],
      ...(t.equipamentoId ? { affectedEquipamentoId: t.equipamentoId } : {}),
      data: dia,
    };
    if (t.saltoKm || t.saltoH) {
      const partes: string[] = [];
      if (t.saltoKm && t.kmTrecho !== null) {
        partes.push(`${numero(t.kmTrecho)} km em ${numero(Math.max(t.diasKm ?? 1, 0), 1)} dia(s)`);
      }
      if (t.saltoH && t.hTrecho !== null) {
        partes.push(`${numero(t.hTrecho, 1)} h em ${numero(Math.max(t.diasH ?? 1, 0), 1)} dia(s)`);
      }
      anomalias.push({
        ...base,
        id: `D6-${t.saidaId}`,
        detector: "D6",
        title: `Salto de leitura: ${nome}`,
        description: `${partes.join(" e ")} desde o abastecimento anterior, acima do plausível para o tipo.`,
        acaoSugerida: "Conferir a leitura do painel. Se trocou o painel ou virou o odômetro, marque a virada na saída",
      });
    }
    if (t.consumoForaKm || t.consumoForaH) {
      const partes: string[] = [];
      if (t.consumoForaKm && t.kmTrecho !== null && t.litrosKm) {
        partes.push(`${numero(t.kmTrecho / t.litrosKm, 2)} km/L`);
      }
      if (t.consumoForaH && t.hTrecho !== null && t.litrosH) {
        partes.push(t.hTrecho > 0 ? `${numero(t.litrosH / t.hTrecho, 1)} L/h` : `${numero(t.litrosH, 2)} L sem hora rodada`);
      }
      anomalias.push({
        ...base,
        id: `D7-${t.saidaId}`,
        detector: "D7",
        title: `Consumo fora do padrão: ${nome}`,
        description: `${partes.join(" e ")} neste trecho.`,
        acaoSugerida: "Conferir os litros e a leitura do painel",
      });
    }
  }
  return anomalias;
}

/** Linha do banco (snake_case, numeric como texto ou número) -> TrechoLinha. */
export function trechoDoBanco(l: {
  saida_id: string;
  veiculo_chave: string | null;
  equipamento_id: string | null;
  transportadora_id: string | null;
  placa: string;
  classe: string;
  data: string;
  litros: number | string;
  valor_total: number | string;
  odometro_km: number | string | null;
  horimetro_h: number | string | null;
  virada: boolean;
  km_trecho: number | string | null;
  litros_km: number | string | null;
  valor_km: number | string | null;
  dias_km: number | string | null;
  salto_km: boolean;
  consumo_fora_km: boolean;
  h_trecho: number | string | null;
  litros_h: number | string | null;
  valor_h: number | string | null;
  dias_h: number | string | null;
  salto_h: boolean;
  consumo_fora_h: boolean;
}): TrechoLinha {
  const n = (v: number | string | null): number | null => (v === null ? null : Number(v));
  const classe = (["carreta", "veiculo_leve", "maquina"] as const).find((c) => c === l.classe) ?? "maquina";
  return {
    saidaId: l.saida_id,
    veiculoChave: l.veiculo_chave,
    equipamentoId: l.equipamento_id,
    transportadoraId: l.transportadora_id,
    placa: l.placa,
    classe,
    data: l.data,
    litros: Number(l.litros),
    valorTotal: Number(l.valor_total),
    odometroKm: n(l.odometro_km),
    horimetroH: n(l.horimetro_h),
    virada: l.virada,
    kmTrecho: n(l.km_trecho),
    litrosKm: n(l.litros_km),
    valorKm: n(l.valor_km),
    diasKm: n(l.dias_km),
    saltoKm: l.salto_km,
    consumoForaKm: l.consumo_fora_km,
    hTrecho: n(l.h_trecho),
    litrosH: n(l.litros_h),
    valorH: n(l.valor_h),
    diasH: n(l.dias_h),
    saltoH: l.salto_h,
    consumoForaH: l.consumo_fora_h,
  };
}
