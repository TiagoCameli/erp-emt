import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Detalhe do contrato, só a parte da Fase 6: a seção Reajuste e o dado dela saem só com
 * `medicao.reajuste/ver` checado no servidor; o Editar dela com `medicao.reajuste/editar`.
 */

const getUsuarioLogado = vi.fn();
const temPermissao = vi.fn();
const carregarConfigReajuste = vi.fn();
const detalhe = vi.fn();
const { ID } = vi.hoisted(() => ({ ID: "33333333-3333-4333-8333-333333333333" }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: () => getUsuarioLogado(),
  temPermissao: (...args: unknown[]) => temPermissao(...args),
}));
vi.mock("@/modules/_shared/anexos/queries", () => ({ listarAnexosDoDocumento: vi.fn().mockResolvedValue([]) }));
vi.mock("@/modules/medicao/contratos/queries", () => ({
  carregarContrato: vi.fn().mockResolvedValue({ id: ID, codigo: "L09", nome_obra: "BR-364 Lote 09", excluido_em: null }),
  listarAditivos: vi.fn().mockResolvedValue([]),
  listarUsuariosAtivos: vi.fn().mockResolvedValue([]),
  listarUsuariosDoContrato: vi.fn().mockResolvedValue([]),
  trilhaContrato: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/medicao/reajuste/queries", () => ({
  carregarConfigReajuste: (...args: unknown[]) => carregarConfigReajuste(...args),
}));
vi.mock("@/modules/medicao/contratos/components/contrato-detalhe", () => ({
  ContratoDetalhe: (props: unknown) => {
    detalhe(props);
    return null;
  },
}));

import PaginaContrato from "./page";

const CONFIG = { temReajuste: true, dataBase: "2025-01-01", periodicidadeMeses: 12, indiceDescricao: null };

function permitir(...permitidas: string[]) {
  temPermissao.mockImplementation((_u: unknown, recurso: string, acao: string) => permitidas.includes(`${recurso}/${acao}`));
}

async function abrir() {
  const elemento = await PaginaContrato({ params: Promise.resolve({ id: ID }) });
  // O componente de servidor devolve o elemento; as props são o que a tela recebe.
  return (elemento as { props: Record<string, unknown> }).props;
}

describe("PaginaContrato, seção Reajuste", () => {
  beforeEach(() => {
    getUsuarioLogado.mockReset().mockResolvedValue({ id: "u" });
    temPermissao.mockReset();
    carregarConfigReajuste.mockReset().mockResolvedValue(CONFIG);
    detalhe.mockReset();
  });

  it("sem medicao.reajuste/ver, não lê a config e a seção não vem", async () => {
    permitir("medicao.contratos/ver", "medicao.contratos/editar");
    const props = await abrir();
    expect(carregarConfigReajuste).not.toHaveBeenCalled();
    expect(props.reajuste).toBeNull();
  });

  it("com ver e sem editar, a seção vem só de leitura", async () => {
    permitir("medicao.contratos/ver", "medicao.reajuste/ver");
    const props = await abrir();
    expect(carregarConfigReajuste).toHaveBeenCalledWith(ID);
    expect(props.reajuste).toEqual({ config: CONFIG, podeEditar: false });
  });

  it("com ver e editar, a seção vem editável", async () => {
    permitir("medicao.contratos/ver", "medicao.reajuste/ver", "medicao.reajuste/editar");
    const props = await abrir();
    expect(props.reajuste).toEqual({ config: CONFIG, podeEditar: true });
  });

  it("editar sem ver não abre a seção", async () => {
    permitir("medicao.contratos/ver", "medicao.reajuste/editar");
    const props = await abrir();
    expect(props.reajuste).toBeNull();
  });
});
