/**
 * O relatório de Investimentos: quanto está aplicado, em quê, e como chegou lá.
 *
 * Pedido do Tiago em 24/09/2026: o CC Investimentos "deve funcionar igual cc de
 * emprestimos e ter o seu proprio aba de relatorios". Aplicar não é despesa, é
 * dinheiro que vai para a SUBCONTA de investimentos da conta; resgatar é o
 * dinheiro voltando. As duas coisas são transferências entre a conta e a
 * subconta, marcadas com a aplicação (uma etapa do centro de investimento).
 *
 * A regra do saldo é dele: "o saldo em aplicação é tudo que foi aplicado menos o
 * que foi resgatado". Por isso a posição de cada aplicação soma o histórico
 * INTEIRO das transferências dela, e não só o período escolhido: o período
 * recorta o movimento (aplicado e resgatado no período), nunca a posição.
 *
 * Módulo puro: a consulta mora em `queries.ts`. Soma em centavos, pelo mesmo
 * motivo do resto dos relatórios: somar reais em ponto flutuante erra o centavo
 * depois de algumas dezenas de linhas.
 */

import type { ParametrosUrl } from "@/modules/financeiro/relatorios/filtros-periodo";

export type SentidoMovimento = "aplicacao" | "resgate";

/** Uma transferência entre a conta e a subconta, já com o sentido resolvido. */
export interface MovimentoInvestimento {
  id: string;
  numero: string;
  /** yyyy-MM-dd */
  data: string;
  valor: number;
  sentido: SentidoMovimento;
  aplicacaoId: string;
  aplicacaoNome: string;
  /** A subconta onde o dinheiro mora. */
  subcontaId: string;
  descricao: string | null;
}

/** Subconta de investimentos, com o saldo quando a pessoa pode vê-lo. */
export interface SubcontaInvestimento {
  contaId: string;
  nome: string;
  /** Nome da conta corrente dona da subconta. */
  contaPaiNome: string;
  /** NULL = sem permissão de ver o saldo desta conta. */
  saldoAtual: number | null;
}

export interface LinhaAplicacao {
  aplicacaoId: string;
  nome: string;
  /** Conta corrente da subconta onde a aplicação está. */
  conta: string;
  /** Histórico inteiro. */
  aplicado: number;
  resgatado: number;
  /** aplicado - resgatado: a regra do Tiago para o saldo em aplicação. */
  posicao: number;
  aplicadoPeriodo: number;
  resgatadoPeriodo: number;
}

export interface MesInvestimento {
  /** yyyy-MM */
  mes: string;
  aplicado: number;
  resgatado: number;
  /** Posição acumulada (todas as aplicações) no fim do mês. */
  posicaoFinal: number;
}

export interface Investimentos {
  /** Soma do saldo das subcontas que a pessoa pode ver. */
  saldoAplicado: number;
  subcontas: SubcontaInvestimento[];
  /** Subcontas fora do total por falta de permissão de ver saldo. */
  subcontasOcultas: number;
  aplicacoes: LinhaAplicacao[];
  aplicadoPeriodo: number;
  resgatadoPeriodo: number;
  meses: MesInvestimento[];
  /** Movimentos do período, do mais recente para o mais antigo. */
  movimentos: MovimentoInvestimento[];
}

/** Período do relatório. Vazio = sem limite daquele lado. */
export interface PeriodoInvestimentos {
  de: string;
  ate: string;
}

const centavos = (valor: number) => Math.round(valor * 100);
const reais = (valor: number) => valor / 100;

function noPeriodo(data: string, periodo: PeriodoInvestimentos): boolean {
  if (periodo.de !== "" && data < periodo.de) return false;
  if (periodo.ate !== "" && data > periodo.ate) return false;
  return true;
}

/** Os meses de `primeiro` a `ultimo` (yyyy-MM), inclusive. */
function mesesEntre(primeiro: string, ultimo: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = primeiro.split("-").map(Number) as [number, number];
  const [anoFim, mesFim] = ultimo.split("-").map(Number) as [number, number];
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes === 13) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

export function montarInvestimentos(
  movimentos: readonly MovimentoInvestimento[],
  subcontas: readonly SubcontaInvestimento[],
  periodo: PeriodoInvestimentos,
): Investimentos {
  const contaDaSubconta = new Map(subcontas.map((s) => [s.contaId, s.contaPaiNome]));

  const porAplicacao = new Map<
    string,
    {
      nome: string;
      subcontaId: string;
      aplicado: number;
      resgatado: number;
      aplicadoPeriodo: number;
      resgatadoPeriodo: number;
    }
  >();
  const porMes = new Map<string, { aplicado: number; resgatado: number }>();
  let aplicadoPeriodo = 0;
  let resgatadoPeriodo = 0;

  for (const m of movimentos) {
    const valor = centavos(m.valor);
    const dentro = noPeriodo(m.data, periodo);
    const linha = porAplicacao.get(m.aplicacaoId) ?? {
      nome: m.aplicacaoNome,
      subcontaId: m.subcontaId,
      aplicado: 0,
      resgatado: 0,
      aplicadoPeriodo: 0,
      resgatadoPeriodo: 0,
    };
    const mes = porMes.get(m.data.slice(0, 7)) ?? { aplicado: 0, resgatado: 0 };

    if (m.sentido === "aplicacao") {
      linha.aplicado += valor;
      mes.aplicado += valor;
      if (dentro) {
        linha.aplicadoPeriodo += valor;
        aplicadoPeriodo += valor;
      }
    } else {
      linha.resgatado += valor;
      mes.resgatado += valor;
      if (dentro) {
        linha.resgatadoPeriodo += valor;
        resgatadoPeriodo += valor;
      }
    }
    porAplicacao.set(m.aplicacaoId, linha);
    porMes.set(m.data.slice(0, 7), mes);
  }

  const aplicacoes: LinhaAplicacao[] = [...porAplicacao.entries()]
    .map(([aplicacaoId, l]) => ({
      aplicacaoId,
      nome: l.nome,
      conta: contaDaSubconta.get(l.subcontaId) ?? "",
      aplicado: reais(l.aplicado),
      resgatado: reais(l.resgatado),
      posicao: reais(l.aplicado - l.resgatado),
      aplicadoPeriodo: reais(l.aplicadoPeriodo),
      resgatadoPeriodo: reais(l.resgatadoPeriodo),
    }))
    .sort((a, b) => b.posicao - a.posicao || a.nome.localeCompare(b.nome, "pt-BR"));

  // A série mensal começa no primeiro movimento: a posição acumulada precisa do
  // histórico inteiro, e o período só escolhe quais meses aparecem.
  const mesesComMovimento = [...porMes.keys()].sort();
  const meses: MesInvestimento[] = [];
  if (mesesComMovimento.length > 0) {
    let acumulado = 0;
    const ultimo = mesesComMovimento[mesesComMovimento.length - 1]!;
    for (const mes of mesesEntre(mesesComMovimento[0]!, ultimo)) {
      const doMes = porMes.get(mes) ?? { aplicado: 0, resgatado: 0 };
      acumulado += doMes.aplicado - doMes.resgatado;
      const inicioDoMes = `${mes}-01`;
      const fimDoMes = `${mes}-31`;
      const visivel =
        (periodo.ate === "" || inicioDoMes <= periodo.ate) &&
        (periodo.de === "" || fimDoMes >= periodo.de);
      if (!visivel) continue;
      meses.push({
        mes,
        aplicado: reais(doMes.aplicado),
        resgatado: reais(doMes.resgatado),
        posicaoFinal: reais(acumulado),
      });
    }
  }

  const visiveis = subcontas.filter((s) => s.saldoAtual !== null);

  return {
    saldoAplicado: reais(
      visiveis.reduce((soma, s) => soma + centavos(s.saldoAtual ?? 0), 0),
    ),
    subcontas: [...subcontas],
    subcontasOcultas: subcontas.length - visiveis.length,
    aplicacoes,
    aplicadoPeriodo: reais(aplicadoPeriodo),
    resgatadoPeriodo: reais(resgatadoPeriodo),
    meses,
    movimentos: movimentos
      .filter((m) => noPeriodo(m.data, periodo))
      .sort((a, b) => (a.data === b.data ? b.numero.localeCompare(a.numero) : b.data.localeCompare(a.data))),
  };
}

/** Uma transferência vira aplicação ou resgate conforme o lado da subconta. */
export function sentidoDaTransferencia(
  destinoEhSubconta: boolean,
): SentidoMovimento {
  return destinoEhSubconta ? "aplicacao" : "resgate";
}

/**
 * As chaves do período na URL. Com prefixo, porque a URL de relatórios é uma só
 * para os nove relatórios e `de`/`ate` já são do Custo x receita: trocar de
 * relatório não pode herdar um período que era de outra pergunta.
 */
export const CHAVE_DE_INVESTIMENTOS = "inv_de";
export const CHAVE_ATE_INVESTIMENTOS = "inv_ate";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataDaUrl(valor: string | string[] | undefined): string {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto !== undefined && DATA_ISO.test(texto) ? texto : "";
}

/** O período do relatório na URL. Sem nada, o histórico inteiro. */
export function lerPeriodoInvestimentos(params: ParametrosUrl): PeriodoInvestimentos {
  let de = dataDaUrl(params[CHAVE_DE_INVESTIMENTOS]);
  let ate = dataDaUrl(params[CHAVE_ATE_INVESTIMENTOS]);
  if (de !== "" && ate !== "" && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}
