import { describe, expect, it } from "vitest";

import {
  avisoFimDeSemana,
  diaDaSemana,
  motivoBloqueioPagamento,
  podePagarEm,
  programacaoVencida,
} from "@/modules/financeiro/_shared/janela-pagamento";

describe("diaDaSemana", () => {
  it("acha o dia sem depender do fuso da máquina", () => {
    expect(diaDaSemana("2026-09-21")).toBe("segunda");
    expect(diaDaSemana("2026-09-19")).toBe("sábado");
    expect(diaDaSemana("2026-09-20")).toBe("domingo");
  });

  it("recusa data que não existe em vez de rolar para o mês seguinte", () => {
    expect(diaDaSemana("2026-02-31")).toBeNull();
    expect(diaDaSemana("21/09/2026")).toBeNull();
    expect(diaDaSemana("")).toBeNull();
  });
});

describe("avisoFimDeSemana", () => {
  it("avisa em sábado e domingo, com o dia por extenso", () => {
    expect(avisoFimDeSemana("2026-09-19")).toContain("19/09 é sábado");
    expect(avisoFimDeSemana("2026-09-20")).toContain("20/09 é domingo");
  });

  it("cala em dia útil", () => {
    expect(avisoFimDeSemana("2026-09-21")).toBeNull();
  });
});

describe("programacaoVencida", () => {
  it("na janela exata, data que passou está vencida", () => {
    expect(programacaoVencida("2026-09-20", "2026-09-21", "exata")).toBe(true);
    expect(programacaoVencida("2026-09-21", "2026-09-21", "exata")).toBe(false);
    expect(programacaoVencida("2026-09-22", "2026-09-21", "exata")).toBe(false);
  });

  it("na janela a partir da data, nada vence", () => {
    expect(programacaoVencida("2026-09-20", "2026-09-21", "a_partir")).toBe(
      false,
    );
  });

  it("sem data programada não vence (o bloqueio ali é outro)", () => {
    expect(programacaoVencida(null, "2026-09-21", "exata")).toBe(false);
  });
});

describe("podePagarEm", () => {
  it("janela exata libera só no dia autorizado", () => {
    expect(podePagarEm("2026-09-21", "2026-09-21", "exata")).toBe(true);
    expect(podePagarEm("2026-09-21", "2026-09-20", "exata")).toBe(false);
    expect(podePagarEm("2026-09-21", "2026-09-22", "exata")).toBe(false);
  });

  it("janela a partir libera do dia autorizado em diante", () => {
    expect(podePagarEm("2026-09-21", "2026-09-21", "a_partir")).toBe(true);
    expect(podePagarEm("2026-09-21", "2026-09-22", "a_partir")).toBe(true);
    expect(podePagarEm("2026-09-21", "2026-09-20", "a_partir")).toBe(false);
  });

  it("sem data programada não paga", () => {
    expect(podePagarEm(null, "2026-09-21", "exata")).toBe(false);
  });
});

describe("motivoBloqueioPagamento", () => {
  it("antes da data diz para qual data está autorizado", () => {
    expect(motivoBloqueioPagamento("2026-09-21", "2026-09-20", "exata")).toBe(
      "Pagamento autorizado para 21/09/2026.",
    );
  });

  it("depois da data manda reprogramar", () => {
    expect(motivoBloqueioPagamento("2026-09-21", "2026-09-22", "exata")).toBe(
      "A data autorizada (21/09/2026) passou: reprograme a data antes de pagar.",
    );
  });

  it("na data não bloqueia", () => {
    expect(
      motivoBloqueioPagamento("2026-09-21", "2026-09-21", "exata"),
    ).toBeNull();
  });

  it("janela a partir só bloqueia antes", () => {
    expect(motivoBloqueioPagamento("2026-09-21", "2026-09-20", "a_partir")).toBe(
      "Pagamento autorizado a partir de 21/09/2026.",
    );
    expect(
      motivoBloqueioPagamento("2026-09-21", "2026-09-30", "a_partir"),
    ).toBeNull();
  });

  it("sem data programada manda reprogramar", () => {
    expect(motivoBloqueioPagamento(null, "2026-09-21", "exata")).toContain(
      "sem data programada",
    );
  });
});
