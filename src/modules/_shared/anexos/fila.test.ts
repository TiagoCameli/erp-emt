// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  aceitarNovos,
  avisoDeFalhas,
  mudarFila,
  subirFila,
  type EnviarUm,
  type RegraDeAnexos,
} from "@/modules/_shared/anexos/fila";

const MB = 1024 * 1024;

const REGRA: RegraDeAnexos = {
  nomeSingular: "foto",
  nomePlural: "fotos",
  maximo: 3,
  tamanhoMaximoBytes: 10 * MB,
  tipos: ["image/jpeg", "image/png"],
  descricaoTipos: "JPEG ou PNG",
};

function arquivo(nome: string, tipo = "image/jpeg", bytes = 1000): File {
  const f = new File(["x"], nome, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

describe("aceitarNovos", () => {
  it("recusa tipo fora da lista, arquivo grande e o que passa do limite, com o motivo", () => {
    const { aceitos, recusados } = aceitarNovos(REGRA, 1, [
      arquivo("a.jpg"),
      arquivo("nota.pdf", "application/pdf"),
      arquivo("grande.jpg", "image/jpeg", 11 * MB),
      arquivo("b.png", "image/png"),
      arquivo("c.jpg"),
    ]);
    expect(aceitos.map((a) => a.name)).toEqual(["a.jpg", "b.png"]);
    expect(recusados).toEqual([
      "nota.pdf: tipo não aceito como foto (use JPEG ou PNG)",
      "grande.jpg tem 11 MB e o limite é 10 MB",
      "c.jpg: o limite é 3 fotos",
    ]);
  });

  it("o limite conta o que o documento já tem", () => {
    expect(aceitarNovos(REGRA, 3, [arquivo("a.jpg")]).aceitos).toEqual([]);
  });

  it("exatamente no limite de tamanho entra", () => {
    expect(aceitarNovos(REGRA, 0, [arquivo("a.jpg", "image/jpeg", 10 * MB)]).aceitos).toHaveLength(1);
  });

  it("sem lista de tipos aceita qualquer tipo", () => {
    const livre = { ...REGRA, tipos: [] };
    expect(aceitarNovos(livre, 0, [arquivo("x.bin", "application/octet-stream")]).aceitos).toHaveLength(1);
  });
});

describe("mudarFila", () => {
  it("remoção vale como veio", () => {
    const a = arquivo("a.jpg");
    const b = arquivo("b.jpg");
    expect(mudarFila(REGRA, [a, b], [b])).toEqual({ fila: [b], recusados: [] });
  });

  it("acréscimo passa pela regra e conta a fila atual", () => {
    const atual = [arquivo("a.jpg"), arquivo("b.jpg")];
    const { fila, recusados } = mudarFila(REGRA, atual, [...atual, arquivo("c.jpg"), arquivo("d.jpg")]);
    expect(fila.map((f) => f.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(recusados).toEqual(["d.jpg: o limite é 3 fotos"]);
  });
});

describe("subirFila", () => {
  it("envia um por vez, no id do registro, e devolve só os que falharam", async () => {
    const ordem: string[] = [];
    const enviar: EnviarUm = vi.fn(async (entidade, id, a) => {
      ordem.push(`${entidade}/${id}/${a.name}`);
      return a.name === "b.jpg" ? { erro: "O envio do arquivo falhou. Tente de novo" } : { ok: true as const };
    });
    const falhas = await subirFila("combustivel_saida", "id-1", [arquivo("a.jpg"), arquivo("b.jpg"), arquivo("c.pdf")], enviar);
    expect(ordem).toEqual(["combustivel_saida/id-1/a.jpg", "combustivel_saida/id-1/b.jpg", "combustivel_saida/id-1/c.pdf"]);
    expect(falhas).toEqual([{ nome: "b.jpg", erro: "O envio do arquivo falhou. Tente de novo" }]);
  });

  it("um envio que estoura não interrompe os outros nem lança", async () => {
    const enviar: EnviarUm = vi.fn(async (_e, _id, a) => {
      if (a.name === "a.jpg") throw new Error("rede");
      return { ok: true as const };
    });
    await expect(subirFila("combustivel_entrada", "id-2", [arquivo("a.jpg"), arquivo("b.jpg")], enviar)).resolves.toEqual([
      { nome: "a.jpg", erro: "O envio falhou" },
    ]);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("fila vazia não chama nada", async () => {
    const enviar = vi.fn<EnviarUm>();
    await expect(subirFila("combustivel_saida", "id", [], enviar)).resolves.toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("avisoDeFalhas", () => {
  it("nulo quando tudo subiu", () => {
    expect(avisoDeFalhas("Abastecimento lançado", [])).toBeNull();
  });

  it("diz que o registro ficou e lista os arquivos com o motivo", () => {
    expect(
      avisoDeFalhas("Abastecimento lançado", [
        { nome: "bomba.jpg", erro: "O envio do arquivo falhou. Tente de novo" },
        { nome: "nf.pdf", erro: "O arquivo passa do limite de 25 MB" },
      ]),
    ).toBe(
      "Abastecimento lançado, mas 2 anexos não subiram: bomba.jpg (O envio do arquivo falhou. Tente de novo); nf.pdf (O arquivo passa do limite de 25 MB). Abra o registro e anexe de novo",
    );
    expect(avisoDeFalhas("Entrada lançada", [{ nome: "a.jpg", erro: "x" }])).toMatch(/^Entrada lançada, mas 1 anexo não subiu: a\.jpg \(x\)/);
  });
});
