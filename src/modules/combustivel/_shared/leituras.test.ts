// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  classeConsumoDe,
  normalizarPlaca,
  odometroObrigatorio,
  problemasDeLeitura,
  SEM_LEITURAS,
  textoUltimaLeitura,
} from "@/modules/combustivel/_shared/leituras";

const anteriores = {
  km: { valor: 11100, data: "2025-01-05T13:00:00Z", origem: "abastecimento" },
  h: { valor: 130, data: "2025-01-04T14:00:00Z", origem: "abastecimento" },
};
const base = { classe: null, odometroKm: null, horimetroH: null, virada: false, motivoVirada: null, anteriores: SEM_LEITURAS };

describe("leituras do painel", () => {
  it("odômetro obrigatório só no cavalo da EMT e no veículo leve", () => {
    expect(odometroObrigatorio("carreta")).toBe(true);
    expect(odometroObrigatorio("veiculo_leve")).toBe(true);
    expect(odometroObrigatorio("maquina")).toBe(false);
    expect(odometroObrigatorio(null)).toBe(false);
    expect(problemasDeLeitura({ ...base, classe: "veiculo_leve" })[0]?.mensagem).toMatch(/carros e motos/);
    expect(problemasDeLeitura({ ...base, classe: "carreta" })[0]?.mensagem).toMatch(/cavalos da EMT TRANSPORTES/);
    expect(problemasDeLeitura({ ...base, classe: "maquina" })).toEqual([]);
  });

  it("leitura menor que a anterior trava, com valor e data da anterior; a virada libera", () => {
    const menor = problemasDeLeitura({ ...base, odometroKm: 11000, horimetroH: 120, anteriores });
    expect(menor.map((p) => p.campo)).toEqual(["odometroKm", "horimetroH"]);
    expect(menor[0]?.mensagem).toContain("11.100 km em 05/01/2025");
    expect(problemasDeLeitura({ ...base, odometroKm: 11100, anteriores })).toEqual([]);
    expect(problemasDeLeitura({ ...base, odometroKm: 50, virada: true, motivoVirada: "Painel novo", anteriores })).toEqual([]);
  });

  it("virada pede leitura e motivo", () => {
    expect(problemasDeLeitura({ ...base, virada: true, motivoVirada: "Painel novo" }).map((p) => p.campo)).toEqual(["odometroKm"]);
    expect(problemasDeLeitura({ ...base, virada: true, horimetroH: 1, motivoVirada: "ok" }).map((p) => p.campo)).toEqual([
      "motivoVirada",
    ]);
  });

  it("placa normalizada igual ao banco, classe desconhecida vira máquina, texto da última leitura", () => {
    expect(normalizarPlaca(" squ-9d14 ")).toBe("SQU9D14");
    expect(normalizarPlaca(null)).toBe("");
    expect(classeConsumoDe("veiculo_leve")).toBe("veiculo_leve");
    expect(classeConsumoDe("caminhão")).toBe("maquina");
    expect(textoUltimaLeitura(anteriores.km, "km")).toBe("Última: 11.100 km em 05/01/2025");
    expect(textoUltimaLeitura(null, "h")).toBe("Sem leitura anterior");
  });
});
