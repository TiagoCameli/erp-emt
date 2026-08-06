import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import {
  lerFiltroSessao,
  salvarFiltroSessao,
} from "@/components/canonicos/filtros-sessao";

/** A rota que o `usePathname` devolve nesta rodada. */
const nav = vi.hoisted(() => ({ rota: "/cadastros/categorias" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.rota,
}));

function Tela({ inicial = "ativos" }: { inicial?: string }) {
  const [status, setStatus] = useFiltroSessao("status", inicial);
  return (
    <div>
      <span data-testid="valor">{status}</span>
      <button onClick={() => setStatus("todos")}>todos</button>
      <button onClick={() => setStatus("")}>limpar</button>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  nav.rota = "/cadastros/categorias";
});

describe("useFiltroSessao", () => {
  it("começa no padrão da tela quando nada foi escolhido", () => {
    render(<Tela />);
    expect(screen.getByTestId("valor")).toHaveTextContent("ativos");
  });

  it("guarda a escolha e devolve ela na remontagem", () => {
    render(<Tela />);
    act(() => screen.getByText("todos").click());
    expect(screen.getByTestId("valor")).toHaveTextContent("todos");

    // Sair da tela e voltar: é o caso que o Tiago reportou.
    cleanup();
    render(<Tela />);
    expect(screen.getByTestId("valor")).toHaveTextContent("todos");
  });

  it("limpar vence o padrão da tela na volta", () => {
    // Sem isto o filtro que o usuário acabou de tirar reaparece sozinho.
    render(<Tela />);
    act(() => screen.getByText("limpar").click());

    cleanup();
    render(<Tela />);
    expect(screen.getByTestId("valor")).toHaveTextContent("");
  });

  it("não confunde o mesmo nome de filtro em rotas diferentes", () => {
    render(<Tela />);
    act(() => screen.getByText("todos").click());
    cleanup();

    nav.rota = "/cadastros/insumos";
    render(<Tela />);
    expect(screen.getByTestId("valor")).toHaveTextContent("ativos");
  });

  it("escreve no armazenamento com a rota na chave", () => {
    render(<Tela />);
    act(() => screen.getByText("todos").click());
    expect(lerFiltroSessao("/cadastros/categorias", "status")).toBe("todos");
  });

  it("hidrata o que já estava guardado antes de a tela montar", () => {
    salvarFiltroSessao("/cadastros/categorias", "status", "inativos");
    render(<Tela />);
    expect(screen.getByTestId("valor")).toHaveTextContent("inativos");
  });

  it("filtro de união descarta valor guardado fora da lista", () => {
    // O sessionStorage é editável pelo usuário e guarda valor de versão anterior
    // da tela. Um valor fora da união não casaria com nenhuma comparação e a
    // listagem apareceria VAZIA: o susto de "sumiu registro".
    type Status = "ativos" | "inativos" | "todos";
    const VALIDOS: readonly Status[] = ["ativos", "inativos", "todos"];

    function TelaTipada() {
      const [status] = useFiltroSessao<Status>("status", "ativos", VALIDOS);
      return <span data-testid="valor">{status}</span>;
    }

    salvarFiltroSessao("/cadastros/categorias", "status", "arquivados_2024");
    render(<TelaTipada />);
    expect(screen.getByTestId("valor")).toHaveTextContent("ativos");
  });

  it("filtro de união aceita valor guardado que está na lista", () => {
    type Status = "ativos" | "inativos" | "todos";
    const VALIDOS: readonly Status[] = ["ativos", "inativos", "todos"];

    function TelaTipada() {
      const [status] = useFiltroSessao<Status>("status", "ativos", VALIDOS);
      return <span data-testid="valor">{status}</span>;
    }

    salvarFiltroSessao("/cadastros/categorias", "status", "inativos");
    render(<TelaTipada />);
    expect(screen.getByTestId("valor")).toHaveTextContent("inativos");
  });

  it("padrão recalculado a cada render não sobrescreve a escolha", () => {
    // Tela que calcula o padrão em linha (ex. o mês corrente) devolvia um
    // `inicial` novo por render; com ele nas dependências do efeito, a escolha
    // do usuário era reescrita pelo padrão a cada ciclo.
    function TelaPadraoInstavel() {
      const [status, setStatus] = useFiltroSessao("status", String(Math.E));
      return (
        <div>
          <span data-testid="valor">{status}</span>
          <button onClick={() => setStatus("escolhido")}>escolher</button>
        </div>
      );
    }

    const { rerender } = render(<TelaPadraoInstavel />);
    act(() => screen.getByText("escolher").click());
    rerender(<TelaPadraoInstavel />);
    rerender(<TelaPadraoInstavel />);
    expect(screen.getByTestId("valor")).toHaveTextContent("escolhido");
  });
});
