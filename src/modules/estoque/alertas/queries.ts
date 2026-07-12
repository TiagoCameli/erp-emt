import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TipoDeposito } from "@/modules/cadastros/depositos/schemas";
import { listarSaldos } from "@/modules/estoque/_shared/queries";

/** Linha da listagem de mínimos: o mínimo definido cruzado com o saldo atual. */
export interface MinimoLista {
  id: string;
  insumoId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string;
  depositoId: string;
  depositoNome: string;
  depositoTipo: TipoDeposito;
  minimo: number;
  saldoAtual: number;
  abaixo: boolean;
}

/** Chave de cruzamento mínimo x saldo. */
function chave(insumoId: string, depositoId: string): string {
  return `${insumoId}|${depositoId}`;
}

/**
 * Lista os estoques mínimos definidos (insumo + depósito), cruzados com o
 * saldo atual materializado. Marca quais estão abaixo do mínimo. Ordena por
 * nome do insumo e depois nome do depósito.
 */
export async function listarMinimos(): Promise<MinimoLista[]> {
  const supabase = await createClient();

  const [{ data, error }, { itens: saldos }] = await Promise.all([
    supabase
      .from("estoque_minimos")
      .select(
        `id, insumo_id, deposito_id, minimo,
         insumos(nome, codigo, unidades_medida(sigla)),
         depositos(nome, tipo)`,
      ),
    listarSaldos({ incluirZerados: true }),
  ]);

  if (error) throw new Error("Não foi possível carregar os mínimos");

  const saldoPorChave = new Map<string, number>();
  for (const saldo of saldos) {
    saldoPorChave.set(chave(saldo.insumoId, saldo.depositoId), saldo.quantidade);
  }

  return (data ?? [])
    .map((minimo) => {
      const saldoAtual =
        saldoPorChave.get(chave(minimo.insumo_id, minimo.deposito_id)) ?? 0;
      return {
        id: minimo.id,
        insumoId: minimo.insumo_id,
        insumoNome: minimo.insumos?.nome ?? "-",
        insumoCodigo: minimo.insumos?.codigo ?? null,
        unidadeSigla: minimo.insumos?.unidades_medida?.sigla ?? "",
        depositoId: minimo.deposito_id,
        depositoNome: minimo.depositos?.nome ?? "-",
        depositoTipo: (minimo.depositos?.tipo ?? "central") as TipoDeposito,
        minimo: minimo.minimo,
        saldoAtual,
        abaixo: saldoAtual < minimo.minimo,
      };
    })
    .sort(
      (a, b) =>
        a.insumoNome.localeCompare(b.insumoNome) ||
        a.depositoNome.localeCompare(b.depositoNome),
    );
}
