import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { StatusOs } from "@/modules/manutencao/_shared/rotulos";
import { OsDetalheView } from "@/modules/manutencao/servicos/components/os-detalhe";
import type { LinhasOs, OsDetalhe } from "@/modules/manutencao/servicos/queries";

/**
 * Quais botões o detalhe da OS mostra em cada status. A regra pura está em
 * regras.test.ts; aqui é a prova de que a TELA obedece a ela, e de que o total
 * do bloco é o número do banco (não uma soma feita no navegador).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/manutencao/servicos/x",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/manutencao/servicos/actions", () => ({
  adicionarOleo: vi.fn(),
  adicionarPeca: vi.fn(),
  adicionarTerceiro: vi.fn(),
  cancelarOs: vi.fn(),
  concluirOs: vi.fn(),
  excluirOs: vi.fn(),
  iniciarOs: vi.fn(),
  reabrirOs: vi.fn(),
  removerLinha: vi.fn(),
  salvarOs: vi.fn(),
}));

afterEach(cleanup);

function os(status: StatusOs, troca: Partial<OsDetalhe> = {}): OsDetalhe {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    numero: "OS-2026-0001",
    numeroLegado: null,
    status,
    tipo: "corretiva",
    prioridade: "media",
    equipamentoId: "22222222-2222-4222-8222-222222222222",
    equipamentoNome: "EQ-01 Escavadeira 320",
    equipamentoPropriedade: "propria",
    equipamentoControlePor: "horimetro",
    equipamentoTemEtapa: true,
    centroCustoId: "33333333-3333-4333-8333-333333333333",
    centroCustoNome: "009 Manutenção / Escavadeira 320",
    descricao: "Troca da bomba",
    defeitoReportado: null,
    causaRaiz: null,
    observacoes: null,
    dataAbertura: "2026-09-20",
    dataInicio: null,
    dataConclusao: null,
    medicaoAbertura: 1200,
    medicaoConclusao: null,
    custoPecas: 0,
    custoOleos: 0,
    custoTerceiros: 0,
    custoTotal: 0,
    motivoCancelamento: null,
    origem: "manual",
    ...troca,
  };
}

const SEM_LINHAS: LinhasOs = { pecas: [], oleos: [], terceiros: [] };

function renderizar(status: StatusOs, permissoes = { podeEditar: true, podeExcluir: true }, linhas = SEM_LINHAS, troca: Partial<OsDetalhe> = {}) {
  render(
    <OsDetalheView
      os={os(status, troca)}
      linhas={linhas}
      trilha={[]}
      {...permissoes}
      equipamentos={[]}
      centros={[]}
      fornecedores={[]}
      saldos={{ pecas: [], oleos: [] }}
    />,
  );
}

function botoes(): string[] {
  return screen
    .queryAllByRole("button")
    .map((botao) => botao.textContent?.trim() ?? "")
    .filter((texto) =>
      [
        "Editar",
        "Iniciar OS",
        "Concluir OS",
        "Reabrir OS",
        "Cancelar OS",
        "Excluir OS",
        "Adicionar peça",
        "Adicionar óleo",
        "Adicionar terceiro",
      ].includes(texto),
    );
}

describe("OsDetalheView: ações por status", () => {
  it("aberta", () => {
    renderizar("aberta");
    expect(botoes()).toEqual([
      "Editar",
      "Iniciar OS",
      "Concluir OS",
      "Cancelar OS",
      "Excluir OS",
      "Adicionar peça",
      "Adicionar óleo",
      "Adicionar terceiro",
    ]);
  });

  it("em execução", () => {
    renderizar("em_execucao");
    expect(botoes()).toEqual([
      "Editar",
      "Concluir OS",
      "Cancelar OS",
      "Adicionar peça",
      "Adicionar óleo",
      "Adicionar terceiro",
    ]);
  });

  it("concluída: só reabrir", () => {
    renderizar("concluida", undefined, SEM_LINHAS, { dataConclusao: "2026-09-22" });
    expect(botoes()).toEqual(["Reabrir OS"]);
  });

  it("cancelada: só excluir, e o motivo aparece", () => {
    renderizar("cancelada", undefined, SEM_LINHAS, { motivoCancelamento: "Aberta em duplicidade" });
    expect(botoes()).toEqual(["Excluir OS"]);
    expect(screen.getByText("Aberta em duplicidade")).toBeTruthy();
  });

  it("sem permissão de editar nem excluir: nenhum botão de ação", () => {
    renderizar("aberta", { podeEditar: false, podeExcluir: false });
    expect(botoes()).toEqual([]);
  });
});

describe("OsDetalheView: custo vem do banco", () => {
  it("o total do bloco de peças é o custo_pecas da OS, não a soma das linhas", () => {
    // Linha e cabeçalho discordam de propósito: se a tela somasse, mostraria 10,00.
    renderizar(
      "aberta",
      undefined,
      {
        ...SEM_LINHAS,
        pecas: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            insumoNome: "Filtro de ar",
            unidade: "un",
            depositoNome: "Almoxarifado Central",
            quantidade: 2,
            custoUnitario: 5,
            custoTotal: 10,
            observacoes: null,
          },
        ],
      },
      { custoPecas: 12.3456 },
    );
    expect(screen.getByText((texto) => texto.replace(/\s/g, " ") === "R$ 12,3456")).toBeTruthy();
  });
});
