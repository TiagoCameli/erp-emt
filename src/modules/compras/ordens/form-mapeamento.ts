import {
  paraNumero,
  totalComAjustes,
} from "@/modules/compras/ordens/calculo";
import {
  ajustesDoForm,
  type OrdemCompraFormInput,
} from "@/modules/compras/ordens/schemas";

/** Grupo de centro de custo do formulário (centro de custo > insumos). */
export type GrupoForm = OrdemCompraFormInput["centrosCusto"][number];

/** Item plano da OC: como vem do banco e como a action grava. */
export interface ItemPlano {
  insumoId: string;
  quantidade: number;
  precoUnitario: number;
  centroCustoId: string;
}

/**
 * Agrupa itens planos por centro de custo, na ordem de primeira aparição,
 * convertendo quantidade/preço para string com vírgula (formato do form).
 * Usado ao carregar uma OC para edição.
 */
export function agruparItensPorCentroCusto(itens: ItemPlano[]): GrupoForm[] {
  const ordem: string[] = [];
  const porCentro = new Map<string, GrupoForm["insumos"]>();
  for (const item of itens) {
    if (!porCentro.has(item.centroCustoId)) {
      porCentro.set(item.centroCustoId, []);
      ordem.push(item.centroCustoId);
    }
    porCentro.get(item.centroCustoId)!.push({
      insumoId: item.insumoId,
      quantidade: String(item.quantidade).replace(".", ","),
      precoUnitario: String(item.precoUnitario).replace(".", ","),
    });
  }
  return ordem.map((centroCustoId) => ({
    centroCustoId,
    insumos: porCentro.get(centroCustoId)!,
  }));
}

/**
 * Achata os grupos do formulário na lista plana de itens que a action grava.
 * Cada insumo herda o centro de custo do seu grupo; qtd/preço são coeridos.
 */
export function achatarGruposEmItens(grupos: GrupoForm[]): ItemPlano[] {
  return grupos.flatMap((grupo) =>
    grupo.insumos.map((insumo) => ({
      insumoId: insumo.insumoId,
      quantidade: paraNumero(insumo.quantidade),
      precoUnitario: paraNumero(insumo.precoUnitario),
      centroCustoId: grupo.centroCustoId,
    })),
  );
}

/**
 * As formas de pagamento como a action grava, a partir do formulario.
 *
 * Com UMA forma ela leva o total da ORDEM -- itens mais frete, outras despesas e
 * impostos, MENOS desconto -- e nao a soma dos itens. A coluna de valor dela nao
 * esta na tela (a compra inteira sai por ela), entao quem preenche o numero e
 * esta funcao.
 *
 * **Por que isto precisa da conta canonica:** o `superRefine` do servidor recusa
 * quando `soma das formas !== totalEmCentavos(itens, ajustes)`, que inclui os
 * ajustes. Enquanto aqui era uma soma de `quantidade * preco` escrita a mao, toda
 * ordem com desconto ou outras despesas paga por uma forma so era recusada no
 * salvamento com "A soma das formas precisa fechar com o total da ordem" --
 * enquanto o rodape da mesma tela, que ja contava os ajustes, dizia ao lado
 * "Fecha com o total da ordem" sobre as parcelas. Duas contas do mesmo dinheiro,
 * e a tela dando razao as duas ao mesmo tempo.
 *
 * Com DUAS ou mais, cada uma leva o valor digitado: ai a coluna existe na tela e
 * fechar a soma e responsabilidade de quem divide (o schema confere).
 *
 * Valor negativo passa de proposito quando o desconto e maior que a ordem: quem
 * recusa e o schema, com a mensagem que fala do desconto. Truncar em zero aqui
 * faria a soma fechar com um total que nao existe.
 */
export function formasDoFormulario(form: {
  formas: { formaPagamentoId: string; valor: string }[];
  centrosCusto: GrupoForm[];
  frete?: string;
  outrasDespesas?: string;
  impostos?: string;
  desconto?: string;
}): { formaPagamentoId: string; valor: number }[] {
  if (form.formas.length === 1) {
    return [
      {
        formaPagamentoId: form.formas[0]!.formaPagamentoId,
        valor: totalComAjustes(
          achatarGruposEmItens(form.centrosCusto),
          ajustesDoForm(form),
        ),
      },
    ];
  }
  return form.formas.map((forma) => ({
    formaPagamentoId: forma.formaPagamentoId,
    valor: paraNumero(forma.valor),
  }));
}
