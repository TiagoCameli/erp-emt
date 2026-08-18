import { describe, expect, it } from "vitest";

import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";

describe("emLotes", () => {
  it("quebra a lista em pedaços do tamanho pedido", () => {
    expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("lista menor que o lote sai inteira, num pedaço só", () => {
    expect(emLotes(["a", "b"], 200)).toEqual([["a", "b"]]);
  });

  it("lista vazia não gera pedaço nenhum", () => {
    // Importa porque quem chama roda uma consulta por pedaço: um pedaço vazio
    // viraria um `in.()` sem id, que o PostgREST recusa.
    expect(emLotes([], 200)).toEqual([]);
  });

  it("tamanho exato não gera pedaço vazio no fim", () => {
    expect(emLotes([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe("LOTE_IDS_POSTGREST", () => {
  it("cabe folgado no limite de URL do PostgREST", () => {
    // ESTE NÚMERO FOI MEDIDO, NÃO ESCOLHIDO POR GOSTO (13/08/2026, projeto vivo):
    // `?id=in.(...)` com 1000 uuids dá 37 KB de URL e volta 400 Bad Request; com
    // 500 dá 18,5 KB e passa; com 100 dá 3,7 KB e passa. O 400 acontece ANTES de
    // qualquer checagem de permissão, então não tem como confundir com RLS.
    //
    // 200 uuids dão ~7,5 KB, abaixo do 8 KB que proxy e CDN costumam cortar.
    // Subir isto de volta para perto de 1000 quebra a exportação com dado real e
    // passa em todo teste, porque teste roda com dois registros.
    const TAMANHO_UUID_NA_URL = 37; // 36 do uuid + a vírgula
    expect(LOTE_IDS_POSTGREST * TAMANHO_UUID_NA_URL).toBeLessThan(8_000);
    // E grande o bastante para não virar uma consulta por lançamento.
    expect(LOTE_IDS_POSTGREST).toBeGreaterThanOrEqual(100);
  });
});
