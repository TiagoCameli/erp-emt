import { CHAVES_RECORTE } from "@/modules/combustivel/_shared/navegacao";
import type { Modo } from "@/modules/combustivel/anomalias/base";
import { ID_NAO_IDENTIFICADO } from "@/modules/combustivel/painel/calculo";

/**
 * O link de cada linha do ranking de Equipamentos/Carretas para a lista de Saídas.
 * Módulo puro, testado em links.test.ts.
 *
 * A linha tem que abrir uma lista que soma o MESMO número: por isso o link repete o
 * recorte que produziu a linha (modo, período resolvido e os filtros globais da URL) e
 * troca só o consumidor. Na origem o clique virava filtro da tela; aqui é navegação com o
 * filtro na URL (a lista de Saídas deriva o tipo de consumidor do `modo`).
 */

export const ROTA_SAIDAS = "/combustivel/abastecimentos";

export interface RecorteDoLink {
  modo: Modo;
  de: string;
  ate: string;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Próprios: `equipamento=<id do banco>`. A linha "Não identificado" agrupa as saídas no
 * sentinela ("Outros"); ela só ganha link quando existe UM sentinela cadastrado, senão a
 * lista mostraria só parte do grupo.
 *
 * Carretas: `placa=<placa>` (a chave do agrupamento da origem).
 */
export function linkSaidasDoConsumidor(
  consumidorId: string,
  recorte: RecorteDoLink,
  sentinelas: readonly string[],
  paramsAtuais: Params = {},
): string | null {
  let equipamento: string | null = null;
  if (recorte.modo === "proprios") {
    if (consumidorId === ID_NAO_IDENTIFICADO) {
      if (sentinelas.length !== 1) return null;
      equipamento = sentinelas[0]!;
    } else {
      equipamento = consumidorId;
    }
  }

  const params = new URLSearchParams();
  for (const chave of CHAVES_RECORTE) {
    if (chave === "modo" || chave === "de" || chave === "ate" || chave === "equipamento" || chave === "placa") continue;
    const valor = paramsAtuais[chave];
    for (const item of Array.isArray(valor) ? valor : valor !== undefined ? [valor] : []) params.append(chave, item);
  }
  if (recorte.modo === "carretas") params.set("modo", "carretas");
  params.set("de", recorte.de);
  params.set("ate", recorte.ate);
  if (equipamento) params.set("equipamento", equipamento);
  else params.set("placa", consumidorId);
  return `${ROTA_SAIDAS}?${params.toString()}`;
}
