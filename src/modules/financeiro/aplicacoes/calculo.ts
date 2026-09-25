/**
 * Financeiro > Aplicações: o que a tela mostra, montado a partir das linhas de
 * `fn_aba_aplicacoes` (uma por aplicação e por mês) e dos movimentos.
 *
 * Função pura, somando em CENTAVOS INTEIROS: o card, a linha de total e a
 * célula têm que fechar no centavo, e reais em ponto flutuante não fecham.
 *
 * NULO NÃO É ZERO. `rendimento` nulo quer dizer "não houve posição no mês" (ou o
 * mês é anterior à abertura), e a tela mostra traço. Somar null como 0 faria um
 * mês sem extrato parecer um mês que não rendeu.
 */

export type LiquidezAplicacao = "diaria" | "d_mais_n" | "carencia";

/** Uma linha de `fn_aba_aplicacoes`, já convertida. */
export interface LinhaAba {
  aplicacaoId: string;
  /** yyyy-MM-01 */
  mes: string;
  posicaoInicial: number;
  aplicado: number;
  resgatado: number;
  rendimento: number | null;
  ajusteAbertura: number | null;
  posicaoFinal: number;
  /** % no mês (1,02 = 1,02%). */
  rendimentoPct: number | null;
  cdiPct: number | null;
  /** % do CDI (95 = 95% do CDI). */
  pctCdi: number | null;
  ultimaPosicao: string | null;
}

export interface AplicacaoCadastro {
  id: string;
  nome: string;
  contaNome: string;
  contaId: string;
  /** A etapa do centro de investimento: é o que a transferência leva. */
  etapaId: string;
  produto: string;
  indexador: string;
  taxaPercentual: number | null;
  liquidez: LiquidezAplicacao;
  liquidezDias: number | null;
  carenciaAte: string | null;
  vencimento: string | null;
  tipoIr: string;
  ativa: boolean;
}

export type TipoMovimento =
  | "aplicacao"
  | "resgate"
  | "rendimento"
  | "rendimento_negativo"
  | "ajuste_abertura"
  | "posicao";

export interface MovimentoAplicacao {
  /** chave única na lista (tipo:id). */
  chave: string;
  id: string;
  tipo: TipoMovimento;
  data: string;
  aplicacaoId: string;
  documento: string | null;
  descricao: string | null;
  /**
   * Efeito no saldo da subconta, com sinal. Na posição é o saldo líquido
   * informado (sem sinal de efeito: ela não move dinheiro, ela o mede).
   */
  valor: number;
  /** Só na posição. */
  saldoBruto?: number | null;
  ir?: number | null;
  iof?: number | null;
  eAbertura?: boolean;
  observacoes?: string | null;
}

const centavos = (valor: number) => Math.round(valor * 100);
const reais = (c: number) => c / 100;

/** Dias entre duas datas yyyy-MM-dd (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Aviso de posição velha: mais de 35 dias sem extrato (regra do Tiago). */
export const DIAS_POSICAO_VELHA = 35;

export function posicaoVelha(ultima: string | null, hoje: string): boolean {
  if (ultima === null) return true;
  return diasEntre(ultima, hoje) > DIAS_POSICAO_VELHA;
}

/**
 * Soma de percentuais de aplicações diferentes num mês, sem média simples: o
 * % do conjunto é Σ rendimento ÷ Σ base, e a base de cada aplicação sai do
 * próprio % dela (base = rendimento ÷ %). É o mesmo Dietz da função, agregado.
 * Aplicação sem % (sem posição anterior, base zero) fica fora da conta.
 */
export function percentualDoConjunto(
  linhas: readonly Pick<LinhaAba, "rendimento" | "rendimentoPct" | "cdiPct">[],
): { pct: number | null; cdi: number | null; pctCdi: number | null } {
  let rend = 0;
  let base = 0;
  let baseCdi = 0;
  let cdiPonderado = 0;
  for (const l of linhas) {
    if (l.rendimento === null || l.rendimentoPct === null || l.rendimentoPct === 0) continue;
    const b = l.rendimento / (l.rendimentoPct / 100);
    rend += l.rendimento;
    base += b;
    if (l.cdiPct !== null) {
      cdiPonderado += l.cdiPct * b;
      baseCdi += b;
    }
  }
  if (base <= 0) return { pct: null, cdi: null, pctCdi: null };
  const pct = (rend / base) * 100;
  const cdi = baseCdi > 0 ? cdiPonderado / baseCdi : null;
  return { pct, cdi, pctCdi: cdi && cdi !== 0 ? (pct / cdi) * 100 : null };
}

/** Compõe percentuais mensais: (1+a)(1+b)... − 1. Nulo some da conta. */
export function compor(pcts: readonly (number | null)[]): number | null {
  const validos = pcts.filter((p): p is number => p !== null);
  if (validos.length === 0) return null;
  return (validos.reduce((f, p) => f * (1 + p / 100), 1) - 1) * 100;
}

export interface LinhaMes {
  mes: string;
  posicaoInicial: number;
  aplicado: number;
  resgatado: number;
  rendimento: number | null;
  ajusteAbertura: number | null;
  posicaoFinal: number;
  rendimentoPct: number | null;
  cdiPct: number | null;
  pctCdi: number | null;
}

/**
 * Mês a mês do conjunto (ou de uma aplicação só, quando `aplicacaoId`).
 * Identidade que o teste trava: final = inicial + aplicado − resgatado +
 * rendimento + ajuste, mês a mês, no centavo.
 */
export function mesAMes(linhas: readonly LinhaAba[], aplicacaoId?: string): LinhaMes[] {
  const doRecorte = aplicacaoId
    ? linhas.filter((l) => l.aplicacaoId === aplicacaoId)
    : linhas;
  const porMes = new Map<string, LinhaAba[]>();
  for (const l of doRecorte) {
    const lista = porMes.get(l.mes) ?? [];
    lista.push(l);
    porMes.set(l.mes, lista);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, ls]) => {
      const soma = (f: (l: LinhaAba) => number) => reais(ls.reduce((s, l) => s + centavos(f(l)), 0));
      const somaNula = (f: (l: LinhaAba) => number | null) =>
        ls.some((l) => f(l) !== null) ? soma((l) => f(l) ?? 0) : null;
      const pct = ls.length === 1
        ? { pct: ls[0].rendimentoPct, cdi: ls[0].cdiPct, pctCdi: ls[0].pctCdi }
        : percentualDoConjunto(ls);
      return {
        mes,
        posicaoInicial: soma((l) => l.posicaoInicial),
        aplicado: soma((l) => l.aplicado),
        resgatado: soma((l) => l.resgatado),
        rendimento: somaNula((l) => l.rendimento),
        ajusteAbertura: somaNula((l) => l.ajusteAbertura),
        posicaoFinal: soma((l) => l.posicaoFinal),
        rendimentoPct: pct.pct,
        cdiPct: pct.cdi,
        pctCdi: pct.pctCdi,
      };
    });
}

export interface ResumoAplicacao {
  aplicacao: AplicacaoCadastro;
  /** Aplicado − resgatado desde sempre. */
  principal: number;
  posicaoLiquida: number;
  /** Soma dos rendimentos desde a abertura (a abertura não conta). Nulo sem nenhum. */
  rendimentoAcumulado: number | null;
  /** % acumulado composto e o % do CDI no mesmo período. */
  rendimentoAcumuladoPct: number | null;
  pctCdiAcumulado: number | null;
  ultimaPosicao: string | null;
  posicaoVelha: boolean;
}

export interface CardsAplicacoes {
  posicaoTotal: number;
  principal: number;
  rendimentoMes: number | null;
  rendimentoMesPct: number | null;
  pctCdiMes: number | null;
  rendimentoAno: number | null;
  rendimentoAnoPct: number | null;
  pctCdiAno: number | null;
  disponivelHoje: number;
  comCarencia: number;
  resgatesAutomaticosMes: { quantidade: number; valor: number };
}

export interface PainelAplicacoes {
  cards: CardsAplicacoes;
  aplicacoes: ResumoAplicacao[];
  meses: LinhaMes[];
}

/** RESGATE AUTOMATICO: a varredura da Caixa que tira do fundo para cobrir a conta. */
export function ehResgateAutomatico(m: Pick<MovimentoAplicacao, "tipo" | "descricao">): boolean {
  return m.tipo === "resgate" && (m.descricao ?? "").toUpperCase().includes("RESGATE AUTOMATICO");
}

/**
 * Monta a tela. `hoje` (yyyy-MM-dd, Rio Branco) decide o mês corrente, o ano e
 * o aviso de posição velha; recebido de fora para a função seguir pura.
 */
export function montarPainel(
  aplicacoes: readonly AplicacaoCadastro[],
  linhas: readonly LinhaAba[],
  movimentos: readonly MovimentoAplicacao[],
  hoje: string,
): PainelAplicacoes {
  const mesAtual = `${hoje.slice(0, 7)}-01`;
  const anoAtual = hoje.slice(0, 4);
  const visiveis = new Set(linhas.map((l) => l.aplicacaoId));

  const resumos: ResumoAplicacao[] = aplicacoes
    .filter((a) => visiveis.has(a.id))
    .map((a) => {
      const minhas = linhas.filter((l) => l.aplicacaoId === a.id).sort((x, y) => x.mes.localeCompare(y.mes));
      const ultima = minhas[minhas.length - 1];
      const principalC = minhas.reduce((s, l) => s + centavos(l.aplicado) - centavos(l.resgatado), 0);
      const comRend = minhas.filter((l) => l.rendimento !== null);
      const pctAcum = compor(comRend.map((l) => l.rendimentoPct));
      const cdiAcum = compor(comRend.map((l) => l.cdiPct));
      return {
        aplicacao: a,
        principal: reais(principalC),
        posicaoLiquida: ultima ? ultima.posicaoFinal : 0,
        rendimentoAcumulado: comRend.length
          ? reais(comRend.reduce((s, l) => s + centavos(l.rendimento ?? 0), 0))
          : null,
        rendimentoAcumuladoPct: pctAcum,
        pctCdiAcumulado: pctAcum !== null && cdiAcum ? (pctAcum / cdiAcum) * 100 : null,
        ultimaPosicao: ultima?.ultimaPosicao ?? null,
        posicaoVelha: posicaoVelha(ultima?.ultimaPosicao ?? null, hoje),
      };
    });

  const doMes = linhas.filter((l) => l.mes === mesAtual);
  const doAno = linhas.filter((l) => l.mes.startsWith(anoAtual));
  const meses = mesAMes(linhas);
  const mesesDoAno = meses.filter((m) => m.mes.startsWith(anoAtual) && m.rendimento !== null);
  const pctMes = percentualDoConjunto(doMes);
  const pctAno = compor(mesesDoAno.map((m) => m.rendimentoPct));
  const cdiAno = compor(mesesDoAno.map((m) => m.cdiPct));

  const somaNula = (ls: readonly LinhaAba[]) =>
    ls.some((l) => l.rendimento !== null)
      ? reais(ls.reduce((s, l) => s + centavos(l.rendimento ?? 0), 0))
      : null;

  const posicaoPorLiquidez = (diaria: boolean) =>
    reais(
      resumos
        .filter((r) => (r.aplicacao.liquidez === "diaria") === diaria)
        .reduce((s, r) => s + centavos(r.posicaoLiquida), 0),
    );

  const automaticos = movimentos.filter(
    (m) => ehResgateAutomatico(m) && m.data.slice(0, 7) === hoje.slice(0, 7) && visiveis.has(m.aplicacaoId),
  );

  return {
    cards: {
      posicaoTotal: reais(resumos.reduce((s, r) => s + centavos(r.posicaoLiquida), 0)),
      principal: reais(resumos.reduce((s, r) => s + centavos(r.principal), 0)),
      rendimentoMes: somaNula(doMes),
      rendimentoMesPct: pctMes.pct,
      pctCdiMes: pctMes.pctCdi,
      rendimentoAno: somaNula(doAno),
      rendimentoAnoPct: pctAno,
      pctCdiAno: pctAno !== null && cdiAno ? (pctAno / cdiAno) * 100 : null,
      disponivelHoje: posicaoPorLiquidez(true),
      comCarencia: posicaoPorLiquidez(false),
      resgatesAutomaticosMes: {
        quantidade: automaticos.length,
        valor: reais(automaticos.reduce((s, m) => s + centavos(Math.abs(m.valor)), 0)),
      },
    },
    aplicacoes: resumos,
    meses,
  };
}

/** Série do gráfico: posição final de cada aplicação, mês a mês. */
export function seriePosicao(
  linhas: readonly LinhaAba[],
): { mes: string; valores: Record<string, number> }[] {
  const porMes = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const reg = porMes.get(l.mes) ?? {};
    reg[l.aplicacaoId] = l.posicaoFinal;
    porMes.set(l.mes, reg);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, valores]) => ({ mes, valores }));
}

export const ROTULO_PRODUTO: Record<string, string> = {
  cdb: "CDB",
  fundo: "Fundo",
  lca: "LCA",
  lci: "LCI",
  tesouro: "Tesouro",
  outro: "Outro",
};

export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  aplicacao: "Aplicação",
  resgate: "Resgate",
  rendimento: "Rendimento",
  rendimento_negativo: "Rendimento negativo",
  ajuste_abertura: "Ajuste de abertura",
  posicao: "Posição do extrato",
};

export function rotuloLiquidez(a: Pick<AplicacaoCadastro, "liquidez" | "liquidezDias" | "carenciaAte">): string {
  if (a.liquidez === "diaria") return "Diária (D+0)";
  if (a.liquidez === "d_mais_n") return `D+${a.liquidezDias ?? "?"}`;
  return a.carenciaAte ? `Carência até ${a.carenciaAte.split("-").reverse().join("/")}` : "Carência";
}

export function rotuloTaxa(a: Pick<AplicacaoCadastro, "taxaPercentual" | "indexador">): string {
  if (a.taxaPercentual === null) return "Não informada";
  const numero = a.taxaPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  if (a.indexador === "cdi") return `${numero}% do CDI`;
  if (a.indexador === "ipca") return `IPCA + ${numero}%`;
  return `${numero}% a.a.`;
}
