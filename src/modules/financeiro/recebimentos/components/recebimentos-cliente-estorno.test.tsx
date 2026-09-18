import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { RecebimentosCliente } from "@/modules/financeiro/recebimentos/components/recebimentos-cliente";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { formatarBRL } from "@/lib/formatadores";
import { estornarRecebimento } from "@/modules/financeiro/recebimentos/actions";
import type { ParcelaRecebida } from "@/modules/financeiro/recebimentos/queries";

/**
 * O estorno de recebimento é dinheiro saindo do saldo, e o aviso antes do
 * clique é a única coisa entre o usuário e um desconto apagado sem ele saber.
 * Os testes aqui cobrem as três coisas que a tela precisa acertar: quem vê o
 * botão, o que a confirmação promete, e que ela promete o CONTRÁRIO do estorno
 * de pagamento (lá o líquido volta para o saldo, aqui ele sai).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/financeiro/recebimentos",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/modules/financeiro/recebimentos/actions", () => ({
  buscarParcelasRecebidas: vi.fn(async () => ({ itens: [], total: 0 })),
  estornarRecebimento: vi.fn(async () => ({ ok: true })),
}));

const ID = "11111111-1111-4111-8111-111111111111";

function parcelaRecebida(troca: Partial<ParcelaRecebida> = {}): ParcelaRecebida {
  return {
    id: ID,
    lancamentoId: "99999999-9999-4999-8999-999999999999",
    lancamentoNumero: "LAN-2026-0042",
    numeroParcela: 1,
    descricao: "Medição 12 BR-364",
    categoriaNome: "Medição de obra",
    numeroDocumento: "NFS-e 1234",
    clienteNome: "DNIT",
    contaBancariaNome: "Caixa 578367973-5",
    dataVencimento: "2026-08-01",
    dataRecebimento: "2026-08-10",
    valor: 1000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1000,
    centroCustoRotulo: "BR-364 Lote 9",
    ...troca,
  };
}

const FILTROS_VAZIOS = {
  busca: "",
  cliente: "",
  conta: "",
  valorDe: "",
  valorAte: "",
  vencDe: "",
  vencAte: "",
};

function renderizar(
  podeEstornar: boolean,
  parcela: ParcelaRecebida = parcelaRecebida(),
) {
  return render(
    <RecebimentosCliente
      aReceber={[]}
      recebidas={[parcela]}
      totalRecebidas={1}
      recebidoNoMes={1000}
      rotuloMes="agosto de 2026"
      contas={[]}
      clientes={[]}
      categoriasReceita={[]}
      hoje="2026-08-20"
      podeCriar={false}
      podeReceber={false}
      podeEstornar={podeEstornar}
      valoresAReceber={FILTROS_VAZIOS}
      valoresRecebidos={{
        ...FILTROS_VAZIOS,
        categoria: "",
        recDe: "",
        recAte: "",
      }}
      filtrosRecebidas={{}}
      categorias={[]}
      fornecedores={[]}
      centrosCusto={[]}
      formasPagamento={[]}
      condicoesPagamento={[]}
    />,
  );
}

/**
 * Leva a tela para a aba "Recebidos", onde o botão mora.
 *
 * `mouseDown`, não `click`: o TabsTrigger do Radix reage ao primeiro, e um
 * `click` sozinho deixa a aba onde estava. Mesmo motivo do helper gêmeo em
 * pagamentos-cliente-barra-selecao.test.tsx.
 */
async function irParaRecebidos() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Recebidos" }));
  await waitFor(() => {
    expect(screen.getByText("NFS-e 1234")).toBeInTheDocument();
  });
}

describe("estorno na aba Recebidos", () => {
  beforeEach(() => {
    limparEstadosTabelaParaTeste();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("não mostra o botão sem a permissão de estornar", async () => {
    renderizar(false);
    await irParaRecebidos();

    expect(
      screen.queryByRole("button", { name: "Estornar" }),
    ).not.toBeInTheDocument();
  });

  it("mostra o botão com a permissão", async () => {
    renderizar(true);
    await irParaRecebidos();

    expect(
      screen.getByRole("button", { name: "Estornar" }),
    ).toBeInTheDocument();
  });

  it("avisa que o líquido SAI do saldo, não que volta", async () => {
    renderizar(true);
    await irParaRecebidos();

    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));

    const aviso = await screen.findByText(/saldo da conta bancária/i);
    expect(aviso.textContent).toMatch(/sai do saldo/i);
    // O texto de Pagamentos, copiado sem inverter, passaria em tudo menos aqui.
    expect(aviso.textContent).not.toMatch(/volta para o saldo/i);
  });

  it("cita o desconto que o estorno vai apagar", async () => {
    renderizar(
      true,
      parcelaRecebida({ desconto: 150, valor: 1000, valorLiquido: 850 }),
    );
    await irParaRecebidos();

    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));

    // Comparado pelo formatador, nunca por string literal: o BRL do Intl usa
    // espaço NÃO separável depois do "R$", e "R$ 150,00" digitado à mão no teste
    // é outro texto. Ver [[feedback_teste_asserir_pelo_formatador]].
    const aviso = await screen.findByText(/saldo da conta bancária/i);
    expect(aviso.textContent).toContain(`o desconto de ${formatarBRL(150)}`);
    expect(aviso.textContent).toContain(`${formatarBRL(850)} sai do saldo`);
    expect(aviso.textContent).toContain(
      `volta a valer ${formatarBRL(1000)} a receber`,
    );
  });

  it("chama a action com o id da parcela ao confirmar", async () => {
    renderizar(true);
    await irParaRecebidos();

    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));

    // A confirmação tem um segundo botão "Estornar": procurar pelo nome na tela
    // inteira pegaria o da linha de novo e o teste passaria sem nunca confirmar.
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Estornar" }));

    await waitFor(() => {
      expect(estornarRecebimento).toHaveBeenCalledWith(ID);
    });
  });
});
