import { describe, expect, it } from "vitest";

import {
  mesesDoAnoAte,
  montarSociosLigadas,
  type SocioLigadaLinha,
  type SocioLigadaMes,
} from "@/modules/financeiro/relatorios/socios-ligadas";

const JAMES = "james";
const TIAGO = "tiago";
const AMAZONIA = "amazonia";
const JURUA = "jurua";

const centro = (
  centroId: string,
  tipo: string,
  enviado: number,
  devolvido: number,
): SocioLigadaLinha => ({
  centroId,
  centro: centroId,
  tipo,
  ativo: true,
  enviado,
  devolvido,
  saldo: enviado - devolvido,
});

const mes = (
  centroId: string,
  m: string,
  enviado: number,
  enviadoAberto = 0,
  devolvido = 0,
): SocioLigadaMes => ({ centroId, mes: m, enviado, enviadoAberto, devolvido, devolvidoAberto: 0 });

const MESES: SocioLigadaMes[] = [
  mes(JAMES, "2025-12", 500.1),
  mes(JAMES, "2026-01", 1000.1, 0),
  mes(JAMES, "2026-03", 2000.2, 300.3),
  mes(TIAGO, "2026-03", 0.1),
  mes(TIAGO, "2026-03", 0.2),
  mes(AMAZONIA, "2025-11", 1000, 0, 200),
  mes(AMAZONIA, "2026-02", 500, 50, 100),
];

const CENTROS = [
  centro(TIAGO, "socio", 0.3, 0),
  centro(JAMES, "socio", 3500.4, 0),
  centro(AMAZONIA, "empresa_ligada", 1500, 300),
  centro(JURUA, "empresa_ligada", 0, 0),
];

describe("montarSociosLigadas", () => {
  const r = montarSociosLigadas(CENTROS, MESES, "2026-04");

  it("separa sócio de empresa ligada, cada bloco com o seu total", () => {
    expect(r.socios.map((s) => s.centroId)).toEqual([JAMES, TIAGO]);
    expect(r.ligadas.map((s) => s.centroId)).toEqual([AMAZONIA, JURUA]);
    // Total de sócios só soma sócio: a distribuição nunca se mistura com mútuo.
    expect(r.totalSocios.acumulado.enviado).toBe(3500.7);
    expect(r.totalLigadas.acumulado.saldo).toBe(1200);
  });

  it("ano corrente x acumulado, e pago = enviado - em aberto", () => {
    const james = r.socios[0];
    expect(james.ano.enviado).toBe(3000.3);
    expect(james.ano.enviadoAberto).toBe(300.3);
    expect(james.ano.enviadoPago).toBe(2700);
    expect(james.acumulado.enviado).toBe(3500.4);
    expect(r.totalSocios.ano.enviadoAberto).toBe(300.3);
  });

  it("soma em centavos (0,1 + 0,2 fecha em 0,30)", () => {
    const tiago = r.socios[1];
    expect(tiago.acumulado.enviado).toBe(0.3);
    expect(r.divergentes).toEqual([]);
  });

  it("saldo do mútuo é enviado menos devolvido, desde o início", () => {
    const amazonia = r.ligadas[0];
    expect(amazonia.acumulado.saldo).toBe(1200);
    expect(amazonia.ano.enviado).toBe(500);
    expect(amazonia.ano.devolvido).toBe(100);
    expect(amazonia.acumulado.enviadoAberto).toBe(50);
  });

  it("ligada sem movimento aparece zerada", () => {
    expect(r.ligadas[1].acumulado).toMatchObject({ enviado: 0, saldo: 0 });
  });

  it("série dos sócios: janeiro até o mês corrente, mês vazio incluído", () => {
    expect(r.serieSocios.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(r.serieSocios[1].total).toBe(0);
    expect(r.serieSocios[2].total).toBe(2000.5);
    // Mês de ligada não entra na série de sócios.
    expect(r.serieSocios[1].porCentro).toEqual({});
  });

  it("aponta o centro cuja soma mensal não fecha com o total", () => {
    const torto = montarSociosLigadas([centro(JAMES, "socio", 9999, 0)], MESES, "2026-04");
    expect(torto.divergentes).toEqual([JAMES]);
  });
});

describe("mesesDoAnoAte", () => {
  it("janeiro sozinho e dezembro completo", () => {
    expect(mesesDoAnoAte("2026-01")).toEqual(["2026-01"]);
    expect(mesesDoAnoAte("2026-12")).toHaveLength(12);
  });
});
