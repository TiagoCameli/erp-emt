import { describe, expect, it } from "vitest";

import { ordenarAlertas } from "@/modules/mapa/components/alertas-mapa";
import {
  normalizarBusca,
  procurar,
  type ItemLocalizavel,
} from "@/modules/mapa/components/localizar-no-mapa";
import { paraAvisosMapa } from "@/modules/mapa/dados";
import { marcosNoZoom } from "@/modules/mapa/geo";
import type { AlertaMapa } from "@/modules/mapa/tipos";

const item = (
  tipo: ItemLocalizavel["tipo"],
  id: string,
  texto: string,
): ItemLocalizavel => ({
  tipo,
  id,
  rotulo: texto,
  detalhe: "",
  busca: normalizarBusca(texto),
});

describe("Localizar no mapa", () => {
  const itens = [
    item("equipamento", "1", "CB-001 Caminhão basculante Atego"),
    item("equipamento", "2", "RC-001 Rolo compactador CB tandem"),
    item("pessoa", "3", "José Antônio Operador"),
    item("local", "4", "Pátio Central Pátio"),
  ];

  it("acha pelo código com ou sem hífen, sem acento", () => {
    // O código primeiro; o rolo também tem "CB" e "001" no texto, e vem depois.
    expect(procurar(itens, "cb 001")[0].id).toBe("1");
    expect(procurar(itens, "CB-001")[0].id).toBe("1");
    expect(procurar(itens, "jose").map((i) => i.id)).toEqual(["3"]);
    expect(procurar(itens, "patio").map((i) => i.id)).toEqual(["4"]);
  });

  it("começa com o termo vem antes de contém", () => {
    expect(procurar(itens, "cb").map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("termo vazio não lista nada", () => {
    expect(procurar(itens, "  ")).toEqual([]);
  });
});

describe("Avisos do mapa", () => {
  it("converte o JSON de fn_mapa_avisos e descarta registro sem id", () => {
    const avisos = paraAvisosMapa({
      hoje: "2026-10-17",
      alertas: [
        {
          id: "a1",
          tipo: "quebrado_obra",
          alvo: "equipamento",
          alvo_id: "e1",
          mensagem: "CS-001 quebrado na obra",
          criado_em: "2026-10-17T10:00:00Z",
        },
        { tipo: "sem_id" },
      ],
      mudancas_hoje: [
        { alvo: "equipamento", alvo_id: "e2", tipo: "transferencia" },
        { alvo: "equipamento", tipo: "sem_alvo" },
      ],
    });
    expect(avisos?.alertas).toHaveLength(1);
    expect(avisos?.alertas[0]).toMatchObject({ alvoId: "e1", tipo: "quebrado_obra" });
    expect(avisos?.mudancasHoje.map((m) => m.alvoId)).toEqual(["e2"]);
  });

  it("formato inesperado devolve null", () => {
    expect(paraAvisosMapa(null)).toBeNull();
    expect(paraAvisosMapa([])).toBeNull();
  });

  it("ordena: quebrado antes de frete, frete antes de parado", () => {
    const a = (tipo: string, mensagem: string): AlertaMapa => ({
      id: tipo,
      tipo,
      alvo: "equipamento",
      alvoId: null,
      mensagem,
      criadoEm: "",
    });
    expect(
      ordenarAlertas([
        a("parado_patio", "x"),
        a("frete_sem_chegada", "y"),
        a("quebrado_obra", "z"),
      ]).map((x) => x.tipo),
    ).toEqual(["quebrado_obra", "frete_sem_chegada", "parado_patio"]);
  });
});

describe("Marcos de km sem lista nova a cada redesenho", () => {
  const marcos = [700, 701, 705, 710].map((km) => ({ km }));
  it("passo 1 devolve a própria lista; o mesmo passo devolve a mesma filtrada", () => {
    expect(marcosNoZoom(marcos, 14)).toBe(marcos);
    const a = marcosNoZoom(marcos, 13);
    expect(marcosNoZoom(marcos, 13.2)).toBe(a);
    expect(a.map((m) => m.km)).toEqual([700, 705, 710]);
  });
});
