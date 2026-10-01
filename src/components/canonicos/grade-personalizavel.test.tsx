import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  salvarPreferenciaTabela: vi.fn(() => Promise.resolve()),
  limparPreferenciaTabela: vi.fn(() => Promise.resolve()),
}));

import { GradeKpis, ItemGrade, itensDaGrade, KPICard, ProvedorGrades } from "@/components/canonicos";
import {
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(salvarPreferenciaTabela).mockClear();
  vi.mocked(limparPreferenciaTabela).mockClear();
});

function cartoes() {
  return (
    <>
      <KPICard titulo="Total" valor="1" />
      <KPICard titulo="Em aberto" valor="2" />
      <KPICard titulo="Vencido" valor="3" />
    </>
  );
}

describe("itensDaGrade", () => {
  it("lê o título dos KPICards através de fragmento e lista", () => {
    const itens = itensDaGrade(
      <>
        <KPICard titulo="Caixa real" valor="1" />
        {["A", "B"].map((x) => (
          <KPICard key={x} titulo={`Saldo ${x}`} valor="1" />
        ))}
        {null}
        {false}
        <ItemGrade titulo="Gráfico" idCard="grafico" larguraPadrao={6}>
          <div>grafico</div>
        </ItemGrade>
      </>,
    );
    expect(itens.map((i) => i.id)).toEqual(["caixa-real", "saldo-a", "saldo-b", "grafico"]);
    expect(itens[3]).toMatchObject({ titulo: "Gráfico", larguraPadrao: 6 });
  });

  it("título repetido ganha sufixo em vez de colidir", () => {
    const itens = itensDaGrade(
      <>
        <KPICard titulo="Pago" valor="1" />
        <KPICard titulo="Pago" valor="2" />
      </>,
    );
    expect(itens.map((i) => i.id)).toEqual(["pago", "pago-2"]);
  });
});

describe("GradeKpis com id", () => {
  it("fora do provedor é fixa: mostra tudo e nenhum controle", () => {
    render(<GradeKpis id="teste.grade">{cartoes()}</GradeKpis>);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("nasce com o layout salvo: ordem e card fora da tela", () => {
    render(
      <ProvedorGrades
        inicial={{
          "painel.teste.grade": { versao: 1, ordem: ["vencido", "total"], ocultos: ["em-aberto"], tamanhos: {} },
        }}
      >
        <GradeKpis id="teste.grade">{cartoes()}</GradeKpis>
      </ProvedorGrades>,
    );
    const titulos = [...document.querySelectorAll("[data-item-grade]")].map((n) => n.getAttribute("data-item-grade"));
    expect(titulos).toEqual(["vencido", "total"]);
    expect(screen.queryByText("Em aberto")).toBeNull();
  });

  it("tira card da tela, coloca de volta e grava", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ProvedorGrades inicial={{}}>
          <GradeKpis id="teste.grade">{cartoes()}</GradeKpis>
        </ProvedorGrades>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Personalizar tela/ }));
      fireEvent.click(screen.getByRole("button", { name: "Tirar Vencido da tela" }));
      expect(screen.queryByText("Vencido")).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
      const [chave, json] = vi.mocked(salvarPreferenciaTabela).mock.calls[0];
      expect(chave).toBe("painel.teste.grade");
      expect(JSON.parse(json)).toMatchObject({ ocultos: ["vencido"] });

      // Restaurar padrão volta tudo e apaga a linha em vez de gravar um layout vazio.
      fireEvent.click(screen.getByRole("button", { name: /Restaurar padrão/ }));
      expect(screen.getByText("Vencido")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(limparPreferenciaTabela).toHaveBeenCalledWith("painel.teste.grade");
    } finally {
      vi.useRealTimers();
    }
  });

  it("no modo de edição o conteúdo do card fica inerte (link não navega)", () => {
    render(
      <ProvedorGrades inicial={{}}>
        <GradeKpis id="teste.grade">
          <KPICard titulo="Pago" valor="1" href="/financeiro/pagamentos" />
        </GradeKpis>
      </ProvedorGrades>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Personalizar tela/ }));
    const link = document.querySelector('a[href="/financeiro/pagamentos"]');
    expect(link?.closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    expect(link?.closest("[inert]")).toBeNull();
  });

  it("grade dentro do card de outra grade não entra em edição (o card de fora é inerte)", () => {
    render(
      <ProvedorGrades inicial={{}}>
        <GradeKpis id="teste.fora">
          <ItemGrade titulo="Bloco">
            <GradeKpis id="teste.dentro">
              <KPICard titulo="Interno" valor="1" />
            </GradeKpis>
          </ItemGrade>
        </GradeKpis>
      </ProvedorGrades>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Personalizar tela/ }));
    expect(screen.getByRole("button", { name: "Tirar Bloco da tela" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tirar Interno da tela" })).toBeNull();
  });
});
