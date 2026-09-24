import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AbastecimentoDetalheView } from "@/modules/combustivel/abastecimentos/components/abastecimento-detalhe";
import { AbastecimentoFormDrawer } from "@/modules/combustivel/abastecimentos/components/abastecimento-form-drawer";
import type { AbastecimentoCompleto, SaidaDetalhe } from "@/modules/combustivel/abastecimentos/queries";

/**
 * O detalhe mostra as 4 casas do banco (camadas, conta corrente) e esconde o que
 * a permissão não deixa; o formulário muda com o consumidor e o tanque.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/combustivel/abastecimentos/x",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/combustivel/abastecimentos/actions", () => ({
  consultarEstoqueNaData: vi.fn(async () => ({ ok: true, litros: 500 })),
  calcularPrecoFifo: vi.fn(async () => ({ ok: true, precoMedio: 6.5, detalhamento: [], litrosSemSuprimento: 0 })),
  consultarInicioCiclo: vi.fn(async () => ({ ok: true, inicio: null })),
  consultarUltimaLeitura: vi.fn(async () => ({ ok: true, valor: null })),
  excluirAbastecimento: vi.fn(),
  restaurarAbastecimento: vi.fn(),
  salvarAbastecimento: vi.fn(),
}));

afterEach(cleanup);

const TANQUE = "11111111-1111-4111-8111-111111111111";
const EXTERNO = "12121212-1212-4212-8212-121212121212";

function saida(troca: Partial<SaidaDetalhe> = {}): SaidaDetalhe {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    data: "2026-09-20T19:30:00Z",
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    consumidor: "EQ-01 Escavadeira 320",
    tanqueId: TANQUE,
    tanqueNome: "Tanque 1",
    tanqueExterno: false,
    equipamentoId: "22222222-2222-4222-8222-222222222222",
    equipamentoNome: "EQ-01 Escavadeira 320",
    equipamentoControlePor: "horimetro",
    transportadoraId: null,
    transportadoraNome: null,
    placa: null,
    motorista: null,
    insumoId: "44444444-4444-4444-8444-444444444444",
    insumoNome: "Diesel S10",
    litros: 150,
    precoCombustivel: null,
    precoProprietario: null,
    taxaLitro: 0,
    precoUnitario: 6.3947,
    precoMedioTanque: 6.3947,
    valorTotal: 959.205,
    pago: false,
    pagoEm: null,
    medicao: 1200,
    tipoMedicao: "horimetro",
    centroCustoNome: "100 Manutenção",
    canal: "computador",
    observacoes: null,
    ...troca,
  };
}

function completo(troca: Partial<AbastecimentoCompleto> = {}, trocaSaida: Partial<SaidaDetalhe> = {}): AbastecimentoCompleto {
  return {
    saida: saida(trocaSaida),
    camadas: [
      { id: "c1", fonteTipo: "entrada", fonteData: "2026-09-01T13:00:00Z", fonteNotaFiscal: "4455", litros: 150, preco: 6.3947 },
    ],
    movimentos: [],
    alocacoes: [],
    semSuprimento: null,
    ...troca,
  };
}

const SEM_OPCOES = { tanques: [], equipamentos: [], transportadoras: [], insumos: [], obras: [] };

describe("AbastecimentoDetalheView", () => {
  it("sem permissão, sem botão de editar nem de excluir", () => {
    render(<AbastecimentoDetalheView anexos={[]} abastecimento={completo()} podeEditar={false} podeExcluir={false} opcoes={SEM_OPCOES} />);
    expect(screen.queryByRole("button", { name: /Editar abastecimento/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir abastecimento/ })).toBeNull();
  });

  it("com permissão, os dois botões", () => {
    render(<AbastecimentoDetalheView anexos={[]} abastecimento={completo()} podeEditar podeExcluir opcoes={SEM_OPCOES} />);
    expect(screen.getByRole("button", { name: /Editar abastecimento/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Excluir abastecimento/ })).toBeTruthy();
  });

  it("camadas do PEPS com o preço em 4 casas, e o aviso de sem suprimento", () => {
    render(
      <AbastecimentoDetalheView
        anexos={[]}
        abastecimento={completo({
          semSuprimento: { litrosSolicitados: 150, litrosSupridos: 100, litrosSemSuprimento: 50 },
        })}
        podeEditar={false}
        podeExcluir={false}
        opcoes={SEM_OPCOES}
      />,
    );
    expect(screen.getByText("Camadas do PEPS")).toBeTruthy();
    expect(screen.getAllByText(/6,3947/).length).toBeGreaterThan(0);
    expect(screen.getByText("4455")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Sem suprimento/);
    // Equipamento próprio não tem conta corrente.
    expect(screen.queryByText("Conta corrente da transportadora")).toBeNull();
  });

  it("carreta mostra a conta corrente com os movimentos do banco", () => {
    render(
      <AbastecimentoDetalheView
        anexos={[]}
        abastecimento={completo(
          {
            camadas: [],
            movimentos: [
              { id: "m1", data: "2026-09-20T19:30:00Z", tipo: "credito_abastecimento_transterra", transportadoraNome: "Transterra", valor: 1010.5, descricao: null },
              { id: "m2", data: "2026-09-20T19:30:00Z", tipo: "debito_abastecimento_transterra", transportadoraNome: "Rápido Acre", valor: 1045.975, descricao: null },
            ],
          },
          {
            tipoConsumidor: "carreta_transportadora",
            tanqueExterno: true,
            transportadoraNome: "Rápido Acre",
            precoCombustivel: 6.8,
            precoProprietario: 6.6,
            taxaLitro: 0.15,
          },
        )}
        podeEditar={false}
        podeExcluir={false}
        opcoes={SEM_OPCOES}
      />,
    );
    expect(screen.getByText("Conta corrente da transportadora")).toBeTruthy();
    expect(screen.getByText("Crédito do dono do tanque")).toBeTruthy();
    expect(screen.getByText(/1\.045,975/)).toBeTruthy();
    expect(screen.getByText("Preço que o dono cobra")).toBeTruthy();
    // Tanque externo não tem PEPS.
    expect(screen.queryByText("Camadas do PEPS")).toBeNull();
  });
});

describe("AbastecimentoFormDrawer", () => {
  const tanques = [
    { id: TANQUE, rotulo: "Tanque 1", ehExterno: false, ativo: true, capacidadeLitros: 15000, nivelAtualLitros: 800, combustivelAtualId: null, proprietarioId: null, proprietarioNome: null, proprietarioTaxaLitro: null },
    { id: EXTERNO, rotulo: "Transterra", ehExterno: true, ativo: true, capacidadeLitros: 0, nivelAtualLitros: 0, combustivelAtualId: null, proprietarioId: "x", proprietarioNome: "Transterra", proprietarioTaxaLitro: 0.15 },
  ];

  it("equipamento no tanque: o preço é o do tanque (snapshot salvo na edição) e o formulário não pede preço", () => {
    render(
      <AbastecimentoFormDrawer aberto onAbertoChange={() => {}} abastecimento={completo()} opcoes={{ ...SEM_OPCOES, tanques }} />,
    );
    expect(screen.getByText(/preço salvo \(snapshot\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/Preço cobrado da transportadora/)).toBeNull();
    expect(screen.queryByLabelText(/Preço unitário/)).toBeNull();
    // Tanque da EMT sem entrada no mapa: o estado "tanque sem entradas" da origem.
    expect(screen.getByText(/Tanque sem entradas/)).toBeTruthy();
  });

  it("carreta em tanque externo: os dois preços e a taxa", () => {
    render(
      <AbastecimentoFormDrawer
        aberto
        onAbertoChange={() => {}}
        abastecimento={completo(
          {},
          { tipoConsumidor: "carreta_transportadora", tanqueId: EXTERNO, tanqueExterno: true, precoCombustivel: 6.8, taxaLitro: 0.15 },
        )}
        opcoes={{ ...SEM_OPCOES, tanques }}
      />,
    );
    expect(screen.getByLabelText(/Preço cobrado da transportadora/)).toBeTruthy();
    expect(screen.getByLabelText(/Preço que Transterra cobra/)).toBeTruthy();
    expect(screen.getByLabelText(/Taxa Transterra/)).toBeTruthy();
    // Tanque externo: o combustível pode trocar (campo editável, não o texto do tanque).
    expect(screen.queryByText(/Tanque sem entradas/)).toBeNull();
  });

  it("requisição: preço por litro e o pago", () => {
    render(
      <AbastecimentoFormDrawer
        aberto
        onAbertoChange={() => {}}
        abastecimento={completo({}, { origem: "requisicao", tanqueId: null, tanqueNome: null, precoUnitario: 6.5 })}
        opcoes={{ ...SEM_OPCOES, tanques }}
      />,
    );
    expect(screen.getByLabelText(/Preço unitário/)).toBeTruthy();
    expect(screen.getByText("Pago")).toBeTruthy();
    expect(screen.getByLabelText(/Pago em/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Tanque/)).toBeNull();
  });
});
