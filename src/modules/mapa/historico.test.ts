import { describe, expect, it } from "vitest";

import {
  resumirMovimentacao,
  rotuloTipoMovimentacao,
  type MovimentacaoMapa,
} from "@/modules/mapa/historico";

const base: MovimentacaoMapa = {
  id: 1,
  tipo: "transferencia",
  alvo: "equipamento",
  alvoId: "e1",
  alvoCodigo: "PC-003",
  alvoNome: "Escavadeira",
  dataEfetiva: "2026-10-16",
  criadoEm: "2026-10-16T12:00:00Z",
  usuarioNome: "Tiago",
  motivo: "",
  deObra: null,
  paraObra: null,
  deLugar: null,
  paraLugar: null,
  deKm: null,
  paraKm: null,
  deEstado: null,
  paraEstado: null,
  dePessoa: null,
  paraPessoa: null,
  deAcoplado: null,
  paraAcoplado: null,
  fornecedor: null,
};

describe("resumirMovimentacao", () => {
  it("transferência entre obras: obra, lugar com km e estado, e marca a troca", () => {
    const r = resumirMovimentacao({
      ...base,
      deObra: "009 - Lote 09",
      paraObra: "001 - Carretas",
      deLugar: "Pátio central",
      paraLugar: "Lote 10",
      paraKm: 701.25,
      deEstado: "parado",
      paraEstado: "operando",
    });
    expect(r.de).toBe("009 - Lote 09 · Pátio central · Parado");
    expect(r.para).toBe("001 - Carretas · Lote 10 · km 701,3 · Operando");
    expect(r.trocouObra).toBe(true);
  });

  it("transferência que perdeu a obra diz Sem obra, não some", () => {
    const r = resumirMovimentacao({ ...base, deObra: "009 - Lote 09" });
    expect(r.para).toBe("Sem obra");
    expect(r.trocouObra).toBe(true);
  });

  it("LINHA DE CONTROLE: mesma obra não marca troca", () => {
    const r = resumirMovimentacao({
      ...base,
      deObra: "009",
      paraObra: "009",
    });
    expect(r.trocouObra).toBe(false);
  });

  it("posição (ajuste ou 1ª entrada) mostra só o lugar", () => {
    const r = resumirMovimentacao({
      ...base,
      tipo: "posicao",
      deObra: "009",
      paraObra: "009",
      deLugar: "Oficina",
      paraLugar: "Oficina",
    });
    expect(r).toEqual({ de: "Oficina", para: "Oficina", trocouObra: false });
  });

  it("estado, operador, acoplamento e locação", () => {
    expect(
      resumirMovimentacao({
        ...base,
        tipo: "estado",
        deEstado: "operando",
        paraEstado: "conserto",
      }),
    ).toMatchObject({ de: "Operando", para: "Em conserto" });
    expect(
      resumirMovimentacao({ ...base, tipo: "operador", paraPessoa: "Renan" }),
    ).toMatchObject({ de: "Sem operador", para: "Renan" });
    expect(
      resumirMovimentacao({
        ...base,
        tipo: "acoplamento",
        paraAcoplado: "CAV-01",
      }),
    ).toMatchObject({ de: "Solto", para: "Acoplado em CAV-01" });
    expect(
      resumirMovimentacao({ ...base, tipo: "locacao", fornecedor: "BR Máquinas" }),
    ).toMatchObject({ para: "Alugada de BR Máquinas" });
  });

  it("tipo desconhecido não quebra", () => {
    expect(resumirMovimentacao({ ...base, tipo: "novo" }).para).toBe("–");
    expect(rotuloTipoMovimentacao("novo")).toBe("novo");
    expect(rotuloTipoMovimentacao("transferencia")).toBe("Transferência");
  });
});
