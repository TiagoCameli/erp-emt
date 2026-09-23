import { EQUIPAMENTO_DESCONHECIDO, type Modo, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import { ID_NAO_IDENTIFICADO, pctChange } from "@/modules/combustivel/painel/calculo";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * As contas das abas analíticas da origem (v2/consumidores, v2/obras, v2/fornecedores):
 * a linha de KPIs e o ranking de cada aba. Módulo puro, testado em calculo.test.ts.
 *
 * Todas as funções recebem a lista JÁ RECORTADA (modo, período e, quando existir, a barra
 * de filtros global): quem recorta é a página. Assim o filtro global entra sem mexer aqui.
 *
 * Mesmas fórmulas da origem, linha a linha. Diferença só de aritmética, a mesma do painel:
 * as somas são em inteiros de décimo de milésimo (`somarValoresOperacionais`), porque o
 * banco guarda 4 casas e somar centenas de saídas em float erra a última.
 */

const somar = somarValoresOperacionais;

export { ID_NAO_IDENTIFICADO };

/** O mínimo de dias com valor para a origem desenhar a tendência ("poucos pts" abaixo disso). */
export const MINIMO_PONTOS_TENDENCIA = 4;

/**
 * `bucketByDia` da origem: um valor por dia de [de, ate], dias sem dado com 0 (série
 * contínua). O dia vem do relógio de parede ("AAAA-MM-DDTHH:MM:SS"), então é o `slice`.
 */
export function porDia<T>(
  itens: readonly T[],
  dia: (item: T) => string,
  valor: (item: T) => number,
  de: string,
  ate: string,
): number[] {
  const acumulado = new Map<string, number[]>();
  for (const item of itens) {
    const d = dia(item).slice(0, 10);
    if (d < de || d > ate) continue;
    const lista = acumulado.get(d) ?? [];
    lista.push(valor(item));
    acumulado.set(d, lista);
  }
  const serie: number[] = [];
  const [a, m, d] = de.split("-").map(Number);
  const fim = ate;
  for (let t = Date.UTC(a!, m! - 1, d!); ; t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso > fim) break;
    serie.push(somar(acumulado.get(iso) ?? []));
  }
  return serie;
}

/** A tendência tem pontos suficientes (a origem conta os dias com valor > 0). */
export function temPontosDeTendencia(serie: readonly number[]): boolean {
  return serie.filter((v) => v > 0).length >= MINIMO_PONTOS_TENDENCIA;
}

/**
 * O chip de contagem da origem ("Equipamentos ativos", "Obras ativas", "Fornecedores
 * ativos"): com base anterior menor que 5 e alguma diferença, mostra "+N"/"−N" em vez do %.
 */
export function chipDeContagem(atual: number, anterior: number): { tipo: "absoluto"; valor: number } | { tipo: "percentual"; valor: number } {
  const diferenca = atual - anterior;
  if (anterior < 5 && Math.abs(diferenca) > 0) return { tipo: "absoluto", valor: diferenca };
  return { tipo: "percentual", valor: pctChange(atual, anterior) };
}

// ---------------------------------------------------------------------------
// Equipamentos / Carretas (ConsumidoresTab)
// ---------------------------------------------------------------------------

/** Chave do consumidor como a origem agrupa: equipamento (sentinela vira `_naoid`) ou placa. */
export function chaveDoConsumidor(s: SaidaBase, modo: Modo): string | null {
  if (modo === "proprios") return s.equipamentoId === EQUIPAMENTO_DESCONHECIDO ? ID_NAO_IDENTIFICADO : s.equipamentoId || null;
  return (s.placa || "").trim() || null;
}

export interface KpisConsumidores {
  volume: number;
  custo: number;
  /** Distintos SEM o sentinela (a origem mede equipamentos cadastrados). */
  qtdConsumidores: number;
  qtdConsumidoresAnt: number;
  /** Saídas no sentinela: o "+N saídas sem ID" do card. */
  qtdSentinela: number;
  /** Consumidor com mais litros (pode ser `_naoid`); null sem consumidor. */
  topChave: string | null;
  topLitros: number;
  topPct: number;
  deltaVolume: number;
  deltaCusto: number;
  chipConsumidores: ReturnType<typeof chipDeContagem>;
  sparkVolume: number[];
  sparkCusto: number[];
}

/** KpisRowConsumidores da origem. */
export function kpisConsumidores(
  noPeriodo: readonly SaidaBase[],
  anterior: readonly SaidaBase[],
  modo: Modo,
  de: string,
  ate: string,
): KpisConsumidores {
  const consumidores = new Set<string>();
  const litrosPorConsumidor = new Map<string, number[]>();
  let qtdSentinela = 0;
  for (const s of noPeriodo) {
    const chave = chaveDoConsumidor(s, modo);
    if (!chave) continue;
    if (chave !== ID_NAO_IDENTIFICADO) consumidores.add(chave);
    else qtdSentinela += 1;
    const lista = litrosPorConsumidor.get(chave) ?? [];
    lista.push(s.litros);
    litrosPorConsumidor.set(chave, lista);
  }

  // Ordem de inserção e troca só com "maior que": no empate fica o primeiro, como na origem.
  let topChave: string | null = null;
  let topLitros = 0;
  for (const [chave, litros] of litrosPorConsumidor) {
    const total = somar(litros);
    if (total > topLitros) {
      topLitros = total;
      topChave = chave;
    }
  }

  const volume = somar(noPeriodo.map((s) => s.litros));
  const custo = somar(noPeriodo.map((s) => s.valorTotal));
  const consumidoresAnt = new Set<string>();
  for (const s of anterior) {
    const chave = chaveDoConsumidor(s, modo);
    if (chave && chave !== ID_NAO_IDENTIFICADO) consumidoresAnt.add(chave);
  }

  return {
    volume,
    custo,
    qtdConsumidores: consumidores.size,
    qtdConsumidoresAnt: consumidoresAnt.size,
    qtdSentinela,
    topChave,
    topLitros,
    topPct: volume > 0 ? (topLitros / volume) * 100 : 0,
    deltaVolume: pctChange(volume, somar(anterior.map((s) => s.litros))),
    deltaCusto: pctChange(custo, somar(anterior.map((s) => s.valorTotal))),
    chipConsumidores: chipDeContagem(consumidores.size, consumidoresAnt.size),
    sparkVolume: porDia(noPeriodo, (s) => s.data, (s) => s.litros, de, ate),
    sparkCusto: porDia(noPeriodo, (s) => s.data, (s) => s.valorTotal, de, ate),
  };
}

export interface LinhaConsumidor {
  /** Equipamento (id do formato da origem), placa, ou `_naoid`. */
  id: string;
  sentinela: boolean;
  /** Transportadora da primeira saída da placa que tem uma (a `meta` da origem no modo carretas). */
  transportadoraId: string | null;
  litros: number;
  custo: number;
  /** custo ÷ litros; 0 sem litros. */
  rPorL: number;
  qtdSaidas: number;
  /** % dos litros do ranking. */
  pctTotal: number;
  spark: number[];
}

/** ConsumidoresRankingTable da origem: todos os consumidores, mais litros primeiro. */
export function rankingConsumidores(noPeriodo: readonly SaidaBase[], modo: Modo, de: string, ate: string): LinhaConsumidor[] {
  const grupos = new Map<string, SaidaBase[]>();
  for (const s of noPeriodo) {
    const chave = chaveDoConsumidor(s, modo);
    if (!chave) continue;
    const lista = grupos.get(chave) ?? [];
    lista.push(s);
    grupos.set(chave, lista);
  }
  const totalLitros = somar(noPeriodo.filter((s) => chaveDoConsumidor(s, modo) !== null).map((s) => s.litros));
  const linhas: LinhaConsumidor[] = [];
  for (const [id, saidas] of grupos) {
    const litros = somar(saidas.map((s) => s.litros));
    const custo = somar(saidas.map((s) => s.valorTotal));
    linhas.push({
      id,
      sentinela: id === ID_NAO_IDENTIFICADO,
      transportadoraId: modo === "carretas" ? (saidas.find((s) => s.transportadoraId)?.transportadoraId ?? null) : null,
      litros,
      custo,
      rPorL: litros > 0 ? custo / litros : 0,
      qtdSaidas: saidas.length,
      pctTotal: totalLitros > 0 ? (litros / totalLitros) * 100 : 0,
      spark: porDia(saidas, (s) => s.data, (s) => s.litros, de, ate),
    });
  }
  // `sort` estável: no empate de litros vale a ordem de chegada, como na origem.
  return linhas.sort((a, b) => b.litros - a.litros);
}

// ---------------------------------------------------------------------------
// Obras (ObrasTab)
// ---------------------------------------------------------------------------

export interface KpisObras {
  volume: number;
  custo: number;
  qtdObras: number;
  qtdObrasAnt: number;
  topObraId: string | null;
  topLitros: number;
  topPct: number;
  deltaVolume: number;
  deltaCusto: number;
  chipObras: ReturnType<typeof chipDeContagem>;
  sparkVolume: number[];
  sparkCusto: number[];
}

/** KpisRowObras da origem. Volume e custo contam TODAS as saídas do recorte, com ou sem obra. */
export function kpisObras(noPeriodo: readonly SaidaBase[], anterior: readonly SaidaBase[], de: string, ate: string): KpisObras {
  const litrosPorObra = new Map<string, number[]>();
  for (const s of noPeriodo) {
    if (!s.obraId) continue;
    const lista = litrosPorObra.get(s.obraId) ?? [];
    lista.push(s.litros);
    litrosPorObra.set(s.obraId, lista);
  }
  let topObraId: string | null = null;
  let topLitros = 0;
  for (const [id, litros] of litrosPorObra) {
    const total = somar(litros);
    if (total > topLitros) {
      topLitros = total;
      topObraId = id;
    }
  }
  const volume = somar(noPeriodo.map((s) => s.litros));
  const custo = somar(noPeriodo.map((s) => s.valorTotal));
  const obrasAnt = new Set(anterior.map((s) => s.obraId).filter((id): id is string => Boolean(id)));
  return {
    volume,
    custo,
    qtdObras: litrosPorObra.size,
    qtdObrasAnt: obrasAnt.size,
    topObraId,
    topLitros,
    topPct: volume > 0 ? (topLitros / volume) * 100 : 0,
    deltaVolume: pctChange(volume, somar(anterior.map((s) => s.litros))),
    deltaCusto: pctChange(custo, somar(anterior.map((s) => s.valorTotal))),
    chipObras: chipDeContagem(litrosPorObra.size, obrasAnt.size),
    sparkVolume: porDia(noPeriodo, (s) => s.data, (s) => s.litros, de, ate),
    sparkCusto: porDia(noPeriodo, (s) => s.data, (s) => s.valorTotal, de, ate),
  };
}

export interface LinhaObra {
  id: string;
  litros: number;
  custo: number;
  rPorL: number;
  /** Equipamentos distintos na obra, sem o sentinela. */
  qtdEquipamentos: number;
  /** % dos litros COM obra (saída sem obra fica fora do ranking e do denominador, como na origem). */
  pctTotal: number;
  spark: number[];
}

/** ObrasRankingTable da origem. */
export function rankingObras(noPeriodo: readonly SaidaBase[], de: string, ate: string): LinhaObra[] {
  const grupos = new Map<string, SaidaBase[]>();
  for (const s of noPeriodo) {
    if (!s.obraId) continue;
    const lista = grupos.get(s.obraId) ?? [];
    lista.push(s);
    grupos.set(s.obraId, lista);
  }
  const totalLitros = somar(noPeriodo.filter((s) => s.obraId).map((s) => s.litros));
  const linhas: LinhaObra[] = [];
  for (const [id, saidas] of grupos) {
    const litros = somar(saidas.map((s) => s.litros));
    const custo = somar(saidas.map((s) => s.valorTotal));
    const equipamentos = new Set(
      saidas.map((s) => s.equipamentoId).filter((e): e is string => Boolean(e) && e !== EQUIPAMENTO_DESCONHECIDO),
    );
    linhas.push({
      id,
      litros,
      custo,
      rPorL: litros > 0 ? custo / litros : 0,
      qtdEquipamentos: equipamentos.size,
      pctTotal: totalLitros > 0 ? (litros / totalLitros) * 100 : 0,
      spark: porDia(saidas, (s) => s.data, (s) => s.litros, de, ate),
    });
  }
  return linhas.sort((a, b) => b.litros - a.litros);
}

// ---------------------------------------------------------------------------
// Fornecedores (FornecedoresTab), sobre as ENTRADAS
// ---------------------------------------------------------------------------

/** Uma entrada (compra) como a aba Fornecedores lê. */
export interface EntradaAnalitica {
  id: string;
  /** Relógio de parede de Rio Branco, "AAAA-MM-DDTHH:MM:SS". */
  data: string;
  tanqueId: string;
  insumoId: string;
  /** A origem agrupa pelo NOME do fornecedor; aqui pelo id do cadastro (dois nomes iguais são duas empresas). */
  fornecedorId: string | null;
  fornecedorNome: string | null;
  litros: number;
  valorTotal: number;
}

/** O recorte da origem para entradas: só o período (entrada não tem consumidor nem obra). */
export function entradasDoPeriodo<T extends { data: string }>(entradas: readonly T[], de: string, ate: string): T[] {
  return entradas.filter((e) => {
    const dia = e.data.slice(0, 10);
    return dia >= de && dia <= ate;
  });
}

export interface KpisFornecedores {
  volume: number;
  custo: number;
  qtdFornecedores: number;
  qtdFornecedoresAnt: number;
  /** Só com 2+ fornecedores no período (com um só, "o mais barato" é ruído). */
  melhorFornecedorId: string | null;
  /** R$/L ponderado (custo ÷ litros do fornecedor), não a entrada mais barata. */
  melhorRPorL: number | null;
  deltaVolume: number;
  deltaCusto: number;
  chipFornecedores: ReturnType<typeof chipDeContagem>;
  sparkVolume: number[];
  sparkCusto: number[];
}

/** KpisRowFornecedores da origem. */
export function kpisFornecedores(
  noPeriodo: readonly EntradaAnalitica[],
  anterior: readonly EntradaAnalitica[],
  de: string,
  ate: string,
): KpisFornecedores {
  const porFornecedor = new Map<string, EntradaAnalitica[]>();
  for (const e of noPeriodo) {
    if (!e.fornecedorId) continue;
    const lista = porFornecedor.get(e.fornecedorId) ?? [];
    lista.push(e);
    porFornecedor.set(e.fornecedorId, lista);
  }
  let melhorFornecedorId: string | null = null;
  let melhorRPorL: number | null = null;
  if (porFornecedor.size >= 2) {
    for (const [id, entradas] of porFornecedor) {
      const litros = somar(entradas.map((e) => e.litros));
      if (litros <= 0) continue;
      const rpl = somar(entradas.map((e) => e.valorTotal)) / litros;
      if (melhorRPorL === null || rpl < melhorRPorL) {
        melhorRPorL = rpl;
        melhorFornecedorId = id;
      }
    }
  }
  const volume = somar(noPeriodo.map((e) => e.litros));
  const custo = somar(noPeriodo.map((e) => e.valorTotal));
  const fornecedoresAnt = new Set(anterior.map((e) => e.fornecedorId).filter((id): id is string => Boolean(id)));
  return {
    volume,
    custo,
    qtdFornecedores: porFornecedor.size,
    qtdFornecedoresAnt: fornecedoresAnt.size,
    melhorFornecedorId,
    melhorRPorL,
    deltaVolume: pctChange(volume, somar(anterior.map((e) => e.litros))),
    deltaCusto: pctChange(custo, somar(anterior.map((e) => e.valorTotal))),
    chipFornecedores: chipDeContagem(porFornecedor.size, fornecedoresAnt.size),
    sparkVolume: porDia(noPeriodo, (e) => e.data, (e) => e.litros, de, ate),
    sparkCusto: porDia(noPeriodo, (e) => e.data, (e) => e.valorTotal, de, ate),
  };
}

export interface LinhaFornecedor {
  id: string;
  qtdCompras: number;
  litros: number;
  custo: number;
  /** Menor e maior R$/L de UMA entrada (entradas com litros); 0 sem nenhuma. */
  rPorLMin: number;
  /** Ponderado: custo ÷ litros. */
  rPorLMedio: number;
  rPorLMax: number;
  pctTotal: number;
  /** R$/L por dia com compra (dias sem compra saem, senão rebaixam a linha). */
  spark: number[];
}

/** FornecedoresRankingTable da origem. */
export function rankingFornecedores(noPeriodo: readonly EntradaAnalitica[], de: string, ate: string): LinhaFornecedor[] {
  const grupos = new Map<string, EntradaAnalitica[]>();
  for (const e of noPeriodo) {
    if (!e.fornecedorId) continue;
    const lista = grupos.get(e.fornecedorId) ?? [];
    lista.push(e);
    grupos.set(e.fornecedorId, lista);
  }
  const totalLitros = somar(noPeriodo.filter((e) => e.fornecedorId).map((e) => e.litros));
  const linhas: LinhaFornecedor[] = [];
  for (const [id, entradas] of grupos) {
    const litros = somar(entradas.map((e) => e.litros));
    const custo = somar(entradas.map((e) => e.valorTotal));
    const precos = entradas.filter((e) => e.litros > 0).map((e) => e.valorTotal / e.litros);
    const litrosDia = porDia(entradas, (e) => e.data, (e) => e.litros, de, ate);
    const custoDia = porDia(entradas, (e) => e.data, (e) => e.valorTotal, de, ate);
    const spark = litrosDia.map((l, i) => (l > 0 ? custoDia[i]! / l : 0)).filter((v) => v > 0);
    linhas.push({
      id,
      qtdCompras: entradas.length,
      litros,
      custo,
      rPorLMin: precos.length > 0 ? Math.min(...precos) : 0,
      rPorLMedio: litros > 0 ? custo / litros : 0,
      rPorLMax: precos.length > 0 ? Math.max(...precos) : 0,
      pctTotal: totalLitros > 0 ? (litros / totalLitros) * 100 : 0,
      spark,
    });
  }
  return linhas.sort((a, b) => b.litros - a.litros);
}
