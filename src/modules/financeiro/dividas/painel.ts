import type { ConsorcioRelatorio, ContratoRelatorio } from "@/modules/financeiro/dividas/relatorio";

/**
 * O painel do topo de Financeiro > Dívidas: os números da carteira inteira e
 * as duas leituras em gráfico (o que vence mês a mês e quanto se deve a cada
 * credor). Substitui a aba Créditos dos Relatórios (14/10/2026), que lia a
 * marca `e_divida` dos lançamentos; aqui tudo sai do cronograma, pelas mesmas
 * linhas das tabelas logo abaixo.
 *
 * Puro e em centavos inteiros: o card, a barra e a tabela somam igual.
 */

export interface MesVencimento {
  /** "atraso" na barra das vencidas; "yyyy-MM" nas demais. */
  chave: string;
  rotulo: string;
  contratos: number;
  consorcios: number;
  total: number;
  parcelas: number;
}

export interface CredorPainel {
  credor: string;
  contratos: number;
  /** Principal em aberto. */
  principal: number;
  /** Juros e encargos em aberto. */
  juros: number;
  total: number;
}

export interface PainelDividas {
  saldoDevedor: number;
  jurosAPagar: number;
  aPagar: number;
  quitacaoHoje: number;
  contratosAtivos: number;
  contratosSemCronograma: number;
  /** Do mês corrente (a partir de hoje) até o fim do 12º mês, sem as vencidas. */
  vence12Meses: number;
  vence12MesesContratos: number;
  vence12MesesConsorcios: number;
  atraso: number;
  parcelasEmAtraso: number;
  consorciosAPagar: number;
  /** O que falta pagar das cotas já contempladas: isso é dívida (D9). */
  consorciosDivida: number;
  cotasEmAberto: number;
  /** A barra "Em atraso" (só quando há) e os 12 meses a partir do corrente. */
  meses: MesVencimento[];
  /** Credores com algo em aberto, do maior para o menor. */
  credores: CredorPainel[];
}

const MESES_JANELA = 12;

const centavos = (valor: number) => Math.round(valor * 100);
const reais = (c: number) => c / 100;

/** "2026-10" + n meses, virando o ano. */
function somarMeses(anoMes: string, n: number): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  const total = ano * 12 + (mes - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" -> "out/26": curto para caber 13 barras no eixo. */
export function rotuloMesCurto(anoMes: string): string {
  const [ano, mes] = anoMes.split("-");
  return `${NOMES_MES[Number(mes) - 1]}/${ano.slice(2)}`;
}

export function montarPainelDividas(
  contratos: readonly ContratoRelatorio[],
  cotas: readonly ConsorcioRelatorio[],
  hoje: string,
): PainelDividas {
  const mesHoje = hoje.slice(0, 7);
  const chaves = Array.from({ length: MESES_JANELA }, (_, i) => somarMeses(mesHoje, i));
  const baldes = new Map(chaves.map((chave) => [chave, { contratos: 0, consorcios: 0, parcelas: 0 }]));
  const atraso = { contratos: 0, consorcios: 0, parcelas: 0 };

  function lancar(data: string, valor: number, lado: "contratos" | "consorcios") {
    const c = centavos(valor);
    if (data < hoje) {
      atraso[lado] += c;
      atraso.parcelas += 1;
      return;
    }
    const balde = baldes.get(data.slice(0, 7));
    if (!balde) return; // depois da janela
    balde[lado] += c;
    balde.parcelas += 1;
  }

  let saldo = 0;
  let juros = 0;
  let aPagar = 0;
  let quitacao = 0;
  let ativos = 0;
  let semCronograma = 0;
  const porCredor = new Map<string, { contratos: number; principal: number; juros: number }>();

  for (const c of contratos) {
    if (c.status === "quitado") continue;
    ativos += 1;
    if (!c.temCronograma) semCronograma += 1;
    saldo += centavos(c.saldoDevedor);
    juros += centavos(c.jurosAPagar);
    aPagar += centavos(c.aPagar);
    quitacao += centavos(c.quitacaoHoje);
    for (const p of c.restantes) lancar(p.data, p.valor, "contratos");

    if (c.saldoDevedor > 0 || c.jurosAPagar > 0) {
      const credor = porCredor.get(c.credor) ?? { contratos: 0, principal: 0, juros: 0 };
      credor.contratos += 1;
      credor.principal += centavos(c.saldoDevedor);
      credor.juros += centavos(c.jurosAPagar);
      porCredor.set(c.credor, credor);
    }
  }

  let consorciosAPagar = 0;
  let consorciosDivida = 0;
  let cotasEmAberto = 0;
  for (const q of cotas) {
    if (q.aPagar > 0) cotasEmAberto += 1;
    consorciosAPagar += centavos(q.aPagar);
    consorciosDivida += centavos(q.divida);
    // `proximas` traz até 12 parcelas em aberto; a cota é mensal, então cobre a
    // janela inteira (salvo cota com parcela vencida, que tira um mês do fim).
    for (const p of q.proximas) lancar(p.vencimento, p.total, "consorcios");
  }

  const meses: MesVencimento[] = [];
  if (atraso.parcelas > 0) {
    meses.push({
      chave: "atraso",
      rotulo: "Em atraso",
      contratos: reais(atraso.contratos),
      consorcios: reais(atraso.consorcios),
      total: reais(atraso.contratos + atraso.consorcios),
      parcelas: atraso.parcelas,
    });
  }
  let vence12Contratos = 0;
  let vence12Consorcios = 0;
  for (const chave of chaves) {
    const b = baldes.get(chave)!;
    vence12Contratos += b.contratos;
    vence12Consorcios += b.consorcios;
    meses.push({
      chave,
      rotulo: rotuloMesCurto(chave),
      contratos: reais(b.contratos),
      consorcios: reais(b.consorcios),
      total: reais(b.contratos + b.consorcios),
      parcelas: b.parcelas,
    });
  }

  const credores = [...porCredor.entries()]
    .map(([credor, v]) => ({
      credor,
      contratos: v.contratos,
      principal: reais(v.principal),
      juros: reais(v.juros),
      total: reais(v.principal + v.juros),
    }))
    .sort((a, b) => b.total - a.total || a.credor.localeCompare(b.credor, "pt-BR"));

  return {
    saldoDevedor: reais(saldo),
    jurosAPagar: reais(juros),
    aPagar: reais(aPagar),
    quitacaoHoje: reais(quitacao),
    contratosAtivos: ativos,
    contratosSemCronograma: semCronograma,
    vence12Meses: reais(vence12Contratos + vence12Consorcios),
    vence12MesesContratos: reais(vence12Contratos),
    vence12MesesConsorcios: reais(vence12Consorcios),
    atraso: reais(atraso.contratos + atraso.consorcios),
    parcelasEmAtraso: atraso.parcelas,
    consorciosAPagar: reais(consorciosAPagar),
    consorciosDivida: reais(consorciosDivida),
    cotasEmAberto,
    meses,
    credores,
  };
}
