import { describe, expect, it } from "vitest";

import type { CelulaLida } from "./leitor";
import { montarPlanilha, type LinhaBruta } from "./montagem";

const n = (texto: string): CelulaLida => ({ tipo: "numero", texto });
const s = (bruto: string): CelulaLida => ({ tipo: "texto", bruto });
const vazia: CelulaLida = { tipo: "vazia" };

function linha(l: number, codigo: string, descricao: string, unidade: CelulaLida, preco: CelulaLida, qtd: CelulaLida, extra: Partial<LinhaBruta> = {}): LinhaBruta {
  return { linhaOrigem: l, oculta: false, codigo: s(codigo), descricao: s(descricao), unidade, preco, quantidade: qtd, valor: null,
           colunas: { preco: 4, quantidade: 5, valor: null }, ...extra };
}

describe("montarPlanilha", () => {
  it("título sem preço, serviço com preço, e filho com preço de serviço com preço", () => {
    const m = montarPlanilha([
      linha(5, "02.07", "Pavimentação", vazia, vazia, vazia),
      linha(6, "02.07.05", "Imprimação", s("m2"), n("4.5"), n("100")),
      linha(7, "02.07.05.01", "Aquisição CM-30", s("t"), n("5000"), n("1.2")),
      linha(8, "02.07.05.02", "Transporte", s("tkm"), n("0.9"), n("300")),
    ]);
    expect(m.linhas.map((x) => [x.ordem, x.codigo, x.tipo, x.paiOrdem])).toEqual([
      [1, "02.07", "titulo", null],
      [2, "02.07.05", "servico", 1],
      [3, "02.07.05.01", "servico", 2],
      [4, "02.07.05.02", "servico", 2],
    ]);
    expect(m.alertas).toEqual([]);
  });

  it("código repetido é importado como está, sinalizado, e o pai dos filhos fica ambíguo", () => {
    const m = montarPlanilha([
      linha(5, "02", "Grupo", vazia, vazia, vazia),
      linha(6, "02.02", "Usinagem", s("t"), n("10"), n("1")),
      linha(7, "02.02", "DOPE", s("kg"), n("20"), n("1")),
      linha(8, "02.02", "CAP", s("t"), n("30"), n("1")),
      linha(9, "02.02.01", "Transporte do CAP", s("tkm"), n("1"), n("1")),
    ]);
    expect(m.linhas).toHaveLength(5);
    expect(m.duplicados).toEqual([{ codigo: "02.02", ordens: [2, 3, 4] }]);
    expect(m.ambiguidades).toEqual([{ ordem: 5, codigo: "02.02.01", candidatos: [2, 3, 4], sugerido: 4 }]);
    expect(m.linhas[4].paiOrdem).toBe(4);
    expect(m.alertas.map((a) => a.tipo).sort()).toEqual(["codigo_duplicado", "hierarquia_ambigua"]);
  });

  it("a escolha do usuário resolve a ambiguidade", () => {
    const m = montarPlanilha([
      linha(5, "02.02", "Usinagem", s("t"), n("10"), n("1")),
      linha(6, "02.02", "CAP", s("t"), n("30"), n("1")),
      linha(7, "02.02.01", "Transporte", s("tkm"), n("1"), n("1")),
    ], { 3: 1 });
    expect(m.linhas[2].paiOrdem).toBe(1);
    expect(m.alertas.find((a) => a.tipo === "hierarquia_ambigua")).toBeUndefined();
  });

  it("unidade com espaço sobrando entra aparada e gera alerta", () => {
    const m = montarPlanilha([linha(5, "01", "Roçada", s("un "), n("1"), n("2"))]);
    expect(m.linhas[0].unidade).toBe("un");
    expect(m.alertas).toMatchObject([{ tipo: "unidade_com_espaco", bloqueia: false, linhaOrigem: 5 }]);
  });

  it("serviço sem preço ou sem quantidade: vazio vira zero, com alerta", () => {
    const m = montarPlanilha([
      linha(5, "01", "Sem preço", s("un"), vazia, n("2")),
      linha(6, "02", "Sem quantidade", s("un"), n("3"), vazia),
    ]);
    expect(m.linhas.map((x) => [x.precoUnitario, x.quantidadePrevista])).toEqual([["0", "2"], ["3", "0"]]);
    expect(m.alertas.map((a) => a.tipo)).toEqual(["sem_preco", "vazio_vira_zero"]);
  });

  it("número como texto bloqueia, com o endereço da célula", () => {
    const m = montarPlanilha([linha(12, "01", "X", s("un"), s("1.234,56"), n("1"))]);
    expect(m.alertas).toMatchObject([{ tipo: "numero_como_texto", bloqueia: true, linhaOrigem: 12 }]);
    expect(m.alertas[0].mensagem).toContain("D12");
  });

  it("fórmula sem valor calculado bloqueia", () => {
    const m = montarPlanilha([linha(12, "01", "X", s("un"), n("1"), { tipo: "formula_sem_valor" })]);
    expect(m.alertas).toMatchObject([{ tipo: "formula_sem_valor", bloqueia: true }]);
    expect(m.alertas[0].mensagem).toBe("A célula E12 é fórmula sem valor calculado. Abra o arquivo no Excel, salve e envie de novo");
  });

  it("linha oculta entra e é sinalizada", () => {
    const m = montarPlanilha([linha(5, "01", "X", s("un"), n("1"), n("1"), { oculta: true })]);
    expect(m.linhas).toHaveLength(1);
    expect(m.alertas).toMatchObject([{ tipo: "linha_oculta", bloqueia: false }]);
  });

  it("código com ponto sem pai na planilha vai para a raiz, com alerta", () => {
    const m = montarPlanilha([linha(5, "02.07.04", "Órfão", s("t"), n("1"), n("1"))]);
    expect(m.linhas[0].paiOrdem).toBeNull();
    expect(m.alertas).toMatchObject([{ tipo: "codigo_sem_pai", bloqueia: false }]);
  });

  it("linha sem código nem descrição é ignorada; sem código mas com descrição bloqueia", () => {
    const m = montarPlanilha([
      linha(5, "", "", vazia, vazia, vazia, { codigo: vazia, descricao: vazia }),
      linha(6, "", "Observação solta", vazia, n("1"), n("1"), { codigo: vazia }),
    ]);
    expect(m.linhas).toHaveLength(0);
    expect(m.alertas).toMatchObject([{ tipo: "linha_sem_codigo", bloqueia: true, linhaOrigem: 6 }]);
  });
});
