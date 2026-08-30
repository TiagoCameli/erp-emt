import { describe, expect, it } from "vitest";

import {
  lerFiltrosCustoCc,
  TIPOS_CENTRO,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";

/**
 * O catálogo de tipos de centro não pode oferecer um filtro que a consulta não
 * responde.
 *
 * `fn_rel_custo_centro_custo` exclui `raiz.tipo = 'financeiro'`
 * incondicionalmente desde 27/08/2026 (empréstimo não é custo de obra, e a
 * análise mudou para o relatório Créditos). O catálogo ficou para trás e
 * continuava oferecendo "Financeiro": marcar devolvia 0 linhas e R$ 0,00 com a
 * mesma mensagem de "Sem custo neste período" que um filtro apertado demais dá —
 * então quem marcava lia que a EMT não tinha gasto financeiro no mês.
 */
describe("tipos de centro que o filtro oferece", () => {
  it("oferece só o que a RPC pode responder", () => {
    expect([...TIPOS_CENTRO]).toEqual(["obra", "escritorio", "manutencao"]);
  });

  it("`financeiro` na URL não vira filtro", () => {
    // Link antigo, favorito salvo ou URL montada na mão: o parâmetro é
    // descartado na validação, como qualquer valor fora do catálogo. Filtro
    // inválido chegando preenchido na barra faria a pessoa ler que o relatório
    // está filtrado quando ele não está, e o número ao lado é dinheiro.
    const { filtros } = lerFiltrosCustoCc(
      { tipo_centro: "financeiro" },
      "2026-08",
    );
    expect(filtros.tiposCentro).toEqual([]);
  });

  it("o que continua no catálogo continua passando", () => {
    // Linha de controle: se a leitura estivesse simplesmente devolvendo lista
    // vazia, o teste acima passaria por acidente.
    const { filtros } = lerFiltrosCustoCc(
      { tipo_centro: "obra,financeiro,manutencao" },
      "2026-08",
    );
    expect(filtros.tiposCentro).toEqual(["obra", "manutencao"]);
  });
});
