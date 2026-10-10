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

describe("GradeEdicao (revisão)", () => {
  it("edição em várias linhas respeita podeEditar de cada linha", () => {
    const cols: ColunaGrade<L>[] = [
      colunas[0],
      { ...colunas[1], editar: { texto: (l) => l.nome, podeEditar: (l) => l.id !== "a" } },
      colunas[2],
      colunas[3],
    ];
    const { onEditar } = montar({ colunas: cols, selecionadas: new Set(["a", "b"]) });
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Z" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Nome, linha 2" }), { key: "Enter" });
    expect(onEditar).toHaveBeenCalledTimes(1);
    expect(onEditar).toHaveBeenCalledWith([{ idLinha: "b", idColuna: "nome", texto: "Z" }]);
  });

  it("Delete em várias linhas também respeita podeEditar", () => {
    const cols: ColunaGrade<L>[] = [colunas[0], colunas[1], colunas[2], { ...colunas[3], editar: { texto: (l) => l.dur, podeEditar: (l) => l.id !== "b" } }];
    const { onEditar } = montar({ colunas: cols, selecionadas: new Set(["a", "b"]) });
    fireEvent.click(screen.getByText("0"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" });
    expect(onEditar).toHaveBeenCalledWith([{ idLinha: "a", idColuna: "dur", texto: "" }]);
  });

  it("linhas que encolhem não deixam a célula ativa fora da grade", () => {
    const onEditar = vi.fn();
    const props = { rotulo: "Cronograma", colunas, idDaLinha: (l: L) => l.id, onEditar, selecionadas: new Set<string>(), onSelecionadasChange: () => {} };
    const { rerender } = render(<GradeEdicao<L> {...props} linhas={linhas} />);
    fireEvent.click(screen.getByText("Estacas"));
    rerender(<GradeEdicao<L> {...props} linhas={[linhas[0]]} />);
    const setData = vi.fn();
    expect(() => fireEvent.copy(screen.getByRole("grid"), { clipboardData: { setData } })).not.toThrow();
    expect(setData).toHaveBeenCalledWith("text/plain", "Fundação");
    fireEvent.keyDown(screen.getByRole("grid"), { key: "x" });
    expect(screen.getByRole("textbox", { name: "Nome, linha 1" })).toBeInTheDocument();
    rerender(<GradeEdicao<L> {...props} linhas={[]} />);
    expect(() => {
      fireEvent.keyDown(screen.getByRole("grid"), { key: "y" });
      fireEvent.copy(screen.getByRole("grid"), { clipboardData: { setData } });
    }).not.toThrow();
  });

  it("copiar usa copiar(), depois o texto de edição, o rótulo da opção, e só texto simples de exibir", () => {
    type M = { id: string; tipo: string; nome: string };
    const cols: ColunaGrade<M>[] = [
      { id: "selo", titulo: "Selo", largura: 40, exibir: (m) => <b>{m.nome}</b> },
      { id: "com", titulo: "Com copiar", largura: 40, exibir: (m) => <i>{m.nome}</i>, copiar: (m) => `#${m.nome}` },
      { id: "tipo", titulo: "Tipo", largura: 80, exibir: (m) => m.tipo, editar: { texto: (m) => m.tipo, opcoes: [{ valor: "t", rotulo: "Tarefa" }, { valor: "m", rotulo: "Marco" }] } },
      { id: "num", titulo: "Num", largura: 40, exibir: () => 7 },
    ];
    render(<GradeEdicao<M> rotulo="G" linhas={[{ id: "1", tipo: "m", nome: "Obra" }]} colunas={cols} idDaLinha={(m) => m.id}
      onEditar={() => {}} selecionadas={new Set(["1"])} onSelecionadasChange={() => {}} />);
    const setData = vi.fn();
    fireEvent.copy(screen.getByRole("grid"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "\t#Obra\tMarco\t7");
  });

  it("coluna com opções: digitar não grava texto que não é opção", () => {
    type M = { id: string; tipo: string };
    const onEditar = vi.fn();
    const cols: ColunaGrade<M>[] = [
      { id: "tipo", titulo: "Tipo", largura: 80, exibir: (m) => m.tipo, editar: { texto: (m) => m.tipo, opcoes: [{ valor: "t", rotulo: "Tarefa" }, { valor: "m", rotulo: "Marco" }] } },
    ];
    render(<GradeEdicao<M> rotulo="G" linhas={[{ id: "1", tipo: "t" }, { id: "2", tipo: "" }]} colunas={cols} idDaLinha={(m) => m.id}
      onEditar={onEditar} selecionadas={new Set()} onSelecionadasChange={() => {}} />);
    fireEvent.click(screen.getByText("t"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "x" });
    const lista = screen.getByRole("combobox", { name: "Tipo, linha 1" });
    expect(lista).toHaveValue("t");
    fireEvent.change(lista, { target: { value: "m" } });
    fireEvent.keyDown(lista, { key: "Enter" });
    expect(onEditar).toHaveBeenLastCalledWith([{ idLinha: "1", idColuna: "tipo", texto: "m" }]);
    onEditar.mockClear();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" });
    expect(onEditar).not.toHaveBeenCalled();
  });

  it("espaço ou letra na caixa de seleção da linha não começa a editar", () => {
    montar();
    const caixa = screen.getByRole("checkbox", { name: "Selecionar linha 2" });
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(caixa, { key: " " });
    fireEvent.keyDown(caixa, { key: "x" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("descer até uma linha escondida rola descontando o cabeçalho fixo, também ao confirmar com Enter", () => {
    const muitas: L[] = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, codigo: String(i), nome: `Linha ${i}`, dur: "1" }));
    const scrollTo = vi.fn();
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const antes = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 10_000 });
    proto.scrollTo = scrollTo;
    try {
      // 96px de área = cabeçalho de 32 + duas linhas de 32. A linha 4 (índice 3) começa em 32 + 96 = 128 e
      // termina em 160; para aparecer inteira, a rolagem vai a 160 - 96 = 64.
      montar({ linhas: muitas, alturaInicial: 96 });
      fireEvent.click(screen.getByText("Linha 0"));
      const grade = screen.getByRole("grid");
      for (let i = 0; i < 3; i++) fireEvent.keyDown(grade, { key: "ArrowDown" });
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 64 }));
      scrollTo.mockClear();
      fireEvent.keyDown(grade, { key: "F2" });
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Nome, linha 4" }), { key: "Enter" });
      // Linha 5 (índice 4) termina em 32 + 160 = 192: rolagem a 96.
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 96 }));
    } finally {
      delete proto.scrollTo;
      if (antes) Object.defineProperty(HTMLElement.prototype, "scrollHeight", antes);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    }
  });
});
