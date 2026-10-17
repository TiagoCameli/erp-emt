import type { ItemAlocacao } from "@/modules/mapa/schemas";

/**
 * Item de `fn_mapa_alocar` como o banco lê: chave ausente não mexe, `null` limpa. Por isso a
 * conversão copia só as chaves presentes no item (inclusive as que valem null) e nunca escreve
 * `undefined`, que o JSON apagaria e viraria "não mexe" sem ninguém pedir.
 */
export type ItemLoteRpc = {
  colaborador_id: string;
  equipamento_id?: string | null;
  localidade_id?: string | null;
  obra_id?: string | null;
  centro_custo_id?: string | null;
};

const CHAVES = [
  ["equipamentoId", "equipamento_id"],
  ["localidadeId", "localidade_id"],
  ["obraId", "obra_id"],
  ["centroCustoId", "centro_custo_id"],
] as const;

export function itemParaRpc(item: ItemAlocacao): ItemLoteRpc {
  const saida: ItemLoteRpc = { colaborador_id: item.colaboradorId };
  for (const [daTela, doBanco] of CHAVES) {
    const valor = item[daTela];
    if (valor !== undefined) saida[doBanco] = valor;
  }
  return saida;
}

/**
 * Junta as edições da tela num lote só, uma linha por pessoa: duas edições da mesma pessoa (a
 * máquina numa célula, o centro na outra) viram um item; a última vence no mesmo campo. Item sem
 * nenhum campo além da pessoa sai (não há o que gravar).
 */
export function montarLote(edicoes: readonly ItemAlocacao[]): ItemAlocacao[] {
  const porPessoa = new Map<string, ItemAlocacao>();
  for (const e of edicoes) {
    const atual = porPessoa.get(e.colaboradorId) ?? {
      colaboradorId: e.colaboradorId,
    };
    porPessoa.set(e.colaboradorId, { ...atual, ...semIndefinidos(e) });
  }
  return [...porPessoa.values()].filter((i) =>
    CHAVES.some(([chave]) => i[chave] !== undefined),
  );
}

function semIndefinidos(item: ItemAlocacao): ItemAlocacao {
  const saida: ItemAlocacao = { colaboradorId: item.colaboradorId };
  for (const [chave] of CHAVES) {
    if (item[chave] !== undefined) saida[chave] = item[chave];
  }
  return saida;
}

/**
 * Uma máquina para duas pessoas no mesmo lote é recusada pelo banco (um operador por máquina).
 * A tela avisa antes de mandar: devolve o id da primeira máquina repetida, ou null.
 */
export function maquinaRepetida(itens: readonly ItemAlocacao[]): string | null {
  const vistas = new Set<string>();
  for (const i of itens) {
    if (!i.equipamentoId) continue;
    if (vistas.has(i.equipamentoId)) return i.equipamentoId;
    vistas.add(i.equipamentoId);
  }
  return null;
}
