import { describe, expect, it } from "vitest";

import { formatarBRL, formatarData } from "@/lib/formatadores";
import { mensagemDeAprovacao } from "@/modules/rh/ferias/mensagem-aprovacao";

const RECIBO = {
  id: "1c8c7061-f775-4a68-9b3c-0045d5f56a86",
  colaboradorNome: "ANDREIA ALENCAR DA SILVA",
  dias: 30,
  dataInicio: "2026-03-02",
  dataFim: "2026-03-31",
  valorLiquido: 900,
  dataVencimento: "2026-02-28",
};

const ORIGEM = "https://app.emt.com";

describe("mensagemDeAprovacao", () => {
  it("nomeia a pessoa logo na primeira linha", () => {
    // Quem aprova recebe vários pedidos: sem o nome, o primeiro passo é abrir
    // o link só para saber de quem é.
    const texto = mensagemDeAprovacao(RECIBO, ORIGEM);
    expect(texto.split("\n")[0]).toBe(
      "Recibo de férias de ANDREIA ALENCAR DA SILVA pronto para aprovação.",
    );
  });

  it("leva o link do recibo", () => {
    const texto = mensagemDeAprovacao(RECIBO, ORIGEM);
    expect(texto).toContain(
      "https://app.emt.com/rh/decimo-terceiro-e-ferias/ferias/1c8c7061-f775-4a68-9b3c-0045d5f56a86",
    );
  });

  it("não faz barra dupla quando a origem termina em barra", () => {
    // O link aparece cru no WhatsApp: barra dupla funciona e fica feio.
    const texto = mensagemDeAprovacao(RECIBO, "https://app.emt.com/");
    expect(texto).not.toContain(".com//rh");
  });

  it("leva o líquido, para quem recebe saber o tamanho do pedido", () => {
    // Asserido pelo formatador: o separador do pt-BR não é espaço comum, e
    // comparar com string escrita à mão passa a falhar por um caractere.
    const texto = mensagemDeAprovacao(RECIBO, ORIGEM);
    expect(texto).toContain(formatarBRL(900));
  });

  it("diz o período do gozo", () => {
    const texto = mensagemDeAprovacao(RECIBO, ORIGEM);
    expect(texto).toContain(
      `30 dias, de ${formatarData("2026-03-02")} a ${formatarData("2026-03-31")}`,
    );
  });

  it("escreve 1 dia no singular", () => {
    const texto = mensagemDeAprovacao({ ...RECIBO, dias: 1 }, ORIGEM);
    expect(texto).toContain("1 dia, de");
    expect(texto).not.toContain("1 dias");
  });

  it("leva o vencimento", () => {
    const texto = mensagemDeAprovacao(RECIBO, ORIGEM);
    expect(texto).toContain(`Vence em ${formatarData("2026-02-28")}`);
  });

  it("omite a linha de vencimento quando não há data escolhida", () => {
    // Sem data escolhida vale o padrão do banco (dois dias antes do gozo).
    // Prometer uma data que não está gravada seria pior que omitir.
    const texto = mensagemDeAprovacao(
      { ...RECIBO, dataVencimento: null },
      ORIGEM,
    );
    expect(texto).not.toContain("Vence em");
  });
});
