import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  mensagemDeAprovacao,
  type FolhaParaMensagem,
} from "@/modules/rh/folha/mensagem-aprovacao";

/** A folha de agosto/2026, com os números que ela tinha ao ser enviada. */
const FOLHA: FolhaParaMensagem = {
  id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  competencia: "2026-08-01",
  colaboradores: 47,
  custoTotal: 173020.37,
  liquido: 162711.43,
};

describe("mensagemDeAprovacao", () => {
  it("leva competência, tamanho da folha, os dois totais e o link", () => {
    const texto = mensagemDeAprovacao(FOLHA, "https://erp.emt.com.br");

    expect(texto).toContain("Folha de 08/2026 pronta para aprovação.");
    expect(texto).toContain("47 colaboradores");
    // Asserção pelo formatador, e não pela string literal: o BRL do projeto usa
    // espaço não separável depois do "R$", que não se digita à mão.
    expect(texto).toContain(`Custo total: ${formatarBRL(173020.37)}`);
    expect(texto).toContain(`Líquido a pagar: ${formatarBRL(162711.43)}`);
    expect(texto).toContain(
      "https://erp.emt.com.br/rh/folha/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
    );
  });

  it("a barra sobrando na origem não vira barra dupla no link", () => {
    // `window.location.origin` não traz barra, mas um domínio digitado à mão em
    // configuração traz — e o link sai cru no WhatsApp, onde a barra dupla fica
    // à vista de quem recebe.
    const texto = mensagemDeAprovacao(FOLHA, "https://erp.emt.com.br///");
    expect(texto).toContain("https://erp.emt.com.br/rh/folha/");
    expect(texto).not.toContain("//rh/folha");
  });

  it("um colaborador só não vira \"1 colaboradores\"", () => {
    const texto = mensagemDeAprovacao(
      { ...FOLHA, colaboradores: 1 },
      "https://erp.emt.com.br",
    );
    expect(texto).toContain("1 colaborador");
    expect(texto).not.toContain("1 colaboradores");
  });

  it("o link fica na última linha, sozinho", () => {
    // O WhatsApp só transforma em link o que ele consegue delimitar. Texto
    // colado depois na mesma linha entra no href e o link abre quebrado.
    const linhas = mensagemDeAprovacao(FOLHA, "https://erp.emt.com.br").split(
      "\n",
    );
    const ultima = linhas[linhas.length - 1]!;
    expect(ultima.startsWith("Aprovar: https://")).toBe(true);
    expect(ultima.endsWith(FOLHA.id)).toBe(true);
  });
});
