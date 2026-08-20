import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { dataHojeISO } from "@/lib/formatadores";
import { pagarParcela } from "@/modules/financeiro/pagamentos/actions";
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

vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

/** Mesma parcela, com outra data autorizada. */
function comProgramada(dataProgramada: string | null): ParcelaAprovada {
  return { ...parcela("conta-1"), dataProgramada };
}

/**
 * Um dia depois de uma data ISO, por UTC. O teste não pode fixar "2026-08-20"
 * porque o drawer usa a data de HOJE como default do pagamento: a diferença
 * tem que ser construída a partir de hoje para o caso valer em qualquer dia.
 */
function umDiaDepois(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
}

afterEach(() => {
  cleanup();
  vi.mocked(pagarParcela).mockClear();
});

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

describe("PagarParcelaDrawer, motivo fora da data autorizada", () => {
  it("na data autorizada não pede motivo nenhum", () => {
    render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).not.toContain("Motivo do pagamento");
    expect(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    ).toBeEnabled();
  });

  it("fora da data pede o motivo e diz o tamanho da diferença", () => {
    // Autorizada amanhã, pagamento hoje (o default do drawer): adiantado 1 dia.
    render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(umDiaDepois(dataHojeISO()))}
        contas={CONTAS}
      />,
    );
    expect(contaNaTela()).toContain("Motivo do pagamento adiantado em 1 dia");
  });

  it("bloqueia o botão sem motivo e libera quando ele é escrito", () => {
    render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(umDiaDepois(dataHojeISO()))}
        contas={CONTAS}
      />,
    );
    const botao = screen.getByRole("button", { name: "Confirmar pagamento" });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motivo do pagamento/), {
      target: { value: "  Fornecedor deu desconto para antecipar  " },
    });
    expect(botao).toBeEnabled();
  });

  it("zera o motivo ao reabrir, para não justificar o pagamento seguinte", () => {
    // O caso que o reset existe para impedir: o motivo escrito num pagamento
    // sobreviver e virar a justificativa de outro, que ninguém escreveu.
    const fora = umDiaDepois(dataHojeISO());
    const tela = render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(fora)}
        contas={CONTAS}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Motivo do pagamento/), {
      target: { value: "Motivo do pagamento anterior" },
    });
    expect(screen.getByLabelText(/Motivo do pagamento/)).toHaveValue(
      "Motivo do pagamento anterior",
    );

    tela.rerender(
      <PagarParcelaDrawer
        aberto={false}
        onAbertoChange={() => {}}
        parcela={comProgramada(fora)}
        contas={CONTAS}
      />,
    );
    tela.rerender(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(fora)}
        contas={CONTAS}
      />,
    );

    expect(screen.getByLabelText(/Motivo do pagamento/)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    ).toBeDisabled();
  });

  it("manda o motivo trimado para a action, e nada quando está na data", async () => {
    const tela = render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(umDiaDepois(dataHojeISO()))}
        contas={CONTAS}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Motivo do pagamento/), {
      target: { value: "  Fornecedor deu desconto para antecipar  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pagamento" }));
    await vi.waitFor(() =>
      expect(vi.mocked(pagarParcela)).toHaveBeenCalledWith(
        "parcela-1",
        "conta-1",
        dataHojeISO(),
        {
          desconto: 0,
          juros: 0,
          outrasDespesas: 0,
          motivo: "Fornecedor deu desconto para antecipar",
        },
      ),
    );

    // Na data autorizada o motivo vai `undefined`: pagamento na data nunca teve
    // motivo, e mandar string vazia faria a action recusar por Zod.
    tela.rerender(
      <PagarParcelaDrawer
        aberto={false}
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );
    tela.rerender(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pagamento" }));
    await vi.waitFor(() =>
      expect(vi.mocked(pagarParcela)).toHaveBeenLastCalledWith(
        "parcela-1",
        "conta-1",
        dataHojeISO(),
        {
          desconto: 0,
          juros: 0,
          outrasDespesas: 0,
          motivo: undefined,
        },
      ),
    );
  });
});

describe("PagarParcelaDrawer, os três ajustes do pagamento", () => {
  /** Abre o drawer com a parcela de R$ 6.757,73, na data autorizada. */
  function abrir() {
    return render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );
  }

  it("manda desconto, juros e outras despesas para a action", async () => {
    abrir();

    fireEvent.change(screen.getByLabelText("Desconto"), {
      target: { value: "100,00" },
    });
    fireEvent.change(screen.getByLabelText("Juros e multa"), {
      target: { value: "42,50" },
    });
    fireEvent.change(screen.getByLabelText("Outras despesas"), {
      target: { value: "3,90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pagamento" }));

    await vi.waitFor(() =>
      expect(vi.mocked(pagarParcela)).toHaveBeenCalledWith(
        "parcela-1",
        "conta-1",
        dataHojeISO(),
        {
          desconto: 100,
          juros: 42.5,
          outrasDespesas: 3.9,
          motivo: undefined,
        },
      ),
    );
  });

  it("o rodapé mostra o líquido composto antes de confirmar", () => {
    abrir();

    fireEvent.change(screen.getByLabelText("Juros e multa"), {
      target: { value: "42,27" },
    });
    fireEvent.change(screen.getByLabelText("Outras despesas"), {
      target: { value: "10,00" },
    });

    // 6.757,73 + 42,27 + 10,00 = 6.810,00. Escrito à mão: é o número que o
    // operador vai conferir no extrato, e calculá-lo aqui provaria só que duas
    // multiplicações iguais dão o mesmo resultado.
    // Pelo body, e não pelo container do render: o FormDrawer monta em portal,
    // e o container fica vazio (foi o que fez esta asserção falhar primeiro).
    const texto = contaNaTela().replace(/\u00a0/g, " ");
    expect(texto).toContain("mais juros");
    expect(texto).toContain("mais despesas");
    expect(texto).toContain("R$ 6.810,00");
  });

  it("juros e despesa PODEM passar do valor da parcela; o desconto não", () => {
    abrir();

    // Boleto de R$ 6.757,73 protestado: custas maiores que a própria parcela é
    // caso real, e recusar aqui obrigaria a mentir o número.
    fireEvent.change(screen.getByLabelText("Juros e multa"), {
      target: { value: "9.000,00" },
    });
    expect(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    ).not.toBeDisabled();

    // Desconto maior que a dívida é dinheiro que ninguém deve.
    fireEvent.change(screen.getByLabelText("Desconto"), {
      target: { value: "9.000,00" },
    });
    expect(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    ).toBeDisabled();
    expect(
      screen.getByText("O desconto não pode ser maior que o valor da parcela"),
    ).toBeInTheDocument();
  });

  it("os três zeram ao reabrir: ajuste não vaza para o próximo pagamento", () => {
    const tela = render(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );

    fireEvent.change(screen.getByLabelText("Juros e multa"), {
      target: { value: "500,00" },
    });
    fireEvent.change(screen.getByLabelText("Outras despesas"), {
      target: { value: "20,00" },
    });

    // Fecha e reabre: é a transição fechado -> aberto que dispara o reset.
    tela.rerender(
      <PagarParcelaDrawer
        aberto={false}
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );
    tela.rerender(
      <PagarParcelaDrawer
        aberto
        onAbertoChange={() => {}}
        parcela={comProgramada(dataHojeISO())}
        contas={CONTAS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar pagamento" }));

    return vi.waitFor(() =>
      expect(vi.mocked(pagarParcela)).toHaveBeenLastCalledWith(
        "parcela-1",
        "conta-1",
        dataHojeISO(),
        { desconto: 0, juros: 0, outrasDespesas: 0, motivo: undefined },
      ),
    );
  });
});
