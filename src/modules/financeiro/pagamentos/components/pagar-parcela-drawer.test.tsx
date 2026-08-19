import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { PagarParcelaDrawer } from "@/modules/financeiro/pagamentos/components/pagar-parcela-drawer";
import type {
  ContaBancariaOpcao,
  ParcelaAprovada,
} from "@/modules/financeiro/pagamentos/queries";

vi.mock("@/modules/financeiro/pagamentos/actions", () => ({
  pagarParcela: vi.fn(async () => ({ ok: true as const })),
}));

// Anexos vai ao servidor por conta própria; o que se prova aqui é a conta
// inicial do formulário, não o upload.
vi.mock("@/components/canonicos/anexos", () => ({
  Anexos: () => null,
}));

const CONTAS: ContaBancariaOpcao[] = [
  { id: "conta-1", nome: "Bradesco Movimento", banco: "bradesco", ativo: true },
  { id: "conta-2", nome: "Caixa Obras", banco: "caixa", ativo: true },
] as unknown as ContaBancariaOpcao[];

function parcela(contaBancariaId: string | null): ParcelaAprovada {
  return {
    id: "parcela-1",
    lancamentoId: "lanc-1",
    lancamentoNumero: "LAN-2026-1604",
    numeroParcela: 5,
    descricao: "Consórcio de trator",
    categoriaNome: null,
    fornecedorNome: "Randon Consórcios",
    contaBancariaId,
    dataVencimento: "2026-08-18",
    dataProgramada: "2026-08-18",
    dataProgramadaOrigem: null,
    valor: 6757.73,
    aprovadoEm: "2026-08-10T12:00:00Z",
  };
}

/**
 * O botão do Combobox mostra o rótulo da opção escolhida, ou o placeholder
 * quando não há escolha. Asserir pelo texto visível é o que prova o que o
 * usuário vê, e não depende de o componente repassar `id` ou `aria-label`.
 */
function contaNaTela(): string {
  return document.body.textContent ?? "";
}

afterEach(cleanup);

describe("PagarParcelaDrawer, conta bancária inicial", () => {
  it("começa com a conta que a parcela já tem, montado já aberto", () => {
    render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={parcela("conta-1")}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).toContain("Bradesco Movimento");
  });

  it("fica vazia quando a parcela não tem conta, e pede escolha", () => {
    render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={parcela(null)}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).toContain("Selecione a conta");
  });

  it("pega a conta na transição de fechado para aberto, que é o caminho real", () => {
    // Em produção o drawer é montado fechado e só depois abre. Este caso e o
    // anterior cobrem os dois caminhos: o valor inicial do estado e o reset.
    const tela = render(
      <PagarParcelaDrawer
        aberto={false}
        onAbertoChange={() => {}}
        parcela={null}
        contas={CONTAS}
      />,
    );
    tela.rerender(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={parcela("conta-2")}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).toContain("Caixa Obras");
  });

  it("troca a conta ao reabrir com outra parcela", () => {
    // O reset na transição de fechado para aberto existe para isto: sem ele, o
    // estado da parcela anterior sobreviveria e o pagamento sairia da conta
    // errada.
    const tela = render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={parcela("conta-1")}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).toContain("Bradesco Movimento");

    tela.rerender(
      <PagarParcelaDrawer
        aberto={false}
        onAbertoChange={() => {}}
        parcela={parcela("conta-1")}
        contas={CONTAS}
      />,
    );
    tela.rerender(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={parcela("conta-2")}
        contas={CONTAS}
      />,
    );

    expect(contaNaTela()).toContain("Caixa Obras");
    expect(contaNaTela()).not.toContain("Bradesco");
  });
});
