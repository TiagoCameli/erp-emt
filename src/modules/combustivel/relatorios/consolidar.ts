import { EQUIPAMENTO_DESCONHECIDO, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * As contas dos quatro relatórios da origem (Gestao_Obras v2/relatorios:
 * mensalConsolidadoExport, porObraExport, porEquipamentoExport, rawExportExcel),
 * portadas com as mesmas regras. Módulo puro (sem banco e sem exceljs), testado em
 * consolidar.test.ts.
 *
 * Mesmas decisões da origem:
 * - o custo de cada linha é o valor total da saída, de equipamento próprio E de carreta;
 * - a obra de uma saída leva a saída inteira (a origem tem uma obra por saída);
 * - o sentinela ("Outros", o 'desconhecido' da origem) não entra no top de equipamentos,
 *   é contado à parte para o aviso;
 * - carreta é agrupada pela placa aparada (sem mexer em maiúsculas);
 * - tops de 10: equipamentos e carretas por litros, obras por custo (Mensal) ou por
 *   litros (Por Equipamento); fornecedores todos, por litros;
 * - R$/L de cada linha = custo ÷ litros.
 *
 * Diferença só de aritmética: litros e valor das saídas somam em inteiros de décimo de
 * milésimo (o banco guarda 4 casas; somar centenas de saídas em float erra a última).
 */

/** Os quatro relatórios da tela. Mora aqui (e não na planilha) para a action validar sem carregar o exceljs. */
export const TIPOS_RELATORIO = ["mensal", "obra", "equipamento", "bruto"] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];

const somar = somarValoresOperacionais;

export interface EntradaRelatorio {
  id: string;
  /** Relógio de parede de Rio Branco. */
  dataHora: string;
  tanqueId: string;
  tipoCombustivel: string;
  litros: number;
  valorTotal: number;
  /** Nome do fornecedor ("" sem fornecedor). */
  fornecedor: string;
  notaFiscal: string | null;
  observacoes: string | null;
  createdBy: string | null;
}

export interface TransferenciaRelatorio {
  id: string;
  dataHora: string;
  tanqueOrigemId: string;
  tanqueDestinoId: string;
  litros: number;
  valorTotal: number;
  observacoes: string | null;
  createdBy: string | null;
}

/** O que os relatórios precisam dos cadastros para dar nome às coisas. */
export interface CadastrosRelatorio {
  equipamentos: ReadonlyMap<string, { descricao: string; codigo: string | null; tipo: string | null }>;
  transportadoraNome: ReadonlyMap<string, string>;
  obraNome: ReadonlyMap<string, string>;
}

export interface LinhaTop {
  nome: string;
  litros: number;
  custo: number;
  rPorL: number;
  qtd: number;
}

export interface LinhaEquipamentoTop extends LinhaTop {
  codigo: string;
}

export interface LinhaCarretaTop extends LinhaTop {
  placa: string;
  transportadora: string;
}

interface Acumulado {
  litros: number[];
  custo: number[];
  qtd: number;
}

function acumular<K>(mapa: Map<K, Acumulado>, chave: K, litros: number, custo: number): void {
  const atual = mapa.get(chave) ?? { litros: [], custo: [], qtd: 0 };
  atual.litros.push(litros);
  atual.custo.push(custo);
  atual.qtd += 1;
  mapa.set(chave, atual);
}

function fechar(a: Acumulado, somaLitros: (v: number[]) => number = somar, somaCusto: (v: number[]) => number = somar) {
  const litros = somaLitros(a.litros);
  const custo = somaCusto(a.custo);
  return { litros, custo, qtd: a.qtd, rPorL: litros > 0 ? custo / litros : 0 };
}

/** Soma simples em float, como a origem: o valor da entrada pode ter mais de 4 casas. */
function somaFloat(valores: readonly number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}

/** Sort estável por litros (ou custo) desc, corta em n: o `topByLitros` da origem. */
function top<T>(linhas: T[], chave: (l: T) => number, n: number): T[] {
  return [...linhas].sort((a, b) => chave(b) - chave(a)).slice(0, n);
}

function codigoDoEquipamento(e: { codigo: string | null; tipo: string | null } | undefined): string {
  return e?.codigo?.trim() || e?.tipo?.trim() || "";
}

// ---------------------------------------------------------------------------
// Blocos compartilhados
// ---------------------------------------------------------------------------

export interface Compras {
  volumeCompras: number;
  custoCompras: number;
  qtdFornecedores: number;
  fornecedores: LinhaTop[];
}

/** Entradas do período: compras e fornecedores (pelo nome aparado), todos, por litros. */
export function consolidarCompras(entradas: readonly EntradaRelatorio[]): Compras {
  const porFornecedor = new Map<string, Acumulado>();
  for (const e of entradas) {
    const nome = e.fornecedor.trim();
    if (nome) acumular(porFornecedor, nome, e.litros, e.valorTotal);
  }
  return {
    volumeCompras: somar(entradas.map((e) => e.litros)),
    custoCompras: somaFloat(entradas.map((e) => e.valorTotal)),
    qtdFornecedores: porFornecedor.size,
    fornecedores: top(
      [...porFornecedor.entries()].map(([nome, a]) => ({ nome, ...fechar(a, somar, somaFloat) })),
      (l) => l.litros,
      Number.POSITIVE_INFINITY,
    ),
  };
}

function consolidarConsumidores(saidas: readonly SaidaBase[], cadastros: CadastrosRelatorio) {
  const porEquipamento = new Map<string, Acumulado>();
  const porPlaca = new Map<string, Acumulado & { transportadora: string }>();
  let qtdSentinel = 0;
  for (const s of saidas) {
    if (s.tipoConsumidor === "equipamento_proprio") {
      if (s.equipamentoId === EQUIPAMENTO_DESCONHECIDO) qtdSentinel += 1;
      else if (s.equipamentoId) acumular(porEquipamento, s.equipamentoId, s.litros, s.valorTotal);
    } else if (s.tipoConsumidor === "carreta_transportadora") {
      const placa = (s.placa || "").trim();
      if (!placa) continue;
      const transportadora = s.transportadoraId ? (cadastros.transportadoraNome.get(s.transportadoraId) ?? "") : "";
      const atual = porPlaca.get(placa) ?? { litros: [], custo: [], qtd: 0, transportadora };
      atual.litros.push(s.litros);
      atual.custo.push(s.valorTotal);
      atual.qtd += 1;
      porPlaca.set(placa, atual);
    }
  }
  const topEquipamentos: LinhaEquipamentoTop[] = top(
    [...porEquipamento.entries()].map(([id, a]) => {
      const e = cadastros.equipamentos.get(id);
      return { nome: e?.descricao ?? id, codigo: codigoDoEquipamento(e), ...fechar(a) };
    }),
    (l) => l.litros,
    10,
  );
  const topCarretas: LinhaCarretaTop[] = top(
    [...porPlaca.entries()].map(([placa, a]) => ({ nome: placa, placa, transportadora: a.transportadora, ...fechar(a) })),
    (l) => l.litros,
    10,
  );
  return { qtdEquipamentos: porEquipamento.size, qtdCarretas: porPlaca.size, qtdSentinel, topEquipamentos, topCarretas };
}

function totais(saidas: readonly SaidaBase[]) {
  const volume = somar(saidas.map((s) => s.litros));
  const custo = somar(saidas.map((s) => s.valorTotal));
  return { volume, custo, rPorL: volume > 0 ? custo / volume : 0, qtdSaidas: saidas.length };
}

/** Saídas da mais recente para a mais antiga (a origem ordena a string da data). */
export function saidasDesc<T extends { data: string }>(saidas: readonly T[]): T[] {
  return [...saidas].sort((a, b) => b.data.localeCompare(a.data));
}

// ---------------------------------------------------------------------------
// (a) Mensal consolidado
// ---------------------------------------------------------------------------

export interface DadosMensal {
  totais: ReturnType<typeof totais> & {
    qtdEquipamentosProprios: number;
    qtdSentinel: number;
    qtdCarretas: number;
    qtdObras: number;
    volumeCompras: number;
    custoCompras: number;
    qtdFornecedores: number;
  };
  topEquipamentos: LinhaEquipamentoTop[];
  topCarretas: LinhaCarretaTop[];
  topObras: LinhaTop[];
  fornecedores: LinhaTop[];
}

export function consolidarMensal(
  saidasNoMes: readonly SaidaBase[],
  entradasNoMes: readonly EntradaRelatorio[],
  cadastros: CadastrosRelatorio,
): DadosMensal {
  const consumidores = consolidarConsumidores(saidasNoMes, cadastros);
  const compras = consolidarCompras(entradasNoMes);
  const porObra = new Map<string, Acumulado>();
  for (const s of saidasNoMes) {
    if (s.obraId) acumular(porObra, s.obraId, s.litros, s.valorTotal);
  }
  return {
    totais: {
      ...totais(saidasNoMes),
      qtdEquipamentosProprios: consumidores.qtdEquipamentos,
      qtdSentinel: consumidores.qtdSentinel,
      qtdCarretas: consumidores.qtdCarretas,
      qtdObras: porObra.size,
      volumeCompras: compras.volumeCompras,
      custoCompras: compras.custoCompras,
      qtdFornecedores: compras.qtdFornecedores,
    },
    topEquipamentos: consumidores.topEquipamentos,
    topCarretas: consumidores.topCarretas,
    topObras: top(
      [...porObra.entries()].map(([id, a]) => ({ nome: cadastros.obraNome.get(id) ?? id, ...fechar(a) })),
      (l) => l.custo,
      10,
    ),
    fornecedores: compras.fornecedores,
  };
}

// ---------------------------------------------------------------------------
// (b) Por obra
// ---------------------------------------------------------------------------

export interface DadosPorObra {
  totais: ReturnType<typeof totais> & {
    qtdEquipamentos: number;
    qtdSentinel: number;
    qtdCarretas: number;
    volumeCompras: number;
    custoCompras: number;
    qtdFornecedores: number;
  };
  topEquipamentos: LinhaEquipamentoTop[];
  topCarretas: LinhaCarretaTop[];
  fornecedores: LinhaTop[];
  saidasDesc: SaidaBase[];
}

/** `saidasObra`: as saídas da obra no mês, próprios E carretas (a origem quer o consumo inteiro da obra). */
export function consolidarPorObra(
  saidasObra: readonly SaidaBase[],
  entradasNoMes: readonly EntradaRelatorio[],
  cadastros: CadastrosRelatorio,
): DadosPorObra {
  const consumidores = consolidarConsumidores(saidasObra, cadastros);
  const compras = consolidarCompras(entradasNoMes);
  return {
    totais: {
      ...totais(saidasObra),
      qtdEquipamentos: consumidores.qtdEquipamentos,
      qtdSentinel: consumidores.qtdSentinel,
      qtdCarretas: consumidores.qtdCarretas,
      volumeCompras: compras.volumeCompras,
      custoCompras: compras.custoCompras,
      qtdFornecedores: compras.qtdFornecedores,
    },
    topEquipamentos: consumidores.topEquipamentos,
    topCarretas: consumidores.topCarretas,
    fornecedores: compras.fornecedores,
    saidasDesc: saidasDesc(saidasObra),
  };
}

// ---------------------------------------------------------------------------
// (c) Por equipamento
// ---------------------------------------------------------------------------

export interface DadosPorEquipamento {
  totais: ReturnType<typeof totais> & {
    qtdObras: number;
    diasAtivos: number;
    volumeCompras: number;
    custoCompras: number;
    qtdFornecedores: number;
  };
  topObras: LinhaTop[];
  fornecedores: LinhaTop[];
  saidasDesc: SaidaBase[];
}

/** `saidasEquipamento`: as de equipamento próprio daquele equipamento no intervalo. */
export function consolidarPorEquipamento(
  saidasEquipamento: readonly SaidaBase[],
  entradasNoPeriodo: readonly EntradaRelatorio[],
  cadastros: CadastrosRelatorio,
): DadosPorEquipamento {
  const compras = consolidarCompras(entradasNoPeriodo);
  const porObra = new Map<string, Acumulado>();
  const dias = new Set<string>();
  for (const s of saidasEquipamento) {
    dias.add(s.data.slice(0, 10));
    if (s.obraId) acumular(porObra, s.obraId, s.litros, s.valorTotal);
  }
  return {
    totais: {
      ...totais(saidasEquipamento),
      qtdObras: porObra.size,
      diasAtivos: dias.size,
      volumeCompras: compras.volumeCompras,
      custoCompras: compras.custoCompras,
      qtdFornecedores: compras.qtdFornecedores,
    },
    topObras: top(
      [...porObra.entries()].map(([id, a]) => ({ nome: cadastros.obraNome.get(id) ?? id, ...fechar(a) })),
      (l) => l.litros,
      10,
    ),
    fornecedores: compras.fornecedores,
    saidasDesc: saidasDesc(saidasEquipamento),
  };
}

// ---------------------------------------------------------------------------
// Rótulos das linhas de saída
// ---------------------------------------------------------------------------

/** "Consumidor" da origem: "COD · Nome", "Não identificado", ou "PLACA · Transportadora". */
export function consumidorDaSaida(s: SaidaBase, cadastros: CadastrosRelatorio): string {
  if (s.tipoConsumidor === "equipamento_proprio") {
    if (s.equipamentoId === EQUIPAMENTO_DESCONHECIDO) return "Não identificado";
    if (!s.equipamentoId) return "-";
    const e = cadastros.equipamentos.get(s.equipamentoId);
    if (!e) return s.equipamentoId;
    const codigo = codigoDoEquipamento(e);
    return codigo ? `${codigo} · ${e.descricao}` : e.descricao;
  }
  const transportadora = s.transportadoraId ? (cadastros.transportadoraNome.get(s.transportadoraId) ?? "") : "";
  return `${s.placa ?? "-"}${transportadora ? ` · ${transportadora}` : ""}`;
}

/** R$/L da linha: valor ÷ litros (0 sem litros). */
export function rPorLDaSaida(s: { litros: number; valorTotal: number }): number {
  return s.litros > 0 ? s.valorTotal / s.litros : 0;
}
