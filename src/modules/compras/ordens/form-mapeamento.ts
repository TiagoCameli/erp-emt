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

/**
 * O grupo visto por quem só faz conta: centro, insumo, quantidade e preço.
 *
 * As contas de total e de rateio não têm nada a ver com a categoria de custo, e
 * pedir o grupo inteiro obrigaria toda fixture de teste de dinheiro a inventar
 * uma categoria para provar uma soma. Função pede o que usa.
 */
export type GrupoParaConta = {
  centroCustoId: string;
  insumos: { insumoId: string; quantidade: string; precoUnitario: string }[];
};

/** Item plano da OC: como vem do banco e como a action grava. */
export interface ItemPlano {
  insumoId: string;
  quantidade: number;
  precoUnitario: number;
  centroCustoId: string;
}

/**
 * Item como a tela agrupa: o plano mais a categoria de custo do insumo.
 *
 * A categoria não está em `ItemPlano` porque não é da ordem — `oc_itens` não tem
 * essa coluna, e a action que grava não pode mandá-la. Ela só existe no caminho
 * banco > formulário, para a célula nascer preenchida com o cadastro.
 */
export type ItemAgrupavel = ItemPlano & {
  categoriaCustoId?: string | null;
};

/**
 * Agrupa itens planos por centro de custo, na ordem de primeira aparição,
 * convertendo quantidade/preço para string com vírgula (formato do form).
 * Usado ao carregar uma OC para edição.
 */
export function agruparItensPorCentroCusto(
  itens: ItemAgrupavel[],
): GrupoForm[] {
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
      categoriaCustoId: item.categoriaCustoId ?? "",
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
export function achatarGruposEmItens(grupos: GrupoParaConta[]): ItemPlano[] {
  return grupos.flatMap((grupo) =>
    grupo.insumos.map((insumo) => ({
      insumoId: insumo.insumoId,
      quantidade: paraNumero(insumo.quantidade),
      precoUnitario: paraNumero(insumo.precoUnitario),
      centroCustoId: grupo.centroCustoId,
    })),
  );
}

/** Uma mudança de categoria de insumo que o formulário está segurando. */
export interface ReclassificacaoPendente {
  insumoId: string;
  insumoNome: string;
  categoriaId: string;
  categoriaNome: string;
  /** O que o cadastro tinha quando a tela carregou. Nulo = não classificado. */
  categoriaAnteriorId: string | null;
  categoriaAnteriorNome: string | null;
}

/** O que esta conta precisa saber de um insumo do catálogo. */
interface InsumoClassificado {
  id: string;
  nome: string;
  categoriaCustoId: string | null;
  categoriaCustoNome: string | null;
}

/**
 * O que o salvamento vai mudar NO CADASTRO dos insumos, comparando o que está na
 * tela com o que o catálogo trouxe.
 *
 * É o insumo que tem categoria, não a linha: o mesmo insumo pode aparecer em dois
 * centros de custo da mesma ordem, e as duas linhas falam do mesmo cadastro.
 * Por isso a saída é uma por INSUMO — a tela mantém as linhas do mesmo insumo em
 * sincronia, e a primeira aparição é a que vale, para o resultado não depender da
 * ordem em que os grupos foram digitados.
 *
 * Célula vazia nunca gera reclassificação: vazio é o insumo que ainda não tem
 * categoria no cadastro, e limpar categoria pela OC quebraria a aprovação de
 * outras ordens.
 */
export function reclassificacoesPendentes(
  grupos: GrupoForm[],
  insumos: InsumoClassificado[],
  categorias: { id: string; nome: string }[],
): ReclassificacaoPendente[] {
  const catalogo = new Map(insumos.map((insumo) => [insumo.id, insumo]));
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const pendentes = new Map<string, ReclassificacaoPendente>();

  for (const grupo of grupos) {
    for (const linha of grupo.insumos ?? []) {
      const escolhida = (linha.categoriaCustoId ?? "").trim();
      if (!linha.insumoId || !escolhida) continue;
      if (pendentes.has(linha.insumoId)) continue;

      const insumo = catalogo.get(linha.insumoId);
      // Insumo fora do catálogo carregado (inativo, por exemplo): sem a foto do
      // "antes" não há como decidir se mudou, e reclassificar no escuro é o que
      // este parâmetro existe para evitar.
      if (!insumo) continue;
      if (insumo.categoriaCustoId === escolhida) continue;

      pendentes.set(linha.insumoId, {
        insumoId: linha.insumoId,
        insumoNome: insumo.nome,
        categoriaId: escolhida,
        categoriaNome: nomeCategoria.get(escolhida) ?? "-",
        categoriaAnteriorId: insumo.categoriaCustoId,
        categoriaAnteriorNome: insumo.categoriaCustoNome,
      });
    }
  }

  return [...pendentes.values()];
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
  formas: { formaPagamentoId: string; cartaoId: string; valor: string }[];
  centrosCusto: GrupoParaConta[];
  frete?: string;
  outrasDespesas?: string;
  impostos?: string;
  desconto?: string;
}): { formaPagamentoId: string; cartaoId?: string; valor: number }[] {
  // Campo vazio vira `undefined`, nao string vazia: `idSchemaCom(...).optional()`
  // recusa "" com "Cartao invalido", e a forma que nao e cartao SEMPRE manda "".
  const cartao = (valor: string) => (valor === "" ? undefined : valor);

  if (form.formas.length === 1) {
    return [
      {
        formaPagamentoId: form.formas[0]!.formaPagamentoId,
        cartaoId: cartao(form.formas[0]!.cartaoId),
        valor: totalComAjustes(
          achatarGruposEmItens(form.centrosCusto),
          ajustesDoForm(form),
        ),
      },
    ];
  }
  return form.formas.map((forma) => ({
    formaPagamentoId: forma.formaPagamentoId,
    cartaoId: cartao(forma.cartaoId),
    valor: paraNumero(forma.valor),
  }));
}
