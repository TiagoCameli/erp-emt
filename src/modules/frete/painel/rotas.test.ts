import { describe, expect, it } from "vitest";

import type { FretePainel } from "./calculo";
import { rotasDoPainel } from "./rotas";

function frete(over: Partial<FretePainel>): FretePainel {
  return {
    id: "f",
    tipo: "material",
    data: "2026-03-10",
    dataChegada: "2026-03-12",
    obraId: "o1",
    origemId: "lBritam",
    destinoId: "lObra",
    pedreiraId: "britam",
    transportadoraId: "tA",
    insumoId: "brita",
    peso: 30,
    km: 700,
    valorTkm: 0.37,
    valorTotal: 7770,
    valorMaterial: 0,
    notaFiscal: "1",
    placaCarreta: "ABC1D23",
    ...over,
  };
}

const MAPA = {
  localidades: [
    { id: "lBritam", nome: "Pedreira Britam", latitude: -9.8, longitude: -66.2 },
    { id: "lObra", nome: "Usina Gregorio", latitude: -7.9, longitude: -71.5 },
    { id: "lPatio", nome: "Patio Lote 10", latitude: -7.7, longitude: -72.5 },
  ],
  tracados: [{ origemId: "lBritam", destinoId: "lObra", kmMapa: 697, horasMapa: 10.7, pontos: [[-9.8, -66.2], [-7.9, -71.5]] as [number, number][] }],
};

describe("rotasDoPainel", () => {
  const rotas = rotasDoPainel(
    [
      frete({ id: "1", transportadoraId: "tA", valorTotal: 10000, km: 690 }),
      frete({ id: "2", transportadoraId: "tB", valorTotal: 5000.5, km: 710, data: "2026-04-02", dataChegada: "2026-04-03" }),
      // Sem chegada: entra na produção, fica fora do tempo médio.
      frete({ id: "3", transportadoraId: "tB", valorTotal: 2000, dataChegada: null, data: "2026-04-20" }),
      frete({ id: "4", tipo: "transferencia", origemId: "lObra", destinoId: "lPatio", valorTotal: 3000, km: 110, peso: 70, dataChegada: "2026-03-10" }),
    ],
    MAPA,
  );

  it("junta as transportadoras na mesma rota e ordena pela produção", () => {
    expect(rotas.map((r) => r.chave)).toEqual(["lBritam_lObra", "lObra_lPatio"]);
    const [britam] = rotas;
    expect(britam?.viagens).toBe(3);
    expect(britam?.producao).toBe(17000.5);
    expect(britam?.toneladas).toBe(90);
    expect(britam?.origem.nome).toBe("Pedreira Britam");
    expect(britam?.kmMapa).toBe(697);
    expect(britam?.tracado).toHaveLength(2);
  });

  it("km mínimo, máximo e tempo médio só de quem chegou", () => {
    const [britam, transf] = rotas;
    expect(britam?.kmMin).toBe(690);
    expect(britam?.kmMax).toBe(710);
    // 2 dias e 1 dia; o terceiro não tem chegada.
    expect(britam?.diasMedio).toBe(1.5);
    expect(britam?.semChegada).toBe(1);
    expect(transf?.diasMedio).toBe(0);
    expect(transf?.tracado).toBeNull();
  });

  it("barrinhas do primeiro ao último mês com frete, ou do período do filtro", () => {
    expect(rotas[0]?.porMes.map((m) => [m.mes, m.viagens])).toEqual([
      ["2026-03", 1],
      ["2026-04", 2],
    ]);
    const comFiltro = rotasDoPainel([frete({})], MAPA, "2026-01-01", "2026-03-31");
    expect(comFiltro[0]?.porMes.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("sem frete, sem rota", () => {
    expect(rotasDoPainel([], MAPA)).toEqual([]);
  });
});
