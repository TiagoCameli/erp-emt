import { describe, expect, it } from "vitest";

import { destinoSeguro } from "@/modules/auth/destino";

describe("destinoSeguro aceita rota interna", () => {
  it("devolve o caminho relativo", () => {
    expect(destinoSeguro("/financeiro/aprovacao-pagamentos")).toBe(
      "/financeiro/aprovacao-pagamentos",
    );
  });

  it("preserva a query, que é onde vive o link de aprovação", () => {
    expect(
      destinoSeguro("/financeiro/aprovacao-pagamentos?parcela=abc,def"),
    ).toBe("/financeiro/aprovacao-pagamentos?parcela=abc,def");
  });
});

describe("destinoSeguro cai na home quando não há destino", () => {
  it("sem valor", () => {
    expect(destinoSeguro(undefined)).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro("")).toBe("/");
  });

  it("com espaço em branco só", () => {
    expect(destinoSeguro("   ")).toBe("/");
  });
});

describe("destinoSeguro recusa redirecionamento para fora", () => {
  it("recusa URL absoluta", () => {
    expect(destinoSeguro("https://evil.com")).toBe("/");
    expect(destinoSeguro("http://evil.com/x")).toBe("/");
  });

  it("recusa a barra dupla, que o navegador lê como outro host", () => {
    expect(destinoSeguro("//evil.com")).toBe("/");
    expect(destinoSeguro("//evil.com/financeiro")).toBe("/");
  });

  it("recusa a contrabarra, que o navegador normaliza para barra", () => {
    expect(destinoSeguro("/\\evil.com")).toBe("/");
    expect(destinoSeguro("/\\/evil.com")).toBe("/");
  });

  it("recusa esquema sem barra", () => {
    expect(destinoSeguro("javascript:alert(1)")).toBe("/");
    expect(destinoSeguro("data:text/html,<script>")).toBe("/");
  });

  it("recusa caminho que não começa com barra", () => {
    expect(destinoSeguro("evil.com")).toBe("/");
    expect(destinoSeguro("financeiro/lancamentos")).toBe("/");
  });

  it("recusa a barra dupla escondida atrás de espaço ou controle", () => {
    // O navegador remove tab e quebra de linha da URL antes de resolver, então
    // "/\n/evil.com" navegaria para //evil.com. Validar o texto cru sem limpar
    // deixaria isso passar.
    expect(destinoSeguro(" //evil.com")).toBe("/");
    expect(destinoSeguro("/\n/evil.com")).toBe("/");
    expect(destinoSeguro("/\t/evil.com")).toBe("/");
  });
});

describe("destinoSeguro não devolve o próprio login", () => {
  it("recusa /login, que faria o formulário voltar para si mesmo", () => {
    expect(destinoSeguro("/login")).toBe("/");
    expect(destinoSeguro("/login?destino=/financeiro")).toBe("/");
  });
});
