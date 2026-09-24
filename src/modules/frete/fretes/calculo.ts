import { somarValoresOperacionais } from "@/modules/manutencao/servicos/formato";

/**
 * Rodapé "Totais" da lista de fretes, igual a utils/freteTotais.ts da origem, sobre
 * TODAS as linhas do filtro (não só a página):
 *
 *   peso += p; valor += valorTotal; valorMaterial += vm; se vm > 0, pesoComMaterial += p
 *   precoMedioMaterial = pesoComMaterial > 0 ? valorMaterial / pesoComMaterial : 0
 *
 * O denominador do preço médio exclui os fretes sem valor de material (inclusive as
 * transferências). O peso (4 casas) soma em inteiros de décimo de milésimo, sem erro
 * de ponto flutuante; os valores somam cru, como a origem (o banco guarda o produto
 * exato, com mais de 4 casas).
 *
 * Módulo puro.
 */

export interface TotaisFrete {
  quantidade: number;
  peso: number;
  valor: number;
  valorMaterial: number;
  pesoComMaterial: number;
  precoMedioMaterial: number;
}

export function totaisDosFretes(
  fretes: readonly { pesoToneladas: number; valorTotal: number; valorMaterial: number }[],
): TotaisFrete {
  let valor = 0;
  let valorMaterial = 0;
  const pesos: number[] = [];
  const pesosComMaterial: number[] = [];
  for (const f of fretes) {
    const p = f.pesoToneladas ?? 0;
    const vm = f.valorMaterial ?? 0;
    pesos.push(p);
    valor += f.valorTotal ?? 0;
    valorMaterial += vm;
    if (vm > 0) pesosComMaterial.push(p);
  }
  const peso = somarValoresOperacionais(pesos);
  const pesoComMaterial = somarValoresOperacionais(pesosComMaterial);
  return {
    quantidade: fretes.length,
    peso,
    valor,
    valorMaterial,
    pesoComMaterial,
    precoMedioMaterial: pesoComMaterial > 0 ? valorMaterial / pesoComMaterial : 0,
  };
}
