import type { FreteLinha } from "@/modules/frete/fretes/tipos";

/** Frete de exemplo para os testes da aba (só teste importa). */
export function frete(parcial: Partial<FreteLinha> = {}): FreteLinha {
  return {
    id: "f1",
    tipo: "material",
    data: "2026-09-10",
    dataChegada: null,
    centroCustoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    obraNome: "BR-364",
    origemId: "o1",
    origemNome: "Pedreira X",
    destinoId: "d1",
    destinoNome: "Canteiro",
    transportadoraId: "t1",
    transportadoraNome: "Transp 1",
    motorista: "João Silva",
    placaCarreta: null,
    insumoId: "i1",
    insumoNome: "Brita 1",
    pesoToneladas: 10,
    kmRodados: 100,
    valorTkm: 0.37,
    valorTotal: 370,
    valorMaterial: 800,
    precoUnitario: 80,
    notaFiscal: "123",
    notaFiscal2: null,
    observacoes: null,
    createdAt: "2026-09-10T12:00:00Z",
    createdBy: null,
    updatedAt: "2026-09-10T12:00:00Z",
    updatedBy: null,
    excluidoEm: null,
    motivoExclusao: null,
    ...parcial,
  };
}
