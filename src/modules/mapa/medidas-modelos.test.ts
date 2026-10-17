import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  afastamentoDoOperadorM,
  MEIA_LARGURA_MODELO_M,
} from "@/modules/mapa/medidas-modelos";

describe("MEIA_LARGURA_MODELO_M", () => {
  it("tem a medida de todo GLB da pasta de modelos", () => {
    const glbs = readdirSync(join(process.cwd(), "public", "mapa-modelos"))
      .filter((f) => f.endsWith(".glb"))
      .map((f) => f.replace(/\.glb$/, ""));
    expect(glbs.length).toBeGreaterThan(0);
    for (const chave of glbs) expect(MEIA_LARGURA_MODELO_M[chave], chave).toBeGreaterThan(0);
  });
});

describe("afastamentoDoOperadorM", () => {
  it("caminhão basculante: lateral (1,71 x 3) + boneco (0,37 x 8) + folga", () => {
    expect(afastamentoDoOperadorM("caminhao_basculante", 3, 8)).toBeCloseTo(
      1.71 * 3 + 0.37 * 8 + 0.5,
      6,
    );
  });

  it("máquina mais larga afasta mais", () => {
    expect(afastamentoDoOperadorM("carreta_cavalo", 3, 8)).toBeGreaterThan(
      afastamentoDoOperadorM("rolo_liso", 3, 8),
    );
  });

  it("modelo sem medida usa o genérico", () => {
    expect(afastamentoDoOperadorM("caminhao_pintura", 3, 8)).toBe(
      afastamentoDoOperadorM("generico", 3, 8),
    );
  });
});
