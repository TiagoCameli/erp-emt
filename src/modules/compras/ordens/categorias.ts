/**
 * A categoria de custo da ordem de compra é DERIVADA dos insumos comprados.
 *
 * Até 27/08/2026 a OC tinha um campo próprio de categoria, digitado por quem
 * emitia a ordem, e a aprovação o sobrescrevia pela categoria de maior valor dos
 * insumos. Duas verdades sobre a mesma compra: a tela dizia uma coisa antes de
 * aprovar e outra depois. Agora existe uma só, a do cadastro do insumo, e a
 * ordem pode ter mais de uma categoria — o que é o caso normal quando a compra
 * junta material e peça de equipamento no mesmo documento.
 *
 * Estas funções são puras de propósito: a mesma conta serve a tela do detalhe, o
 * rótulo da listagem e o teste, sem passar pelo banco.
 */

/** Uma categoria presente na ordem, com quanto dela vem por essa categoria. */
export interface CategoriaDaOrdem {
  id: string;
  nome: string;
  /** Soma dos subtotais dos itens desta categoria. Bruto, sem os ajustes. */
  valor: number;
}

/** O que `categoriasDaOrdem` precisa saber de um item. */
export interface ItemClassificado {
  categoriaCustoId: string | null;
  categoriaCustoNome: string | null;
  subtotal: number;
}

/**
 * As categorias da ordem, da que responde pelo maior valor para a menor.
 *
 * Item sem categoria fica FORA da lista: ele não classifica nada, e quem avisa
 * sobre ele é o aviso de "item sem categoria de custo", que é outro problema
 * (esse trava a aprovação). Contá-lo aqui como uma categoria anônima faria uma
 * ordem incompleta parecer uma ordem com duas categorias.
 *
 * O desempate é pelo nome, e não pela ordem de chegada dos itens: sem ele, duas
 * categorias de valor igual trocariam de lugar entre um carregamento e o outro.
 */
export function categoriasDaOrdem(
  itens: ItemClassificado[],
): CategoriaDaOrdem[] {
  const porId = new Map<string, CategoriaDaOrdem>();

  for (const item of itens) {
    if (!item.categoriaCustoId) continue;
    const existente = porId.get(item.categoriaCustoId);
    if (existente) {
      existente.valor += item.subtotal;
      continue;
    }
    porId.set(item.categoriaCustoId, {
      id: item.categoriaCustoId,
      nome: item.categoriaCustoNome ?? "-",
      valor: item.subtotal,
    });
  }

  return [...porId.values()].sort(
    (a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/**
 * O rótulo de uma célula ou de um campo de leitura.
 *
 * Com uma categoria, o nome dela. Com duas ou mais, a contagem — mesmo padrão
 * de "2 formas" na coluna de forma de pagamento, e pelo mesmo motivo: escrever
 * o nome de uma só, quando existem duas, é dizer que a compra inteira foi
 * daquela categoria. Sem nenhuma, `null`, para a tela desenhar o vazio dela.
 */
export function rotuloCategorias(categorias: CategoriaDaOrdem[]): string | null {
  if (categorias.length === 0) return null;
  if (categorias.length === 1) return categorias[0]!.nome;
  return `${categorias.length} categorias`;
}

/** O rótulo do campo: singular com uma, plural com duas ou mais. */
export function rotuloCategoriasDaOrdem(
  categorias: CategoriaDaOrdem[],
): string {
  return categorias.length > 1 ? "Categorias do custo" : "Categoria do custo";
}
