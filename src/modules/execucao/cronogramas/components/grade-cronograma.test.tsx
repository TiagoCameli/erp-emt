import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const salvarLinhas = vi.fn();
const toastErro = vi.fn();

vi.mock("@/modules/execucao/cronogramas/actions", () => ({
  salvarLinhas: (...args: unknown[]) => salvarLinhas(...args),
  excluirAtividades: vi.fn(),
  renumerarEap: vi.fn(),
  recalcular: vi.fn(),
}));
vi.mock("@/components/canonicos/toast", () => ({ toast: { error: (m: string) => toastErro(m), success: vi.fn() } }));

import { GradeCronograma } from "@/modules/execucao/cronogramas/components/grade-cronograma";
import type { AtividadeGrade } from "@/modules/execucao/cronogramas/edicao";

const CRONO = "11111111-1111-4111-8111-111111111111";
// Microssegundos: se passasse por Date, viraria ...13.123Z e o banco recusaria a linha.
const VERSAO = "2026-10-10T13:00:00.123456+00:00";

const a = (p: Partial<AtividadeGrade>): AtividadeGrade => ({
  id: "x", codigo: "1", nome: "Estacas", tipo: "atividade", paiId: null, paiCodigo: null, ordem: 1, servicoId: null, servicoCodigo: null,
  quantidade: null, unidadeId: null, unidadeSigla: null, produtividade: null, modoDuracao: "digitada", duracaoDias: 1,
  inicioCedo: null, fimCedo: null, folgaTotal: null, critica: null, predecessoras: [], locais: [], observacao: null, versao: VERSAO, ...p,
});

function montar(perm: { criar?: boolean; editar?: boolean; excluir?: boolean } = { criar: true, editar: true, excluir: true }) {
  render(
    <GradeCronograma
      cronogramaId={CRONO}
      atividades={[a({})]}
      servicos={[]}
      unidades={[]}
      locais={[]}
      podeCriar={!!perm.criar}
      podeEditar={!!perm.editar}
      podeExcluir={!!perm.excluir}
    />,
  );
}

beforeEach(() => {
  salvarLinhas.mockReset().mockResolvedValue({ ok: true, atividades: [a({ nome: "Estacas raiz", versao: "2026-10-10T13:00:01.000001+00:00" })] });
  toastErro.mockReset();
});
afterEach(cleanup);

describe("GradeCronograma", () => {
  it("editar o nome manda uma linha do lote com id e a versão como veio do banco, e troca pela resposta", async () => {
    montar();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "E" });
    const campo = screen.getByRole("textbox", { name: "Nome, linha 1" });
    fireEvent.change(campo, { target: { value: "Estacas raiz" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(salvarLinhas).toHaveBeenCalledWith(CRONO, [{ id: "x", versao: VERSAO, nome: "Estacas raiz" }]));
    expect(await screen.findByText("Estacas raiz")).toBeTruthy();
  });

  it("texto que não se interpreta vira aviso e nada é enviado", () => {
    montar();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" });
    expect(toastErro).toHaveBeenCalledWith("Linha 1: Informe o nome");
    expect(salvarLinhas).not.toHaveBeenCalled();
  });

  it("erro do banco vai para o aviso, intacto", async () => {
    salvarLinhas.mockResolvedValue({ erro: "Linha 1: esta linha foi alterada por outra pessoa. Recarregue a grade" });
    montar();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Z" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Nome, linha 1" }), { key: "Enter" });
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Linha 1: esta linha foi alterada por outra pessoa. Recarregue a grade"));
  });

  it("sem criar e sem editar: sem barra e a grade não edita", () => {
    montar({ excluir: true });
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "E" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("só com editar: a barra não mostra Nova linha nem Excluir", () => {
    montar({ editar: true });
    expect(screen.getByRole("toolbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nova linha/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Recalcular datas/ })).toBeTruthy();
  });
});
