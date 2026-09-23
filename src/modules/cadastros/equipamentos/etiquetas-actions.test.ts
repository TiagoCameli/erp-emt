// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));

import { gerarEtiquetasQr } from "@/modules/cadastros/equipamentos/etiquetas-actions";

const ID = "c4e0f922-3aec-8c72-7089-225523e04557";

/** Cliente falso: toda cadeia devolve a si mesma e resolve com as linhas dadas. */
function clienteCom(linhas: unknown[]) {
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn(() => consulta),
    order: vi.fn(() => consulta),
    range: vi.fn(() => Promise.resolve({ data: linhas, error: null })),
    in: vi.fn(() => Promise.resolve({ data: linhas, error: null })),
  };
  return { from: vi.fn(() => consulta), consulta };
}

const LINHA = {
  id: ID,
  codigo: "EQ-001",
  descricao: "Escavadeira",
  tipo: null,
  marca: null,
  modelo: null,
  placa: null,
};

describe("gerarEtiquetasQr", () => {
  const envOriginal = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://erp.emt.com.br/";
  });

  afterEach(() => {
    if (envOriginal === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = envOriginal;
  });

  it("sem permissão de ver: recusa e nem abre o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await gerarEtiquetasQr(null);
    expect(resultado).toEqual({
      erro: "Sem permissão para gerar etiquetas de equipamentos",
    });
    expect(exigirPermissao).toHaveBeenCalledWith("cadastros.equipamentos", "ver");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("sem NEXT_PUBLIC_SITE_URL: explica e não gera", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const resultado = await gerarEtiquetasQr(null);
    expect("erro" in resultado && resultado.erro).toMatch(
      /URL pública do app não está configurada/,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("id inválido é recusado pelo schema", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await gerarEtiquetasQr(["nao-e-id"]);
    expect("erro" in resultado).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("mais de 500 ids é recusado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const resultado = await gerarEtiquetasQr(Array.from({ length: 501 }, () => ID));
    expect(resultado).toEqual({
      erro: "Escolha no máximo 500 equipamentos por vez",
    });
  });

  it("nenhum ativo: avisa em vez de gerar PDF vazio", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    createClient.mockResolvedValue(clienteCom([]));
    const resultado = await gerarEtiquetasQr([]);
    expect(resultado).toEqual({
      erro: "Não há equipamento ativo para gerar etiqueta",
    });
  });

  it("vazio = todos os ativos, e devolve o PDF em base64", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const cliente = clienteCom([LINHA]);
    createClient.mockResolvedValue(cliente);
    const resultado = await gerarEtiquetasQr(null);
    expect(cliente.consulta.eq).toHaveBeenCalledWith("ativo", true);
    expect("ok" in resultado).toBe(true);
    if ("ok" in resultado) {
      const bytes = Buffer.from(resultado.base64, "base64");
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
      expect(resultado.nomeArquivo).toMatch(/^etiquetas-equipamentos-\d{4}-\d{2}-\d{2}\.pdf$/);
    }
  });

  it("com escolha, busca pelos ids (sem filtrar ativo)", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const cliente = clienteCom([LINHA]);
    createClient.mockResolvedValue(cliente);
    const resultado = await gerarEtiquetasQr([ID, ID]);
    expect(cliente.consulta.in).toHaveBeenCalledWith("id", [ID]);
    expect(cliente.consulta.eq).not.toHaveBeenCalled();
    expect("ok" in resultado).toBe(true);
  });
});
