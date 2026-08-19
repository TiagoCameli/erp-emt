import { describe, expect, it } from "vitest";

import {
  eventoParcelaParaTrilha,
  type ParcelaEvento,
} from "@/modules/financeiro/pagamentos/eventos";

const base: ParcelaEvento = {
  id: "e1",
  tipo: "reprogramou",
  motivo: "Fornecedor pediu prazo",
  dataDe: "2026-08-10",
  dataPara: "2026-08-20",
  valorDe: null,
  valorPara: null,
  criadoEm: "2026-08-09T12:00:00Z",
  usuarioNome: "Dora Silva",
};

describe("eventoParcelaParaTrilha", () => {
  it("põe o número da parcela no título e o motivo na descrição", () => {
    const e = eventoParcelaParaTrilha(base, 3);
    expect(e.titulo).toContain("Parcela 3");
    expect(e.descricao).toContain("Fornecedor pediu prazo");
    expect(e.usuario).toBe("Dora Silva");
  });

  it("mostra a mudança de data quando o evento tem data", () => {
    const e = eventoParcelaParaTrilha(base, 1);
    expect(e.descricao).toContain("10/08/2026");
    expect(e.descricao).toContain("20/08/2026");
  });

  it("mostra a mudança de valor quando o evento tem valor", () => {
    const e = eventoParcelaParaTrilha(
      { ...base, tipo: "alterou", valorDe: 1000, valorPara: 1500.5 },
      2,
    );
    expect(e.descricao).toContain("1.000,00");
    expect(e.descricao).toContain("1.500,50");
  });

  it("nomeia as duas datas no pagamento fora da data, sem parecer remarcação", () => {
    const e = eventoParcelaParaTrilha(
      {
        ...base,
        tipo: "pagou_fora_da_janela",
        motivo: "Fornecedor deu desconto para antecipar",
        dataDe: "2026-08-18",
        dataPara: "2026-08-17",
      },
      2,
    );
    expect(e.descricao).toContain("autorizada 18/08/2026, paga 17/08/2026");
    expect(e.descricao).not.toContain("de 18/08/2026 para");
    expect(e.descricao).toContain("Fornecedor deu desconto para antecipar");
  });

  it("marca exceção de dinheiro com o tipo de destaque da trilha", () => {
    expect(eventoParcelaParaTrilha({ ...base, tipo: "alterou" }, 1).tipo).toBe("edicao");
    expect(
      eventoParcelaParaTrilha({ ...base, tipo: "pagou_fora_da_janela" }, 1).tipo,
    ).toBe("edicao");
  });

  it("mapeia os cinco tipos que já existiam", () => {
    const esperado: Record<string, string> = {
      aprovou: "aprovacao",
      revisou: "rejeicao",
      reenviou: "edicao",
      desaprovou: "desaprovacao",
      reprogramou: "edicao",
    };
    for (const [tipo, alvo] of Object.entries(esperado)) {
      expect(
        eventoParcelaParaTrilha({ ...base, tipo: tipo as ParcelaEvento["tipo"] }, 1).tipo,
      ).toBe(alvo);
    }
  });

  it("sobrevive a evento sem motivo", () => {
    const e = eventoParcelaParaTrilha({ ...base, motivo: null }, 1);
    expect(e.titulo).toContain("Parcela 1");
  });
});
