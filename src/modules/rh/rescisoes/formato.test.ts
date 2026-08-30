import { describe, expect, it } from "vitest";

import {
  AVISOS_POR_TIPO,
  AVISOS_RESCISAO,
  ROTULO_AVISO,
  ROTULO_TIPO_RESCISAO,
  STATUS_RESCISAO,
  TIPOS_RESCISAO,
  VERBAS_POR_TIPO,
} from "./formato";

/**
 * A matriz de verbas NÃO é dedução minha: foi declarada pelo Tiago em
 * 29/08/2026, escolhendo os quatro tipos numa pergunta em que cada opção
 * trazia escrito o que ela implica. Estes testes travam essa declaração no
 * repositório, para que uma alteração futura precise ser deliberada em vez de
 * silenciosa.
 */
describe("matriz de rescisão declarada pelo Tiago", () => {
  it("demissão sem justa causa aceita aviso indenizado ou trabalhado", () => {
    expect(AVISOS_POR_TIPO.sem_justa_causa).toEqual([
      "indenizado",
      "trabalhado",
    ]);
  });

  it("pedido de demissão aceita aviso trabalhado ou não cumprido", () => {
    expect(AVISOS_POR_TIPO.pedido_demissao).toEqual([
      "trabalhado",
      "nao_cumprido",
    ]);
  });

  it("não há aviso prévio em experiência nem em justa causa", () => {
    expect(AVISOS_POR_TIPO.termino_experiencia).toEqual(["nao_se_aplica"]);
    expect(AVISOS_POR_TIPO.justa_causa).toEqual(["nao_se_aplica"]);
  });

  it("só a demissão sem justa causa tem multa do FGTS", () => {
    const comMulta = TIPOS_RESCISAO.filter((tipo) =>
      VERBAS_POR_TIPO[tipo].some((verba) => verba.includes("FGTS")),
    );
    expect(comMulta).toEqual(["sem_justa_causa"]);
  });

  it("férias vencidas entram nos QUATRO tipos, justa causa inclusive", () => {
    for (const tipo of TIPOS_RESCISAO) {
      expect(
        VERBAS_POR_TIPO[tipo].some((verba) => verba.startsWith("Férias vencidas")),
      ).toBe(true);
    }
  });

  it("justa causa não tem 13º nem férias proporcionais", () => {
    const verbas = VERBAS_POR_TIPO.justa_causa;
    expect(verbas.some((verba) => verba.includes("13º"))).toBe(false);
    expect(verbas.some((verba) => verba.includes("proporcionais"))).toBe(false);
  });

  it("todo aviso permitido é um aviso conhecido", () => {
    for (const tipo of TIPOS_RESCISAO) {
      for (const aviso of AVISOS_POR_TIPO[tipo]) {
        expect(AVISOS_RESCISAO).toContain(aviso);
      }
    }
  });
});

describe("rótulos", () => {
  it("todo tipo e todo aviso têm rótulo em pt-BR", () => {
    for (const tipo of TIPOS_RESCISAO) {
      expect(ROTULO_TIPO_RESCISAO[tipo].length).toBeGreaterThan(3);
    }
    for (const aviso of AVISOS_RESCISAO) {
      expect(ROTULO_AVISO[aviso].length).toBeGreaterThan(3);
    }
  });

  it("os rótulos de status são femininos, como a entidade", () => {
    // "Aprovado" ao lado de "a rescisão" é o tipo de detalhe que faz a tela
    // parecer de outro sistema. O ApprovalBar recebe estes mesmos rótulos.
    expect(STATUS_RESCISAO.aprovado.rotulo).toBe("Aprovada");
    expect(STATUS_RESCISAO.rejeitado.rotulo).toBe("Rejeitada");
  });

  it("o badge de aprovado não é o mesmo do rascunho", () => {
    expect(STATUS_RESCISAO.aprovado.badge).toBe("aprovado");
    expect(STATUS_RESCISAO.rascunho.badge).toBe("rascunho");
  });
});
