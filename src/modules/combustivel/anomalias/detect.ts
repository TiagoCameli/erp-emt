/**
 * Detector de anomalias do Combustível, portado LINHA A LINHA de
 * Gestao_Obras/src/components/combustivel/v2/anomalias/detect.ts (Tiago, 24/09/2026:
 * "tudo do combustível tem que ser exatamente igual ao app Gestão Obras").
 *
 * Função pura, sem banco. Mesmos limiares, mesma estatística, mesmas chaves, mesmos ids.
 *
 * 5 detectores:
 *   D1 sentinela       equipamentoId = 'desconhecido'                           atenção
 *   D2 R$/L outlier    saída fora de ±2σ por combustível no período              atenção
 *   D3 volume atípico  saída fora de ±2σ da média dos últimos 90 dias do equip.  atenção
 *   D4 duplicatas      mesmo consumidor + litros + valor + combustível em 5 min  crítica
 *   D5 gap operacional equipamento ativo sem saída em 60 dias (janela fixa)      informação
 *
 * Como a origem calcula (e aqui continua igual):
 * - σ é o desvio POPULACIONAL (divide por n) e a própria saída avaliada ENTRA na
 *   população com que é comparada. n = tamanho do grupo inteiro. n < 5 não acusa.
 * - D2 compara R$/L = valorTotal / litros (não o preço unitário gravado), só litros > 0,
 *   e pula grupo com σ < 0,0001. D3 pula σ < 0,001.
 * - D3 usa o histórico dos 90 dias até HOJE (não os 90 antes da saída), de todas as
 *   saídas de equipamento próprio fora do sentinela, com a saída avaliada dentro.
 * - D4 agrupa por consumidor (equipamento, ou a placa em minúsculas), litros, valor e
 *   combustível; o grupo ancora na primeira saída e para no primeiro fora da janela.
 * - D5 olha a janela fixa de 60 dias até hoje em TODAS as saídas, independente do filtro,
 *   e acusa também equipamento ativo que nunca teve saída.
 * - `data` é o dia (AAAA-MM-DD) do relógio de parede da saída; "hoje" é a data UTC do
 *   relógio (`toISOString`), como na origem.
 *
 * Adaptação necessária ao ERP: o sentinela da origem (a linha de equipamentos com id
 * 'desconhecido', inativa) no ERP é o equipamento "Outros". Quem monta a entrada troca o
 * id do "Outros" por EQUIPAMENTO_DESCONHECIDO e tira o "Outros" da lista de equipamentos
 * (na origem ele é inativo, então o D5 também não o via). Ver `base.ts`.
 *
 * Diferença de texto (só exibição): litros aparecem com 2 casas (regra do app para
 * litros; a origem mostrava inteiro) e o "—" da origem virou texto, pela regra de UI do ERP.
 */

export const EQUIPAMENTO_DESCONHECIDO = "desconhecido";

export type Severidade = "info" | "warning" | "critical";
export type DetectorId = "D1" | "D2" | "D3" | "D4" | "D5";

export interface Anomalia {
  /**
   * Id determinístico: a mesma anomalia recalculada vira o mesmo id.
   * D1/D2/D3 por saída, D4 pelo grupo, D5 por equipamento.
   */
  id: string;
  severity: Severidade;
  detector: DetectorId;
  title: string;
  description: string;
  /** Saídas envolvidas. */
  affectedSaidaIds: string[];
  affectedEquipamentoId?: string;
  affectedObraId?: string;
  /** Dia AAAA-MM-DD da saída relacionada (ou hoje no D5 sem histórico). */
  data: string;
  acaoSugerida?: string;
}

/** O que o detector lê de uma saída (os mesmos campos da SaidaCombustivel da origem). */
export interface SaidaDeteccao {
  id: string;
  /** Relógio de parede da saída, "AAAA-MM-DDTHH:MM:SS" (a coluna `data` da origem). */
  data: string;
  tipoConsumidor: string;
  equipamentoId: string | null;
  placa: string | null;
  obraId: string | null;
  tipoCombustivel: string;
  litros: number;
  valorTotal: number;
}

export interface EquipamentoDeteccao {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface DetectInput {
  /** Saídas no período do filtro (recorte da tela). D1, D2 e D4 trabalham aqui. */
  saidasNoPeriodo: readonly SaidaDeteccao[];
  /** TODAS as saídas (não excluídas). D3 precisa do histórico de 90 dias e o D5, de 60. */
  saidasTodas: readonly SaidaDeteccao[];
  equipamentos: readonly EquipamentoDeteccao[];
  /** id do insumo -> nome do combustível, para as mensagens. */
  combustivelNome: ReadonlyMap<string, string>;
  /** id da obra -> nome, para as mensagens. */
  obraNome: ReadonlyMap<string, string>;
  /** O relógio. Padrão: agora. Parâmetro só para o teste fixar o dia. */
  agora?: Date;
}

export const MIN_SAMPLES = 5;
export const SIGMA_THRESHOLD = 2;
export const DUP_WINDOW_MS = 5 * 60 * 1000;
export const D5_GAP_DAYS = 60;
export const D3_HIST_DAYS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

function isoToday(agora: Date): string {
  return agora.toISOString().slice(0, 10);
}

/** A origem faz `setDate(getDate() - dias)` e `toISOString`: sem horário de verão, é isto. */
function daysAgoIso(agora: Date, days: number): string {
  return new Date(agora.getTime() - days * DIA_MS).toISOString().slice(0, 10);
}

function meanStd(values: number[]): { mean: number; sigma: number } {
  if (values.length === 0) return { mean: 0, sigma: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, sigma: Math.sqrt(variance) };
}

function fmtNum(n: number, dec: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtBRL(n: number, dec = 2): string {
  return `R$ ${fmtNum(n, dec)}`;
}

/** Litros com 2 casas (regra do app; a origem usava `fmtNum(litros, 0)`). */
function fmtLitros(n: number): string {
  return fmtNum(n, 2);
}

// ────────────────────────────────────────────────────────────────────
// D1: sentinela sem equipamento (equipamento próprio no "desconhecido")
// ────────────────────────────────────────────────────────────────────

function detectD1(input: DetectInput): Anomalia[] {
  const sentinels = input.saidasNoPeriodo.filter(
    (s) => s.tipoConsumidor === "equipamento_proprio" && s.equipamentoId === EQUIPAMENTO_DESCONHECIDO,
  );
  return sentinels.map((s) => {
    const obraNm = s.obraId ? (input.obraNome.get(s.obraId) ?? "não encontrada") : "não informada";
    return {
      id: `D1-${s.id}`,
      severity: "warning" as const,
      detector: "D1" as const,
      title: "Saída sem equipamento identificado",
      description: `${fmtLitros(s.litros)} L · ${fmtBRL(s.valorTotal)} · obra ${obraNm}`,
      affectedSaidaIds: [s.id],
      affectedObraId: s.obraId ?? undefined,
      data: s.data.slice(0, 10),
      acaoSugerida: "Atribuir o equipamento à saída",
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// D2: R$/L fora da faixa por combustível (±2σ no período)
// ────────────────────────────────────────────────────────────────────

function detectD2(input: DetectInput): Anomalia[] {
  const byCombustivel = new Map<string, SaidaDeteccao[]>();
  for (const s of input.saidasNoPeriodo) {
    if (s.litros <= 0) continue;
    const list = byCombustivel.get(s.tipoCombustivel) ?? [];
    list.push(s);
    byCombustivel.set(s.tipoCombustivel, list);
  }

  const results: Anomalia[] = [];
  for (const [combId, saidas] of byCombustivel) {
    if (saidas.length < MIN_SAMPLES) continue;
    const rPorL = saidas.map((s) => s.valorTotal / s.litros);
    const { mean, sigma } = meanStd(rPorL);
    if (sigma < 0.0001) continue; // sem variância: todos iguais
    const lo = mean - SIGMA_THRESHOLD * sigma;
    const hi = mean + SIGMA_THRESHOLD * sigma;
    const combNm = input.combustivelNome.get(combId) ?? combId;

    for (const s of saidas) {
      const rpl = s.valorTotal / s.litros;
      if (rpl >= lo && rpl <= hi) continue;
      const direcao = rpl > hi ? "acima" : "abaixo";
      results.push({
        id: `D2-${s.id}`,
        severity: "warning",
        detector: "D2",
        title: `R$/L ${direcao} da média para ${combNm}`,
        description: `${fmtBRL(rpl, 4)}/L vs média ${fmtBRL(mean, 4)} (±2 sigma ${fmtBRL(SIGMA_THRESHOLD * sigma, 4)}, n=${saidas.length})`,
        affectedSaidaIds: [s.id],
        affectedEquipamentoId: s.equipamentoId ?? undefined,
        affectedObraId: s.obraId ?? undefined,
        data: s.data.slice(0, 10),
        acaoSugerida: "Verificar se preço está correto na nota fiscal",
      });
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// D3: volume atípico por equipamento (±2σ do histórico de 90 dias)
// ────────────────────────────────────────────────────────────────────

function detectD3(input: DetectInput, agora: Date): Anomalia[] {
  const cutoff = daysAgoIso(agora, D3_HIST_DAYS);
  // Histórico por equipamento (últimos 90 dias, sem o sentinela)
  const histByEquip = new Map<string, number[]>();
  for (const s of input.saidasTodas) {
    if (s.tipoConsumidor !== "equipamento_proprio") continue;
    if (!s.equipamentoId || s.equipamentoId === EQUIPAMENTO_DESCONHECIDO) continue;
    if (s.data.slice(0, 10) < cutoff) continue;
    const list = histByEquip.get(s.equipamentoId) ?? [];
    list.push(s.litros);
    histByEquip.set(s.equipamentoId, list);
  }

  const eqMap = new Map(input.equipamentos.map((e) => [e.id, e]));
  const results: Anomalia[] = [];
  for (const s of input.saidasNoPeriodo) {
    if (s.tipoConsumidor !== "equipamento_proprio") continue;
    if (!s.equipamentoId || s.equipamentoId === EQUIPAMENTO_DESCONHECIDO) continue;
    const hist = histByEquip.get(s.equipamentoId);
    if (!hist || hist.length < MIN_SAMPLES) continue;
    const { mean, sigma } = meanStd(hist);
    if (sigma < 0.001) continue;
    const lo = mean - SIGMA_THRESHOLD * sigma;
    const hi = mean + SIGMA_THRESHOLD * sigma;
    if (s.litros >= lo && s.litros <= hi) continue;
    const eq = eqMap.get(s.equipamentoId);
    const eqNome = eq?.nome ?? "equipamento não encontrado";
    const direcao = s.litros > hi ? "acima" : "abaixo";
    results.push({
      id: `D3-${s.id}`,
      severity: "warning",
      detector: "D3",
      title: `Volume ${direcao} do padrão de ${eqNome}`,
      description: `${fmtLitros(s.litros)} L vs média ${fmtLitros(mean)} L (±2 sigma ${fmtLitros(SIGMA_THRESHOLD * sigma)} L em 90d, n=${hist.length})`,
      affectedSaidaIds: [s.id],
      affectedEquipamentoId: s.equipamentoId,
      affectedObraId: s.obraId ?? undefined,
      data: s.data.slice(0, 10),
      acaoSugerida: "Conferir leitura ou possível erro de digitação",
    });
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// D4: duplicatas em janela de 5 minutos
// ────────────────────────────────────────────────────────────────────

function detectD4(input: DetectInput): Anomalia[] {
  // Agrupa por (consumidor, litros, valor, combustível): saídas idênticas
  const groups = new Map<string, SaidaDeteccao[]>();
  for (const s of input.saidasNoPeriodo) {
    const consumer =
      s.tipoConsumidor === "equipamento_proprio"
        ? `eq:${s.equipamentoId ?? "unk"}`
        : `pl:${(s.placa ?? "unk").toLowerCase()}`;
    const key = `${consumer}|${s.litros}|${s.valorTotal}|${s.tipoCombustivel}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const results: Anomalia[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.data.localeCompare(b.data));
    const used = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const base = list[i]!;
      if (used.has(base.id)) continue;
      const cluster: SaidaDeteccao[] = [base];
      const tBase = new Date(base.data).getTime();
      for (let j = i + 1; j < list.length; j++) {
        const outra = list[j]!;
        if (used.has(outra.id)) continue;
        const tj = new Date(outra.data).getTime();
        if (tj - tBase <= DUP_WINDOW_MS) {
          cluster.push(outra);
          used.add(outra.id);
        } else {
          break;
        }
      }
      if (cluster.length >= 2) {
        used.add(base.id);
        const ids = cluster.map((c) => c.id).sort();
        results.push({
          id: `D4-${ids.join("-")}`,
          severity: "critical",
          detector: "D4",
          title: `${cluster.length} saídas idênticas em janela de 5 minutos`,
          description: `Mesmo consumidor + ${fmtLitros(base.litros)} L + ${fmtBRL(base.valorTotal)}: provável duplicata`,
          affectedSaidaIds: ids,
          affectedEquipamentoId: base.equipamentoId ?? undefined,
          data: base.data.slice(0, 10),
          acaoSugerida: "Verificar e excluir registros duplicados",
        });
      }
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// D5: gap operacional (equipamento ativo sem saída em 60 dias, janela fixa)
// ────────────────────────────────────────────────────────────────────

function detectD5(input: DetectInput, agora: Date): Anomalia[] {
  const today = isoToday(agora);
  const cutoff = daysAgoIso(agora, D5_GAP_DAYS);
  const equipsAtivos = input.saidasTodas.reduce((acc, s) => {
    if (s.equipamentoId && s.equipamentoId !== EQUIPAMENTO_DESCONHECIDO && s.data.slice(0, 10) >= cutoff) {
      acc.add(s.equipamentoId);
    }
    return acc;
  }, new Set<string>());

  // equipamento -> última saída (qualquer época), para o contexto
  const ultimaPorEquip = new Map<string, SaidaDeteccao>();
  for (const s of input.saidasTodas) {
    if (!s.equipamentoId || s.equipamentoId === EQUIPAMENTO_DESCONHECIDO) continue;
    const cur = ultimaPorEquip.get(s.equipamentoId);
    if (!cur || s.data.localeCompare(cur.data) > 0) {
      ultimaPorEquip.set(s.equipamentoId, s);
    }
  }

  const results: Anomalia[] = [];
  for (const eq of input.equipamentos) {
    if (eq.ativo === false) continue;
    if (equipsAtivos.has(eq.id)) continue;
    const ultima = ultimaPorEquip.get(eq.id);
    const ultimaData = ultima ? ultima.data.slice(0, 10) : null;
    const diasGap = ultimaData
      ? Math.floor(
          (new Date(today + "T00:00:00").getTime() - new Date(ultimaData + "T00:00:00").getTime()) / DIA_MS,
        )
      : null;
    results.push({
      id: `D5-${eq.id}`,
      severity: "info",
      detector: "D5",
      title: `${eq.nome} sem saída há ${diasGap !== null ? `${diasGap} dia(s)` : "60+ dias"}`,
      description: ultimaData
        ? `Última saída em ${ultimaData.split("-").reverse().join("/")}`
        : "Nunca teve saída registrada",
      affectedSaidaIds: ultima ? [ultima.id] : [],
      affectedEquipamentoId: eq.id,
      data: ultimaData ?? today,
      acaoSugerida: "Confirmar uso ou inativar no cadastro",
    });
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────
// detectAnomalias: ponto de entrada
// ────────────────────────────────────────────────────────────────────

export const SEVERITY_ORDER: Record<Severidade, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function detectAnomalias(input: DetectInput): Anomalia[] {
  const agora = input.agora ?? new Date();
  const all: Anomalia[] = [
    ...detectD1(input),
    ...detectD2(input),
    ...detectD3(input, agora),
    ...detectD4(input),
    ...detectD5(input, agora),
  ];
  // Severidade desc, depois data desc (sort estável: empate fica na ordem D1..D5).
  all.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return b.data.localeCompare(a.data);
  });
  return all;
}

export const DETECTOR_LABEL: Record<DetectorId, string> = {
  D1: "Sentinel sem equipamento",
  D2: "R$/L outlier",
  D3: "Volume atípico",
  D4: "Duplicatas (5min)",
  D5: "Gap operacional (60d)",
};

export const SEVERITY_LABEL: Record<Severidade, string> = {
  critical: "Crítica",
  warning: "Atenção",
  info: "Informação",
};
