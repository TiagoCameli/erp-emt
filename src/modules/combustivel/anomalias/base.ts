import {
  detectAnomalias,
  EQUIPAMENTO_DESCONHECIDO,
  type Anomalia,
  type SaidaDeteccao,
} from "@/modules/combustivel/anomalias/detect";

/**
 * A ponte entre as linhas do banco do ERP e o formato das saídas da origem (Gestão Obras),
 * que é o que a detecção, o painel e os relatórios portados leem. Módulo puro.
 *
 * Três adaptações, e só elas:
 * 1. Sentinela: o equipamento "Outros" do ERP (que absorveu o "Equipamento Desconhecido"
 *    na migração) vira o id 'desconhecido' da origem. O id real fica em `equipamentoIdReal`.
 * 2. Data: a origem grava o relógio de parede ("2026-09-01T14:30:00", sem fuso). O ERP grava
 *    timestamptz; aqui ele volta para o relógio de Rio Branco (UTC-5 o ano todo).
 * 3. Obra: a origem tem `obra_id` na saída (as alocações dela eram por etapa da MESMA obra).
 *    No ERP a obra é a raiz do centro de custo da alocação; com mais de uma, a de maior
 *    percentual (empate: a primeira).
 */

export { EQUIPAMENTO_DESCONHECIDO };

/** Nomes do equipamento-sentinela, já normalizados. */
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
 * O equipamento é o sentinela de "não sei qual foi"? Casa pela descrição OU pelo código,
 * normalizados dos dois lados. Não casa por "contém": "Outros serviços" é outro equipamento.
 */
export function ehEquipamentoSentinela(equipamento: { codigo: string | null; descricao: string }): boolean {
  return NOMES_SENTINELA.has(normalizarNome(equipamento.descricao)) || NOMES_SENTINELA.has(normalizarNome(equipamento.codigo));
}

const CINCO_HORAS_MS = 5 * 60 * 60 * 1000;

/** Instante (timestamptz) -> relógio de parede de Rio Branco, "AAAA-MM-DDTHH:MM:SS". */
export function relogioDeParede(iso: string): string {
  const tempo = Date.parse(iso);
  if (Number.isNaN(tempo)) return iso;
  return new Date(tempo - CINCO_HORAS_MS).toISOString().slice(0, 19);
}

/** Obra da saída: a raiz do centro da alocação de maior percentual. */
export function obraDaSaida(
  alocacoes: readonly { centroRaizId: string | null; percentual: number }[],
): string | null {
  let escolhida: { centroRaizId: string | null; percentual: number } | null = null;
  for (const alocacao of alocacoes) {
    if (alocacao.centroRaizId === null) continue;
    if (escolhida === null || alocacao.percentual > escolhida.percentual) escolhida = alocacao;
  }
  return escolhida?.centroRaizId ?? null;
}

/** Sobe pela árvore de centros de custo até a raiz (a obra). Ciclo ou pai sumido param no último conhecido. */
export function raizDoCentro(
  id: string,
  centros: ReadonlyMap<string, { nome: string; paiId: string | null }>,
): { id: string; nome: string } | null {
  let atual = centros.get(id);
  if (!atual) return null;
  let atualId = id;
  const vistos = new Set<string>([id]);
  while (atual.paiId && centros.has(atual.paiId) && !vistos.has(atual.paiId)) {
    vistos.add(atual.paiId);
    atualId = atual.paiId;
    atual = centros.get(atualId)!;
  }
  return { id: atualId, nome: atual.nome };
}

/** A saída como a origem a via, com o que o painel e os relatórios também precisam. */
export interface SaidaBase extends SaidaDeteccao {
  /** O instante gravado no banco (timestamptz). */
  instante: string;
  /** O id do equipamento no banco (o "Outros" continua com o id dele aqui). */
  equipamentoIdReal: string | null;
  origem: string;
  tanqueId: string | null;
  transportadoraId: string | null;
  motorista: string | null;
  precoUnitario: number;
  pago: boolean;
  pagoEm: string | null;
  observacoes: string | null;
  createdBy: string | null;
}

/** Os dois "mundos" da operação na origem (o ModeSwitch): próprios e carretas. */
export const MODOS = ["proprios", "carretas"] as const;
export type Modo = (typeof MODOS)[number];

export const ROTULO_MODO: Record<Modo, string> = {
  proprios: "Equipamentos próprios",
  carretas: "Carretas",
};

export const TIPO_POR_MODO: Record<Modo, string> = {
  proprios: "equipamento_proprio",
  carretas: "carreta_transportadora",
};

export function modoDaUrl(valor: string | string[] | undefined): Modo {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return (MODOS as readonly string[]).includes(texto ?? "") ? (texto as Modo) : "proprios";
}

/** Dia (AAAA-MM-DD) do relógio de parede dentro de [de, ate], os dois inclusivos. */
export function noPeriodo(saida: { data: string }, de: string, ate: string): boolean {
  const dia = saida.data.slice(0, 10);
  return dia >= de && dia <= ate;
}

/** O recorte da tela da origem: modo (tipo de consumidor) e período. */
export function saidasDoRecorte<T extends SaidaBase>(saidas: readonly T[], modo: Modo, de: string, ate: string): T[] {
  const tipo = TIPO_POR_MODO[modo];
  return saidas.filter((s) => s.tipoConsumidor === tipo && noPeriodo(s, de, ate));
}

// ---------------------------------------------------------------------------
// Cadastros e montagem
// ---------------------------------------------------------------------------

export interface EquipamentoBase {
  id: string;
  codigo: string | null;
  /** A `nome` da origem. */
  descricao: string;
  placa: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  ativo: boolean;
  /** É o "Outros" (o sentinela da origem)? */
  sentinela: boolean;
}

export interface TanqueBase {
  id: string;
  /** Apelido, ou o nome (a origem mostra `apelido || nome`). */
  nomeExibicao: string;
  nome: string;
  apelido: string | null;
  capacidadeLitros: number;
  ehExterno: boolean;
  proprietarioId: string | null;
  ativo: boolean;
}

/** Tudo o que a detecção, o painel e os relatórios leem, carregado uma vez por requisição. */
export interface BaseCombustivel {
  saidas: SaidaBase[];
  equipamentos: EquipamentoBase[];
  combustivelNome: Map<string, string>;
  obraNome: Map<string, string>;
  tanques: TanqueBase[];
  transportadoraNome: Map<string, string>;
}

/** Rótulo da origem: "COD · Nome" (código patrimonial, senão o tipo). */
export function rotuloOrigemEquipamento(equipamento: Pick<EquipamentoBase, "codigo" | "tipo" | "descricao">): string {
  const codigo = equipamento.codigo?.trim() || equipamento.tipo?.trim() || "";
  return codigo ? `${codigo} · ${equipamento.descricao}` : equipamento.descricao;
}

/** Os equipamentos como o detector os vê: sem o sentinela (que na origem é inativo). */
export function equipamentosParaDeteccao(equipamentos: readonly EquipamentoBase[]) {
  return equipamentos.filter((e) => !e.sentinela).map((e) => ({ id: e.id, nome: e.descricao, ativo: e.ativo }));
}

export interface LinhaSaidaBanco {
  id: string;
  data: string;
  origem: string;
  tipo_consumidor: string;
  tanque_id: string | null;
  equipamento_id: string | null;
  transportadora_id: string | null;
  placa: string | null;
  motorista: string | null;
  insumo_id: string;
  litros: number | string;
  preco_unitario: number | string;
  valor_total: number | string;
  pago: boolean;
  pago_em: string | null;
  observacoes: string | null;
  created_by: string | null;
  abastecimento_alocacoes: { centro_custo_id: string; percentual: number | string }[] | null;
}

function numero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(n) ? n : 0;
}

/**
 * A detecção como cada tela da origem a chama: `saidasNoPeriodo` é o recorte da tela e
 * `saidasTodas` é o banco inteiro (o D3 e o D5 precisam dele).
 */
export function detectarNaBase(base: BaseCombustivel, saidasNoPeriodo: readonly SaidaBase[], agora?: Date): Anomalia[] {
  return detectAnomalias({
    saidasNoPeriodo,
    saidasTodas: base.saidas,
    equipamentos: equipamentosParaDeteccao(base.equipamentos),
    combustivelNome: base.combustivelNome,
    obraNome: base.obraNome,
    agora,
  });
}

/** Opções do seletor de equipamento da origem: ativos, sem o sentinela, por código ou nome. */
export function opcoesDeEquipamento(equipamentos: readonly EquipamentoBase[]): { valor: string; rotulo: string }[] {
  return equipamentos
    .filter((e) => e.ativo && !e.sentinela)
    .sort((a, b) => (a.codigo || a.descricao).localeCompare(b.codigo || b.descricao, "pt-BR"))
    .map((e) => ({ valor: e.id, rotulo: rotuloOrigemEquipamento(e) }));
}

/** Linha do banco -> saída no formato da origem. */
export function montarSaidaBase(
  linha: LinhaSaidaBanco,
  sentinelas: ReadonlySet<string>,
  centros: ReadonlyMap<string, { nome: string; paiId: string | null }>,
): SaidaBase {
  const alocacoes = (linha.abastecimento_alocacoes ?? []).map((a) => ({
    centroRaizId: raizDoCentro(a.centro_custo_id, centros)?.id ?? null,
    percentual: numero(a.percentual),
  }));
  const equipamentoId =
    linha.equipamento_id !== null && sentinelas.has(linha.equipamento_id) ? EQUIPAMENTO_DESCONHECIDO : linha.equipamento_id;
  return {
    id: linha.id,
    data: relogioDeParede(linha.data),
    instante: linha.data,
    tipoConsumidor: linha.tipo_consumidor,
    equipamentoId,
    equipamentoIdReal: linha.equipamento_id,
    placa: linha.placa,
    obraId: obraDaSaida(alocacoes),
    tipoCombustivel: linha.insumo_id,
    litros: numero(linha.litros),
    valorTotal: numero(linha.valor_total),
    origem: linha.origem,
    tanqueId: linha.tanque_id,
    transportadoraId: linha.transportadora_id,
    motorista: linha.motorista,
    precoUnitario: numero(linha.preco_unitario),
    pago: linha.pago,
    pagoEm: linha.pago_em,
    observacoes: linha.observacoes,
    createdBy: linha.created_by,
  };
}
