import { describe, expect, it } from "vitest";

import {
  motivoParaNaoAlternar,
  motivoParaNaoDesativar,
} from "@/modules/cadastros/centros-custo/travas-de-status";

/**
 * A trava de status da árvore de centros de custo.
 *
 * O que estes testes travam é a ASSIMETRIA, que é a correção de 21/09/2026:
 * desligar um centro ou um nó gerido continua proibido, ligar passa a ser
 * sempre permitido. Antes a mesma trava valia para os dois sentidos, e o centro
 * "Investimentos" — desativado por acesso direto ao banco, com a Obra dele
 * ainda ativa — ficou sem caminho de volta: aparecia na árvore, esmaecido, e o
 * menu não oferecia nada.
 */
const CENTRO = { nivel: 1, gerido: true };
const CENTRO_MANUAL = { nivel: 1, gerido: false };
const ETAPA = { nivel: 2, gerido: false };
const ETAPA_DE_EQUIPAMENTO = { nivel: 2, gerido: true };
const ITEM = { nivel: 3, gerido: false };

describe("motivoParaNaoDesativar", () => {
  it("centro não se desativa por aqui: quem manda é o cadastro de origem", () => {
    expect(motivoParaNaoDesativar(CENTRO)).toBe(
      "Centros não podem ser desativados aqui. São geridos pelo sistema",
    );
    // Nível 1 basta: a trava não depende de o centro ser gerido.
    expect(motivoParaNaoDesativar(CENTRO_MANUAL)).not.toBeNull();
  });

  it("nó gerido de nível 2 também não", () => {
    expect(motivoParaNaoDesativar(ETAPA_DE_EQUIPAMENTO)).toBe(
      "Este nó é gerido pelo sistema e não pode ser desativado",
    );
  });

  it("etapa e item manuais desativam à vontade", () => {
    expect(motivoParaNaoDesativar(ETAPA)).toBeNull();
    expect(motivoParaNaoDesativar(ITEM)).toBeNull();
  });
});

describe("motivoParaNaoAlternar", () => {
  it("LIGAR nunca tem impedimento, nem no centro", () => {
    // O conserto: é por aqui que um centro inativo volta.
    expect(motivoParaNaoAlternar(CENTRO, true)).toBeNull();
    expect(motivoParaNaoAlternar(ETAPA_DE_EQUIPAMENTO, true)).toBeNull();
    expect(motivoParaNaoAlternar(ETAPA, true)).toBeNull();
  });

  it("DESLIGAR mantém as travas de sempre", () => {
    // A metade que não pode afrouxar junto: reativar é reversível, desativar um
    // centro com etapas e histórico embaixo não é.
    expect(motivoParaNaoAlternar(CENTRO, false)).not.toBeNull();
    expect(motivoParaNaoAlternar(ETAPA_DE_EQUIPAMENTO, false)).not.toBeNull();
    expect(motivoParaNaoAlternar(ETAPA, false)).toBeNull();
  });

  it("a mensagem de desligar é a mesma dos dois caminhos", () => {
    // A action devolve este texto e a árvore decide o menu com ele: se
    // divergirem, o menu passa a oferecer o que o servidor recusa.
    for (const no of [CENTRO, ETAPA_DE_EQUIPAMENTO, ETAPA, ITEM]) {
      expect(motivoParaNaoAlternar(no, false)).toBe(motivoParaNaoDesativar(no));
    }
  });
});
