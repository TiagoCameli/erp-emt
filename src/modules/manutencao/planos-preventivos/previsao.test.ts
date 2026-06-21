import { describe, expect, it } from "vitest";

import {
  diferencaDias,
  preverAtividade,
  somarDias,
  type PlanoAtividade,
} from "@/modules/manutencao/planos-preventivos/previsao";

function atividade(
  intervaloTipo: PlanoAtividade["intervaloTipo"],
  intervaloValor: number,
): PlanoAtividade {
  return { id: "a", descricao: "Troca de óleo", intervaloTipo, intervaloValor, ordem: 0 };
}

const SEM_LEITURA = { horimetro: null, km: null };

describe("somarDias / diferencaDias", () => {
  it("soma dias atravessando o mês", () => {
    expect(somarDias("2026-01-01", 30)).toBe("2026-01-31");
    expect(somarDias("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("conta a diferença em dias", () => {
    expect(diferencaDias("2026-01-01", "2026-01-31")).toBe(30);
    expect(diferencaDias("2026-02-05", "2026-01-31")).toBe(-5);
  });
});

describe("preverAtividade por horímetro", () => {
  const base = { horimetro: 1000, km: null, data: "2026-01-01" };

  it("vencido quando a última leitura passou da próxima marca", () => {
    const r = preverAtividade(atividade("horimetro", 250), base, { horimetro: 1300, km: null }, "2026-06-20");
    expect(r.proxima).toBe(1250);
    expect(r.vencido).toBe(true);
    expect(r.faltam).toBe(-50);
    expect(r.semLeitura).toBe(false);
  });

  it("em dia quando ainda não chegou na próxima marca", () => {
    const r = preverAtividade(atividade("horimetro", 250), base, { horimetro: 1100, km: null }, "2026-06-20");
    expect(r.vencido).toBe(false);
    expect(r.faltam).toBe(150);
  });

  it("sem leitura quando falta a leitura atual", () => {
    const r = preverAtividade(atividade("horimetro", 250), base, SEM_LEITURA, "2026-06-20");
    expect(r.semLeitura).toBe(true);
    expect(r.vencido).toBe(false);
    expect(r.proxima).toBeNull();
  });
});

describe("preverAtividade por km", () => {
  const base = { horimetro: null, km: 50000, data: "2026-01-01" };

  it("vencido por km", () => {
    const r = preverAtividade(atividade("km", 10000), base, { horimetro: null, km: 61000 }, "2026-06-20");
    expect(r.proxima).toBe(60000);
    expect(r.vencido).toBe(true);
  });

  it("em dia por km", () => {
    const r = preverAtividade(atividade("km", 10000), base, { horimetro: null, km: 55000 }, "2026-06-20");
    expect(r.vencido).toBe(false);
    expect(r.faltam).toBe(5000);
  });
});

describe("preverAtividade por dias", () => {
  const base = { horimetro: null, km: null, data: "2026-01-01" };

  it("vencido quando hoje passou da data prevista", () => {
    const r = preverAtividade(atividade("dias", 30), base, SEM_LEITURA, "2026-02-05");
    expect(r.proximaData).toBe("2026-01-31");
    expect(r.vencido).toBe(true);
    expect(r.faltam).toBeLessThan(0);
  });

  it("em dia quando ainda não chegou a data", () => {
    const r = preverAtividade(atividade("dias", 30), base, SEM_LEITURA, "2026-01-15");
    expect(r.vencido).toBe(false);
    expect(r.faltam).toBe(16);
  });
});
