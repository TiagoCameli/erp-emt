import { describe, expect, it } from "vitest";

import {
  escritaIncluirInvestimento,
  lerIncluirInvestimento,
  PARAM_INCLUIR_INVESTIMENTO,
  sufixoInvestimento,
} from "@/modules/financeiro/relatorios/filtro-investimento";
import { lerFiltrosCustoCc } from "@/modules/financeiro/relatorios/filtros-custo-cc";
import { lerFiltrosCustoGrupo } from "@/modules/financeiro/relatorios/filtros-custo-grupo";
import { lerFiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";
import { lerFiltrosPainel } from "@/modules/gestao/filtros";

/**
 * O "Incluir investimentos" na URL das quatro telas de custo.
 *
 * Um parâmetro só, com o mesmo nome em todas: o que estes testes travam é que
 * as quatro leituras concordam. Se uma tela lesse outro nome, trocar de
 * relatório pela barra de cima (ou clicar no cartão do Painel) abriria o
 * destino SEM o CAPEX embaixo de um número que o somou.
 */
describe("lerIncluirInvestimento", () => {
  it("liga só no literal 1", () => {
    expect(lerIncluirInvestimento("1")).toBe(true);
    expect(lerIncluirInvestimento(undefined)).toBe(false);
    expect(lerIncluirInvestimento("0")).toBe(false);
    expect(lerIncluirInvestimento("true")).toBe(false);
    // Chave repetida chega como array e é URL mal montada.
    expect(lerIncluirInvestimento(["1", "1"])).toBe(false);
  });

  it("desmarcar remove o parâmetro em vez de escrever zero", () => {
    expect(escritaIncluirInvestimento(true)).toEqual({
      [PARAM_INCLUIR_INVESTIMENTO]: "1",
    });
    expect(escritaIncluirInvestimento(false)).toEqual({
      [PARAM_INCLUIR_INVESTIMENTO]: null,
    });
  });

  it("o título da planilha só ganha sufixo quando ligado", () => {
    expect(sufixoInvestimento(false)).toBe("");
    expect(sufixoInvestimento(true)).toContain("com investimentos");
  });
});

describe("as quatro telas leem o mesmo parâmetro", () => {
  const LIGADO = { [PARAM_INCLUIR_INVESTIMENTO]: "1" };

  it("desligado por padrão em todas", () => {
    expect(lerFiltrosCustoCc({}, "2026-09").filtros.incluirInvestimento).toBe(false);
    expect(lerFiltrosCustoGrupo({}, "2026-09").incluirInvestimento).toBe(false);
    expect(lerFiltrosCustoReceita({}, ["2026-09"]).filtros.incluirInvestimento).toBe(
      false,
    );
    const painel = lerFiltrosPainel({}, "2026-09");
    expect(painel.filtros.incluirInvestimento).toBe(false);
    expect(painel.valores.incluirInvestimento).toBe(false);
  });

  it("ligado pelo mesmo `com_investimento=1` em todas", () => {
    expect(lerFiltrosCustoCc(LIGADO, "2026-09").filtros.incluirInvestimento).toBe(true);
    expect(lerFiltrosCustoGrupo(LIGADO, "2026-09").incluirInvestimento).toBe(true);
    expect(
      lerFiltrosCustoReceita(LIGADO, ["2026-09"]).filtros.incluirInvestimento,
    ).toBe(true);
    const painel = lerFiltrosPainel(LIGADO, "2026-09");
    expect(painel.filtros.incluirInvestimento).toBe(true);
    expect(painel.valores.incluirInvestimento).toBe(true);
  });

  it("no Painel, ligar não acende o aviso de 'não filtrado'", () => {
    // O aviso é para os blocos de caixa e pendência, que não obedecem a centro
    // e categoria. O investimento também não os move, e não é recorte deles.
    expect(lerFiltrosPainel(LIGADO, "2026-09").temRecorte).toBe(false);
  });
});
