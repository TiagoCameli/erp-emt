/**
 * Agregação pura do lote de 13º para a tela.
 *
 * Sem Supabase e **sem conta de dinheiro**: a fórmula do 13º vive inteira em
 * `fn_gerar_decimo_terceiro` e em lugar nenhum mais. Aqui só se soma o que a
 * RPC já gravou, para a tela poder conferir. Uma cópia da fórmula aqui seria
 * uma segunda fonte de verdade, e um teste verde em cima da cópia não diria
 * nada sobre a função que realmente paga.
 *
 * Precedente: `src/modules/rh/folha/calculo.ts`, que faz o mesmo pela folha.
 * Fica fora de `queries.ts` (que tem `import "server-only"`) para poder ser
 * testado com Vitest.
 */
import type { LoteDetalhe } from "@/modules/rh/decimo-terceiro/queries";

export interface CustoPorCentro {
  centroCustoId: string | null;
  centroCustoNome: string | null;
  valorLiquido: number;
}

/**
 * Líquido do lote agrupado por centro de custo, do maior para o menor.
 *
 * Agrupa por **id**, não por nome: dois centros de custo podem se chamar igual
 * em obras diferentes, e somá-los esconderia para onde o custo foi.
 */
export function resumoPorCentroCusto(lote: LoteDetalhe): CustoPorCentro[] {
  const grupos = new Map<string, CustoPorCentro>();

  for (const item of lote.itens) {
    const chave = item.centroCustoId ?? "__sem_centro__";
    const atual = grupos.get(chave);

    if (atual) {
      atual.valorLiquido += item.valorLiquido;
    } else {
      grupos.set(chave, {
        centroCustoId: item.centroCustoId,
        centroCustoNome: item.centroCustoNome ?? "Sem centro de custo",
        valorLiquido: item.valorLiquido,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.valorLiquido - a.valorLiquido);
}

export interface Conferencia {
  somaDosItens: number;
  totalGravado: number;
  /** Sempre positiva. Zero quando fecha. */
  diferenca: number;
  fecha: boolean;
  editadosAMao: number;
}

/**
 * A soma dos itens contra o total gravado no cabeçalho do lote.
 *
 * Divergência significa que `fn_dt_recalcular_totais` não rodou depois de
 * alguma edição, e aí o número que a tela mostra não é o que vai virar conta a
 * pagar. A tela acusa em vez de escolher um dos dois.
 */
export function conferenciaDoLote(lote: LoteDetalhe): Conferencia {
  const soma = lote.itens.reduce((total, item) => total + item.valorLiquido, 0);

  // Arredonda para centavos antes de comparar: 0,1 + 0,2 dá
  // 0,30000000000000004 em binário, e comparar float direto acusaria
  // divergência num lote que fecha.
  const somaEmCentavos = Math.round(soma * 100);
  const gravadoEmCentavos = Math.round(lote.valorLiquido * 100);
  const diferenca = Math.abs(somaEmCentavos - gravadoEmCentavos) / 100;

  return {
    somaDosItens: somaEmCentavos / 100,
    totalGravado: lote.valorLiquido,
    diferenca,
    fecha: diferenca === 0,
    editadosAMao: lote.itens.filter((item) => item.editadoManualmente).length,
  };
}
