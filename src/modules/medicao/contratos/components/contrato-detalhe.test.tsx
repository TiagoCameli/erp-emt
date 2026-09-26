import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Fluxo de "Excluir contrato" no detalhe (Important 2 da revisão da Task 11:
 * nenhuma tela chamava `excluirContrato`) e a trava de leitura só quando o
 * contrato está na lixeira (Important 3: acesso, aditivos e anexos ficam
 * read-only lá, mesmo para quem tem `editar`).
 */

const estado = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const excluirContrato = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: estado.push, refresh: estado.refresh, replace: vi.fn() }),
}));
vi.mock("@/modules/medicao/contratos/actions", () => ({
  excluirContrato: (...args: unknown[]) => excluirContrato(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { ContratoDetalhe } from "@/modules/medicao/contratos/components/contrato-detalhe";
import type { ContratoDetalhe as ContratoDetalheRow } from "@/modules/medicao/contratos/queries";

const ID = "33333333-3333-4333-8333-333333333333";

function contrato(overrides: Partial<ContratoDetalheRow> = {}): ContratoDetalheRow {
  return {
    id: ID,
    codigo: "L09-BR364",
    nome_obra: "BR-364 Lote 09",
    local: "Cruzeiro do Sul/AC",
    objeto: "Manutenção rodoviária",
    numero_contrato: "00615/2025",
    contratante_nome: "DNIT",
    contratante_tipo: "federal",
    contratante_documento: null,
    valor_inicial: 243927498.02,
    data_assinatura: "2025-10-01",
    data_ordem_servico: null,
    prazo_meses: 39,
    inicio_prazo: "assinatura",
    dia_inicio_periodo: 26,
    tipo_localizacao: "rodovia",
    regra_arredondamento: null,
    alerta_prazo_dias: 90,
    alerta_valor_pct: 90,
    status: "ativo",
    observacoes: null,
    excluido_em: null,
    motivo_exclusao: null,
    excluido_por: null,
    created_at: "2025-10-01T00:00:00Z",
    updated_at: "2025-10-01T00:00:00Z",
    created_by: null,
    ...overrides,
  } as ContratoDetalheRow;
}

function montar(opcoes: {
  contratoOverrides?: Partial<ContratoDetalheRow>;
  podeEditar?: boolean;
  podeExcluir?: boolean;
  podeRestaurar?: boolean;
} = {}) {
  render(
    <ContratoDetalhe
      contrato={contrato(opcoes.contratoOverrides)}
      podeEditar={opcoes.podeEditar ?? true}
      podeExcluir={opcoes.podeExcluir ?? true}
      podeRestaurar={opcoes.podeRestaurar ?? true}
      usuarios={[]}
      usuariosAtivos={[]}
      aditivos={[]}
      anexos={[]}
      trilha={[]}
    />,
  );
}

beforeEach(() => {
  estado.push.mockReset();
  estado.refresh.mockReset();
  excluirContrato.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ContratoDetalhe: excluir contrato", () => {
  it("sem podeExcluir, o botão nem aparece", () => {
    montar({ podeExcluir: false });
    expect(screen.queryByRole("button", { name: "Excluir contrato" })).toBeNull();
  });

  it("com podeExcluir, exclui com motivo e volta para a lista", async () => {
    excluirContrato.mockResolvedValue({ ok: true });
    montar({ podeExcluir: true });

    fireEvent.click(screen.getByRole("button", { name: "Excluir contrato" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Rescindido amigavelmente" } });
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Excluir contrato" }));

    await waitFor(() => expect(excluirContrato).toHaveBeenCalledWith(ID, "Rescindido amigavelmente"));
    await waitFor(() => expect(estado.push).toHaveBeenCalledWith("/medicao/contratos"));
    expect(toastSucesso).toHaveBeenCalled();
  });

  it("erro do banco vira toast e não navega", async () => {
    excluirContrato.mockResolvedValue({ erro: "Não foi possível excluir" });
    montar({ podeExcluir: true });

    fireEvent.click(screen.getByRole("button", { name: "Excluir contrato" }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Teste" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir contrato" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Não foi possível excluir"));
    expect(estado.push).not.toHaveBeenCalled();
  });

  it("na lixeira: sem botão de excluir nem editar, e o aviso só fala em restaurar para quem pode", () => {
    montar({
      podeExcluir: true,
      podeEditar: true,
      podeRestaurar: false,
      contratoOverrides: { excluido_em: "2026-01-01T00:00:00Z", motivo_exclusao: "Teste" },
    });
    expect(screen.queryByRole("button", { name: "Excluir contrato" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar contrato" })).toBeNull();
    expect(screen.getByText(/Este contrato está na lixeira/)).toBeInTheDocument();
    expect(screen.queryByText(/Restaure-o pela lista/)).toBeNull();
  });
});
