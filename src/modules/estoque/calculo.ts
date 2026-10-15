import { CASAS_TAXA } from "@/lib/casas-decimais";
import { arredondar } from "@/modules/manutencao/almoxarifado/calculo";

/**
 * Conta do saldo para MOSTRAR no formulário da saída. Quem decide é o banco: o PEPS
 * (`fn_estoque_recalcular_peps`) recusa a saída sem saldo na data, inclusive a
 * retroativa. Aqui é só para a pessoa ver quanto há antes de digitar.
 */

// ---------------------------------------------------------------------------
// Local: depósito, tanque de material ou pilha, num valor só ("deposito:<id>" / "tanque:<id>" / "pilha:<id>")
// ---------------------------------------------------------------------------

export type TipoLocal = "deposito" | "tanque" | "pilha";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function codificarLocal(tipo: TipoLocal, id: string): string {
  return `${tipo}:${id}`;
}

/** Opção do campo "Local" na entrada. A pilha leva o insumo dela: a entrada só pode ser dele. */
export interface LocalFormOpcao {
  id: string;
  nome: string;
  insumoId?: string | null;
}

export interface LocalDecodificado {
  depositoId: string | null;
  tanqueId: string | null;
  pilhaId: string | null;
}

export const SEM_LOCAL: LocalDecodificado = { depositoId: null, tanqueId: null, pilhaId: null };

/** O valor do campo "Local" de volta em depósito, tanque ou pilha; null quando não é um local. */
export function decodificarLocal(valor: string): LocalDecodificado | null {
  const [tipo, id, ...resto] = valor.split(":");
  if (resto.length > 0 || !id || !GUID.test(id)) return null;
  if (tipo === "deposito") return { ...SEM_LOCAL, depositoId: id };
  if (tipo === "tanque") return { ...SEM_LOCAL, tanqueId: id };
  if (tipo === "pilha") return { ...SEM_LOCAL, pilhaId: id };
  return null;
}

export interface MovimentoSaldo {
  /** `codificarLocal(...)`. */
  local: string;
  insumoId: string;
  quantidade: number;
}

export function chaveSaldo(local: string, insumoId: string): string {
  return `${local}|${insumoId}`;
}

/** Saldo por local × insumo: entradas menos saídas (ignorando a saída em edição). */
export function saldosPorDepositoInsumo(
  entradas: readonly MovimentoSaldo[],
  saidas: readonly (MovimentoSaldo & { id: string })[],
  ignorarSaidaId: string | null = null,
): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const entrada of entradas) {
    const chave = chaveSaldo(entrada.local, entrada.insumoId);
    saldos.set(chave, (saldos.get(chave) ?? 0) + entrada.quantidade);
  }
  for (const saida of saidas) {
    if (saida.id === ignorarSaidaId) continue;
    const chave = chaveSaldo(saida.local, saida.insumoId);
    saldos.set(chave, (saldos.get(chave) ?? 0) - saida.quantidade);
  }
  for (const [chave, valor] of saldos) saldos.set(chave, arredondar(valor, CASAS_TAXA));
  return saldos;
}
