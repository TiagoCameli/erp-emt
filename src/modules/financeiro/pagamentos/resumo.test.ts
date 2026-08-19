import { describe, expect, it } from "vitest";

import type { ParcelaAprovada } from "@/modules/financeiro/pagamentos/queries";
import {
  contagem,
  podePagarParcela,
  somarParaResumo,
} from "@/modules/financeiro/pagamentos/resumo";

const HOJE = "2026-08-19";

function parcela(sobrescreve: Partial<ParcelaAprovada> = {}): ParcelaAprovada {
  return {
    id: crypto.randomUUID(),
    lancamentoId: crypto.randomUUID(),
    lancamentoNumero: "LAN-2026-0001",
    numeroParcela: 1,
    descricao: "Diesel S10",
    categoriaNome: "Combustível",
    fornecedorNome: "Areacre",
    dataVencimento: "2026-08-25",
    dataProgramada: "2026-08-25",
    dataProgramadaOrigem: null,
    valor: 1000,
    aprovadoEm: null,
    status: "aprovado",
    ...sobrescreve,
  };
}

describe("podePagarParcela", () => {
  it("só aprovada pode ser paga", () => {
    expect(podePagarParcela(parcela({ status: "aprovado" }))).toBe(true);
    expect(podePagarParcela(parcela({ status: "pendente" }))).toBe(false);
    expect(podePagarParcela(parcela({ status: "em_revisao" }))).toBe(false);
  });

  it("parcela sem status vinda de Programados continua pagável", () => {
    // A fila de Programados já é só de aprovadas e não carrega o campo: tratar
    // a ausência como "não pode" tiraria o botão de pagar daquela tela.
    expect(podePagarParcela(parcela({ status: undefined }))).toBe(true);
  });
});

describe("somarParaResumo", () => {
  it("separa o que pode ser pago do que ainda espera aprovação", () => {
    const resumo = somarParaResumo(
      [
        parcela({ status: "aprovado", valor: 1000 }),
        parcela({ status: "aprovado", valor: 500 }),
        parcela({ status: "pendente", valor: 300 }),
        parcela({ status: "em_revisao", valor: 200 }),
      ],
      HOJE,
    );

    expect(resumo.total).toBe(2000);
    expect(resumo.parcelas).toBe(4);
    expect(resumo.aprovado).toBe(1500);
    expect(resumo.aprovadas).toBe(2);
    expect(resumo.aguardando).toBe(500);
    expect(resumo.aguardandoParcelas).toBe(2);
  });

  it("vencido é o que passou de hoje, aprovado ou não", () => {
    const resumo = somarParaResumo(
      [
        parcela({ dataVencimento: "2026-08-18", valor: 100 }),
        parcela({
          status: "pendente",
          dataVencimento: "2026-08-01",
          valor: 400,
        }),
        parcela({ dataVencimento: HOJE, valor: 900 }),
        parcela({ dataVencimento: "2026-09-01", valor: 700 }),
      ],
      HOJE,
    );

    // Vence HOJE ainda não está vencida: quem paga no dia paga em dia.
    expect(resumo.vencido).toBe(500);
    expect(resumo.vencidas).toBe(2);
  });

  it("parcela sem vencimento não conta como vencida", () => {
    const resumo = somarParaResumo(
      [parcela({ dataVencimento: null, valor: 100 })],
      HOJE,
    );
    expect(resumo.vencido).toBe(0);
    expect(resumo.total).toBe(100);
  });

  it("conjunto vazio soma zero em tudo", () => {
    const resumo = somarParaResumo([], HOJE);
    expect(resumo.total).toBe(0);
    expect(resumo.parcelas).toBe(0);
    expect(resumo.aprovado).toBe(0);
    expect(resumo.vencido).toBe(0);
  });

  it("o total é a soma das parcelas, e não a soma dos cards", () => {
    // Linha de controle: uma parcela vencida E aprovada entra nos dois cards.
    // Somar os quatro números daria mais que o total, e é assim mesmo — os
    // cards respondem perguntas diferentes. Se algum dia alguém "consertar"
    // isso subtraindo, este teste quebra.
    const vencidaEAprovada = parcela({
      status: "aprovado",
      dataVencimento: "2026-08-01",
      valor: 1000,
    });
    const resumo = somarParaResumo([vencidaEAprovada], HOJE);

    expect(resumo.total).toBe(1000);
    expect(resumo.aprovado).toBe(1000);
    expect(resumo.vencido).toBe(1000);
    expect(resumo.aprovado + resumo.vencido).not.toBe(resumo.total);
  });
});

describe("contagem", () => {
  it("concorda em número", () => {
    expect(contagem(0)).toBe("0 parcelas");
    expect(contagem(1)).toBe("1 parcela");
    expect(contagem(2)).toBe("2 parcelas");
  });
});
