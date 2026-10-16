import { describe, expect, it } from "vitest";

import {
  FOLGA_CARTAO_PX,
  MARGEM_CARTAO_PX,
  TOPO_CARTAO_PX,
  pontoAoLeste,
  posicaoDoCartao,
} from "@/modules/mapa/cartao";

const mapa = { largura: 288, altura: 300, larguraMapa: 1500, alturaMapa: 800 };

describe("card da ficha ao lado do objeto", () => {
  it("fica à direita, depois do raio, centrado na altura do objeto", () => {
    const r = posicaoDoCartao({ ...mapa, ponto: [500, 400], raioPx: 40 });
    expect(r).toEqual({
      x: 500 + 40 + FOLGA_CARTAO_PX,
      y: 400 - 150,
      lado: "direita",
    });
  });

  it("vai para a esquerda quando não cabe à direita, sem cobrir o objeto", () => {
    const r = posicaoDoCartao({ ...mapa, ponto: [1400, 400], raioPx: 40 });
    expect(r.lado).toBe("esquerda");
    expect(r.x + mapa.largura).toBe(1400 - 40 - FOLGA_CARTAO_PX);
  });

  it("não sobe nos botões do mapa nem sai pelas bordas", () => {
    const topo = posicaoDoCartao({ ...mapa, ponto: [500, 10], raioPx: 20 });
    expect(topo.y).toBe(TOPO_CARTAO_PX);
    const baixo = posicaoDoCartao({ ...mapa, ponto: [500, 790], raioPx: 20 });
    expect(baixo.y).toBe(800 - 300 - MARGEM_CARTAO_PX);
    // objeto fora da vista, à esquerda: o card encosta na borda
    const fora = posicaoDoCartao({ ...mapa, ponto: [-900, 400], raioPx: 20 });
    expect(fora.x).toBe(MARGEM_CARTAO_PX);
  });

  it("o ponto a leste fica à distância pedida (mede o raio em pixels)", () => {
    const [lng, lat] = pontoAoLeste([-71.49, -7.95], 100);
    expect(lat).toBe(-7.95);
    const metros = (lng + 71.49) * 111_320 * Math.cos((7.95 * Math.PI) / 180);
    expect(metros).toBeCloseTo(100, 6);
  });
});
