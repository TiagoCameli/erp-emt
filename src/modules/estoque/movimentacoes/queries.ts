import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { OrigemPosicao } from "@/modules/estoque/queries";

/**
 * O que mexeu no saldo. A transferência aparece nas duas pontas; o frete que chega numa pilha
 * é a entrada "frete"; a saída de peça para a OS é "consumo_os".
 */
export type TipoMovimento =
  | "entrada"
  | "frete"
  | "saida"
  | "transferencia_entrada"
  | "transferencia_saida"
  | "abastecimento"
  | "esvaziamento"
  | "consumo_os";

export interface MovimentoLinha {
  /** Prefixo da fonte + id do registro (ex. "ee:<uuid>"): único na lista. */
  id: string;
  origem: OrigemPosicao;
  localTipo: "deposito" | "tanque" | "pilha";
  localId: string;
  localNome: string;
  /** Nulo no esvaziamento do tanque. */
  insumoId: string | null;
  insumoNome: string | null;
  unidade: string | null;
  data: string;
  /** Data e hora do movimento (o do estoque e o da peça só têm o dia). */
  momento: string;
  lancadoEm: string;
  tipo: TipoMovimento;
  /** Positiva quando entra, negativa quando sai. */
  quantidade: number;
  /** Saldo do local (e insumo) logo depois deste movimento, contando toda a história. */
  saldo: number;
  /** Fornecedor/OC/NF, centro de custo, equipamento, OS ou o outro lado da transferência. */
  referencia: string | null;
}

/**
 * Todas as movimentações de depósitos, tanques e pilhas, da mais nova para a mais velha.
 * A RPC junta Estoque, Combustível e Peças pela regra de saldo de cada módulo: o último saldo
 * de cada local é o da Posição (prova `supabase/provas/estoque_movimentacoes.sql`).
 */
export async function listarMovimentacoes(): Promise<MovimentoLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_movimentacoes");
  if (error) throw new Error("Não foi possível carregar as movimentações do estoque");

  return (data ?? [])
    .map(
      (linha): MovimentoLinha => ({
        id: linha.id,
        origem: linha.origem as OrigemPosicao,
        localTipo: linha.local_tipo as MovimentoLinha["localTipo"],
        localId: linha.local_id,
        localNome: linha.local_nome,
        insumoId: linha.insumo_id,
        insumoNome: linha.insumo_nome,
        unidade: linha.unidade,
        data: linha.data,
        momento: linha.momento,
        lancadoEm: linha.lancado_em,
        tipo: linha.tipo as TipoMovimento,
        quantidade: Number(linha.quantidade),
        saldo: Number(linha.saldo),
        referencia: linha.referencia,
      }),
    )
    .sort(compararMaisNovoPrimeiro);
}

/** A mesma ordem da janela do saldo, invertida: o mais novo em cima. */
function compararMaisNovoPrimeiro(a: MovimentoLinha, b: MovimentoLinha): number {
  const porMomento = Date.parse(b.momento) - Date.parse(a.momento);
  if (porMomento !== 0) return porMomento;
  const porLancamento = Date.parse(b.lancadoEm) - Date.parse(a.lancadoEm);
  if (porLancamento !== 0) return porLancamento;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
