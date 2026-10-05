import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { aceitarSugestoes } from "@/modules/financeiro/conciliacao/actions";
import type { SugestaoSegura } from "@/modules/financeiro/conciliacao/casamento";
import type { CandidatoDoPainel, ParcelaLivre } from "@/modules/financeiro/conciliacao/painel";
import { RevisarSegurasDialog, efeitoDaSugestao } from "./revisar-seguras-dialog";

vi.mock("@/modules/financeiro/conciliacao/actions", () => ({
  aceitarSugestoes: vi.fn(async () => ({ ok: true, feitos: 1, falhas: [] })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/canonicos/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function segura(n: number, grupo: "paga_outra_conta" | "aberta"): SugestaoSegura<CandidatoDoPainel> {
  const registro: ParcelaLivre = {
    id: `38673fc5-c55a-c7be-8687-e9b1d3589e0${n}`,
    lancamentoId: "l",
    lancamentoNumero: `LAN-2026-000${n}`,
    descricao: "x",
    nome: `FORNECEDOR ${n}`,
    razaoSocial: null,
    tipo: "a_pagar",
    origem: "manual",
    numeroParcela: 1,
    qtdParcelas: 1,
    valor: 100 * n,
    valorLiquido: 100 * n,
    dataPagamento: "2026-09-10",
    numeroDocumento: null,
    status: grupo === "aberta" ? "aprovado" : "pago",
    contaNome: "CAIXA ECONOMICA",
    contaId: "caixa",
    apelidos: [],
  };
  return {
    movimento: { id: `38673fc5-c55a-c7be-8687-e9b1d3589f0${n}`, dataMovimento: "2026-09-10", valor: -100 * n, memo: `PIX FORNECEDOR ${n}` },
    candidato: { especie: "parcela", grupo, id: registro.id, data: "2026-09-10", valor: 100 * n, sentido: "debito", nomes: [registro.nome], registro },
  };
}

describe("RevisarSegurasDialog", () => {
  it("vem tudo marcado; desmarcar uma linha envia só as outras", async () => {
    const lista = [segura(1, "paga_outra_conta"), segura(2, "aberta"), segura(3, "paga_outra_conta")];
    render(<RevisarSegurasDialog aberto onAbertoChange={() => {}} seguras={lista} contaNome="BANCO DO BRASIL 102.124-9" />);

    expect(screen.getByRole("button", { name: /Aceitar 3/ })).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Aceitar PIX FORNECEDOR 2"));
    fireEvent.click(screen.getByRole("button", { name: /Aceitar 2/ }));

    await waitFor(() =>
      expect(aceitarSugestoes).toHaveBeenCalledWith([
        { transacaoId: lista[0].movimento.id, especie: "parcela", alvoId: lista[0].candidato.id },
        { transacaoId: lista[2].movimento.id, especie: "parcela", alvoId: lista[2].candidato.id },
      ]),
    );
  });

  it("diz o que muda no app em cada linha", () => {
    expect(efeitoDaSugestao(segura(1, "paga_outra_conta"), "BANCO DO BRASIL 102.124-9")).toBe(
      "LAN-2026-0001: muda de CAIXA ECONOMICA para BANCO DO BRASIL 102.124-9",
    );
    expect(efeitoDaSugestao(segura(2, "aberta"), "BB")).toBe("Dá baixa em LAN-2026-0002 em 10/09/2026 (data do extrato)");
  });
});
