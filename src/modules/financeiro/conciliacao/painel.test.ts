import { describe, expect, it } from "vitest";

import { contaDoArquivoConfere } from "@/lib/ofx";
import {
  candidatosDoPainel,
  mesCurto,
  montarVisoes,
  resumoUltimosMeses,
  statusDoMes,
  painelSchema,
  periodoDoMes,
  periodoDosExtratos,
  somar,
  type PainelConciliacao,
  type ParcelaLivre,
} from "./painel";

function parcela(parcial: Partial<ParcelaLivre>): ParcelaLivre {
  return {
    id: "p",
    lancamentoId: "l",
    lancamentoNumero: "LAN-2026-0001",
    descricao: "Pneus",
    nome: "AMAZONIA PNEUS",
    razaoSocial: null,
    tipo: "a_pagar",
    origem: "manual",
    numeroParcela: 1,
    qtdParcelas: 1,
    valor: 100,
    valorLiquido: 100,
    dataPagamento: "2026-09-10",
    numeroDocumento: null,
    status: "pago",
    contaNome: "BB",
    contaId: "bb",
    apelidos: [],
    ...parcial,
  };
}

const painel: PainelConciliacao = {
  saldo: null,
  fechamento: null,
  vizinhos: [],
  transacoes: [
    {
      id: "t1",
      extratoId: "e",
      dataMovimento: "2026-09-10",
      valor: -100,
      tipo: "debito",
      memo: "BOLETO",
      conciliada: true,
      automatica: true,
      confiraConfirmado: false,
      parcela: null,
      transferencia: null,
      estorno: null,
      fatura: null,
    },
    {
      id: "t2",
      extratoId: "e",
      dataMovimento: "2026-09-11",
      valor: -50,
      tipo: "debito",
      memo: "PIX",
      conciliada: false,
      automatica: false,
      confiraConfirmado: false,
      parcela: null,
      transferencia: null,
      estorno: null,
      fatura: null,
    },
  ],
  pagasNaConta: [
    parcela({ id: "dentro", dataPagamento: "2026-09-20", valorLiquido: 80 }),
    // Folga de borda: serve para casar, mas não acusa "fora do banco" em setembro.
    parcela({ id: "agosto", dataPagamento: "2026-08-29" }),
    parcela({ id: "recebida", tipo: "a_receber", dataPagamento: "2026-09-21", valorLiquido: 30 }),
  ],
  pagasEmOutraConta: [parcela({ id: "outra", contaId: "caixa" })],
  abertas: [parcela({ id: "aberta", status: "aprovado", dataPagamento: undefined, dataVencimento: "2026-09-12" })],
  transferencias: [
    {
      id: "trf",
      numero: "TRF-1",
      descricao: null,
      data: "2026-09-15",
      valor: 1000,
      lado: "saida",
      origemNome: "BB",
      destinoNome: "BB INVESTIMENTOS",
    },
  ],
};

describe("periodoDoMes", () => {
  it("fecha o mês do dia 1 ao último dia, contando bissexto", () => {
    expect(periodoDoMes("2026-09")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodoDoMes("2028-02")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
    expect(periodoDoMes("2026-13")).toBeNull();
    expect(periodoDoMes("setembro")).toBeNull();
  });
});

describe("montarVisoes", () => {
  it("separa casados, faltam no app e fora do banco só dentro do mês", () => {
    const visoes = montarVisoes(painel, { inicio: "2026-09-01", fim: "2026-09-30" });
    expect(visoes.casados.map((t) => t.id)).toEqual(["t1"]);
    expect(visoes.faltamNoApp.map((t) => t.id)).toEqual(["t2"]);
    expect(visoes.foraDoBanco.map((i) => i.id)).toEqual(["trf", "dentro", "recebida"]);
    // Com sinal, como o extrato: pagamento e transferência de saída negativos.
    expect(visoes.foraDoBanco.map((i) => i.valor)).toEqual([-1000, -80, 30]);
  });
});

describe("candidatosDoPainel", () => {
  it("põe cada lista no grupo certo, com o sentido e a data de cada uma", () => {
    const candidatos = candidatosDoPainel(painel);
    const porId = Object.fromEntries(candidatos.map((c) => [c.id, c]));
    expect(porId.dentro).toMatchObject({ grupo: "paga_na_conta", sentido: "debito", data: "2026-09-20" });
    expect(porId.recebida).toMatchObject({ sentido: "credito" });
    expect(porId.outra).toMatchObject({ grupo: "paga_outra_conta" });
    expect(porId.aberta).toMatchObject({ grupo: "aberta", data: "2026-09-12" });
    expect(porId.trf).toMatchObject({ grupo: "transferencia", sentido: "debito", especie: "transferencia" });
  });
});

describe("painelSchema", () => {
  it("aceita o numeric que o Postgres manda como texto", () => {
    const lido = painelSchema.parse({
      ...painel,
      transacoes: [{ ...painel.transacoes[0], valor: "-100.00" }],
    });
    expect(lido.transacoes[0]?.valor).toBe(-100);
  });
});

describe("somar", () => {
  it("soma em centavos, sem erro de ponto flutuante", () => {
    expect(somar([0.1, 0.2, -0.3])).toBe(0);
    expect(somar([-1716.67, 1716.66])).toBe(-0.01);
  });
});

describe("contaDoArquivoConfere", () => {
  it("confere o ACCTID do BB com a conta cadastrada", () => {
    expect(contaDoArquivoConfere("102124-9", "102.124-9")).toBe(true);
    expect(contaDoArquivoConfere("0234-8 102124-9", "102.124-9")).toBe(true);
    expect(contaDoArquivoConfere("30893-5", "102.124-9")).toBe(false);
  });

  it("não recusa quando um dos lados não tem número", () => {
    expect(contaDoArquivoConfere(null, "102.124-9")).toBe(true);
    expect(contaDoArquivoConfere("102124-9", null)).toBe(true);
  });
});

describe("decodificarOfx", () => {
  it("lê o OFX do BB em Windows-1252 sem estragar o acento", async () => {
    const { decodificarOfx, parseOfx } = await import("@/lib/ofx");
    // "BB RENDE FÁCIL" com o Á em 1252 (0xC1), como vem do banco.
    const texto = "OFXHEADER:100\r\nCHARSET:1252\r\n<OFX><STMTTRN><TRNTYPE>DEP<DTPOSTED>20260901<TRNAMT>15706.31<FITID>1<MEMO>BB RENDE FÁCIL</STMTTRN></OFX>";
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    expect(parseOfx(decodificarOfx(bytes)).transacoes[0]?.memo).toBe("BB RENDE FÁCIL");
  });

  it("lê UTF-8 quando o arquivo é UTF-8 e não declara charset", async () => {
    const { decodificarOfx } = await import("@/lib/ofx");
    const bytes = new TextEncoder().encode("<OFX><MEMO>TRANSFERÊNCIA</OFX>");
    expect(decodificarOfx(bytes)).toContain("TRANSFERÊNCIA");
  });
});

describe("statusDoMes", () => {
  const vazio = { faltamNoApp: [], foraDoBanco: [] };
  const saldo = (bate: boolean | null) => ({
    data: "2026-09-30",
    temSaldoNoArquivo: bate !== null,
    podeVer: true,
    banco: 100,
    app: bate ? 100 : 90,
    diferenca: bate ? 0 : 10,
    bate,
    corte: null,
    antesDoCorte: false,
    bancoFonte: bate === null ? null : ("encadeado" as const),
    bancoAncora: bate === null ? null : "2026-08-21",
    motivo: bate === null ? "sem_ancora" : null,
    subconta: null,
  });

  it("subconta diferente do app não trava o mês: vale o saldo da conta", () => {
    const comSubconta = { ...saldo(true), subconta: { banco: 90, app: 100, temAncora: true, bate: false } };
    expect(statusDoMes(vazio, comSubconta)).toBe("conciliado");
    const batendo = { ...saldo(true), subconta: { banco: 100, app: 100, temAncora: true, bate: true } };
    expect(statusDoMes(vazio, batendo)).toBe("conciliado");
  });

  it("só declara conciliado com as listas zeradas e o saldo batendo", () => {
    expect(statusDoMes(vazio, saldo(true))).toBe("conciliado");
  });

  it("listas zeradas com saldo diferente: falta bater o saldo", () => {
    expect(statusDoMes(vazio, saldo(false))).toBe("falta_saldo");
  });

  it("sem saldo no arquivo ou sem extrato no fim do mês nunca fecha sozinho", () => {
    expect(statusDoMes(vazio, saldo(null))).toBe("sem_saldo");
    expect(statusDoMes(vazio, null)).toBe("sem_saldo");
  });

  it("com movimento pendente fica aberto mesmo com o saldo batendo", () => {
    const visoes = montarVisoes(painel, { inicio: "2026-09-01", fim: "2026-09-30" });
    expect(statusDoMes(visoes, saldo(true))).toBe("aberto");
  });
});

describe("resumoUltimosMeses (Bloco F)", () => {
  it("escreve fechado, pendentes ou aberto por mês, do mais recente ao mais antigo", () => {
    expect(
      resumoUltimosMeses([
        { mes: "2026-09", fechado: true, pendentes: 0 },
        { mes: "2026-08", fechado: true, pendentes: 0 },
        { mes: "2026-07", fechado: false, pendentes: 12 },
      ]),
    ).toBe("set/26 fechado · ago/26 fechado · jul/26 12 pendentes");
  });

  it("mês sem pendência e sem fechamento é aberto; um pendente no singular", () => {
    expect(
      resumoUltimosMeses([
        { mes: "2026-10", fechado: false, pendentes: 0 },
        { mes: "2026-01", fechado: false, pendentes: 1 },
      ]),
    ).toBe("out/26 aberto · jan/26 1 pendente");
    expect(mesCurto("2025-12")).toBe("dez/25");
  });
});

describe("periodoDosExtratos (todos os meses)", () => {
  it("vai do início do primeiro extrato ao fim do último, em qualquer ordem", () => {
    expect(
      periodoDosExtratos([
        { periodoInicio: "2025-03-01", periodoFim: "2025-03-31" },
        { periodoInicio: "2025-01-01", periodoFim: "2025-01-31" },
        { periodoInicio: "2026-09-01", periodoFim: "2026-09-30" },
      ]),
    ).toEqual({ inicio: "2025-01-01", fim: "2026-09-30" });
  });

  it("sem extrato com período devolve null", () => {
    expect(periodoDosExtratos([])).toBeNull();
    expect(periodoDosExtratos([{ periodoInicio: null, periodoFim: null }])).toBeNull();
  });
});
