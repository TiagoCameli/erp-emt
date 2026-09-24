/**
 * O painel (Dashboard) do Frete, portado de Gestao_Obras/src/components/frete/
 * FreteDashboard.tsx, FreteAnalyticsOverview.tsx e MaterialAnalyticsOverview.tsx com as
 * mesmas fórmulas (Tiago: "exatamente igual, só mude o que for necessário"). Módulo puro:
 * a tela chama, os testes provam.
 *
 * O que muda por necessidade:
 * - Transportadora, origem, destino e obra são ids (a origem agrupava pelo texto
 *   aparado); o rótulo vem do cadastro. Obra = raiz do centro de custo do frete.
 * - A pedreira do frete é o fornecedor da localidade de origem (`_shared/pedreira.ts`),
 *   no lugar do "contém" entre o texto da origem e o nome do fornecedor.
 * - "A Pagar EMT" tira a própria empresa pelo CNPJ da ETAM (a origem comparava o nome
 *   "ETAM Construtora"; no ERP o cadastro tem a razão social "CONSTRUTORA ETAM LTDA").
 *
 * Quirks da origem mantidos de propósito (docs/FASE4-FRETE.md, "igual à origem"):
 * - Pagamentos são recortados pelo MÊS DE REFERÊNCIA, não pela data, e não pela obra.
 * - "Gasto com Transporte por Material e Pedreira" e "Material Transportado" incluem a
 *   transferência; "Top Pedreiras", "Custo Material + Frete", o saldo na pedreira e o
 *   último frete por material não.
 * - "Pagamentos por Empresa" soma TODAS as saídas de carreta do recorte como pagas pela
 *   "Areacre".
 * - "Distribuição por Material": top 6 + "Outros", e "Outros" soma só do 7º ao 10º do
 *   ranking de 10 (é o que a origem faz).
 */

import type { FreteBase, PedidoBase } from "@/modules/frete/_shared/pedreira-dados";
import {
  agregarPedidos,
  agregarTransporte,
  apenasFretesDePedreira,
  custoUnitarioDoPedido,
  saldoNaPedreira,
  type AgregadoDosPedidos,
  type GrupoSaldoPedreira,
  type TotalSaldoPedreira,
} from "@/modules/frete/_shared/pedreira";

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export type FretePainel = FreteBase;
export type PedidoPainel = PedidoBase;

export interface PagamentoPainel {
  id: string;
  data: string;
  /** AAAA-MM. */
  mesReferencia: string;
  transportadoraId: string;
  valor: number;
  metodo: string;
  pagoPor: string;
}

/** Saída de combustível de carreta (`tipo_consumidor = carreta_transportadora`). */
export interface AbastecimentoPainel {
  id: string;
  /** Dia de Rio Branco, AAAA-MM-DD. */
  data: string;
  transportadoraId: string | null;
  placa: string;
  litros: number;
  valorTotal: number;
}

/** Uma linha da view `transportadora_saldos`. */
export interface SaldoPainel {
  transportadoraId: string;
  nome: string;
  ehTransportadora: boolean;
  ehDonaDeTanque: boolean;
  /** A própria empresa (ETAM): fica fora do "A Pagar EMT". */
  ehPropria: boolean;
  saldo: number;
  creditoFreteTotal: number;
  pagoFreteTotal: number;
  debitoCombustivelTotal: number;
}

export interface NomesPainel {
  obra: Record<string, string>;
  insumo: Record<string, string>;
  localidade: Record<string, string>;
  fornecedor: Record<string, string>;
}

export interface DadosPainel {
  fretes: FretePainel[];
  pagamentos: PagamentoPainel[];
  abastecimentos: AbastecimentoPainel[];
  pedidos: PedidoPainel[];
  saldos: SaldoPainel[];
  nomes: NomesPainel;
  /** Fornecedores marcados como transportadora (o editor de cards marca "(sem frete)" nos outros). */
  transportadoras: string[];
  /** Fornecedores escolhidos nos cards, na ordem salva. */
  cardsIds: string[];
}

export const PAGADOR_EMT = "EMT Construtora";
export const PAGADOR_ABASTECIMENTO = "Areacre";
/** CONSTRUTORA ETAM LTDA, a própria empresa (plano, seção 6.1). */
export const CNPJ_ETAM = "22768840000131";

export const METODOS = ["pix", "boleto", "cheque", "dinheiro", "transferencia", "combustivel"] as const;
export const METODO_LABEL: Record<string, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cheque: "Cheque",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  combustivel: "Combustível",
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "2026-03" -> "Mar/26" (eixo) ou "Mar/2026" (chip). */
export function rotuloMes(ym: string, anoCompleto = false): string {
  const [ano = "", mes = "1"] = ym.split("-");
  return `${MESES[parseInt(mes, 10) - 1] ?? mes}/${anoCompleto ? ano : ano.slice(2)}`;
}

function nome(mapa: Record<string, string>, id: string): string {
  return mapa[id] ?? id;
}

// ---------------------------------------------------------------------------
// Filtros do topo e comparação de períodos
// ---------------------------------------------------------------------------

export interface FiltrosTopo {
  obraId: string;
  de: string;
  ate: string;
}

export type CompararCom = "none" | "periodo_anterior" | "ano_anterior" | "custom";

function diaUTC(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, (m ?? 1) - 1, d ?? 1, 12));
}

export function deslocarDias(iso: string, dias: number): string {
  if (!iso) return "";
  const d = diaUTC(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function deslocarAnos(iso: string, anos: number): string {
  if (!iso) return "";
  const d = diaUTC(iso);
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  return d.toISOString().slice(0, 10);
}

export function diasEntreDatas(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.round((diaUTC(b).getTime() - diaUTC(a).getTime()) / 86_400_000);
}

/** A janela de comparação (FreteDashboard.tsx:247-261). */
export function janelaDeComparacao(
  tipo: CompararCom,
  de: string,
  ate: string,
  compDe: string,
  compAte: string,
): { inicio: string; fim: string } | null {
  if (tipo === "none" || !de || !ate) return null;
  if (tipo === "custom") return compDe && compAte ? { inicio: compDe, fim: compAte } : null;
  if (tipo === "ano_anterior") return { inicio: deslocarAnos(de, -1), fim: deslocarAnos(ate, -1) };
  const duracao = diasEntreDatas(de, ate);
  const fim = deslocarDias(de, -1);
  return { inicio: deslocarDias(fim, -duracao), fim };
}

/** DeltaChip: ambos zero, nada; anterior zero, "novo"; senão a variação sobre |anterior|. */
export function variacao(atual: number, anterior: number): null | { tipo: "novo" } | { tipo: "pct"; valor: number } {
  if (anterior === 0 && atual === 0) return null;
  if (anterior === 0) return { tipo: "novo" };
  return { tipo: "pct", valor: ((atual - anterior) / Math.abs(anterior)) * 100 };
}

function noPeriodo(d: string, de: string, ate: string): boolean {
  if (!d) return true;
  if (de && d < de) return false;
  if (ate && d > ate) return false;
  return true;
}

function mesNoPeriodo(mes: string, de: string, ate: string): boolean {
  if (!mes) return true;
  if (de && mes < de.slice(0, 7)) return false;
  if (ate && mes > ate.slice(0, 7)) return false;
  return true;
}

export interface Bases {
  fretes: FretePainel[];
  pagamentos: PagamentoPainel[];
  abastecimentos: AbastecimentoPainel[];
  pedidos: PedidoPainel[];
}

/** Os recortes base do topo: fretes por data e obra; pagamentos pelo mês de referência. */
export function recortarBases(dados: Pick<DadosPainel, keyof Bases>, filtros: FiltrosTopo): Bases {
  const { de, ate, obraId } = filtros;
  return {
    fretes: dados.fretes.filter((f) => noPeriodo(f.data, de, ate) && (!obraId || f.obraId === obraId)),
    pagamentos: dados.pagamentos.filter((p) => mesNoPeriodo(p.mesReferencia, de, ate)),
    abastecimentos: dados.abastecimentos.filter((a) => noPeriodo(a.data, de, ate)),
    pedidos: dados.pedidos.filter((p) => noPeriodo(p.data, de, ate)),
  };
}

// ---------------------------------------------------------------------------
// Cross-filter (clique no gráfico), como o Power BI da origem
// ---------------------------------------------------------------------------

export type DimensaoCruzada =
  | "transportadora"
  | "obraId"
  | "insumoId"
  | "origem"
  | "destino"
  | "mes"
  | "metodo"
  | "pagoPor"
  | "fornecedorId";

export type FiltrosCruzados = Partial<Record<DimensaoCruzada, string>>;

export const ROTULO_DIMENSAO: Record<DimensaoCruzada, string> = {
  transportadora: "Transportadora",
  obraId: "Obra",
  insumoId: "Material",
  origem: "Pedreira",
  destino: "Destino",
  mes: "Mês",
  metodo: "Método",
  pagoPor: "Pago por",
  fornecedorId: "Fornecedor",
};

/** Clicar de novo no mesmo valor desmarca. */
export function alternarCruzado(atual: FiltrosCruzados, dim: DimensaoCruzada, valor: string): FiltrosCruzados {
  if (!valor) return atual;
  return atual[dim] === valor ? { ...atual, [dim]: undefined } : { ...atual, [dim]: valor };
}

export function cruzarFretes(itens: readonly FretePainel[], c: FiltrosCruzados, exceto?: DimensaoCruzada): FretePainel[] {
  return itens.filter((f) => {
    if (exceto !== "transportadora" && c.transportadora && f.transportadoraId !== c.transportadora) return false;
    if (exceto !== "obraId" && c.obraId && f.obraId !== c.obraId) return false;
    if (exceto !== "insumoId" && c.insumoId && f.insumoId !== c.insumoId) return false;
    if (exceto !== "origem" && c.origem && f.origemId !== c.origem) return false;
    if (exceto !== "destino" && c.destino && f.destinoId !== c.destino) return false;
    if (exceto !== "mes" && c.mes && (f.data || "").slice(0, 7) !== c.mes) return false;
    return true;
  });
}

export function cruzarPagamentos(itens: readonly PagamentoPainel[], c: FiltrosCruzados, exceto?: DimensaoCruzada): PagamentoPainel[] {
  return itens.filter((p) => {
    if (exceto !== "transportadora" && c.transportadora && p.transportadoraId !== c.transportadora) return false;
    if (exceto !== "metodo" && c.metodo && p.metodo !== c.metodo) return false;
    if (exceto !== "pagoPor" && c.pagoPor && p.pagoPor.trim() !== c.pagoPor) return false;
    if (exceto !== "mes" && c.mes && (p.mesReferencia || "") !== c.mes) return false;
    return true;
  });
}

export function cruzarAbastecimentos(
  itens: readonly AbastecimentoPainel[],
  c: FiltrosCruzados,
  exceto?: DimensaoCruzada,
): AbastecimentoPainel[] {
  return itens.filter((a) => {
    if (exceto !== "transportadora" && c.transportadora && a.transportadoraId !== c.transportadora) return false;
    if (exceto !== "mes" && c.mes && (a.data || "").slice(0, 7) !== c.mes) return false;
    return true;
  });
}

export function cruzarPedidos(itens: readonly PedidoPainel[], c: FiltrosCruzados, exceto?: DimensaoCruzada): PedidoPainel[] {
  return itens.filter((p) => {
    if (exceto !== "fornecedorId" && c.fornecedorId && p.fornecedorId !== c.fornecedorId) return false;
    if (exceto !== "mes" && c.mes && (p.data || "").slice(0, 7) !== c.mes) return false;
    if (exceto !== "insumoId" && c.insumoId && !p.itens.some((i) => i.insumoId === c.insumoId)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Fileira 1 e cards de saldo
// ---------------------------------------------------------------------------

export interface CardsTopo {
  totalFretes: number;
  qtdFretes: number;
  pagosPelaEmt: number;
  qtdPagamentosEmt: number;
  totalFretesComparado: number | null;
  pagosPelaEmtComparado: number | null;
}

function somaEmt(pagamentos: readonly PagamentoPainel[]): { valor: number; qtd: number } {
  const emt = pagamentos.filter((p) => p.pagoPor.trim() === PAGADOR_EMT);
  return { valor: emt.reduce((s, p) => s + p.valor, 0), qtd: emt.length };
}

export function cardsTopo(
  dados: Pick<DadosPainel, keyof Bases>,
  filtros: FiltrosTopo,
  cruzados: FiltrosCruzados,
  janela: { inicio: string; fim: string } | null,
): CardsTopo {
  const bases = recortarBases(dados, filtros);
  const fretesF = cruzarFretes(bases.fretes, cruzados);
  const emt = somaEmt(cruzarPagamentos(bases.pagamentos, cruzados));
  let totalFretesComparado: number | null = null;
  let pagosPelaEmtComparado: number | null = null;
  if (janela) {
    const comp = recortarBases(dados, { obraId: filtros.obraId, de: janela.inicio, ate: janela.fim });
    totalFretesComparado = cruzarFretes(comp.fretes, cruzados).reduce((s, f) => s + f.valorTotal, 0);
    pagosPelaEmtComparado = somaEmt(cruzarPagamentos(comp.pagamentos, cruzados)).valor;
  }
  return {
    totalFretes: fretesF.reduce((s, f) => s + f.valorTotal, 0),
    qtdFretes: fretesF.length,
    pagosPelaEmt: emt.valor,
    qtdPagamentosEmt: emt.qtd,
    totalFretesComparado,
    pagosPelaEmtComparado,
  };
}

/** "A Pagar EMT" (utils/fretePassivoEmt.ts): Σ saldo das transportadoras e donas de tanque, fora a própria. */
export function passivoEmt(saldos: readonly SaldoPainel[]): { total: number; linhas: { id: string; nome: string; saldo: number }[] } {
  const linhas = saldos
    .filter((s) => (s.ehTransportadora || s.ehDonaDeTanque) && !s.ehPropria)
    .map((s) => ({ id: s.transportadoraId, nome: s.nome, saldo: s.saldo }))
    .sort((a, b) => b.saldo - a.saldo);
  return { total: linhas.reduce((s, l) => s + l.saldo, 0), linhas };
}

export interface CardSaldo {
  fornecedorId: string;
  titulo: string;
  saldo: number;
  linhas: { rotulo: string; sinal: "+" | "−"; valor: number }[];
}

/** Os cards configuráveis (freteSaldoCard.ts): fornecedor fora da view tem saldo zero. */
export function cardsDeSaldo(
  cardsIds: readonly string[],
  nomes: Record<string, string>,
  saldos: readonly SaldoPainel[],
): CardSaldo[] {
  const porId = new Map(saldos.map((s) => [s.transportadoraId, s]));
  return cardsIds.flatMap((id) => {
    const nomeFornecedor = nomes[id];
    if (nomeFornecedor === undefined) return [];
    const s = porId.get(id);
    const saldo = s?.saldo ?? 0;
    const linhas: CardSaldo["linhas"] = [
      { rotulo: "Crédito Frete", sinal: "+", valor: s?.creditoFreteTotal ?? 0 },
      { rotulo: "Pago Frete", sinal: "−", valor: s?.pagoFreteTotal ?? 0 },
    ];
    if ((s?.debitoCombustivelTotal ?? 0) > 0) {
      linhas.push({ rotulo: "Débito Combustível", sinal: "−", valor: s!.debitoCombustivelTotal });
    }
    return [{ fornecedorId: id, titulo: `Saldo ${nomeFornecedor}`, saldo, linhas }];
  });
}

/** Quem configura os cards: painel/ver + pagamentos/criar (plano 4.1). */
export function podeConfigurarCards(pode: (recurso: "frete.painel" | "frete.pagamentos", acao: "ver" | "criar") => boolean): boolean {
  return pode("frete.painel", "ver") && pode("frete.pagamentos", "criar");
}

// ---------------------------------------------------------------------------
// FreteAnalyticsOverview
// ---------------------------------------------------------------------------

export interface ItemRanking {
  id: string;
  nome: string;
  valor: number;
  qtd: number;
  toneladas: number;
}

export interface MesEvolucao {
  ym: string;
  rotulo: string;
  valor: number;
  qtd: number;
  toneladas: number;
}

export interface AnaliseFretes {
  totalFretes: number;
  qtdFretes: number;
  totalToneladas: number;
  totalKm: number;
  custoMedioPorTon: number;
  custoMedioPorKm: number;
  entregues: number;
  emTransito: number;
  pctEntregues: number;
  evolucaoMensal: MesEvolucao[];
  topTransportadoras: ItemRanking[];
  topObras: ItemRanking[];
  topMateriais: ItemRanking[];
  topPedreiras: (ItemRanking & { custoMedio: number })[];
  pagamentosPorMetodo: ItemRanking[];
  totalPagamentosMetodo: number;
}

function ranquear(
  itens: readonly { chave: string | null; valor: number; toneladas: number }[],
  nomeDe: (id: string) => string,
  limite?: number,
): ItemRanking[] {
  const mapa = new Map<string, { valor: number; qtd: number; toneladas: number }>();
  for (const i of itens) {
    if (!i.chave) continue;
    const atual = mapa.get(i.chave) ?? { valor: 0, qtd: 0, toneladas: 0 };
    atual.valor += i.valor;
    atual.qtd += 1;
    atual.toneladas += i.toneladas;
    mapa.set(i.chave, atual);
  }
  // Soma antes de cortar: o corte é sobre o total de cada entidade.
  const lista = [...mapa.entries()].map(([id, d]) => ({ id, nome: nomeDe(id), ...d })).sort((a, b) => b.valor - a.valor);
  return limite === undefined ? lista : lista.slice(0, limite);
}

export function analisarFretes(bases: Bases, c: FiltrosCruzados, nomes: NomesPainel): AnaliseFretes {
  const todos = cruzarFretes(bases.fretes, c);
  const totalFretes = todos.reduce((s, f) => s + f.valorTotal, 0);
  const totalToneladas = todos.reduce((s, f) => s + (f.peso || 0), 0);
  const totalKm = todos.reduce((s, f) => s + (f.km || 0), 0);
  const entregues = todos.filter((f) => !!f.dataChegada).length;

  const porMes = new Map<string, { valor: number; qtd: number; toneladas: number }>();
  for (const f of cruzarFretes(bases.fretes, c, "mes")) {
    if (!f.data) continue;
    const ym = f.data.slice(0, 7);
    const atual = porMes.get(ym) ?? { valor: 0, qtd: 0, toneladas: 0 };
    atual.valor += f.valorTotal;
    atual.qtd += 1;
    atual.toneladas += f.peso || 0;
    porMes.set(ym, atual);
  }
  const evolucaoMensal = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, d]) => ({ ym, rotulo: rotuloMes(ym), valor: d.valor, qtd: d.qtd, toneladas: Math.round(d.toneladas) }));

  const paraRanking = (f: FretePainel, chave: string | null) => ({ chave, valor: f.valorTotal, toneladas: f.peso || 0 });

  const topPedreiras = ranquear(
    apenasFretesDePedreira(cruzarFretes(bases.fretes, c, "origem")).map((f) => paraRanking(f, f.origemId)),
    (id) => nome(nomes.localidade, id),
    10,
  ).map((r) => ({ ...r, custoMedio: r.toneladas > 0 ? r.valor / r.toneladas : 0 }));

  const pagamentosPorMetodo = ranquear(
    cruzarPagamentos(bases.pagamentos, c, "metodo").map((p) => ({ chave: p.metodo || "outro", valor: p.valor, toneladas: 0 })),
    (id) => METODO_LABEL[id] ?? id,
  );

  return {
    totalFretes,
    qtdFretes: todos.length,
    totalToneladas,
    totalKm,
    custoMedioPorTon: totalToneladas > 0 ? totalFretes / totalToneladas : 0,
    custoMedioPorKm: totalKm > 0 ? totalFretes / totalKm : 0,
    entregues,
    emTransito: todos.length - entregues,
    pctEntregues: todos.length > 0 ? (entregues / todos.length) * 100 : 0,
    evolucaoMensal,
    topTransportadoras: ranquear(
      cruzarFretes(bases.fretes, c, "transportadora").map((f) => paraRanking(f, f.transportadoraId)),
      (id) => nomes.fornecedor[id] ?? "Sem transportadora",
      8,
    ),
    topObras: ranquear(
      cruzarFretes(bases.fretes, c, "obraId").map((f) => paraRanking(f, f.obraId)),
      (id) => nomes.obra[id] ?? "Sem obra",
      8,
    ),
    topMateriais: ranquear(
      cruzarFretes(bases.fretes, c, "insumoId").map((f) => paraRanking(f, f.insumoId)),
      (id) => nome(nomes.insumo, id),
      8,
    ),
    topPedreiras,
    pagamentosPorMetodo,
    totalPagamentosMetodo: pagamentosPorMetodo.reduce((s, p) => s + p.valor, 0),
  };
}

// ---------------------------------------------------------------------------
// MaterialAnalyticsOverview
// ---------------------------------------------------------------------------

function somaDoPedido(p: PedidoPainel, insumo?: string): { valor: number; qtd: number; itens: number } {
  const itens = p.itens.filter((i) => !insumo || i.insumoId === insumo);
  return {
    valor: itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0),
    qtd: itens.reduce((s, i) => s + i.quantidade, 0),
    itens: itens.length,
  };
}

export interface MaterialComprado {
  id: string;
  nome: string;
  valor: number;
  qtd: number;
  precoMedio: number;
  ultimoPreco: number;
}

export interface AnaliseMateriais {
  totalComprado: number;
  qtdComprada: number;
  pedidosEmitidos: number;
  materiaisDistintos: number;
  topMaterial: { id: string; nome: string; valor: number };
  evolucao: { ym: string; rotulo: string; valor: number; qtdPedidos: number }[];
  topFornecedores: { id: string; nome: string; valor: number; pedidos: number; qtd: number }[];
  topMateriais: MaterialComprado[];
  distribuicao: { id: string; nome: string; valor: number }[];
  totalDistribuicao: number;
  materialVsFrete: { id: string; nome: string; material: number; frete: number }[];
}

export const ID_OUTROS = "__outros";

export function analisarMateriais(bases: Bases, c: FiltrosCruzados, nomes: NomesPainel): AnaliseMateriais {
  const insumo = c.insumoId;
  const todos = cruzarPedidos(bases.pedidos, c);
  let totalComprado = 0;
  let qtdComprada = 0;
  let pedidosEmitidos = 0;
  const materiais = new Set<string>();
  for (const p of todos) {
    const s = somaDoPedido(p, insumo);
    totalComprado += s.valor;
    qtdComprada += s.qtd;
    if (s.itens > 0) pedidosEmitidos += 1;
    for (const i of p.itens) if (!insumo || i.insumoId === insumo) materiais.add(i.insumoId);
  }

  const porMaterial = cruzarPedidos(bases.pedidos, c, "insumoId");
  const valorPorMaterial = new Map<string, number>();
  for (const p of porMaterial) {
    for (const i of p.itens) valorPorMaterial.set(i.insumoId, (valorPorMaterial.get(i.insumoId) ?? 0) + i.quantidade * i.valorUnitario);
  }
  let topId = "";
  let topValor = 0;
  for (const [id, v] of valorPorMaterial) {
    if (v > topValor) {
      topValor = v;
      topId = id;
    }
  }

  const porMes = new Map<string, { valor: number; qtdPedidos: number }>();
  for (const p of cruzarPedidos(bases.pedidos, c, "mes")) {
    if (!p.data) continue;
    const s = somaDoPedido(p, insumo);
    if (s.itens === 0) continue;
    const ym = p.data.slice(0, 7);
    const atual = porMes.get(ym) ?? { valor: 0, qtdPedidos: 0 };
    atual.valor += s.valor;
    atual.qtdPedidos += 1;
    porMes.set(ym, atual);
  }

  const porFornecedor = new Map<string, { valor: number; pedidos: number; qtd: number }>();
  for (const p of cruzarPedidos(bases.pedidos, c, "fornecedorId")) {
    if (!p.fornecedorId) continue;
    const s = somaDoPedido(p, insumo);
    if (s.itens === 0) continue;
    const atual = porFornecedor.get(p.fornecedorId) ?? { valor: 0, pedidos: 0, qtd: 0 };
    atual.valor += s.valor;
    atual.pedidos += 1;
    atual.qtd += s.qtd;
    porFornecedor.set(p.fornecedorId, atual);
  }

  // Top materiais comprados, com o último preço do pedido de data mais recente (vu > 0).
  const comprados = new Map<string, { valor: number; qtd: number; ultimoPreco: number; ultimaData: string }>();
  for (const p of porMaterial) {
    for (const i of p.itens) {
      const ant = comprados.get(i.insumoId) ?? { valor: 0, qtd: 0, ultimoPreco: 0, ultimaData: "" };
      const maisNovo = ant.ultimaData < (p.data || "");
      comprados.set(i.insumoId, {
        valor: ant.valor + i.quantidade * i.valorUnitario,
        qtd: ant.qtd + i.quantidade,
        ultimoPreco: maisNovo && i.valorUnitario > 0 ? i.valorUnitario : ant.ultimoPreco,
        ultimaData: maisNovo ? p.data || "" : ant.ultimaData,
      });
    }
  }
  const topMateriais = [...comprados.entries()]
    .map(([id, d]) => ({
      id,
      nome: nome(nomes.insumo, id),
      valor: d.valor,
      qtd: d.qtd,
      precoMedio: d.qtd > 0 ? d.valor / d.qtd : 0,
      ultimoPreco: d.ultimoPreco,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const distribuicao =
    topMateriais.length <= 6
      ? topMateriais.map(({ id, nome: n, valor }) => ({ id, nome: n, valor }))
      : [
          ...topMateriais.slice(0, 6).map(({ id, nome: n, valor }) => ({ id, nome: n, valor })),
          { id: ID_OUTROS, nome: "Outros", valor: topMateriais.slice(6).reduce((s, m) => s + m.valor, 0) },
        ];

  const fretePorMaterial = new Map<string, number>();
  for (const f of cruzarFretes(bases.fretes, c, "insumoId")) {
    if (!f.insumoId) continue;
    fretePorMaterial.set(f.insumoId, (fretePorMaterial.get(f.insumoId) ?? 0) + f.valorTotal);
  }

  return {
    totalComprado,
    qtdComprada,
    pedidosEmitidos,
    materiaisDistintos: materiais.size,
    topMaterial: { id: topId, nome: topId ? nome(nomes.insumo, topId) : "Nenhum", valor: topValor },
    evolucao: [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, d]) => ({ ym, rotulo: rotuloMes(ym), valor: d.valor, qtdPedidos: d.qtdPedidos })),
    topFornecedores: [...porFornecedor.entries()]
      .map(([id, d]) => ({ id, nome: nome(nomes.fornecedor, id), ...d }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    topMateriais,
    distribuicao,
    totalDistribuicao: distribuicao.reduce((s, d) => s + d.valor, 0),
    materialVsFrete: topMateriais.slice(0, 6).map((m) => ({
      id: m.id,
      nome: m.nome,
      material: m.valor,
      frete: fretePorMaterial.get(m.id) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

/** Filtros locais de uma tabela (pedreira = localidade de origem). Vazio = todos. */
export interface FiltrosLocais {
  pedreiras: string[];
  materiais: string[];
  destinos: string[];
}

export const SEM_FILTRO_LOCAL: FiltrosLocais = { pedreiras: [], materiais: [], destinos: [] };

function casa(valor: string | null, filtro: readonly string[]): boolean {
  return filtro.length === 0 || (valor !== null && filtro.includes(valor));
}

export function filtrarLocal(fretes: readonly FretePainel[], f: FiltrosLocais): FretePainel[] {
  return fretes.filter((x) => casa(x.origemId, f.pedreiras) && casa(x.insumoId, f.materiais) && casa(x.destinoId, f.destinos));
}

export interface OpcaoPainel {
  valor: string;
  rotulo: string;
}

function opcoes(ids: Iterable<string>, rotulo: (id: string) => string): OpcaoPainel[] {
  return [...new Set(ids)].map((valor) => ({ valor, rotulo: rotulo(valor) })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

/** As opções dos filtros locais, tiradas dos fretes do recorte (opsPedreiras/Destinos/Materiais). */
export function opcoesLocais(fretesF: readonly FretePainel[], nomes: NomesPainel) {
  return {
    pedreiras: opcoes(fretesF.map((f) => f.origemId), (id) => nome(nomes.localidade, id)),
    destinos: opcoes(fretesF.map((f) => f.destinoId), (id) => nome(nomes.localidade, id)),
    materiais: opcoes(fretesF.map((f) => f.insumoId), (id) => nome(nomes.insumo, id)),
  };
}

// 1. Resumo por Transportadora
export interface LinhaResumoTransportadora {
  id: string;
  nome: string;
  totalTkm: number;
  tkmMedio: number;
  valor: number;
}

export function resumoPorTransportadora(fretesF: readonly FretePainel[], f: FiltrosLocais, nomes: NomesPainel) {
  const fretes = filtrarLocal(fretesF, f);
  const mapa = new Map<string, { valor: number; somaValorTkm: number; somaTkm: number; count: number }>();
  for (const x of fretes) {
    if (!x.transportadoraId) continue;
    const a = mapa.get(x.transportadoraId) ?? { valor: 0, somaValorTkm: 0, somaTkm: 0, count: 0 };
    a.valor += x.valorTotal;
    a.somaValorTkm += x.valorTkm;
    a.somaTkm += x.km * x.peso;
    a.count += 1;
    mapa.set(x.transportadoraId, a);
  }
  const linhas: LinhaResumoTransportadora[] = [...mapa.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .map(([id, d]) => ({
      id,
      nome: nome(nomes.fornecedor, id),
      totalTkm: d.somaTkm,
      tkmMedio: d.count > 0 ? d.somaValorTkm / d.count : 0,
      valor: d.valor,
    }));
  return {
    linhas,
    total: {
      totalTkm: fretes.reduce((s, x) => s + x.km * x.peso, 0),
      tkmMedio: fretes.length > 0 ? fretes.reduce((s, x) => s + x.valorTkm, 0) / fretes.length : 0,
      valor: fretes.reduce((s, x) => s + x.valorTotal, 0),
    },
  };
}

// 2. Pagamentos por Empresa e Método
export function pagamentosEmpresaMetodo(pagamentosF: readonly PagamentoPainel[]) {
  const mapa = new Map<string, Map<string, number>>();
  const metodos = new Set<string>();
  for (const p of pagamentosF) {
    const empresa = p.pagoPor.trim();
    if (!empresa) continue;
    metodos.add(p.metodo);
    const m = mapa.get(empresa) ?? new Map<string, number>();
    m.set(p.metodo, (m.get(p.metodo) ?? 0) + p.valor);
    mapa.set(empresa, m);
  }
  const ordem = METODOS as readonly string[];
  const colunas = [...metodos].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  const linhas = [...mapa.entries()]
    .map(([empresa, m]) => ({
      empresa,
      porMetodo: Object.fromEntries(m) as Record<string, number>,
      total: [...m.values()].reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total);
  const totalPorMetodo = Object.fromEntries(colunas.map((c) => [c, linhas.reduce((s, l) => s + (l.porMetodo[c] ?? 0), 0)]));
  return { colunas, linhas, totalPorMetodo, total: linhas.reduce((s, l) => s + l.total, 0) };
}

// 3. Abastecimentos em Tanque Externo (todas as saídas de carreta, como a origem)
export function abastecimentosPorEmpresa(abastF: readonly AbastecimentoPainel[], nomes: NomesPainel) {
  const mapa = new Map<string, Map<string, { litros: number; valor: number; count: number }>>();
  for (const a of abastF) {
    const empresa = a.transportadoraId ? (nomes.fornecedor[a.transportadoraId] ?? "").trim() : "";
    if (!empresa) continue;
    const placa = a.placa.trim() || "Sem placa";
    const porPlaca = mapa.get(empresa) ?? new Map();
    const atual = porPlaca.get(placa) ?? { litros: 0, valor: 0, count: 0 };
    porPlaca.set(placa, { litros: atual.litros + a.litros, valor: atual.valor + a.valorTotal, count: atual.count + 1 });
    mapa.set(empresa, porPlaca);
  }
  const empresas = [...mapa.entries()]
    .map(([empresa, porPlaca]) => {
      const placas = [...porPlaca.entries()].map(([placa, d]) => ({ placa, ...d })).sort((a, b) => b.valor - a.valor);
      return {
        empresa,
        placas,
        litros: placas.reduce((s, p) => s + p.litros, 0),
        valor: placas.reduce((s, p) => s + p.valor, 0),
        count: placas.reduce((s, p) => s + p.count, 0),
      };
    })
    .sort((a, b) => b.valor - a.valor);
  return {
    empresas,
    total: {
      litros: empresas.reduce((s, e) => s + e.litros, 0),
      valor: empresas.reduce((s, e) => s + e.valor, 0),
      count: empresas.reduce((s, e) => s + e.count, 0),
    },
  };
}

// 4. Pedidos de Material por Fornecedor (saldo na pedreira)
export interface TabelaSaldoPedreira {
  grupos: GrupoSaldoPedreira[];
  total: TotalSaldoPedreira;
  opcoesFornecedores: OpcaoPainel[];
  opcoesMateriais: OpcaoPainel[];
}

/** Fornecedores dos cards que NÃO são transportadora: aparecem na tabela mesmo sem pedido. */
export function fornecedoresDeMaterialDosCards(cardsIds: readonly string[], nomes: NomesPainel, transportadoras: readonly string[]): Set<string> {
  const transp = new Set(transportadoras);
  return new Set(cardsIds.filter((id) => nomes.fornecedor[id] !== undefined && !transp.has(id)));
}

export function tabelaSaldoPedreira(
  pedidosF: readonly PedidoPainel[],
  fretesF: readonly FretePainel[],
  filtros: { fornecedores: string[]; materiais: string[]; destinos: string[] },
  sempreVisiveis: ReadonlySet<string>,
  nomes: NomesPainel,
): TabelaSaldoPedreira {
  const pedidos = agregarPedidos(pedidosF);
  const nomeFornecedor = (id: string) => nomes.fornecedor[id] ?? id;
  // As opções vêm da conta sem os filtros locais (FreteDashboard.tsx:664-769).
  const semFiltro = saldoNaPedreira({ pedidos, transporte: agregarTransporte(fretesF), sempreVisiveis, nomeFornecedor });
  const comFiltro = saldoNaPedreira({
    pedidos,
    transporte: agregarTransporte(fretesF.filter((f) => casa(f.destinoId, filtros.destinos))),
    sempreVisiveis,
    fornecedores: filtros.fornecedores,
    materiais: filtros.materiais,
    nomeFornecedor,
  });
  return {
    grupos: comFiltro.grupos.filter((g) => g.visivel),
    total: comFiltro.total,
    opcoesFornecedores: semFiltro.grupos.map((g) => ({ valor: g.fornecedorId, rotulo: nomeFornecedor(g.fornecedorId) })),
    opcoesMateriais: opcoes(
      semFiltro.grupos.flatMap((g) => g.linhas.map((l) => l.insumoId)),
      (id) => nome(nomes.insumo, id),
    ),
  };
}

// 5. Custo Material + Frete por Pedreira e Local de Entrega
export interface LinhaCustoMaterialFrete {
  origemId: string;
  destinoId: string;
  insumoId: string;
  qtdTon: number;
  custoFrete: number;
  custoFretePorTon: number;
  custoUnitMaterial: number;
  custoTotalMaterial: number;
  custoTotal: number;
}

export interface TotaisCusto {
  qtdTon: number;
  custoFrete: number;
  custoMaterial: number;
  custoTotal: number;
}

function somarCusto(linhas: readonly LinhaCustoMaterialFrete[]): TotaisCusto {
  return linhas.reduce(
    (t, r) => ({
      qtdTon: t.qtdTon + r.qtdTon,
      custoFrete: t.custoFrete + r.custoFrete,
      custoMaterial: t.custoMaterial + r.custoTotalMaterial,
      custoTotal: t.custoTotal + r.custoTotal,
    }),
    { qtdTon: 0, custoFrete: 0, custoMaterial: 0, custoTotal: 0 },
  );
}

export function custoMaterialFrete(
  fretesF: readonly FretePainel[],
  pedidos: AgregadoDosPedidos,
  f: FiltrosLocais,
  nomes: NomesPainel,
) {
  const nomeLocal = (id: string) => nome(nomes.localidade, id);
  const agregado = new Map<string, Map<string, Map<string, { qtdTon: number; custoFrete: number; pedreiraId: string | null }>>>();
  for (const x of apenasFretesDePedreira(fretesF)) {
    if (!x.origemId || !x.destinoId || !x.insumoId) continue;
    const porDestino = agregado.get(x.origemId) ?? new Map();
    const porMaterial = porDestino.get(x.destinoId) ?? new Map();
    const atual = porMaterial.get(x.insumoId) ?? { qtdTon: 0, custoFrete: 0, pedreiraId: x.pedreiraId };
    atual.qtdTon += x.peso;
    atual.custoFrete += x.valorTotal;
    porMaterial.set(x.insumoId, atual);
    porDestino.set(x.destinoId, porMaterial);
    agregado.set(x.origemId, porDestino);
  }
  const todas: LinhaCustoMaterialFrete[] = [];
  for (const [origemId, porDestino] of [...agregado.entries()].sort((a, b) => nomeLocal(a[0]).localeCompare(nomeLocal(b[0])))) {
    for (const [destinoId, porMaterial] of [...porDestino.entries()].sort((a, b) => nomeLocal(a[0]).localeCompare(nomeLocal(b[0])))) {
      for (const [insumoId, d] of [...porMaterial.entries()].sort((a, b) => b[1].custoFrete - a[1].custoFrete)) {
        const custoUnitMaterial = custoUnitarioDoPedido(pedidos, d.pedreiraId, insumoId);
        const custoTotalMaterial = custoUnitMaterial * d.qtdTon;
        todas.push({
          origemId,
          destinoId,
          insumoId,
          qtdTon: d.qtdTon,
          custoFrete: d.custoFrete,
          custoFretePorTon: d.qtdTon > 0 ? d.custoFrete / d.qtdTon : 0,
          custoUnitMaterial,
          custoTotalMaterial,
          custoTotal: custoTotalMaterial + d.custoFrete,
        });
      }
    }
  }
  const filtradas = todas.filter((r) => casa(r.origemId, f.pedreiras) && casa(r.insumoId, f.materiais) && casa(r.destinoId, f.destinos));
  // Reagrupa pedreira -> destino, na ordem da conta.
  const pedreiras: { origemId: string; totais: TotaisCusto; destinos: { destinoId: string; totais: TotaisCusto; linhas: LinhaCustoMaterialFrete[] }[] }[] = [];
  for (const r of filtradas) {
    let p = pedreiras.find((x) => x.origemId === r.origemId);
    if (!p) {
      p = { origemId: r.origemId, totais: somarCusto([]), destinos: [] };
      pedreiras.push(p);
    }
    let d = p.destinos.find((x) => x.destinoId === r.destinoId);
    if (!d) {
      d = { destinoId: r.destinoId, totais: somarCusto([]), linhas: [] };
      p.destinos.push(d);
    }
    d.linhas.push(r);
  }
  for (const p of pedreiras) {
    for (const d of p.destinos) d.totais = somarCusto(d.linhas);
    p.totais = somarCusto(p.destinos.flatMap((d) => d.linhas));
  }
  return {
    pedreiras,
    total: somarCusto(filtradas),
    opcoesPedreiras: opcoes(todas.map((r) => r.origemId), nomeLocal),
    opcoesMateriais: opcoes(todas.map((r) => r.insumoId), (id) => nome(nomes.insumo, id)),
    opcoesDestinos: opcoes(todas.map((r) => r.destinoId), nomeLocal),
  };
}

// 6. Gasto com Transporte por Material e Pedreira (inclui transferência, como a origem)
export function gastoTransportePorPedreira(fretesF: readonly FretePainel[], f: FiltrosLocais, nomes: NomesPainel) {
  const nomeLocal = (id: string) => nome(nomes.localidade, id);
  const mapa = new Map<string, Map<string, { valor: number; peso: number }>>();
  for (const x of filtrarLocal(fretesF, f)) {
    if (!x.insumoId || !x.origemId) continue;
    const porMaterial = mapa.get(x.origemId) ?? new Map();
    const atual = porMaterial.get(x.insumoId) ?? { valor: 0, peso: 0 };
    porMaterial.set(x.insumoId, { valor: atual.valor + x.valorTotal, peso: atual.peso + x.peso });
    mapa.set(x.origemId, porMaterial);
  }
  const pedreiras = [...mapa.entries()]
    .sort((a, b) => nomeLocal(a[0]).localeCompare(nomeLocal(b[0])))
    .map(([origemId, porMaterial]) => {
      const linhas = [...porMaterial.entries()]
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([insumoId, d]) => ({ insumoId, valor: d.valor, peso: d.peso, custoMedioTon: d.peso > 0 ? d.valor / d.peso : 0 }));
      const valor = linhas.reduce((s, l) => s + l.valor, 0);
      const peso = linhas.reduce((s, l) => s + l.peso, 0);
      return { origemId, linhas, valor, peso, custoMedioTon: peso > 0 ? valor / peso : 0 };
    });
  const valor = pedreiras.reduce((s, p) => s + p.valor, 0);
  const peso = pedreiras.reduce((s, p) => s + p.peso, 0);
  return { pedreiras, total: { valor, peso, custoMedioTon: peso > 0 ? valor / peso : 0 } };
}

// 7. Material Transportado (entregue = tem data de chegada)
export function materialTransportado(fretesF: readonly FretePainel[], f: FiltrosLocais) {
  const mapa = new Map<string, { entregue: number; transito: number; pesoEntregue: number; pesoTransito: number }>();
  for (const x of filtrarLocal(fretesF, f)) {
    if (!x.insumoId) continue;
    const a = mapa.get(x.insumoId) ?? { entregue: 0, transito: 0, pesoEntregue: 0, pesoTransito: 0 };
    if (x.dataChegada) {
      a.entregue += 1;
      a.pesoEntregue += x.peso;
    } else {
      a.transito += 1;
      a.pesoTransito += x.peso;
    }
    mapa.set(x.insumoId, a);
  }
  const linhas = [...mapa.entries()]
    .map(([insumoId, d]) => ({ insumoId, ...d, total: d.pesoEntregue + d.pesoTransito }))
    .sort((a, b) => b.total - a.total);
  return {
    linhas,
    total: linhas.reduce(
      (t, l) => ({
        entregue: t.entregue + l.entregue,
        transito: t.transito + l.transito,
        pesoEntregue: t.pesoEntregue + l.pesoEntregue,
        pesoTransito: t.pesoTransito + l.pesoTransito,
        total: t.total + l.total,
      }),
      { entregue: 0, transito: 0, pesoEntregue: 0, pesoTransito: 0, total: 0 },
    ),
  };
}

// 8. Pagamentos por Empresa (+ as saídas de carreta como pagas pela Areacre)
export function pagamentosPorEmpresa(pagamentosF: readonly PagamentoPainel[], abastF: readonly AbastecimentoPainel[]) {
  const mapa = new Map<string, { valor: number; count: number }>();
  for (const p of pagamentosF) {
    const empresa = p.pagoPor.trim();
    if (!empresa) continue;
    const a = mapa.get(empresa) ?? { valor: 0, count: 0 };
    mapa.set(empresa, { valor: a.valor + p.valor, count: a.count + 1 });
  }
  const totalAbast = abastF.reduce((s, a) => s + a.valorTotal, 0);
  if (totalAbast > 0) {
    const a = mapa.get(PAGADOR_ABASTECIMENTO) ?? { valor: 0, count: 0 };
    mapa.set(PAGADOR_ABASTECIMENTO, { valor: a.valor + totalAbast, count: a.count + abastF.length });
  }
  const linhas = [...mapa.entries()].map(([empresa, d]) => ({ empresa, ...d })).sort((a, b) => b.valor - a.valor);
  return {
    linhas,
    total: { valor: linhas.reduce((s, l) => s + l.valor, 0), count: linhas.reduce((s, l) => s + l.count, 0) },
  };
}

// 9. Gasto por Obra
export function gastoPorObra(fretesF: readonly FretePainel[], nomes: NomesPainel) {
  const mapa = new Map<string, number>();
  for (const f of fretesF) {
    if (!f.obraId) continue;
    mapa.set(f.obraId, (mapa.get(f.obraId) ?? 0) + f.valorTotal);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, valor]) => ({ id, nome: nomes.obra[id] ?? "Sem obra", valor }));
}

// 10. Último Preço por Material (a única regra de "preço mais recente" do módulo)
export function ultimoPrecoPorMaterial(pedidosF: readonly PedidoPainel[], fretesF: readonly FretePainel[], nomes: NomesPainel) {
  const preco = new Map<string, { valorUnitario: number; data: string; fornecedorId: string }>();
  for (const p of [...pedidosF].sort((a, b) => a.data.localeCompare(b.data))) {
    for (const i of p.itens) {
      if (i.valorUnitario > 0) preco.set(i.insumoId, { valorUnitario: i.valorUnitario, data: p.data, fornecedorId: p.fornecedorId });
    }
  }
  const frete = new Map<string, { custoPorTon: number; data: string; transportadoraId: string }>();
  for (const f of apenasFretesDePedreira(fretesF).sort((a, b) => a.data.localeCompare(b.data))) {
    if (!f.insumoId || f.peso <= 0) continue;
    frete.set(f.insumoId, { custoPorTon: f.valorTotal / f.peso, data: f.data, transportadoraId: f.transportadoraId });
  }
  return [...preco.entries()]
    .map(([insumoId, info]) => {
      const fr = frete.get(insumoId);
      return {
        insumoId,
        material: nome(nomes.insumo, insumoId),
        fornecedor: nome(nomes.fornecedor, info.fornecedorId),
        valorUnitario: info.valorUnitario,
        data: info.data,
        fretePorTon: fr?.custoPorTon ?? 0,
        freteData: fr?.data ?? "",
        freteTransportadora: fr ? nome(nomes.fornecedor, fr.transportadoraId) : "",
      };
    })
    .sort((a, b) => a.material.localeCompare(b.material));
}

/** Rótulo do valor de um chip de cross-filter. */
export function rotuloCruzado(dim: DimensaoCruzada, valor: string, nomes: NomesPainel): string {
  switch (dim) {
    case "obraId":
      return nomes.obra[valor] ?? valor;
    case "insumoId":
      return nome(nomes.insumo, valor);
    case "fornecedorId":
    case "transportadora":
      return nome(nomes.fornecedor, valor);
    case "origem":
    case "destino":
      return nome(nomes.localidade, valor);
    case "mes":
      return rotuloMes(valor, true);
    case "metodo":
      return METODO_LABEL[valor] ?? valor;
    default:
      return valor;
  }
}

/** Obras (raiz do centro) que têm frete, para o filtro do topo. */
export function opcoesObras(fretes: readonly FretePainel[], nomes: NomesPainel): OpcaoPainel[] {
  return opcoes(
    fretes.flatMap((f) => (f.obraId ? [f.obraId] : [])),
    (id) => nomes.obra[id] ?? id,
  );
}
