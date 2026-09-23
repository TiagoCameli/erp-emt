import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

/**
 * Detecção de anomalias do Combustível, portada da detecção que a origem (Gestão
 * Obras) rodava no navegador. Aqui roda no SERVIDOR, sobre as saídas do período.
 * Módulo puro: sem banco, sem relógio (a referência de tempo vem de quem chama).
 *
 * Os ids são DETERMINÍSTICOS porque a conferência mora no banco pela chave
 * (`combustivel_anomalias_conferidas.chave`): a mesma anomalia tem que sair com
 * o mesmo id em toda recarga, senão a conferida "volta" como pendente.
 *
 * ## As cinco regras
 *
 * - D1 `D1-{saída}`: saída no equipamento-sentinela ("Outros", que na migração
 *   absorveu o "Equipamento Desconhecido"). Atenção.
 * - D2 `D2-{saída}`: preço por litro fora de média ± 2σ do mesmo combustível no
 *   período. Atenção.
 * - D3 `D3-{saída}`: litros fora de média ± 2σ do mesmo equipamento nos 90 dias
 *   anteriores à saída. Atenção.
 * - D4 `D4-{ids ordenados, unidos por '-'}`: duplicidade: mesmo consumidor, mesmos
 *   litros, mesmo valor e mesmo combustível em até 5 minutos. Crítica.
 * - D5 `D5-{equipamento}`: equipamento ativo com abastecimento anterior e nenhum
 *   nos últimos 60 dias. Informativa.
 *
 * ## Decisões da estatística (D2 e D3)
 *
 * A saída avaliada fica FORA da população com que ela é comparada ("deixa um de
 * fora"), e `n` é o tamanho dessa população. Com a própria saída dentro e o
 * desvio populacional, um ponto isolado entre cinco nunca passa de 1,79σ
 * ((n-1)/√n): a regra "n ≥ 5" viraria uma regra que não dispara. σ é o desvio
 * POPULACIONAL (divide por n). Abaixo de 5 na população, não há alerta.
 *
 * D3 usa a janela móvel da própria saída (os 90 dias antes dela), e não o
 * período da tela: assim o veredito de uma saída não muda conforme o período
 * escolhido, e a conferência continua valendo.
 */

export type RegraAnomalia = "D1" | "D2" | "D3" | "D4" | "D5";
export type SeveridadeAnomalia = "critica" | "atencao" | "info";

export const ROTULO_REGRA: Record<RegraAnomalia, string> = {
  D1: "Equipamento não identificado",
  D2: "Preço fora da faixa",
  D3: "Litros fora da faixa",
  D4: "Possível duplicidade",
  D5: "Equipamento sem abastecer",
};

export const ROTULO_SEVERIDADE: Record<SeveridadeAnomalia, string> = {
  critica: "Crítica",
  atencao: "Atenção",
  info: "Informativa",
};

/** Peso para ordenar: crítica primeiro. */
const PESO_SEVERIDADE: Record<SeveridadeAnomalia, number> = { critica: 0, atencao: 1, info: 2 };

export const MINIMO_AMOSTRA = 5;
export const JANELA_D3_DIAS = 90;
export const JANELA_D4_MINUTOS = 5;
export const JANELA_D5_DIAS = 60;

const DIA_MS = 24 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;
/** Folga contra o ruído do ponto flutuante na comparação com 2σ. */
const EPSILON = 1e-9;

export interface SaidaParaDeteccao {
  id: string;
  /** Instante ISO (timestamptz). */
  data: string;
  tipoConsumidor: string;
  equipamentoId: string | null;
  placa: string | null;
  transportadoraId: string | null;
  insumoId: string;
  litros: number;
  valorTotal: number;
  precoUnitario: number;
}

export interface EquipamentoParaDeteccao {
  id: string;
  codigo: string | null;
  descricao: string;
  ativo: boolean;
  /** Rótulo pronto para a descrição ("EQ-012 Escavadeira"). */
  rotulo: string;
  /**
   * Último abastecimento ANTES da janela de saídas que foi entregue (a consulta
   * não traz o histórico inteiro). Null quando não há nenhum.
   */
  ultimaSaidaAntesDaJanela?: string | null;
}

export interface EntradaDeteccao {
  /**
   * Saídas não excluídas do período E dos 90 dias antes dele (histórico do D3).
   * As regras D1, D2 e D4 só acusam saída dentro do período.
   */
  saidas: readonly SaidaParaDeteccao[];
  equipamentos: readonly EquipamentoParaDeteccao[];
  /** Nome do combustível pelo id do insumo, para a descrição. */
  combustiveis: ReadonlyMap<string, string>;
  /** Início do período (ISO, inclusivo). */
  inicio: string;
  /** Fim do período (ISO, exclusivo). É a referência "agora" do D5. */
  fim: string;
}

export interface Anomalia {
  id: string;
  regra: RegraAnomalia;
  severidade: SeveridadeAnomalia;
  descricao: string;
  /** Saídas envolvidas (uma, várias no D4, nenhuma no D5). */
  saidaIds: string[];
  equipamentoId: string | null;
  /** Instante da saída (ou da última saída, no D5), para ordenar e exibir. */
  data: string | null;
}

// ---------------------------------------------------------------------------
// Sentinela
// ---------------------------------------------------------------------------

/** Nomes do equipamento-sentinela, já normalizados. "Equipamento Desconhecido" virou "Outros" na migração. */
const NOMES_SENTINELA = new Set(["outros", "equipamento desconhecido"]);

/** Minúsculo, sem acento, espaço colapsado. */
export function normalizarNome(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O equipamento é o sentinela de "não sei qual foi"? Casa pela descrição OU pelo
 * código, normalizados dos dois lados ("OUTROS", " Outros ", "Equipamento
 * desconhecido"). Não casa por "contém": "Outros serviços" seria outro equipamento.
 */
export function ehEquipamentoSentinela(equipamento: { codigo: string | null; descricao: string }): boolean {
  return NOMES_SENTINELA.has(normalizarNome(equipamento.descricao)) || NOMES_SENTINELA.has(normalizarNome(equipamento.codigo));
}

// ---------------------------------------------------------------------------
// Estatística
// ---------------------------------------------------------------------------

export interface Estatistica {
  n: number;
  media: number;
  desvio: number;
}

/** Média e desvio POPULACIONAL. Lista vazia: n = 0. */
export function estatistica(valores: readonly number[]): Estatistica {
  const n = valores.length;
  if (n === 0) return { n: 0, media: 0, desvio: 0 };
  const media = valores.reduce((soma, v) => soma + v, 0) / n;
  const variancia = valores.reduce((soma, v) => soma + (v - media) ** 2, 0) / n;
  return { n, media, desvio: Math.sqrt(variancia) };
}

/** Fora de média ± 2σ, com população mínima. */
export function foraDaFaixa(valor: number, est: Estatistica): boolean {
  if (est.n < MINIMO_AMOSTRA) return false;
  return Math.abs(valor - est.media) > 2 * est.desvio + EPSILON;
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

function tempo(iso: string): number {
  return Date.parse(iso);
}

function dentroDoPeriodo(saida: SaidaParaDeteccao, inicio: number, fim: number): boolean {
  const t = tempo(saida.data);
  return t >= inicio && t < fim;
}

/** Ordem estável: data, depois id. */
function porDataEId(a: SaidaParaDeteccao, b: SaidaParaDeteccao): number {
  return tempo(a.data) - tempo(b.data) || a.id.localeCompare(b.id);
}

/**
 * Quem consumiu: o equipamento, ou a placa da carreta (normalizada: "abc-1d23" e
 * "ABC1D23" são a mesma carreta). Carreta sem placa cai na transportadora.
 */
export function chaveConsumidor(saida: SaidaParaDeteccao): string {
  if (saida.tipoConsumidor === "carreta_transportadora") {
    const placa = (saida.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return placa ? `placa:${placa}` : `transportadora:${saida.transportadoraId ?? "?"}:sem-placa`;
  }
  return `equipamento:${saida.equipamentoId ?? "?"}`;
}

/** Número com 4 casas como chave (o banco guarda NUMERIC(14,4)). */
function chave4(valor: number): string {
  return Math.round(valor * 10_000).toString();
}

function nomeCombustivel(entrada: EntradaDeteccao, insumoId: string): string {
  return entrada.combustiveis.get(insumoId) ?? "combustível";
}

function detectarD1(entrada: EntradaDeteccao, noPeriodo: SaidaParaDeteccao[]): Anomalia[] {
  const sentinelas = new Set(entrada.equipamentos.filter(ehEquipamentoSentinela).map((e) => e.id));
  if (sentinelas.size === 0) return [];
  return noPeriodo
    .filter((s) => s.equipamentoId !== null && sentinelas.has(s.equipamentoId))
    .map((s) => ({
      id: `D1-${s.id}`,
      regra: "D1" as const,
      severidade: "atencao" as const,
      descricao: `Abastecimento de ${formatarLitros(s.litros)} lançado em "Outros": identifique o equipamento que recebeu o combustível`,
      saidaIds: [s.id],
      equipamentoId: s.equipamentoId,
      data: s.data,
    }));
}

function detectarD2(entrada: EntradaDeteccao, noPeriodo: SaidaParaDeteccao[]): Anomalia[] {
  // Preço zero não entra: é saída sem preço (carreta sem preço digitado), não um preço baixo.
  const comPreco = noPeriodo.filter((s) => s.precoUnitario > 0);
  const porInsumo = new Map<string, SaidaParaDeteccao[]>();
  for (const s of comPreco) {
    const lista = porInsumo.get(s.insumoId) ?? [];
    lista.push(s);
    porInsumo.set(s.insumoId, lista);
  }

  const anomalias: Anomalia[] = [];
  for (const [insumoId, lista] of porInsumo) {
    for (const s of lista) {
      const est = estatistica(lista.filter((outra) => outra.id !== s.id).map((outra) => outra.precoUnitario));
      if (!foraDaFaixa(s.precoUnitario, est)) continue;
      anomalias.push({
        id: `D2-${s.id}`,
        regra: "D2",
        severidade: "atencao",
        descricao:
          `Preço de ${formatarValorOperacional(s.precoUnitario)}/L de ${nomeCombustivel(entrada, insumoId)} fora da faixa do período ` +
          `(média ${formatarValorOperacional(est.media)}/L em ${est.n} abastecimentos)`,
        saidaIds: [s.id],
        equipamentoId: s.equipamentoId,
        data: s.data,
      });
    }
  }
  return anomalias;
}

function detectarD3(entrada: EntradaDeteccao, noPeriodo: SaidaParaDeteccao[], sentinelas: Set<string>): Anomalia[] {
  const porEquipamento = new Map<string, SaidaParaDeteccao[]>();
  for (const s of entrada.saidas) {
    if (s.tipoConsumidor !== "equipamento_proprio" || s.equipamentoId === null) continue;
    const lista = porEquipamento.get(s.equipamentoId) ?? [];
    lista.push(s);
    porEquipamento.set(s.equipamentoId, lista);
  }

  const anomalias: Anomalia[] = [];
  for (const s of noPeriodo) {
    if (s.tipoConsumidor !== "equipamento_proprio" || s.equipamentoId === null) continue;
    // O sentinela junta máquinas diferentes: a "média do equipamento" dele não existe.
    if (sentinelas.has(s.equipamentoId)) continue;
    const t = tempo(s.data);
    const desde = t - JANELA_D3_DIAS * DIA_MS;
    const historico = (porEquipamento.get(s.equipamentoId) ?? []).filter((outra) => {
      if (outra.id === s.id) return false;
      const to = tempo(outra.data);
      return to >= desde && to <= t;
    });
    const est = estatistica(historico.map((outra) => outra.litros));
    if (!foraDaFaixa(s.litros, est)) continue;
    anomalias.push({
      id: `D3-${s.id}`,
      regra: "D3",
      severidade: "atencao",
      descricao:
        `${formatarLitros(s.litros)} fora da faixa do equipamento nos ${JANELA_D3_DIAS} dias anteriores ` +
        `(média ${formatarLitros(est.media)} em ${est.n} abastecimentos)`,
      saidaIds: [s.id],
      equipamentoId: s.equipamentoId,
      data: s.data,
    });
  }
  return anomalias;
}

function detectarD4(noPeriodo: SaidaParaDeteccao[]): Anomalia[] {
  const grupos = new Map<string, SaidaParaDeteccao[]>();
  for (const s of noPeriodo) {
    const chave = [chaveConsumidor(s), s.insumoId, chave4(s.litros), chave4(s.valorTotal)].join("|");
    const lista = grupos.get(chave) ?? [];
    lista.push(s);
    grupos.set(chave, lista);
  }

  const anomalias: Anomalia[] = [];
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const ordenadas = [...lista].sort(porDataEId);
    // Agrupa pela PRIMEIRA do grupo: toda saída do grupo fica a até 5 minutos dela,
    // então qualquer par dentro do grupo está a até 5 minutos. Encadear pela
    // anterior deixaria uma fila de lançamentos de 4 em 4 minutos virar um grupo só.
    let i = 0;
    while (i < ordenadas.length) {
      const ancora = ordenadas[i];
      const limite = tempo(ancora.data) + JANELA_D4_MINUTOS * MINUTO_MS;
      let j = i + 1;
      while (j < ordenadas.length && tempo(ordenadas[j].data) <= limite) j += 1;
      const grupo = ordenadas.slice(i, j);
      if (grupo.length >= 2) {
        const ids = grupo.map((s) => s.id).sort();
        anomalias.push({
          id: `D4-${ids.join("-")}`,
          regra: "D4",
          severidade: "critica",
          descricao:
            `${grupo.length} abastecimentos iguais em até ${JANELA_D4_MINUTOS} minutos (${formatarDataHoraRioBranco(ancora.data)}): ` +
            `mesmo consumidor, ${formatarLitros(ancora.litros)}, mesmo valor e mesmo combustível`,
          saidaIds: ids,
          equipamentoId: ancora.equipamentoId,
          data: ancora.data,
        });
      }
      i = j;
    }
  }
  return anomalias;
}

function detectarD5(entrada: EntradaDeteccao, sentinelas: Set<string>): Anomalia[] {
  const fim = tempo(entrada.fim);
  const corte = fim - JANELA_D5_DIAS * DIA_MS;

  const ultima = new Map<string, number>();
  for (const s of entrada.saidas) {
    if (s.equipamentoId === null) continue;
    const t = tempo(s.data);
    if (t >= fim) continue;
    if (t > (ultima.get(s.equipamentoId) ?? -Infinity)) ultima.set(s.equipamentoId, t);
  }

  const anomalias: Anomalia[] = [];
  for (const equipamento of entrada.equipamentos) {
    if (!equipamento.ativo || sentinelas.has(equipamento.id)) continue;
    const antes = equipamento.ultimaSaidaAntesDaJanela ? tempo(equipamento.ultimaSaidaAntesDaJanela) : -Infinity;
    const t = Math.max(ultima.get(equipamento.id) ?? -Infinity, antes);
    // Nunca abasteceu: não é "parou de abastecer", é equipamento que não usa combustível.
    if (t === -Infinity || t >= corte) continue;
    const dias = Math.floor((fim - t) / DIA_MS);
    const data = new Date(t).toISOString();
    anomalias.push({
      id: `D5-${equipamento.id}`,
      regra: "D5",
      severidade: "info",
      descricao: `${equipamento.rotulo} está ativo e não abastece há ${dias} dias (último em ${formatarDataHoraRioBranco(data).slice(0, 10)})`,
      saidaIds: [],
      equipamentoId: equipamento.id,
      data,
    });
  }
  return anomalias;
}

/** Crítica primeiro, depois a mais recente, depois o id (ordem estável entre recargas). */
export function ordenarAnomalias(anomalias: readonly Anomalia[]): Anomalia[] {
  return [...anomalias].sort(
    (a, b) =>
      PESO_SEVERIDADE[a.severidade] - PESO_SEVERIDADE[b.severidade] ||
      (b.data ? tempo(b.data) : 0) - (a.data ? tempo(a.data) : 0) ||
      a.id.localeCompare(b.id),
  );
}

/** Roda as cinco regras. */
export function detectarAnomalias(entrada: EntradaDeteccao): Anomalia[] {
  const inicio = tempo(entrada.inicio);
  const fim = tempo(entrada.fim);
  const noPeriodo = entrada.saidas.filter((s) => dentroDoPeriodo(s, inicio, fim));
  const sentinelas = new Set(entrada.equipamentos.filter(ehEquipamentoSentinela).map((e) => e.id));

  return ordenarAnomalias([
    ...detectarD1(entrada, noPeriodo),
    ...detectarD2(entrada, noPeriodo),
    ...detectarD3(entrada, noPeriodo, sentinelas),
    ...detectarD4(noPeriodo),
    ...detectarD5(entrada, sentinelas),
  ]);
}
