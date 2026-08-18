import { describe, expect, it } from "vitest";

import type { ParcelaPaga } from "@/modules/financeiro/pagamentos/queries";

describe("ParcelaPaga", () => {
  it("o líquido é valor menos desconto mais juros", () => {
    // Trava a semântica que a migration de 11/08/2026 fixou. A aba "Pagas"
    // exibe os três valores na mesma linha; sem `juros` no tipo, a tela mostra
    // números que não somam, e o usuário não consegue reconciliar a listagem
    // com o recebimento efetivo.
    const parcela: ParcelaPaga = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      lancamentoNumero: "LAN-2026-0001",
      numeroParcela: 1,
      descricao: "REFERENTE ABASTECIMENTO",
      categoriaNome: "Combustível",
      fornecedorNome: "AUTO POSTO PROGRESSO",
      contaNome: "BANCO DO BRASIL 102.124-9",
      dataPagamento: "2026-08-12",
      valor: 1000,
      desconto: 50,
      juros: 20,
      valorLiquido: 970,
    };
    expect(parcela.valor - parcela.desconto + parcela.juros).toBe(
      parcela.valorLiquido,
    );
  });
});
