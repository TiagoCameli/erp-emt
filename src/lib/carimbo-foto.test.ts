// @vitest-environment node
import { describe, expect, it } from "vitest";

import { linhasDoCarimbo } from "@/lib/carimbo-foto";

describe("linhasDoCarimbo", () => {
  it("hora de Rio Branco (UTC-5) e GPS com 6 casas e a precisão em metros", () => {
    const momento = new Date("2026-09-24T02:05:09Z");
    expect(linhasDoCarimbo(momento, { lat: -9.974512345, lon: -67.8243219, precisao: 12.6 })).toEqual([
      "23/09/2026 21:05:09",
      "GPS: -9.974512, -67.824322 (precisão 13 m)",
    ]);
  });

  it("sem posição diz que o GPS não estava disponível", () => {
    expect(linhasDoCarimbo(new Date("2026-09-24T15:00:00Z"), null)).toEqual(["24/09/2026 10:00:00", "GPS: indisponível"]);
  });
});
