import { formatarBRL, formatarData } from "@/lib/formatadores";
import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";

/**
 * O extrato da conta corrente da transportadora, igual ao Gestão Obras
 * (TransportadoraExtratoModal, TransportadoraExtratoList, extrato/*.tsx e
 * utils/extratoExport.ts, levantamento de 23/09/2026).
 *
 * Módulo PURO: serve a tela, a planilha, o PDF e o teste. Nada aqui lê banco.
 *
 * O que muda da origem, e por quê:
 * - O saldo corrido desempata por `createdAt` e depois por `id` quando dois
 *   movimentos têm a mesma data. A origem ordenava só pela string da data, e
 *   movimentos do mesmo instante (o crédito e o débito da mesma saída de
 *   combustível) saíam numa ordem que o banco não garante.
 * - Somas em inteiros de 1/10.000 (as 4 casas da coluna): somar reais em float
 *   deixava resíduo na quarta casa, e o valor gravado já é exato.
 * - Datas em Rio Branco (a origem usava o relógio do aparelho na tela e o dia
 *   UTC na planilha).
 */

export const TIPOS_MOVIMENTO = [
  "credito_frete",
  "debito_pagamento_frete",
  "credito_abastecimento_transterra",
  "debito_abastecimento_transterra",
  "debito_abastecimento_emt",
  "ajuste_manual_credito",
  "ajuste_manual_debito",
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

/** TIPO_LABEL da origem (extratoExport.ts:41-51). */
export const TIPO_LABEL: Record<TipoMovimento, string> = {
  credito_frete: "Crédito · Frete",
  debito_pagamento_frete: "Débito · Pagamento",
  credito_abastecimento_transterra: "Crédito · Abast. (Tanque externo)",
  debito_abastecimento_transterra: "Débito · Abast. (Tanque externo)",
  debito_abastecimento_emt: "Débito · Abast. (EMT)",
  ajuste_manual_credito: "Crédito · Ajuste manual",
  ajuste_manual_debito: "Débito · Ajuste manual",
};

export const TIPOS_CREDITO: ReadonlySet<TipoMovimento> = new Set<TipoMovimento>([
  "credito_frete",
  "credito_abastecimento_transterra",
  "ajuste_manual_credito",
]);

export function ehCredito(tipo: TipoMovimento): boolean {
  return TIPOS_CREDITO.has(tipo);
}

export function ehTipoMovimento(valor: string | null | undefined): valor is TipoMovimento {
  return (TIPOS_MOVIMENTO as readonly string[]).includes(valor ?? "");
}

export const METODOS_PAGAMENTO = ["pix", "boleto", "cheque", "dinheiro", "transferencia", "combustivel"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];
export const METODO_LABEL: Record<MetodoPagamento, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cheque: "Cheque",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  combustivel: "Combustível",
};

export function rotuloMetodo(metodo: string | null | undefined): string {
  if (!metodo) return "";
  return (METODO_LABEL as Record<string, string>)[metodo] ?? metodo;
}

/** Um movimento do extrato, já com os nomes resolvidos (insumo, obra, autor). */
export interface MovimentoExtrato {
  id: string;
  /** timestamptz ISO. */
  data: string;
  createdAt: string;
  tipo: TipoMovimento;
  valor: number;
  descricao: string | null;
  /** "AAAA-MM-01". */
  mesReferencia: string | null;
  origemTabela: string | null;
  origemId: string | null;
  obraNome: string | null;
  fretePeso: number | null;
  freteKm: number | null;
  freteTkm: number | null;
  freteOrigem: string | null;
  freteDestino: string | null;
  freteInsumoNome: string | null;
  freteNotaFiscal: string | null;
  freteNotaFiscal2: string | null;
  fretePlaca: string | null;
  freteMotorista: string | null;
  saidaLitros: number | null;
  /** Preço cobrado da transportadora. */
  saidaPrecoCombustivel: number | null;
  /** Preço que a dona do tanque cobra (o `preco_combustivel_areacre` da origem). */
  saidaPrecoProprietario: number | null;
  saidaTaxaLitro: number | null;
  saidaPrecoMedioTanque: number | null;
  saidaCombustivelNome: string | null;
  saidaPlaca: string | null;
  saidaMotorista: string | null;
  saidaObservacoes: string | null;
  pagamentoMetodo: string | null;
  pagamentoNotaFiscal: string | null;
  pagamentoResponsavel: string | null;
  pagamentoPagoPor: string | null;
  pagamentoObservacoes: string | null;
  pagamentoLitros: number | null;
  ajusteCriadoPor: string | null;
}

export interface MovimentoComSaldo extends MovimentoExtrato {
  saldoAcumulado: number;
}

// ---------------------------------------------------------------------------
// Soma exata nas 4 casas
// ---------------------------------------------------------------------------

const ESCALA = 10 ** CASAS_VALOR_OPERACIONAL;

function emUnidades(valor: number | null | undefined): number {
  return Number.isFinite(valor) ? Math.round((valor as number) * ESCALA) : 0;
}

/** Soma sem resíduo de ponto flutuante. */
export function somar(valores: readonly (number | null | undefined)[]): number {
  let total = 0;
  for (const v of valores) total += emUnidades(v);
  return total / ESCALA;
}

/** Valor com o sinal do tipo: crédito soma, débito subtrai. */
export function valorComSinal(m: Pick<MovimentoExtrato, "tipo" | "valor">): number {
  return ehCredito(m.tipo) ? m.valor : -m.valor;
}

// ---------------------------------------------------------------------------
// Ordem e saldo corrido
// ---------------------------------------------------------------------------

function instante(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Ordem crescente: data, depois created_at, depois id (o desempate estável). */
export function compararAsc(a: MovimentoExtrato, b: MovimentoExtrato): number {
  return (
    instante(a.data) - instante(b.data) ||
    instante(a.createdAt) - instante(b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function compararDesc(a: MovimentoExtrato, b: MovimentoExtrato): number {
  return compararAsc(b, a);
}

/**
 * Saldo corrido da origem (TransportadoraExtratoList.tsx:50-57): ordena em ordem
 * crescente, começa do ZERO dentro do recorte que chegou (mês, tipo, busca) e
 * devolve em ordem decrescente, como extrato de banco. A primeira linha é o
 * saldo do recorte.
 */
export function comSaldoAcumulado(movimentos: readonly MovimentoExtrato[]): MovimentoComSaldo[] {
  const asc = [...movimentos].sort(compararAsc);
  let acumulado = 0;
  return asc
    .map((m) => {
      acumulado += ehCredito(m.tipo) ? emUnidades(m.valor) : -emUnidades(m.valor);
      return { ...m, saldoAcumulado: acumulado / ESCALA };
    })
    .reverse();
}

export interface TotaisExtrato {
  creditos: number;
  debitos: number;
  saldo: number;
  qtd: number;
}

export function totaisDe(movimentos: readonly MovimentoExtrato[]): TotaisExtrato {
  const creditos = somar(movimentos.filter((m) => ehCredito(m.tipo)).map((m) => m.valor));
  const debitos = somar(movimentos.filter((m) => !ehCredito(m.tipo)).map((m) => m.valor));
  return { creditos, debitos, saldo: somar([creditos, -debitos]), qtd: movimentos.length };
}

// ---------------------------------------------------------------------------
// Filtro de mês e cabeçalho
// ---------------------------------------------------------------------------

/** Meses distintos (AAAA-MM-01), do mais novo para o mais velho. */
export function mesesDisponiveis(movimentos: readonly MovimentoExtrato[]): string[] {
  const meses = new Set<string>();
  for (const m of movimentos) if (m.mesReferencia) meses.add(m.mesReferencia.slice(0, 10));
  return [...meses].sort().reverse();
}

/** Vazio = todos os meses. */
export function filtrarPorMeses(movimentos: readonly MovimentoExtrato[], meses: readonly string[]): MovimentoExtrato[] {
  if (meses.length === 0) return [...movimentos];
  const escolhidos = new Set(meses);
  return movimentos.filter((m) => m.mesReferencia !== null && escolhidos.has(m.mesReferencia.slice(0, 10)));
}

const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-06-01" -> "Junho/2026" (formatMesLabel da origem). */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const indice = Number(m) - 1;
  if (!ano || indice < 0 || indice > 11) return mes;
  return `${MESES_LONGOS[indice]}/${ano}`;
}

/** "2026-06-01" -> "06/2026" (fmtMesRef da origem). */
export function mesRefCurto(mes: string | null | undefined): string {
  if (!mes) return "";
  const [ano, m] = mes.split("-");
  return ano && m ? `${m}/${ano}` : mes;
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export interface CabecalhoExtrato {
  titulo: string;
  valor: number;
  sub: string;
}

/**
 * Cabeçalho do extrato: sem mês escolhido, o saldo da view (o saldo da conta);
 * com mês, créditos menos débitos dos movimentos do recorte.
 */
export function cabecalhoDoExtrato(
  saldoDaView: number,
  todos: readonly MovimentoExtrato[],
  meses: readonly string[],
): CabecalhoExtrato {
  if (meses.length === 0) {
    return { titulo: "Saldo atual", valor: saldoDaView, sub: `${plural(todos.length, "movimento", "movimentos")} no total` };
  }
  const recorte = filtrarPorMeses(todos, meses);
  const umMes = meses.length === 1;
  return {
    titulo: umMes ? `Saldo de ${rotuloMes(meses[0]!)}` : `Saldo de ${meses.length} meses`,
    valor: totaisDe(recorte).saldo,
    sub: `${plural(recorte.length, "movimento", "movimentos")} ${umMes ? "no mês" : "no período"}`,
  };
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

export const ABAS_EXTRATO = ["todos", "fretes", "abastecimentos", "pagamentos", "ajustes"] as const;
export type AbaExtrato = (typeof ABAS_EXTRATO)[number];
export const ROTULO_ABA: Record<AbaExtrato, string> = {
  todos: "Todos",
  fretes: "Fretes",
  abastecimentos: "Abastecimentos",
  pagamentos: "Pagamentos",
  ajustes: "Ajustes",
};

export function abaDoTipo(tipo: TipoMovimento): AbaExtrato | null {
  switch (tipo) {
    case "credito_frete":
      return "fretes";
    case "debito_abastecimento_transterra":
    case "debito_abastecimento_emt":
      return "abastecimentos";
    case "debito_pagamento_frete":
      return "pagamentos";
    case "ajuste_manual_credito":
    case "ajuste_manual_debito":
      return "ajustes";
    default:
      // credito_abastecimento_transterra só aparece em "Todos", como na origem.
      return null;
  }
}

export function contadoresDasAbas(movimentos: readonly MovimentoExtrato[]): Record<AbaExtrato, number> {
  const contagem: Record<AbaExtrato, number> = { todos: movimentos.length, fretes: 0, abastecimentos: 0, pagamentos: 0, ajustes: 0 };
  for (const m of movimentos) {
    const aba = abaDoTipo(m.tipo);
    if (aba) contagem[aba] += 1;
  }
  return contagem;
}

function contem(campos: readonly (string | null | undefined)[], busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (q === "") return true;
  return campos.some((c) => (c ?? "").toLowerCase().includes(q));
}

/** Aba Todos: tipos (vazio = todos) e busca em descrição e placa, com saldo corrido. */
export function filtrarTodos(
  movimentos: readonly MovimentoExtrato[],
  tipos: readonly TipoMovimento[],
  busca: string,
): MovimentoComSaldo[] {
  const setTipos = new Set(tipos);
  const filtrados = movimentos.filter(
    (m) => (setTipos.size === 0 || setTipos.has(m.tipo)) && contem([m.descricao, placaMovimento(m)], busca),
  );
  return comSaldoAcumulado(filtrados);
}

export function filtrarFretes(movimentos: readonly MovimentoExtrato[], busca: string): MovimentoExtrato[] {
  return movimentos
    .filter((m) => m.tipo === "credito_frete")
    .filter((m) =>
      contem(
        [
          m.descricao,
          m.freteOrigem,
          m.freteDestino,
          m.freteNotaFiscal,
          m.freteNotaFiscal2,
          m.fretePlaca,
          m.freteMotorista,
          m.freteInsumoNome,
          m.obraNome,
        ],
        busca,
      ),
    )
    .sort(compararDesc);
}

export type CategoriaAbastecimento = "transterra" | "emt";
export const ROTULO_CATEGORIA: Record<CategoriaAbastecimento, string> = { transterra: "Tanque externo", emt: "EMT" };

export function categoriaDoTipo(tipo: TipoMovimento): CategoriaAbastecimento | null {
  if (tipo === "debito_abastecimento_transterra") return "transterra";
  if (tipo === "debito_abastecimento_emt") return "emt";
  return null;
}

export function filtrarAbastecimentos(
  movimentos: readonly MovimentoExtrato[],
  categoria: CategoriaAbastecimento | "",
  busca: string,
): MovimentoExtrato[] {
  return movimentos
    .filter((m) => categoriaDoTipo(m.tipo) !== null)
    .filter((m) => categoria === "" || categoriaDoTipo(m.tipo) === categoria)
    .filter((m) => contem([m.descricao, m.saidaPlaca, m.saidaMotorista, m.saidaCombustivelNome, m.saidaObservacoes], busca))
    .sort(compararDesc);
}

/**
 * Preço por litro da aba Abastecimentos da tela: no tanque da EMT, o preço médio
 * do tanque (cai no cobrado se faltar); no externo, o cobrado. É o que a origem
 * mostra na tela (ExtratoAbastecimentosList.tsx); a planilha usa sempre o cobrado.
 */
export function precoBaseAbastecimento(m: MovimentoExtrato): number {
  return categoriaDoTipo(m.tipo) === "emt"
    ? (m.saidaPrecoMedioTanque ?? m.saidaPrecoCombustivel ?? 0)
    : (m.saidaPrecoCombustivel ?? 0);
}

export function filtrarPagamentos(
  movimentos: readonly MovimentoExtrato[],
  metodo: MetodoPagamento | "",
  busca: string,
): MovimentoExtrato[] {
  return movimentos
    .filter((m) => m.tipo === "debito_pagamento_frete")
    .filter((m) => metodo === "" || m.pagamentoMetodo === metodo)
    .filter((m) =>
      contem([m.descricao, m.pagamentoNotaFiscal, m.pagamentoResponsavel, m.pagamentoPagoPor, m.pagamentoObservacoes], busca),
    )
    .sort(compararDesc);
}

export type SinalAjuste = "credito" | "debito";

export function sinalDoTipo(tipo: TipoMovimento): SinalAjuste | null {
  if (tipo === "ajuste_manual_credito") return "credito";
  if (tipo === "ajuste_manual_debito") return "debito";
  return null;
}

export function filtrarAjustes(
  movimentos: readonly MovimentoExtrato[],
  sinal: SinalAjuste | "",
  busca: string,
): MovimentoExtrato[] {
  return movimentos
    .filter((m) => sinalDoTipo(m.tipo) !== null)
    .filter((m) => sinal === "" || sinalDoTipo(m.tipo) === sinal)
    .filter((m) => contem([m.descricao, m.ajusteCriadoPor, m.obraNome], busca))
    .sort(compararDesc);
}

// ---------------------------------------------------------------------------
// Memória de cálculo e placa
// ---------------------------------------------------------------------------

function numero(n: number, casas: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
const toneladas = (n: number) => `${numero(n, 2)} t`;
const km = (n: number) => `${numero(n, 1)} km`;
const precoL = (n: number) => `R$ ${numero(n, 4)}/L`;
const precoTkm = (n: number) => `R$ ${numero(n, 4)}/tkm`;
const litros = (n: number) => formatarLitros(n);

/**
 * `formatBreakdown` da origem (extratoExport.ts:354-417): a conta que produziu o
 * valor. Vazio quando falta dado, para não mostrar "× R$ 0 = R$ 0".
 */
export function memoriaDeCalculo(m: MovimentoExtrato): string {
  switch (m.tipo) {
    case "credito_frete": {
      const peso = m.fretePeso ?? 0;
      const k = m.freteKm ?? 0;
      const tkm = m.freteTkm ?? 0;
      if (peso <= 0 || k <= 0 || tkm <= 0) return "";
      return `${toneladas(peso)} × ${km(k)} × ${precoTkm(tkm)} = ${formatarBRL(peso * k * tkm)}`;
    }
    case "debito_abastecimento_transterra": {
      const l = m.saidaLitros ?? 0;
      const preco = m.saidaPrecoCombustivel ?? 0;
      const taxa = m.saidaTaxaLitro ?? 0;
      if (l <= 0 || preco <= 0) return "";
      return taxa > 0
        ? `${litros(l)} × (${precoL(preco)} + ${precoL(taxa)} taxa) = ${formatarBRL(l * (preco + taxa))}`
        : `${litros(l)} × ${precoL(preco)} = ${formatarBRL(l * preco)}`;
    }
    case "credito_abastecimento_transterra": {
      const l = m.saidaLitros ?? 0;
      const preco = m.saidaPrecoProprietario ?? m.saidaPrecoCombustivel ?? 0;
      const taxa = m.saidaTaxaLitro ?? 0;
      if (l <= 0 || preco <= 0) return "";
      return taxa > 0
        ? `${litros(l)} × (${precoL(preco)} Areacre + ${precoL(taxa)} taxa) = ${formatarBRL(l * (preco + taxa))}`
        : `${litros(l)} × ${precoL(preco)} (Areacre) = ${formatarBRL(l * preco)}`;
    }
    case "debito_abastecimento_emt": {
      const l = m.saidaLitros ?? 0;
      const preco = m.saidaPrecoCombustivel ?? 0;
      const taxa = m.saidaTaxaLitro ?? 0;
      if (l <= 0 || preco <= 0) {
        if (l > 0) return `${litros(l)} × ${precoL(m.valor / l)} (cobrado) = ${formatarBRL(m.valor)}`;
        return "";
      }
      return taxa > 0
        ? `${litros(l)} × (${precoL(preco)} cobrado + ${precoL(taxa)} taxa) = ${formatarBRL(l * (preco + taxa))}`
        : `${litros(l)} × ${precoL(preco)} (cobrado da transportadora) = ${formatarBRL(l * preco)}`;
    }
    case "debito_pagamento_frete": {
      const partes: string[] = [];
      if (m.pagamentoMetodo) partes.push(`Método: ${m.pagamentoMetodo}`);
      if (m.mesReferencia) partes.push(`Ref: ${m.mesReferencia.slice(0, 7)}`);
      return partes.join(" · ");
    }
    case "ajuste_manual_credito":
    case "ajuste_manual_debito":
      return "Ajuste manual lançado no extrato";
  }
  return "";
}

/** Placa da carreta do movimento (placaMovimento da origem). */
export function placaMovimento(m: MovimentoExtrato): string | null {
  switch (m.tipo) {
    case "credito_frete":
      return m.fretePlaca?.trim() || null;
    case "debito_abastecimento_transterra":
    case "debito_abastecimento_emt":
    case "credito_abastecimento_transterra":
      return m.saidaPlaca?.trim() || null;
    default:
      return null;
  }
}

/** Data do movimento em Rio Branco, dd/mm/aaaa. */
export function dataDoMovimento(iso: string): string {
  return formatarData(iso);
}

// ---------------------------------------------------------------------------
// Conta corrente (cards)
// ---------------------------------------------------------------------------

export interface SaldoTransportadora {
  transportadoraId: string;
  nome: string;
  saldo: number;
  debitoCombustivelTotal: number;
  creditoFreteTotal: number;
  pagoFreteTotal: number;
  qtdMovimentos: number;
}

const SUFIXOS_EMPRESA = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "s.a"]);

function tokensDoNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t !== "" && !SUFIXOS_EMPRESA.has(t));
}

/**
 * A origem esconde da Conta Corrente o fornecedor "ETAM Construtora" (decisão
 * do Tiago de 11/05/2026: é empresa do grupo, não transportadora de fora), por
 * nome exato. No ERP o mesmo fornecedor tem a razão social ("CONSTRUTORA ETAM
 * LTDA") e pode ou não ter nome fantasia, então a comparação é por PALAVRAS, sem
 * ordem, acento, caixa nem sufixo societário: sobra exatamente {etam,
 * construtora}. Um nome com qualquer palavra a mais não é escondido.
 */
export function ehEtamConstrutora(nome: string): boolean {
  const tokens = tokensDoNome(nome);
  return tokens.length === 2 && tokens.includes("etam") && tokens.includes("construtora");
}

export function saldosVisiveis(saldos: readonly SaldoTransportadora[]): SaldoTransportadora[] {
  return saldos.filter((s) => !ehEtamConstrutora(s.nome));
}

/** Card final: Σ débitos de combustível das visíveis (a origem não desconta abatidos). */
export function saldoDevedorCombustivelTotal(saldos: readonly SaldoTransportadora[]): number {
  return somar(saldos.map((s) => s.debitoCombustivelTotal));
}

/** Cor do saldo no card: verde > 0 (a EMT deve), vermelho < 0, cinza 0. */
export function corDoSaldo(saldo: number): "positivo" | "negativo" | "zero" {
  if (saldo > 0) return "positivo";
  if (saldo < 0) return "negativo";
  return "zero";
}

export function rotuloMovimentos(n: number): string {
  return plural(n, "movimento", "movimentos");
}

// ---------------------------------------------------------------------------
// Exportação (planilha e PDF): o recorte da origem
// ---------------------------------------------------------------------------

export interface DadosExportacao {
  /** A aba "Todos": o recorte de meses, com saldo corrido, do mais novo ao mais velho. */
  todos: MovimentoComSaldo[];
  totais: TotaisExtrato & { saldoFinal: number };
  fretes: MovimentoExtrato[];
  abastecimentos: MovimentoExtrato[];
  creditosTanque: MovimentoExtrato[];
  pagamentos: MovimentoExtrato[];
  ajustes: MovimentoExtrato[];
}

/**
 * `prepararExtrato` + os recortes por tipo de `montarExtratoWorkbook` da origem.
 * Na exportação só o filtro de mês vale (a tela da origem manda tipos e busca
 * vazios).
 */
export function dadosDaExportacao(movimentos: readonly MovimentoExtrato[], meses: readonly string[]): DadosExportacao {
  const doMes = filtrarPorMeses(movimentos, meses);
  const todos = comSaldoAcumulado(doMes);
  const porTipo = (...tipos: TipoMovimento[]) => doMes.filter((m) => tipos.includes(m.tipo)).sort(compararDesc);
  return {
    todos,
    totais: { ...totaisDe(doMes), saldoFinal: todos[0]?.saldoAcumulado ?? 0 },
    fretes: porTipo("credito_frete"),
    abastecimentos: porTipo("debito_abastecimento_transterra", "debito_abastecimento_emt"),
    creditosTanque: porTipo("credito_abastecimento_transterra"),
    pagamentos: porTipo("debito_pagamento_frete"),
    ajustes: porTipo("ajuste_manual_credito", "ajuste_manual_debito"),
  };
}

/** Bloco "Filtros aplicados" (filtrosToTuples da origem, só com os meses). */
export function filtrosDaExportacao(meses: readonly string[]): [string, string][] {
  if (meses.length === 0) return [];
  return [[meses.length === 1 ? "Mês de referência" : "Meses de referência", meses.map(rotuloMes).join(", ")]];
}

/** Nome do arquivo exportado: o da origem, em kebab-case e com o dia de Rio Branco. */
export function nomeArquivoExtrato(nomeTransportadora: string, hoje: string, extensao: "xlsx" | "pdf"): string {
  const parte = nomeTransportadora
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `extrato-transportadora-${parte || "transportadora"}-${hoje}.${extensao}`;
}
