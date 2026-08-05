import { describe, expect, it } from "vitest";

import { idSchema, idSchemaCom } from "./id";

describe("idSchema", () => {
  it("aceita uuid v4 normal, que é o id que o banco gera sozinho", () => {
    expect(
      idSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success,
    ).toBe(true);
    expect(
      idSchema.safeParse("9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b").success,
    ).toBe(true);
  });

  it("aceita o id da importação da BR-364, derivado de md5", () => {
    // Caso real: lançamento LAN-2026-0262. Variante 7 e versão 8, o que o
    // z.uuid() recusava e travava a tela de escolher a conta bancária.
    expect(
      idSchema.safeParse("c4e0f922-3aec-8c72-7089-225523e04557").success,
    ).toBe(true);
    // Extremos do que o md5 pode produzir nos dígitos de versão e variante.
    expect(
      idSchema.safeParse("00000000-0000-0000-0000-000000000000").success,
    ).toBe(true);
    expect(
      idSchema.safeParse("ffffffff-ffff-ffff-ffff-ffffffffffff").success,
    ).toBe(true);
  });

  it("aceita hexadecimal maiúsculo, que o Postgres também aceita", () => {
    expect(
      idSchema.safeParse("C4E0F922-3AEC-8C72-7089-225523E04557").success,
    ).toBe(true);
  });

  it("recusa string vazia", () => {
    expect(idSchema.safeParse("").success).toBe(false);
    expect(idSchema.safeParse("   ").success).toBe(false);
  });

  it("recusa texto qualquer", () => {
    expect(idSchema.safeParse("abc").success).toBe(false);
    expect(idSchema.safeParse("LAN-2026-0262").success).toBe(false);
    expect(idSchema.safeParse("null").success).toBe(false);
  });

  it("recusa uuid com tamanho errado", () => {
    // Um dígito a menos no último grupo.
    expect(
      idSchema.safeParse("550e8400-e29b-41d4-a716-44665544000").success,
    ).toBe(false);
    // Um dígito a mais.
    expect(
      idSchema.safeParse("550e8400-e29b-41d4-a716-4466554400001").success,
    ).toBe(false);
    // Sem os hífens.
    expect(idSchema.safeParse("550e8400e29b41d4a716446655440000").success).toBe(
      false,
    );
    // Caractere fora do hexadecimal.
    expect(
      idSchema.safeParse("550e8400-e29b-41d4-a716-44665544000g").success,
    ).toBe(false);
  });

  it("recusa tentativa de injeção", () => {
    expect(idSchema.safeParse("' or 1=1").success).toBe(false);
    expect(
      idSchema.safeParse("c4e0f922-3aec-8c72-7089-225523e04557' or 1=1--")
        .success,
    ).toBe(false);
    expect(
      idSchema.safeParse("' or 1=1; drop table lancamentos;").success,
    ).toBe(false);
    // Nada de âncora frouxa: espaço ou quebra de linha em volta não passa.
    expect(
      idSchema.safeParse(" c4e0f922-3aec-8c72-7089-225523e04557 ").success,
    ).toBe(false);
    expect(
      idSchema.safeParse("c4e0f922-3aec-8c72-7089-225523e04557\n' or 1=1")
        .success,
    ).toBe(false);
    expect(
      idSchema.safeParse("c4e0f922-3aec-8c72-7089-225523e04557\n").success,
    ).toBe(false);
  });

  it("recusa o que não é string", () => {
    expect(idSchema.safeParse(null).success).toBe(false);
    expect(idSchema.safeParse(undefined).success).toBe(false);
    expect(idSchema.safeParse(42).success).toBe(false);
    expect(idSchema.safeParse({}).success).toBe(false);
  });
});

describe("idSchemaCom", () => {
  it("valida igual ao canônico, só troca a mensagem", () => {
    const schema = idSchemaCom("Selecione o fornecedor");
    expect(
      schema.safeParse("c4e0f922-3aec-8c72-7089-225523e04557").success,
    ).toBe(true);

    const recusado = schema.safeParse("");
    expect(recusado.success).toBe(false);
    expect(recusado.error?.issues[0]?.message).toBe("Selecione o fornecedor");
  });
});
