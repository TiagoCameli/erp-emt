// @vitest-environment node
/**
 * As etiquetas QR em PDF. Roda em NODE: gerar o PDF de verdade precisa de
 * `Buffer` e do printer do pdfmake. "Cabe 8 por folha" se mede no PDF gerado,
 * contando `/Type /Page` (não `/Pages`), e não olhando a definição: quem decide
 * a quebra é o pdfmake.
 */
import { describe, expect, it } from "vitest";

import { gerarPdf } from "@/lib/pdf";
import {
  codigoDaEtiqueta,
  encurtar,
  linhaTipoModelo,
  MAX_CARACTERES_NOME,
  montarDocumentoEtiquetas,
  nomeArquivoEtiquetas,
  type EtiquetaEquipamento,
} from "@/modules/cadastros/equipamentos/etiquetas-pdf";

const BASE = "https://erp.emt.com.br";

function etiqueta(
  i: number,
  extra: Partial<EtiquetaEquipamento> = {},
): EtiquetaEquipamento {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    codigo: `EQ-${String(i).padStart(3, "0")}`,
    descricao: `Escavadeira hidráulica ${i}`,
    tipo: "Escavadeira",
    marca: "Caterpillar",
    modelo: "320",
    placa: null,
    ...extra,
  };
}

function lista(n: number, extra: Partial<EtiquetaEquipamento> = {}) {
  return Array.from({ length: n }, (_, i) => etiqueta(i + 1, extra));
}

async function paginas(etiquetas: EtiquetaEquipamento[]): Promise<number> {
  const bytes = await gerarPdf(montarDocumentoEtiquetas(etiquetas, BASE));
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  return (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("montarDocumentoEtiquetas: páginas", () => {
  it("1 etiqueta dá 1 página", async () => {
    expect(await paginas(lista(1))).toBe(1);
  });

  it("8 etiquetas cabem em 1 página", async () => {
    expect(await paginas(lista(8))).toBe(1);
  });

  it("LINHA DE CONTROLE: 9 etiquetas dão 2 páginas", async () => {
    expect(await paginas(lista(9))).toBe(2);
  });

  it("16 dão 2 e 17 dão 3", async () => {
    expect(await paginas(lista(16))).toBe(2);
    expect(await paginas(lista(17))).toBe(3);
  });

  it("nome, código e modelo longos e em maiúscula não empurram a grade", async () => {
    const longos = lista(8, {
      codigo: "WWWWWWWWWWWWWWW",
      descricao:
        "CARGA SEMI-REBOQUE SR/GUERRA BASC B2T093 - 03 MMMMMMMMMMMMMMMMMMMMMMMMMMM",
      tipo: "SEMI-REBOQUE BASCULANTE WWWWWWWWWWW",
      marca: "GUERRA MMMMMMMMMMMMMMM",
      modelo: "WWWWWWWWWWWWWWWWWWWWWW",
    });
    expect(await paginas(longos)).toBe(1);
  });

  it("sem tipo, marca, modelo nem código ainda gera", async () => {
    const vazios = lista(3, {
      codigo: null,
      tipo: null,
      marca: null,
      modelo: null,
    });
    expect(await paginas(vazios)).toBe(1);
  });
});

describe("montarDocumentoEtiquetas: conteúdo", () => {
  it("o QR de cada etiqueta aponta para o equipamento dela", () => {
    const doc = montarDocumentoEtiquetas(lista(3), BASE);
    const json = JSON.stringify(doc.content);
    for (const e of lista(3)) {
      expect(json).toContain(`"qr":"${BASE}/m/equipamento/${e.id}"`);
    }
    expect(json).toContain('"eccLevel":"H"');
  });

  it("A4 retrato em Helvetica", () => {
    const doc = montarDocumentoEtiquetas(lista(1), BASE);
    expect(doc.pageSize).toBe("A4");
    expect(doc.pageOrientation).toBe("portrait");
    expect(doc.defaultStyle?.font).toBe("Helvetica");
  });
});

describe("auxiliares", () => {
  it("código cai para a placa e depois para 'Sem código'", () => {
    expect(codigoDaEtiqueta(etiqueta(1))).toBe("EQ-001");
    expect(
      codigoDaEtiqueta(etiqueta(1, { codigo: " ", placa: "ABC1D23" })),
    ).toBe("ABC1D23");
    expect(codigoDaEtiqueta(etiqueta(1, { codigo: null, placa: null }))).toBe(
      "Sem código",
    );
  });

  it("tipo e marca/modelo só com o que existe", () => {
    expect(linhaTipoModelo(etiqueta(1))).toBe("Escavadeira · Caterpillar 320");
    expect(linhaTipoModelo(etiqueta(1, { tipo: null }))).toBe("Caterpillar 320");
    expect(
      linhaTipoModelo(etiqueta(1, { tipo: null, marca: null, modelo: null })),
    ).toBe("");
  });

  it("encurtar corta na palavra e marca com reticências", () => {
    expect(encurtar("curto", 10)).toBe("curto");
    const longo =
      "Carga Semi-Reboque SR/GUERRA BASC B2T093 - 03 com sobra de texto";
    const cortado = encurtar(longo, MAX_CARACTERES_NOME);
    expect(cortado.length).toBeLessThanOrEqual(MAX_CARACTERES_NOME);
    expect(cortado.endsWith("…")).toBe(true);
    // Hífen solto antes das reticências sai.
    expect(encurtar("Carga Semi-Reboque SR/GUERRA BASC B2T093 - 03", 44)).toBe(
      "Carga Semi-Reboque SR/GUERRA BASC B2T093…",
    );
  });

  it("nome do arquivo usa a data de Rio Branco", () => {
    // 02:00 UTC do dia 24 ainda é dia 23 no Acre (UTC-5).
    expect(nomeArquivoEtiquetas(new Date("2026-09-24T02:00:00Z"))).toBe(
      "etiquetas-equipamentos-2026-09-23.pdf",
    );
  });
});
