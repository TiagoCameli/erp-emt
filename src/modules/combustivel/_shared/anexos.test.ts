// @vitest-environment node
import { describe, expect, it } from "vitest";

import { aceitarNovos } from "@/modules/_shared/anexos/fila";
import { ehFoto, REGRA_ARQUIVOS, REGRA_FOTOS } from "@/modules/combustivel/_shared/anexos";

/** As regras do AnexosUploader da origem: 8 fotos + 8 arquivos, 10 MB cada, os mesmos tipos. */

const MB = 1024 * 1024;

function arquivo(nome: string, tipo: string, bytes = 1000): File {
  const f = new File(["x"], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

describe("anexos do combustível", () => {
  it("fotos: JPEG, PNG, WebP e HEIC entram; PDF não", () => {
    const { aceitos, recusados } = aceitarNovos(REGRA_FOTOS, 0, [
      arquivo("a.jpg", "image/jpeg"),
      arquivo("b.png", "image/png"),
      arquivo("c.webp", "image/webp"),
      arquivo("d.heic", "image/heic"),
      arquivo("nf.pdf", "application/pdf"),
    ]);
    expect(aceitos).toHaveLength(4);
    expect(recusados).toEqual(["nf.pdf: tipo não aceito como foto (use JPEG, PNG ou WebP)"]);
  });

  it("arquivos: PDF, Excel, Word, CSV e texto entram; foto e zip não", () => {
    const { aceitos, recusados } = aceitarNovos(REGRA_ARQUIVOS, 0, [
      arquivo("nf.pdf", "application/pdf"),
      arquivo("p.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      arquivo("p.xls", "application/vnd.ms-excel"),
      arquivo("d.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      arquivo("d.doc", "application/msword"),
      arquivo("t.csv", "text/csv"),
      arquivo("t.txt", "text/plain"),
      arquivo("f.jpg", "image/jpeg"),
      arquivo("z.zip", "application/zip"),
    ]);
    expect(aceitos).toHaveLength(7);
    expect(recusados).toHaveLength(2);
  });

  it("até 8 de cada grupo e 10 MB por arquivo", () => {
    expect(REGRA_FOTOS.maximo).toBe(8);
    expect(REGRA_ARQUIVOS.maximo).toBe(8);
    const nove = Array.from({ length: 9 }, (_, i) => arquivo(`f${i}.jpg`, "image/jpeg"));
    expect(aceitarNovos(REGRA_FOTOS, 0, nove).aceitos).toHaveLength(8);
    expect(aceitarNovos(REGRA_FOTOS, 0, [arquivo("g.jpg", "image/jpeg", 10 * MB + 1)]).aceitos).toHaveLength(0);
  });

  it("foto é qualquer imagem (o migrado conta pelo tipo gravado)", () => {
    expect(ehFoto("image/jpeg")).toBe(true);
    expect(ehFoto("image/gif")).toBe(true);
    expect(ehFoto("application/pdf")).toBe(false);
    expect(ehFoto(null)).toBe(false);
  });
});
