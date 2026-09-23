import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import {
  montarItemEntrada,
  montarItemSaida,
  montarItemTransferencia,
  textoExclusao,
} from "@/modules/combustivel/lixeira/montar";
import { permissoesDaLixeira, veAlgumaSecao } from "@/modules/combustivel/lixeira/permissoes";

function pode(concedidas: string[]) {
  return (recurso: string, acao: string) => concedidas.includes(`${recurso}:${acao}`);
}

describe("quem vê e quem restaura na Lixeira do Combustível", () => {
  it("sem ver a Lixeira, não vê seção nenhuma, nem com o recurso", () => {
    const p = permissoesDaLixeira(pode(["combustivel.saidas:ver", "combustivel.saidas:excluir"]));
    expect(veAlgumaSecao(p)).toBe(false);
    expect(p.saida).toEqual({ ver: false, restaurar: false });
  });

  it("vê a seção de cada recurso que pode ver; restaura só com editar a Lixeira E excluir no recurso", () => {
    const p = permissoesDaLixeira(
      pode([
        "administracao.lixeira:ver",
        "administracao.lixeira:editar",
        "combustivel.saidas:ver",
        "combustivel.saidas:excluir",
        "combustivel.entradas:ver",
        "combustivel.transferencias:excluir",
      ]),
    );
    expect(p.saida).toEqual({ ver: true, restaurar: true });
    // Vê entradas, mas sem excluir não restaura.
    expect(p.entrada).toEqual({ ver: true, restaurar: false });
    // Excluir transferência sem ver a aba: nem a seção aparece.
    expect(p.transferencia).toEqual({ ver: false, restaurar: false });
    expect(p.esvaziamento).toEqual({ ver: false, restaurar: false });
  });

  it("ver a Lixeira sem editar: vê, não restaura", () => {
    const p = permissoesDaLixeira(pode(["administracao.lixeira:ver", "combustivel.saidas:ver", "combustivel.saidas:excluir"]));
    expect(p.saida).toEqual({ ver: true, restaurar: false });
  });
});

describe("itens da lixeira (resumo da origem)", () => {
  it("saída: litros com 2 casas e valor; data em Rio Branco e o contexto", () => {
    const item = montarItemSaida({
      id: "s1",
      data: "2026-09-23T12:05:00Z",
      litros: 155.6,
      valorTotal: 994.99,
      consumidor: "EC-01 · Escavadeira",
      obra: "BR-364",
      tanque: null,
      motivo: "lançado em dobro",
      excluidoEm: "2026-09-23T15:00:00Z",
      excluidoPor: "Tiago",
    });
    expect(item.titulo).toBe(`155,60 L · ${formatarBRL(994.99)}`);
    expect(item.subtitulo).toBe("23/09/2026 07:05 · EC-01 · Escavadeira · BR-364");
    expect(textoExclusao(item)).toBe("Excluído por Tiago em 23/09/2026 10:00");
  });

  it("entrada: fornecedor, tanque e NF", () => {
    const item = montarItemEntrada({
      id: "e1",
      dataHora: "2026-09-23T12:05:00Z",
      litros: 5000,
      valorTotal: 30000,
      fornecedor: "Posto A",
      tanque: "Tanque Base",
      notaFiscal: " 123 ",
      motivo: null,
      excluidoEm: null,
      excluidoPor: null,
    });
    expect(item.subtitulo).toBe("23/09/2026 07:05 · Posto A · Tanque Base · NF 123");
    expect(textoExclusao(item)).toBe("Excluído por — em —");
  });

  it("transferência: origem → destino, com ? quando o tanque sumiu", () => {
    const item = montarItemTransferencia({
      id: "t1",
      dataHora: "2026-09-23T12:05:00Z",
      litros: 300,
      tanqueOrigem: "Base",
      tanqueDestino: null,
      motivo: null,
      excluidoEm: null,
      excluidoPor: null,
    });
    expect(item.titulo).toBe("300,00 L");
    expect(item.subtitulo).toBe("23/09/2026 07:05 · Base → ?");
  });
});
