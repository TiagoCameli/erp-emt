import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GradeEdicao, type ColunaGrade } from "@/components/canonicos";

type L = { id: string; codigo: string; nome: string; dur: string };
const linhas: L[] = [
  { id: "a", codigo: "1", nome: "Fundação", dur: "0" },
  { id: "b", codigo: "1.1", nome: "Estacas", dur: "4" },
];
const colunas: ColunaGrade<L>[] = [
  { id: "codigo", titulo: "Código", largura: 80, exibir: (l) => l.codigo, editar: { texto: (l) => l.codigo } },
  { id: "nome", titulo: "Nome", largura: 200, exibir: (l) => l.nome, editar: { texto: (l) => l.nome } },
  { id: "inicio", titulo: "Início", largura: 100, exibir: () => "02/03/2026" },
  { id: "dur", titulo: "Duração", largura: 80, direita: true, exibir: (l) => l.dur, editar: { texto: (l) => l.dur } },
];

function montar(extra: Partial<React.ComponentProps<typeof GradeEdicao<L>>> = {}) {
  const onEditar = vi.fn();
  const onColarAlem = vi.fn();
  render(
    <GradeEdicao<L> rotulo="Cronograma" linhas={linhas} colunas={colunas} idDaLinha={(l) => l.id}
      onEditar={onEditar} onColarAlem={onColarAlem} selecionadas={new Set()} onSelecionadasChange={() => {}} {...extra} />,
  );
  return { onEditar, onColarAlem, grade: screen.getByRole("grid", { name: "Cronograma" }) };
}

afterEach(cleanup);

describe("GradeEdicao", () => {
  it("digitar e Enter emite a mudança da célula", () => {
    const { onEditar } = montar();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "E" });
    const campo = screen.getByRole("textbox", { name: "Nome, linha 2" });
    fireEvent.change(campo, { target: { value: "Estacas raiz" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onEditar).toHaveBeenCalledWith([{ idLinha: "b", idColuna: "nome", texto: "Estacas raiz" }]);
  });

  it("coluna só leitura não abre editor", () => {
    montar();
    fireEvent.click(screen.getAllByText("02/03/2026")[0]);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "F2" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("colar bloco a partir da célula ativa pula a coluna só leitura e manda o excedente para onColarAlem", () => {
    const { onEditar, onColarAlem } = montar();
    fireEvent.click(screen.getByText("Fundação"));
    fireEvent.paste(screen.getByRole("grid"), { clipboardData: { getData: () => "Base\t5\nEstacas\t6\nBlocos\t7\n" } });
    expect(onEditar).toHaveBeenCalledWith([
      { idLinha: "a", idColuna: "nome", texto: "Base" },
      { idLinha: "a", idColuna: "dur", texto: "5" },
      { idLinha: "b", idColuna: "nome", texto: "Estacas" },
      { idLinha: "b", idColuna: "dur", texto: "6" },
    ]);
    expect(onColarAlem).toHaveBeenCalledWith([["Blocos", "7"]], "nome");
  });

  it("com linhas selecionadas, a edição vale para todas", () => {
    const { onEditar } = montar({ selecionadas: new Set(["a", "b"]) });
    fireEvent.click(screen.getByText("4"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "9" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Duração, linha 2" }), { key: "Enter" });
    expect(onEditar).toHaveBeenCalledWith([
      { idLinha: "a", idColuna: "dur", texto: "9" },
      { idLinha: "b", idColuna: "dur", texto: "9" },
    ]);
  });

  it("somente leitura não edita nem cola", () => {
    const { onEditar } = montar({ somenteLeitura: true });
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "x" });
    fireEvent.paste(screen.getByRole("grid"), { clipboardData: { getData: () => "y" } });
    expect(onEditar).not.toHaveBeenCalled();
  });
});
