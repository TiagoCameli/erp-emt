import { describe, expect, it } from "vitest";

import { formatarBRL, formatarData } from "@/lib/formatadores";
import { mensagemDeAprovacao } from "@/modules/rh/decimo-terceiro/mensagem-aprovacao";

const LOTE = {
  id: "1c8c7061-f775-4a68-9b3c-0045d5f56a86",
  ano: 2026,
  parcela: 1,
  pessoas: 59,
  preenchidos: 42,
  valorLiquido: 38400,
  dataVencimento: "2026-12-20",
};

describe("mensagemDeAprovacao", () => {
  it("diz qual 13º é, logo na primeira linha", () => {
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com");
    expect(texto.split("\n")[0]).toBe(
      "13º 2026, 1ª parcela pronto para aprovação.",
    );
  });

  it("leva o link do lote", () => {
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com");
    expect(texto).toContain(
      "https://app.emt.com/rh/decimo-terceiro-e-ferias/13o/1c8c7061-f775-4a68-9b3c-0045d5f56a86",
    );
  });

  it("não faz barra dupla quando a origem termina em barra", () => {
    // O link aparece cru no WhatsApp: barra dupla funciona e fica feio.
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com/");
    expect(texto).not.toContain(".com//rh");
  });

  it("leva o líquido, para quem recebe saber o tamanho do pedido", () => {
    // Asserido pelo formatador: o separador do pt-BR não é espaço comum, e
    // comparar com string escrita à mão passa a falhar por um caractere.
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com");
    expect(texto).toContain(formatarBRL(38400));
  });

  it("diz quantas linhas estão preenchidas, não só quantas pessoas têm", () => {
    // É o número que só o 13º tem: 59 pessoas com 3 preenchidas é outro pedido.
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com");
    expect(texto).toContain("59 colaboradores, 42 com valor preenchido");
  });

  it("leva o vencimento", () => {
    const texto = mensagemDeAprovacao(LOTE, "https://app.emt.com");
    expect(texto).toContain(formatarData("2026-12-20"));
  });

  it("omite a linha de vencimento quando não há data", () => {
    const texto = mensagemDeAprovacao(
      { ...LOTE, dataVencimento: null },
      "https://app.emt.com",
    );
    expect(texto).not.toContain("Vence em");
  });

  it("usa singular com uma pessoa só", () => {
    const texto = mensagemDeAprovacao(
      { ...LOTE, pessoas: 1, preenchidos: 1 },
      "https://app.emt.com",
    );
    expect(texto).toContain("1 colaborador, 1 com valor preenchido");
  });

  it("diz a parcela certa", () => {
    const texto = mensagemDeAprovacao({ ...LOTE, parcela: 2 }, "https://app.emt.com");
    expect(texto).toContain("2ª parcela");
  });
});
