// @vitest-environment node
import { describe, expect, it } from "vitest";

import { facetarTransferencias, type TransferenciaFiltravel } from "@/modules/combustivel/transferencias/filtros";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const DIESEL = "44444444-4444-4444-8444-444444444444";
const GASOLINA = "55555555-5555-4555-8555-555555555555";

function transferencia(troca: Partial<TransferenciaFiltravel> = {}): TransferenciaFiltravel {
  return {
    dataHora: "2026-09-20T12:00:00Z",
    origemId: A,
    origemNome: "Tanque A",
    destinoId: B,
    destinoNome: "Tanque B",
    insumoId: DIESEL,
    observacoes: null,
    excluidoEm: null,
    ...troca,
  };
}

const vazio = { busca: "", de: "", ate: "", tanqueIds: [], insumoIds: [], mostrarExcluidos: false };
const base = (...ids: string[]) => ids.map((valor) => ({ valor, rotulo: valor }));

describe("facetarTransferencias", () => {
  it("o combustível escolhido restringe os tanques (origem ou destino)", () => {
    const lista = [transferencia(), transferencia({ origemId: C, destinoId: B, insumoId: GASOLINA })];
    const { linhas, opcoes } = facetarTransferencias(lista, { ...vazio, insumoIds: [GASOLINA] });
    expect(linhas).toHaveLength(1);
    expect(opcoes("tanque", base(A, B, C)).map((o) => o.valor)).toEqual([B, C]);
    // O próprio filtro não se corta.
    expect(opcoes("combustivel", base(DIESEL, GASOLINA)).map((o) => o.valor)).toEqual([DIESEL, GASOLINA]);
  });

  it("excluída escondida não oferece opção", () => {
    const lista = [transferencia(), transferencia({ insumoId: GASOLINA, excluidoEm: "2026-09-21T00:00:00Z" })];
    expect(facetarTransferencias(lista, vazio).opcoes("combustivel", base(DIESEL, GASOLINA)).map((o) => o.valor)).toEqual([
      DIESEL,
    ]);
  });
});
