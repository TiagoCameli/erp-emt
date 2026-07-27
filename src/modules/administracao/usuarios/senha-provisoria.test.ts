import { describe, expect, it } from "vitest";
import { gerarSenhaProvisoria } from "./senha-provisoria";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";

describe("gerarSenhaProvisoria", () => {
  it("gera 16 caracteres", () => {
    expect(gerarSenhaProvisoria()).toHaveLength(16);
  });

  it("usa só o alfabeto permitido", () => {
    const senha = gerarSenhaProvisoria();
    for (const c of senha) {
      expect(ALFABETO).toContain(c);
    }
  });

  it("não repete entre chamadas", () => {
    const a = gerarSenhaProvisoria();
    const b = gerarSenhaProvisoria();
    expect(a).not.toBe(b);
  });
});
