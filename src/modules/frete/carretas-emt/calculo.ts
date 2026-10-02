/**
 * Carretas EMT: a produção das carretas próprias contra o que elas custam.
 *
 * Os números chegam agregados da RPC `fn_frete_carretas_emt` (mês x carreta x categoria; as
 * regras de cada um estão no comentário da migration 20261001155959). Aqui só se recorta pelo
 * período e pela carreta, se agrupa e se deriva: resultado, margem, R$ por viagem, por tonelada
 * e por km.
 *
 * Toda soma de dinheiro é em CENTAVOS inteiros: somar reais em ponto flutuante erra o centavo
 * depois de algumas dezenas de linhas (mesmo motivo dos relatórios do Financeiro).
 *
 * As definições (combinadas com o Tiago na entrega, 30/09/2026):
 *   Produção ................. valor dos fretes da EMT TRANSPORTES (o que a carreta faturou).
 *   Custo operacional ........ gasto lançado nas carretas, menos Aquisição de equipamento, mais o
 *                              diesel do tanque abastecido pela placa.
 *   Investimento à vista ..... Aquisição de equipamento que NÃO é financiamento (entrada,
 *                              implemento pago à vista).
 *   Financiamento ............ parcelas dos contratos (e_divida) que vencem no período, na fração
 *                              de cada carreta.
 *   Resultado operacional .... produção - custo operacional.
 *   Resultado final .......... resultado operacional - investimento à vista - parcelas.
 */

import { montarAlertas, montarRotas, type AlertaRota, type LinhaRota } from "./rotas";

export const GRUPOS_GASTO = ["mao_de_obra", "manutencao", "combustivel", "documentacao", "aquisicao", "outros"] as const;
export type GrupoGasto = (typeof GRUPOS_GASTO)[number];

export const ROTULO_GRUPO: Record<GrupoGasto, string> = {
  mao_de_obra: "Mão de obra",
  manutencao: "Manutenção",
  combustivel: "Combustível (posto)",
  documentacao: "Impostos e documentação",
  aquisicao: "Aquisição à vista",
  outros: "Outras despesas",
};

/** Chave do gasto da raiz "001 - Carretas EMT": da frota inteira, sem placa. */
export const CHAVE_FROTA = "frota";
/** Chave dos fretes com placa que não é de nenhuma das carretas (digitação errada, carreta nova). */
export const CHAVE_OUTRAS = "outras";

export interface Carreta {
  centroId: string;
  nome: string;
  placa: string;
}

export interface FreteMes {
  placa: string;
  /** yyyy-MM */
  mes: string;
  tipo: string;
  viagens: number;
  toneladas: number;
  km: number;
  valor: number;
  /** Rota do frete (migration 20261001193947). Ausente nas leituras antigas. */
  origemId?: string;
  destinoId?: string;
  kmMin?: number;
  kmMax?: number;
  /** Fretes do grupo com data de chegada, a soma dos dias entre saída e chegada e o maior deles. */
  comChegada?: number;
  dias?: number;
  diasMax?: number | null;
}

export interface Localidade {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
}

/** Um frete fora do padrão da rota, ainda não conferido (regras na migration 20261001215045). */
export interface AlertaFrete {
  /** R1: km lançado longe da estrada. R2: viagem longa demais. */
  regra: "R1" | "R2";
  freteId: string;
  /** yyyy-MM-dd da saída. */
  data: string;
  mes: string;
  tipo: string;
  placa: string;
  origemId: string;
  destinoId: string;
  km: number;
  kmMapa: number | null;
  dias: number | null;
  /** Mediana de dias da rota. */
  mediana: number | null;
}

export interface TracadoRota {
  origemId: string;
  destinoId: string;
  /** Distância pela estrada (OSRM). */
  kmMapa: number;
  horasMapa: number | null;
  /** [lat, lng] */
  pontos: [number, number][];
}

export interface GastoMes {
  centroId: string;
  mes: string;
  categoria: string;
  valor: number;
  pago: number;
}

export interface Contrato {
  lancamentoId: string;
  centroId: string;
  numero: string;
  credor: string;
  /** A fração desta carreta no valor do contrato. */
  contratado: number;
  parcelas: number;
}

export interface ParcelaMes {
  lancamentoId: string;
  centroId: string;
  mes: string;
  paga: boolean;
  quantidade: number;
  valor: number;
}

export interface DieselMes {
  placa: string;
  mes: string;
  litros: number;
  valor: number;
}

export interface DadosCarretas {
  raizId: string;
  carretas: Carreta[];
  fretes: FreteMes[];
  gastos: GastoMes[];
  contratos: Contrato[];
  parcelas: ParcelaMes[];
  diesel: DieselMes[];
  localidades: Localidade[];
  tracados: TracadoRota[];
  alertas: AlertaFrete[];
}

export interface FiltroCarretas {
  /** yyyy-MM, inclusive. */
  de: string;
  ate: string;
  /** Vazio = a frota inteira. */
  placa: string;
  /**
   * Tipo de transporte do frete (material, transferencia); vazio = todos. Recorta SÓ a produção:
   * o gasto e a parcela são da carreta inteira e não se dividem por tipo de viagem.
   */
  tipo?: string;
  /**
   * Rota escolhida na tabela de rotas ("<origem>_<destino>", ids das localidades); vazio = todas.
   * Como o tipo, recorta só a produção.
   */
  rota?: string;
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function mesValido(valor: string | undefined | null): string | null {
  return valor && MES_RE.test(valor) ? valor : null;
}

/** Placa como o banco compara: só letra e número, maiúscula ("sqs 7e01" -> "SQS7E01"). */
export function normalizarPlaca(placa: string): string {
  return placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O grupo de uma categoria do Financeiro, pelo nome. As categorias das carretas (30/09/2026):
 * Salário, Vale Alimentação, Férias, 13º, Rescisões e Mão de Obra Terceirizada (mão de obra);
 * Manutenção e Manutenção de equipamentos; Combustível; IPVA; Aquisição de Equipamento; o resto
 * (Outras despesas, Materiais, Frete, Hospedagem, Reembolso, Despesas financeiras) em outras.
 */
export function grupoDaCategoria(categoria: string): GrupoGasto {
  const nome = semAcento(categoria);
  if (/mao de obra|salario|ferias|13|rescis|vale alimentacao|alimentacao/.test(nome)) return "mao_de_obra";
  if (nome.includes("manutencao") || nome.includes("pneu") || nome.includes("peca")) return "manutencao";
  if (nome.includes("combustivel") || nome.includes("diesel")) return "combustivel";
  if (/ipva|licenciamento|seguro|documenta|multa|taxa/.test(nome)) return "documentacao";
  if (nome.includes("aquisicao")) return "aquisicao";
  return "outros";
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" -> "set/26". */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${(ano ?? "").slice(2)}`;
}

/** Todos os meses de `de` a `ate`, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = de.split("-").map(Number) as [number, number];
  const [anoFim, mesFim] = ate.split("-").map(Number) as [number, number];
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    if (meses.length > 240) break;
  }
  return meses;
}

/**
 * O período que a aba abre: do primeiro mês com frete ou gasto até o mês de hoje. As parcelas
 * não puxam o começo (a primeira venceu antes da carreta rodar) nem o fim (vão até 2031).
 */
export function periodoPadrao(dados: DadosCarretas, mesAtual: string): { de: string; ate: string } {
  const meses = [...dados.fretes.map((f) => f.mes), ...dados.gastos.map((g) => g.mes)].filter(
    (m) => MES_RE.test(m) && m <= mesAtual,
  );
  const de = meses.length > 0 ? meses.reduce((a, b) => (a < b ? a : b)) : mesAtual;
  return { de, ate: mesAtual };
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface Financiamento {
  contratado: number;
  pago: number;
  /** Soma das parcelas ainda não pagas (vencidas ou não). */
  saldo: number;
  /** Parcelas não pagas com vencimento anterior ao mês atual. */
  emAtraso: number;
  /** A soma das parcelas que vencem no mês atual (ou no primeiro mês adiante com parcela). */
  proximaParcela: number;
  proximoMes: string | null;
  parcelasPagas: number;
  parcelasTotal: number;
}

export interface Desempenho {
  chave: string;
  nome: string;
  placa: string | null;
  viagens: number;
  toneladas: number;
  km: number;
  producao: number;
  gastos: Record<GrupoGasto, number>;
  diesel: number;
  litros: number;
  custoOperacional: number;
  investimento: number;
  parcelas: number;
  resultadoOperacional: number;
  resultadoFinal: number;
  /** resultado operacional / produção; null sem produção. */
  margemOperacional: number | null;
  producaoPorViagem: number | null;
  producaoPorTonelada: number | null;
  producaoPorKm: number | null;
  custoPorKm: number | null;
  /** Meses do período com pelo menos um frete. */
  mesesRodando: number;
  financiamento: Financiamento;
}

export interface LinhaMensal {
  mes: string;
  rotulo: string;
  viagens: number;
  toneladas: number;
  km: number;
  producao: number;
  /** Por placa (e CHAVE_OUTRAS), para os gráficos empilhados. */
  viagensPorCarreta: Record<string, number>;
  producaoPorCarreta: Record<string, number>;
  /** Custo operacional (gasto sem aquisição + diesel) por placa, CHAVE_FROTA e CHAVE_OUTRAS. */
  custoPorCarreta: Record<string, number>;
  custoOperacional: number;
  investimento: number;
  parcelas: number;
  resultadoOperacional: number;
  resultadoFinal: number;
  /** Resultado final somado desde o primeiro mês do período. */
  resultadoAcumulado: number;
  /** Resultado operacional somado desde o primeiro mês do período. */
  operacionalAcumulado: number;
}

export interface LinhaContrato {
  lancamentoId: string;
  numero: string;
  credor: string;
  /** Placas do contrato (um contrato pode ser de três carretas). */
  placas: string[];
  contratado: number;
  pago: number;
  saldo: number;
  parcelasPagas: number;
  parcelasTotal: number;
  proximaParcela: number;
}

export interface LinhaCategoria {
  categoria: string;
  grupo: GrupoGasto;
  valor: number;
  pago: number;
}

export interface PainelCarretas {
  filtro: FiltroCarretas;
  meses: LinhaMensal[];
  /** Uma por carreta, na ordem do cadastro; sem filtro de placa, mais frota e outras quando houver. */
  desempenhos: Desempenho[];
  total: Desempenho;
  contratos: LinhaContrato[];
  categorias: LinhaCategoria[];
  /** Placas de frete que não casaram com nenhuma carreta. */
  placasNaoReconhecidas: string[];
  /** Produção por rota (origem -> destino), com o mesmo recorte de período, carreta e tipo. */
  rotas: LinhaRota[];
  /** Fretes fora do padrão da rota ainda não conferidos, agrupados por rota e regra. */
  alertas: AlertaRota[];
  /** O que os filtros de carreta e tipo oferecem (ver `presentesNosFiltros`). */
  presentes: PresentesNosFiltros;
}

export interface PresentesNosFiltros {
  /** Placas de carreta com frete ou gasto no recorte dos outros filtros. */
  placas: string[];
  /** Tipos de transporte com frete no recorte dos outros filtros. */
  tipos: string[];
}

/**
 * Facetado (ver `_shared/filtros-facetados`), pedido do Tiago de 02/10/2026: o
 * filtro de carreta só oferece as placas com dado no período, no tipo e na rota
 * escolhidos, e o de tipo só os tipos dos fretes do período, da carreta e da rota.
 * O período restringe, sem lista. O gasto não tem tipo nem rota (é da carreta
 * inteira), então conta para a placa em qualquer tipo, como no painel.
 */
export function presentesNosFiltros(dados: DadosCarretas, filtro: FiltroCarretas): PresentesNosFiltros {
  const dentro = (mes: string) => mes >= filtro.de && mes <= filtro.ate;
  const placaDoCentro = new Map(dados.carretas.map((k) => [k.centroId, k.placa]));
  const escolhida = filtro.placa ? normalizarPlaca(filtro.placa) : "";
  const naRota = (f: FreteMes) => !filtro.rota || `${f.origemId ?? ""}_${f.destinoId ?? ""}` === filtro.rota;
  const placas = new Set<string>();
  const tipos = new Set<string>();
  for (const f of dados.fretes) {
    if (!dentro(f.mes) || !naRota(f)) continue;
    if (!filtro.tipo || f.tipo === filtro.tipo) placas.add(f.placa);
    if (!escolhida || f.placa === escolhida) tipos.add(f.tipo);
  }
  for (const g of dados.gastos) {
    const placa = placaDoCentro.get(g.centroId);
    if (placa && dentro(g.mes)) placas.add(placa);
  }
  return { placas: [...placas].sort(), tipos: [...tipos].sort() };
}

const c = (reais: number) => Math.round(reais * 100);
const r = (centavos: number) => centavos / 100;
const razao = (a: number, b: number) => (b > 0 ? a / b : null);

interface Acumulador {
  viagens: number;
  toneladas: number;
  km: number;
  producao: number;
  gastos: Record<GrupoGasto, number>;
  diesel: number;
  litros: number;
  parcelas: number;
  mesesComFrete: Set<string>;
  contratado: number;
  pago: number;
  saldo: number;
  emAtraso: number;
  parcelasPagas: number;
  parcelasTotal: number;
  porMesFuturo: Map<string, number>;
}

function novoAcumulador(): Acumulador {
  return {
    viagens: 0,
    toneladas: 0,
    km: 0,
    producao: 0,
    gastos: Object.fromEntries(GRUPOS_GASTO.map((g) => [g, 0])) as Record<GrupoGasto, number>,
    diesel: 0,
    litros: 0,
    parcelas: 0,
    mesesComFrete: new Set(),
    contratado: 0,
    pago: 0,
    saldo: 0,
    emAtraso: 0,
    parcelasPagas: 0,
    parcelasTotal: 0,
    porMesFuturo: new Map(),
  };
}

function fechar(chave: string, nome: string, placa: string | null, a: Acumulador): Desempenho {
  const gastosOperacionais = GRUPOS_GASTO.filter((g) => g !== "aquisicao").reduce((s, g) => s + a.gastos[g], 0);
  const custoOperacional = gastosOperacionais + a.diesel;
  const investimento = a.gastos.aquisicao;
  const resultadoOperacional = a.producao - custoOperacional;
  const resultadoFinal = resultadoOperacional - investimento - a.parcelas;
  const proximo = [...a.porMesFuturo.entries()].sort(([x], [y]) => x.localeCompare(y))[0];
  return {
    chave,
    nome,
    placa,
    viagens: a.viagens,
    toneladas: a.toneladas,
    km: a.km,
    producao: r(a.producao),
    gastos: Object.fromEntries(GRUPOS_GASTO.map((g) => [g, r(a.gastos[g])])) as Record<GrupoGasto, number>,
    diesel: r(a.diesel),
    litros: a.litros,
    custoOperacional: r(custoOperacional),
    investimento: r(investimento),
    parcelas: r(a.parcelas),
    resultadoOperacional: r(resultadoOperacional),
    resultadoFinal: r(resultadoFinal),
    margemOperacional: razao(resultadoOperacional, a.producao),
    producaoPorViagem: razao(r(a.producao), a.viagens),
    producaoPorTonelada: razao(r(a.producao), a.toneladas),
    producaoPorKm: razao(r(a.producao), a.km),
    custoPorKm: razao(r(custoOperacional), a.km),
    mesesRodando: a.mesesComFrete.size,
    financiamento: {
      contratado: r(a.contratado),
      pago: r(a.pago),
      saldo: r(a.saldo),
      emAtraso: r(a.emAtraso),
      proximaParcela: r(proximo?.[1] ?? 0),
      proximoMes: proximo?.[0] ?? null,
      parcelasPagas: a.parcelasPagas,
      parcelasTotal: a.parcelasTotal,
    },
  };
}

function somarEm(destino: Acumulador, origem: Acumulador): void {
  destino.viagens += origem.viagens;
  destino.toneladas += origem.toneladas;
  destino.km += origem.km;
  destino.producao += origem.producao;
  for (const g of GRUPOS_GASTO) destino.gastos[g] += origem.gastos[g];
  destino.diesel += origem.diesel;
  destino.litros += origem.litros;
  destino.parcelas += origem.parcelas;
  for (const m of origem.mesesComFrete) destino.mesesComFrete.add(m);
  destino.contratado += origem.contratado;
  destino.pago += origem.pago;
  destino.saldo += origem.saldo;
  destino.emAtraso += origem.emAtraso;
  destino.parcelasPagas += origem.parcelasPagas;
  destino.parcelasTotal += origem.parcelasTotal;
  for (const [m, v] of origem.porMesFuturo) destino.porMesFuturo.set(m, (destino.porMesFuturo.get(m) ?? 0) + v);
}

/**
 * Monta a aba inteira para o período e a carreta escolhidos.
 *
 * `mesAtual` (yyyy-MM, Rio Branco) separa parcela em atraso de parcela a vencer. A posição do
 * financiamento (contratado, pago, saldo) é a de HOJE, não a do período: o saldo devedor não
 * depende de qual mês se olha.
 */
export function montarPainel(dados: DadosCarretas, filtro: FiltroCarretas, mesAtual: string): PainelCarretas {
  const dentro = (mes: string) => mes >= filtro.de && mes <= filtro.ate;
  const placaDoCentro = new Map(dados.carretas.map((k) => [k.centroId, k.placa]));
  const placas = new Set(dados.carretas.map((k) => k.placa));
  const escolhida = filtro.placa ? normalizarPlaca(filtro.placa) : "";

  // A chave de cada linha: a placa da carreta, a frota (raiz) ou outras (placa desconhecida).
  const chaveDoCentro = (centroId: string) => placaDoCentro.get(centroId) ?? CHAVE_FROTA;
  const chaveDaPlaca = (placa: string) => (placas.has(placa) ? placa : CHAVE_OUTRAS);
  const entra = (chave: string) => !escolhida || chave === escolhida;

  const acumuladores = new Map<string, Acumulador>();
  const acc = (chave: string) => {
    let a = acumuladores.get(chave);
    if (!a) {
      a = novoAcumulador();
      acumuladores.set(chave, a);
    }
    return a;
  };

  const meses = mesesEntre(filtro.de, filtro.ate).map<LinhaMensal & { _c: { producao: number; custo: number; investimento: number; parcelas: number } }>((mes) => ({
    mes,
    rotulo: rotuloMes(mes),
    viagens: 0,
    toneladas: 0,
    km: 0,
    producao: 0,
    viagensPorCarreta: {},
    producaoPorCarreta: {},
    custoPorCarreta: {},
    custoOperacional: 0,
    investimento: 0,
    parcelas: 0,
    resultadoOperacional: 0,
    resultadoFinal: 0,
    resultadoAcumulado: 0,
    operacionalAcumulado: 0,
    _c: { producao: 0, custo: 0, investimento: 0, parcelas: 0 },
  }));
  const linhaDoMes = new Map(meses.map((m) => [m.mes, m]));

  const naoReconhecidas = new Set<string>();

  for (const f of dados.fretes) {
    const chave = chaveDaPlaca(f.placa);
    if (chave === CHAVE_OUTRAS) naoReconhecidas.add(f.placa || "(sem placa)");
    if (!entra(chave) || !dentro(f.mes)) continue;
    if (filtro.tipo && f.tipo !== filtro.tipo) continue;
    if (filtro.rota && `${f.origemId ?? ""}_${f.destinoId ?? ""}` !== filtro.rota) continue;
    const a = acc(chave);
    a.viagens += f.viagens;
    a.toneladas += f.toneladas;
    a.km += f.km;
    a.producao += c(f.valor);
    if (f.viagens > 0) a.mesesComFrete.add(f.mes);
    const linha = linhaDoMes.get(f.mes);
    if (linha) {
      linha.viagens += f.viagens;
      linha.toneladas += f.toneladas;
      linha.km += f.km;
      linha._c.producao += c(f.valor);
      linha.viagensPorCarreta[chave] = (linha.viagensPorCarreta[chave] ?? 0) + f.viagens;
      linha.producaoPorCarreta[chave] = (linha.producaoPorCarreta[chave] ?? 0) + c(f.valor);
    }
  }

  const categorias = new Map<string, LinhaCategoria & { _v: number; _p: number }>();
  for (const g of dados.gastos) {
    const chave = chaveDoCentro(g.centroId);
    if (!entra(chave) || !dentro(g.mes)) continue;
    const grupo = grupoDaCategoria(g.categoria);
    acc(chave).gastos[grupo] += c(g.valor);
    const cat = categorias.get(g.categoria) ?? { categoria: g.categoria, grupo, valor: 0, pago: 0, _v: 0, _p: 0 };
    cat._v += c(g.valor);
    cat._p += c(g.pago);
    categorias.set(g.categoria, cat);
    const linha = linhaDoMes.get(g.mes);
    if (linha) {
      if (grupo === "aquisicao") linha._c.investimento += c(g.valor);
      else {
        linha._c.custo += c(g.valor);
        linha.custoPorCarreta[chave] = (linha.custoPorCarreta[chave] ?? 0) + c(g.valor);
      }
    }
  }

  for (const d of dados.diesel) {
    const chave = chaveDaPlaca(d.placa);
    if (!entra(chave) || !dentro(d.mes)) continue;
    const a = acc(chave);
    a.diesel += c(d.valor);
    a.litros += d.litros;
    const linha = linhaDoMes.get(d.mes);
    if (linha) {
      linha._c.custo += c(d.valor);
      linha.custoPorCarreta[chave] = (linha.custoPorCarreta[chave] ?? 0) + c(d.valor);
    }
  }

  // Financiamento: a parcela do período entra no resultado; a posição (pago, saldo) é de hoje.
  const contratosPorId = new Map<string, LinhaContrato & { _k: Map<string, number>; _pg: number; _sd: number; _ct: number }>();
  for (const k of dados.contratos) {
    const chave = chaveDoCentro(k.centroId);
    if (!entra(chave)) continue;
    acc(chave).contratado += c(k.contratado);
    const linha = contratosPorId.get(k.lancamentoId) ?? {
      lancamentoId: k.lancamentoId,
      numero: k.numero,
      credor: k.credor,
      placas: [] as string[],
      contratado: 0,
      pago: 0,
      saldo: 0,
      parcelasPagas: 0,
      parcelasTotal: k.parcelas,
      proximaParcela: 0,
      _k: new Map(),
      _pg: 0,
      _sd: 0,
      _ct: 0,
    };
    if (chave !== CHAVE_FROTA && !linha.placas.includes(chave)) linha.placas.push(chave);
    linha._ct += c(k.contratado);
    contratosPorId.set(k.lancamentoId, linha);
  }
  // Parcelas pagas contadas por contrato uma vez só: a mesma parcela aparece em cada carreta dele.
  const pagasPorContrato = new Map<string, Map<string, number>>();
  for (const p of dados.parcelas) {
    const chave = chaveDoCentro(p.centroId);
    if (!entra(chave)) continue;
    const a = acc(chave);
    const valor = c(p.valor);
    const contrato = contratosPorId.get(p.lancamentoId);
    if (p.paga) {
      a.pago += valor;
      if (contrato) contrato._pg += valor;
      const porMes = pagasPorContrato.get(p.lancamentoId) ?? new Map<string, number>();
      porMes.set(p.mes, Math.max(porMes.get(p.mes) ?? 0, p.quantidade));
      pagasPorContrato.set(p.lancamentoId, porMes);
    } else {
      a.saldo += valor;
      if (p.mes < mesAtual) a.emAtraso += valor;
      else a.porMesFuturo.set(p.mes, (a.porMesFuturo.get(p.mes) ?? 0) + valor);
      if (contrato) {
        contrato._sd += valor;
        if (p.mes >= mesAtual) contrato._k.set(p.mes, (contrato._k.get(p.mes) ?? 0) + valor);
      }
    }
    if (dentro(p.mes)) {
      a.parcelas += valor;
      const linha = linhaDoMes.get(p.mes);
      if (linha) linha._c.parcelas += valor;
    }
  }
  // A quantidade de parcelas é do contrato, não da carreta: com três carretas no mesmo contrato,
  // somar por carreta triplicaria "4 de 57". O acumulador da carreta fica com a do contrato.
  for (const [chave, a] of acumuladores) {
    if (chave === CHAVE_OUTRAS) continue;
    const contratosDaChave = dados.contratos.filter((k) => chaveDoCentro(k.centroId) === chave);
    a.parcelasTotal = contratosDaChave.reduce((s, k) => s + k.parcelas, 0);
    a.parcelasPagas = contratosDaChave.reduce(
      (s, k) => s + [...(pagasPorContrato.get(k.lancamentoId)?.values() ?? [])].reduce((x, y) => x + y, 0),
      0,
    );
  }

  const ordem = dados.carretas.filter((k) => entra(k.placa));
  const desempenhos: Desempenho[] = ordem.map((k) => fechar(k.placa, k.nome, k.placa, acumuladores.get(k.placa) ?? novoAcumulador()));
  if (acumuladores.has(CHAVE_FROTA)) {
    desempenhos.push(fechar(CHAVE_FROTA, "Frota (gasto sem placa)", null, acumuladores.get(CHAVE_FROTA)!));
  }
  if (acumuladores.has(CHAVE_OUTRAS)) {
    desempenhos.push(fechar(CHAVE_OUTRAS, "Placa não reconhecida", null, acumuladores.get(CHAVE_OUTRAS)!));
  }

  const soma = novoAcumulador();
  for (const a of acumuladores.values()) somarEm(soma, a);
  // O total de parcelas é dos contratos, cada um uma vez.
  soma.parcelasTotal = [...contratosPorId.values()].reduce((s, k) => s + k.parcelasTotal, 0);
  soma.parcelasPagas = [...contratosPorId.keys()].reduce(
    (s, id) => s + [...(pagasPorContrato.get(id)?.values() ?? [])].reduce((x, y) => x + y, 0),
    0,
  );
  const total = fechar("total", escolhida ? escolhida : "Todas as carretas", escolhida || null, soma);

  let acumulado = 0;
  let operacionalAcumulado = 0;
  return {
    filtro,
    meses: meses.map(({ _c, ...m }) => {
      const { custo, producao, investimento, parcelas } = _c;
      acumulado += producao - custo - investimento - parcelas;
      operacionalAcumulado += producao - custo;
      return {
        ...m,
        producao: r(producao),
        producaoPorCarreta: Object.fromEntries(Object.entries(m.producaoPorCarreta).map(([k, v]) => [k, r(v)])),
        custoPorCarreta: Object.fromEntries(Object.entries(m.custoPorCarreta).map(([k, v]) => [k, r(v)])),
        custoOperacional: r(custo),
        investimento: r(investimento),
        parcelas: r(parcelas),
        resultadoOperacional: r(producao - custo),
        resultadoFinal: r(producao - custo - investimento - parcelas),
        resultadoAcumulado: r(acumulado),
        operacionalAcumulado: r(operacionalAcumulado),
      };
    }),
    desempenhos,
    total,
    contratos: [...contratosPorId.values()]
      .map(({ _k, _pg, _sd, _ct, ...k }) => {
        const proximo = [..._k.entries()].sort(([x], [y]) => x.localeCompare(y))[0];
        return {
          ...k,
          placas: [...k.placas].sort(),
          contratado: r(_ct),
          pago: r(_pg),
          saldo: r(_sd),
          parcelasPagas: [...(pagasPorContrato.get(k.lancamentoId)?.values() ?? [])].reduce((x, y) => x + y, 0),
          proximaParcela: r(proximo?.[1] ?? 0),
        };
      })
      .sort((a, b) => b.contratado - a.contratado),
    categorias: [...categorias.values()]
      .map(({ _v, _p, ...k }) => ({ ...k, valor: r(_v), pago: r(_p) }))
      .sort((a, b) => b.valor - a.valor),
    placasNaoReconhecidas: [...naoReconhecidas].sort(),
    // A tabela de rotas mostra todas (é nela que se troca a rota); os alertas seguem a rota escolhida.
    rotas: montarRotas(dados, { ...filtro, rota: "" }),
    alertas: montarAlertas(dados, filtro),
    presentes: presentesNosFiltros(dados, filtro),
  };
}
