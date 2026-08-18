import {
  type AjustesDaOrdem,
  subtotalItem,
  totalComAjustes,
  totalOrdemCompra,
} from "@/modules/compras/ordens/calculo";

/** Item da OC do ponto de vista do rateio: onde o custo cai e em que categoria. */
export interface ItemParaRateio {
  centroCustoId: string;
  categoriaId: string;
  quantidade: number;
  precoUnitario: number;
}

/** Uma fatia do custo: um par (centro de custo, categoria) e o valor dele. */
export interface FatiaDoRateio {
  centroCustoId: string;
  categoriaId: string;
  valor: number;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Rateia a Ordem de Compra por (centro de custo, categoria de custo).
 *
 * A categoria vem do insumo, não é digitada: quem escolhe "Diesel S10" já disse que
 * o custo é Combustível. Quando a compra mistura coisas, o valor deixa de cair inteiro
 * numa categoria e passa a ser rateado — a OC-2026-0017 tem brita, rachão e BGS.
 *
 * O rodapé da ordem (frete, outras despesas, impostos, desconto) entra
 * proporcionalmente, porque o lançamento gerado na aprovação recebe o total COM
 * ajustes: ratear só os itens deixaria a soma das fatias diferente do valor do
 * lançamento. Medido em 17/08/2026, a OC-2026-0017 divergiria em R$ 3.835,95, e a
 * trava `trg_valida_soma_do_rateio` recusaria a aprovação.
 *
 * O resto do arredondamento vai para a maior fatia, a mesma regra usada nos rateios do
 * financeiro — duas aritméticas diferentes no sistema divergiriam no primeiro centavo.
 *
 * A ordem da saída é da maior fatia para a menor, que é como a tela mostra.
 */
export function ratearPorCategoria(
  itens: ItemParaRateio[],
  ajustes: AjustesDaOrdem,
): FatiaDoRateio[] {
  if (itens.length === 0) return [];

  const porChave = new Map<string, FatiaDoRateio>();
  for (const item of itens) {
    const chave = `${item.centroCustoId}|${item.categoriaId}`;
    const atual = porChave.get(chave);
    const valor = subtotalItem(item.quantidade, item.precoUnitario);
    if (atual) {
      atual.valor = centavos(atual.valor + valor);
    } else {
      porChave.set(chave, {
        centroCustoId: item.centroCustoId,
        categoriaId: item.categoriaId,
        valor: centavos(valor),
      });
    }
  }

  const fatias = [...porChave.values()].sort((a, b) => b.valor - a.valor);
  const totalItens = totalOrdemCompra(itens);
  const totalFinal = totalComAjustes(itens, ajustes);

  // Sem itens com valor não há proporção para aplicar: o rodapé inteiro cai na
  // primeira fatia, senão o total da ordem sumiria do rateio.
  if (totalItens === 0) {
    return fatias.map((fatia, indice) => ({
      ...fatia,
      valor: indice === 0 ? totalFinal : 0,
    }));
  }

  const proporcionais = fatias.map((fatia) => ({
    ...fatia,
    valor: centavos((fatia.valor * totalFinal) / totalItens),
  }));

  const somado = centavos(
    proporcionais.reduce((total, fatia) => total + fatia.valor, 0),
  );
  const resto = centavos(totalFinal - somado);
  if (resto !== 0) {
    proporcionais[0].valor = centavos(proporcionais[0].valor + resto);
  }

  return proporcionais;
}
