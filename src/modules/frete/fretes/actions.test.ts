// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();
const contarAnexosPorDocumento = vi.fn();
const lerChegadaDoFrete = vi.fn();
const listarFretes = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/formatadores", () => ({ dataHojeISO: () => "2026-09-24" }));
vi.mock("@/modules/_shared/anexos/queries", () => ({
  contarAnexosPorDocumento: (...args: unknown[]) => contarAnexosPorDocumento(...args),
  listarAnexosDoDocumento: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/modules/frete/fretes/queries", () => ({
  lerChegadaDoFrete: (...args: unknown[]) => lerChegadaDoFrete(...args),
  listarFretes: (...args: unknown[]) => listarFretes(...args),
  nomesDeUsuarios: vi.fn().mockResolvedValue({}),
  trilhaDoFrete: vi.fn().mockResolvedValue([]),
}));

import {
  excluirFrete,
  gerarPlanilhaFretes,
  registrarChegada,
  registrarChegadaPelaFoto,
  restaurarFrete,
  salvarFrete,
} from "@/modules/frete/fretes/actions";
import { frete } from "@/modules/frete/fretes/fixture-frete";
import type { FreteInput } from "@/modules/frete/fretes/schemas";

const ID = "99999999-9999-4999-8999-999999999999";
const DADOS: FreteInput = {
  tipo: "material",
  data: "2026-09-20",
  dataChegada: null,
  centroCustoId: "11111111-1111-4111-8111-111111111111",
  origemLocalidadeId: "22222222-2222-4222-8222-222222222222",
  destinoLocalidadeId: "33333333-3333-4333-8333-333333333333",
  transportadoraId: "44444444-4444-4444-8444-444444444444",
  motorista: "João",
  placaCarreta: "ABC1D23",
  insumoId: "55555555-5555-4555-8555-555555555555",
  pesoToneladas: 32.5,
  kmRodados: 120,
  valorTkm: 0.37,
  valorUnitarioMaterial: 85.1234,
  notaFiscal: "123",
  notaFiscal2: null,
  observacoes: null,
};

/** Permissões que o usuário TEM; o resto é recusado. */
function permitir(...chaves: string[]) {
  exigirPermissao.mockImplementation(async (recurso: string, acao: string) => {
    if (!chaves.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  });
}

describe("actions da aba Fretes", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    contarAnexosPorDocumento.mockReset();
    lerChegadaDoFrete.mockReset();
    listarFretes.mockReset();
    createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("criar sem frete.fretes/criar: recusa e nem abre o banco", async () => {
    permitir("frete.fretes/editar");
    await expect(salvarFrete(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para lançar frete" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("editar sem frete.fretes/editar: recusa", async () => {
    permitir("frete.fretes/criar");
    await expect(salvarFrete(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar frete" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cria pela fn_frete_salvar com p_id nulo e as chaves de p_dados", async () => {
    permitir("frete.fretes/criar");
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarFrete(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(rpc).toHaveBeenCalledWith("fn_frete_salvar", {
      p_id: null,
      p_dados: {
        tipo: "material",
        data: "2026-09-20",
        data_chegada: null,
        centro_custo_id: DADOS.centroCustoId,
        origem_localidade_id: DADOS.origemLocalidadeId,
        destino_localidade_id: DADOS.destinoLocalidadeId,
        transportadora_id: DADOS.transportadoraId,
        motorista: "João",
        placa_carreta: "ABC1D23",
        insumo_id: DADOS.insumoId,
        peso_toneladas: 32.5,
        km_rodados: 120,
        valor_tkm: 0.37,
        valor_unitario_material: 85.1234,
        nota_fiscal: "123",
        nota_fiscal2: null,
        observacoes: null,
      },
    });
  });

  it("dado inválido não chega à RPC; a trava do banco (P0001) chega com o texto dela", async () => {
    permitir("frete.fretes/criar");
    await expect(salvarFrete(null, { ...DADOS, centroCustoId: null })).resolves.toEqual({ erro: "Selecione a obra" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "O fornecedor escolhido não está marcado como transportadora no cadastro" },
    });
    await expect(salvarFrete(null, DADOS)).resolves.toEqual({
      erro: "O fornecedor escolhido não está marcado como transportadora no cadastro",
    });
  });

  it("chegada: pede editar, aceita limpar (nulo) e recusa data inválida", async () => {
    permitir();
    await expect(registrarChegada(ID, "2026-09-21")).resolves.toEqual({ erro: "Sem permissão para editar frete" });
    permitir("frete.fretes/editar");
    await expect(registrarChegada(ID, "2026-02-30")).resolves.toEqual({ erro: "Data de chegada inválida" });
    rpc.mockResolvedValue({ error: null });
    await expect(registrarChegada(ID, "")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("fn_frete_registrar_chegada", { p_id: ID, p_data: null });
  });

  it("primeira foto da chegada com a data vazia: grava hoje (Rio Branco)", async () => {
    permitir("frete.fretes/editar");
    lerChegadaDoFrete.mockResolvedValue({ dataChegada: null });
    contarAnexosPorDocumento.mockResolvedValue({ [ID]: 1 });
    rpc.mockResolvedValue({ error: null });
    await expect(registrarChegadaPelaFoto(ID)).resolves.toEqual({ ok: true, dataChegada: "2026-09-24" });
    expect(contarAnexosPorDocumento).toHaveBeenCalledWith("frete_chegada", [ID]);
    expect(rpc).toHaveBeenCalledWith("fn_frete_registrar_chegada", { p_id: ID, p_data: "2026-09-24" });
  });

  it("com chegada já preenchida, ou sem foto, não grava nada", async () => {
    permitir("frete.fretes/editar");
    lerChegadaDoFrete.mockResolvedValue({ dataChegada: "2026-09-10" });
    await expect(registrarChegadaPelaFoto(ID)).resolves.toEqual({ ok: true, dataChegada: "2026-09-10" });
    lerChegadaDoFrete.mockResolvedValue({ dataChegada: null });
    contarAnexosPorDocumento.mockResolvedValue({});
    await expect(registrarChegadaPelaFoto(ID)).resolves.toEqual({ ok: true, dataChegada: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("excluir pede excluir e motivo, e chama fn_frete_excluir('fretes')", async () => {
    permitir("frete.fretes/editar");
    await expect(excluirFrete(ID, "duplicado")).resolves.toEqual({ erro: "Sem permissão para excluir frete" });
    permitir("frete.fretes/excluir");
    await expect(excluirFrete(ID, "  ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    rpc.mockResolvedValue({ error: null });
    await expect(excluirFrete(ID, " duplicado ")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_excluir", { p_tabela: "fretes", p_id: ID, p_motivo: "duplicado" });
  });

  it("restaurar pede administracao.lixeira/editar E frete.fretes/excluir", async () => {
    permitir("frete.fretes/excluir");
    await expect(restaurarFrete(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar itens da lixeira" });
    permitir("administracao.lixeira/editar");
    await expect(restaurarFrete(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar itens da lixeira" });
    expect(rpc).not.toHaveBeenCalled();
    permitir("administracao.lixeira/editar", "frete.fretes/excluir");
    rpc.mockResolvedValue({ error: null });
    await expect(restaurarFrete(ID)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_frete_restaurar", { p_tabela: "fretes", p_id: ID });
  });

  it("exportar pede ver e aplica os filtros da lista, menos o sem chegada", async () => {
    permitir();
    await expect(gerarPlanilhaFretes({})).resolves.toEqual({ erro: "Sem permissão para exportar fretes" });
    permitir("frete.fretes/ver");
    listarFretes.mockResolvedValue([
      frete({ id: "a", tipo: "material", dataChegada: "2026-09-11" }),
      frete({ id: "b", tipo: "transferencia" }),
    ]);
    const resultado = await gerarPlanilhaFretes({ tipo: "material", sem_chegada: "sim" });
    expect("ok" in resultado && resultado.nomeArquivo).toBe("fretes-2026-09-24.xlsx");
    expect("ok" in resultado && resultado.base64.length).toBeGreaterThan(100);
  });
});
