import { describe, expect, it } from "vitest";

import { MESES_PAINEL } from "@/modules/gestao/calculo";
import { lerFiltrosPainel } from "@/modules/gestao/filtros";

const HOJE = "2026-08";
const OBRA = "11111111-1111-4111-8111-111111111111";
const CATEGORIA = "22222222-2222-4222-8222-222222222222";

/**
 * A URL do painel é o que decide de que conjunto todos os gráficos falam. Filtro
 * que passa quando não devia manda lixo para o parâmetro da RPC; filtro que cai
 * fora quando devia valer faz a tela mostrar o total com cara de recorte.
 */
describe("lerFiltrosPainel", () => {
  it("sem parâmetro, mantém a janela padrão do painel", () => {
    const { filtros, valores, temRecorte, periodoEscolhido } =
      lerFiltrosPainel({}, HOJE);

    expect(filtros.janela.meses).toHaveLength(MESES_PAINEL);
    // Termina no mês corrente, que é o comportamento que a tela sempre teve.
    expect(filtros.janela.meses[MESES_PAINEL - 1]).toBe("2026-08-01");
    expect(filtros.janela.inicio).toBe("2026-03-01");
    expect(filtros.janela.fim).toBe("2026-09-01");
    expect(filtros.centroCustoId).toBeUndefined();
    expect(filtros.categoriaId).toBeUndefined();
    expect(valores.mesDe).toBe("");
    expect(temRecorte).toBe(false);
    expect(periodoEscolhido).toBe(false);
  });

  it("aceita obra e categoria e devolve para a barra", () => {
    const { filtros, valores, temRecorte } = lerFiltrosPainel(
      { centro: OBRA, categoria: CATEGORIA },
      HOJE,
    );

    expect(filtros.centroCustoId).toBe(OBRA);
    expect(filtros.categoriaId).toBe(CATEGORIA);
    expect(valores.centro).toBe(OBRA);
    expect(valores.categoria).toBe(CATEGORIA);
    expect(temRecorte).toBe(true);
  });

  it("descarta uuid malformado em vez de mandar lixo pra RPC", () => {
    const { filtros, valores, temRecorte } = lerFiltrosPainel(
      { centro: "123", categoria: "'; drop table lancamentos; --" },
      HOJE,
    );

    expect(filtros.centroCustoId).toBeUndefined();
    expect(filtros.categoriaId).toBeUndefined();
    expect(valores.centro).toBe("");
    // Sem recorte válido, os blocos que ignoram filtro não devem ganhar aviso.
    expect(temRecorte).toBe(false);
  });

  it("período com as duas pontas vale o intervalo, com o fim inclusivo na tela", () => {
    const { filtros, valores, periodoEscolhido } = lerFiltrosPainel(
      { mes_de: "2026-01", mes_ate: "2026-03" },
      HOJE,
    );

    expect(filtros.janela.meses).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    // Março escolhido mostra março: o limite exclusivo é abril.
    expect(filtros.janela.fim).toBe("2026-04-01");
    expect(valores.mesDe).toBe("2026-01");
    expect(valores.mesAte).toBe("2026-03");
    expect(periodoEscolhido).toBe(true);
  });

  it("só o mês inicial abre até o mês corrente", () => {
    const { filtros } = lerFiltrosPainel({ mes_de: "2026-06" }, HOJE);

    expect(filtros.janela.meses).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("só o mês final abre os seis meses anteriores a ele", () => {
    const { filtros } = lerFiltrosPainel({ mes_ate: "2026-03" }, HOJE);

    expect(filtros.janela.meses).toHaveLength(MESES_PAINEL);
    expect(filtros.janela.meses[0]).toBe("2025-10-01");
    expect(filtros.janela.fim).toBe("2026-04-01");
  });

  it("período invertido é trocado de lado em vez de zerar a tela", () => {
    const { filtros } = lerFiltrosPainel(
      { mes_de: "2026-08", mes_ate: "2026-06" },
      HOJE,
    );

    expect(filtros.janela.meses).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("mês fora do formato ou fora de 1 a 12 cai fora", () => {
    for (const mes of ["2026-13", "2026-00", "26-08", "2026-8", "agosto"]) {
      const { filtros, valores } = lerFiltrosPainel({ mes_de: mes }, HOJE);
      expect(valores.mesDe).toBe("");
      // Sem período válido, volta para a janela padrão.
      expect(filtros.janela.meses).toHaveLength(MESES_PAINEL);
    }
  });

  it("chave repetida na URL não vale (é array, não string)", () => {
    const { filtros } = lerFiltrosPainel({ centro: [OBRA, OBRA] }, HOJE);
    expect(filtros.centroCustoId).toBeUndefined();
  });

  it("período sozinho NÃO liga o aviso dos blocos não filtrados", () => {
    // Os blocos de fora são foto do momento ("o que está em aberto hoje"), e
    // "hoje" não muda com o período escolhido. Avisar ali seria ruído.
    const { temRecorte } = lerFiltrosPainel(
      { mes_de: "2026-01", mes_ate: "2026-03" },
      HOJE,
    );
    expect(temRecorte).toBe(false);
  });

  it("atravessa o ano sem tropeçar", () => {
    const { filtros } = lerFiltrosPainel(
      { mes_de: "2025-11", mes_ate: "2026-02" },
      HOJE,
    );

    expect(filtros.janela.meses).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
    expect(filtros.janela.fim).toBe("2026-03-01");
  });
});
