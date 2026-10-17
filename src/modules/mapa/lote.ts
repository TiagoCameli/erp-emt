import { pontoNaObra } from "@/modules/mapa/obra-destino";
import type { Posicao } from "@/modules/mapa/tipos";

/**
 * Transferência em lote da seleção múltipla (Tiago, 17/10/2026): com a seleção ligada, as fichas
 * não abrem; um botão "Transferir" leva as máquinas e as pessoas selecionadas para o mesmo lugar
 * (obra, local ou área), com a mesma obra, data e motivo.
 */

/** Um ponto livre para cada item em volta do lugar, sem empilhar um sobre o outro. */
export function pontosDoLote(
  base: Posicao,
  quantos: number,
  ocupados: readonly Posicao[],
): Posicao[] {
  const usados = [...ocupados];
  const pontos: Posicao[] = [];
  for (let i = 0; i < quantos; i++) {
    const p = pontoNaObra(base, usados);
    pontos.push(p);
    usados.push(p);
  }
  return pontos;
}

/**
 * Destino de `fn_mapa_mover_colaboradores` para uma pessoa do lote. O lugar vem como a chave da
 * lista "Para onde" ("obra:<id>", "local:<id>" ou "area:<id>"): local e área entram como tal, e a
 * pessoa fica no ponto dela. Sem obra escolhida a RPC mantém a obra que a pessoa já tinha.
 */
export function destinoDaPessoaNoLote(
  chaveLugar: string,
  para: Posicao,
  obraId: string | null,
): {
  obra_id?: string;
  localidade_id?: string;
  area_id?: string;
  lng: number;
  lat: number;
} {
  const [tipo, id] = chaveLugar.split(":");
  return {
    ...(obraId ? { obra_id: obraId } : {}),
    ...(tipo === "local" && id ? { localidade_id: id } : {}),
    ...(tipo === "area" && id ? { area_id: id } : {}),
    lng: para[0],
    lat: para[1],
  };
}

/** "3 equipamentos e 2 pessoas", "1 equipamento", "1 pessoa". */
export function rotuloDoLote(equipamentos: number, pessoas: number): string {
  const partes = [
    equipamentos > 0
      ? `${equipamentos} ${equipamentos === 1 ? "equipamento" : "equipamentos"}`
      : null,
    pessoas > 0 ? `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}` : null,
  ].filter((p): p is string => p !== null);
  return partes.join(" e ");
}
