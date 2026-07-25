import { describe, expect, it } from "vitest";

import { salarioSugerido } from "@/modules/cadastros/colaboradores/funcao-salario";

const FUNCOES = [
  { id: "func-pedreiro", salarioBase: 2200 },
  { id: "func-mestre", salarioBase: 4500 },
  { id: "func-sem-salario", salarioBase: null },
];

describe("salarioSugerido", () => {
  it("sugere o salarioBase da função nova quando o usuário troca de função", () => {
    const resultado = salarioSugerido("func-pedreiro", "func-mestre", FUNCOES);
    expect(resultado).toBe(4500);
  });

  it("não sugere nada no load (função nova igual à atual)", () => {
    const resultado = salarioSugerido("func-pedreiro", "func-pedreiro", FUNCOES);
    expect(resultado).toBeNull();
  });

  it("não sugere nada quando a função nova não tem salarioBase cadastrado", () => {
    const resultado = salarioSugerido(
      "func-pedreiro",
      "func-sem-salario",
      FUNCOES,
    );
    expect(resultado).toBeNull();
  });

  it("não sugere nada quando o usuário limpa a função (nova é null)", () => {
    const resultado = salarioSugerido("func-pedreiro", null, FUNCOES);
    expect(resultado).toBeNull();
  });

  it("não sugere nada partindo de nenhuma função (load de cadastro novo)", () => {
    const resultado = salarioSugerido(null, null, FUNCOES);
    expect(resultado).toBeNull();
  });

  it("sugere ao sair de nenhuma função e escolher uma função com salário", () => {
    const resultado = salarioSugerido(null, "func-mestre", FUNCOES);
    expect(resultado).toBe(4500);
  });

  it("não sugere nada quando a função nova não é encontrada na lista", () => {
    const resultado = salarioSugerido("func-pedreiro", "func-inexistente", FUNCOES);
    expect(resultado).toBeNull();
  });
});
