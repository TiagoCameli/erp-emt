import { describe, expect, it } from "vitest";

import { MESES_PAINEL } from "@/modules/gestao/calculo";
import { lerFiltrosPainel } from "@/modules/gestao/filtros";
import { MAX_ITENS_FILTRO } from "@/modules/financeiro/_shared/listas-na-url";

const HOJE = "2026-08";
const OBRA = "11111111-1111-4111-8111-111111111111";
const OUTRA_OBRA = "33333333-3333-4333-8333-333333333333";
const ETAPA = "44444444-4444-4444-8444-444444444444";
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
    expect(filtros.centroIds).toEqual([]);
    expect(filtros.etapaIds).toEqual([]);
    expect(filtros.categoriaIds).toEqual([]);
    expect(valores.mesDe).toBe("");
    expect(temRecorte).toBe(false);
    expect(periodoEscolhido).toBe(false);
  });

  it("aceita centro e categoria e devolve para a barra", () => {
    const { filtros, valores, temRecorte } = lerFiltrosPainel(
      { centro: OBRA, categoria: CATEGORIA },
      HOJE,
    );

    expect(filtros.centroIds).toEqual([OBRA]);
    expect(filtros.categoriaIds).toEqual([CATEGORIA]);
    expect(valores.centro).toEqual([OBRA]);
    expect(valores.categoria).toEqual([CATEGORIA]);
    expect(temRecorte).toBe(true);
  });

  /**
   * O link antigo do painel guardava UM id em `centro=`, e todo cartão desta tela
   * monta link assim desde que ela existe. Um id solto tem que continuar
   * significando exatamente o mesmo recorte, senão favorito e histórico do
   * navegador passam a abrir outro conjunto sem avisar.
   */
  it("link antigo de um id só continua valendo, como lista de um", () => {
    const { filtros } = lerFiltrosPainel({ centro: OBRA }, HOJE);
    expect(filtros.centroIds).toEqual([OBRA]);
  });

  it("aceita vários centros separados por vírgula, na ordem de escolha", () => {
    const { filtros } = lerFiltrosPainel(
      { centro: `${OUTRA_OBRA},${OBRA}` },
      HOJE,
    );
    expect(filtros.centroIds).toEqual([OUTRA_OBRA, OBRA]);
  });

  it("aceita a chave repetida, que é como um formulário mandaria", () => {
    const { filtros } = lerFiltrosPainel({ centro: [OBRA, OUTRA_OBRA] }, HOJE);
    expect(filtros.centroIds).toEqual([OBRA, OUTRA_OBRA]);
  });

  it("deduplica sem mudar a ordem de escolha", () => {
    const { filtros } = lerFiltrosPainel(
      { centro: `${OBRA},${OUTRA_OBRA},${OBRA}` },
      HOJE,
    );
    expect(filtros.centroIds).toEqual([OBRA, OUTRA_OBRA]);
  });

  it("a etapa viaja em parâmetro próprio, separada da raiz", () => {
    const { filtros, valores } = lerFiltrosPainel(
      { centro: OBRA, etapa: ETAPA },
      HOJE,
    );

    expect(filtros.centroIds).toEqual([OBRA]);
    expect(filtros.etapaIds).toEqual([ETAPA]);
    expect(valores.etapa).toEqual([ETAPA]);
  });

  /**
   * Etapa sem raiz é descartada antes do banco (`centrosEfetivos` exige o pai na
   * escolha), então sozinha ela não recorta nada. Acender o aviso de "total da
   * empresa, não filtrado" nos outros blocos faria a tela avisar de um recorte
   * que não existe.
   */
  it("etapa sozinha não liga o aviso de recorte", () => {
    const { temRecorte } = lerFiltrosPainel({ etapa: ETAPA }, HOJE);
    expect(temRecorte).toBe(false);
  });

  it("descarta uuid malformado em vez de mandar lixo pra RPC", () => {
    const { filtros, valores, temRecorte } = lerFiltrosPainel(
      { centro: "123", categoria: "'; drop table lancamentos; --" },
      HOJE,
    );

    expect(filtros.centroIds).toEqual([]);
    expect(filtros.categoriaIds).toEqual([]);
    expect(valores.centro).toEqual([]);
    // Sem recorte válido, os blocos que ignoram filtro não devem ganhar aviso.
    expect(temRecorte).toBe(false);
  });

  it("descarta só o item inválido, e mantém o resto da lista", () => {
    const { filtros } = lerFiltrosPainel({ centro: `${OBRA},123,` }, HOJE);
    expect(filtros.centroIds).toEqual([OBRA]);
  });

  /**
   * O teto não é gosto: a consulta filtra com `in`, e o PostgREST manda o filtro
   * na URL. Uuid ocupa 37 caracteres ali, e lista grande vira HTTP 400 por
   * tamanho antes de chegar na RLS.
   */
  it("corta a lista no teto em vez de estourar a URL da consulta", () => {
    const muitos = Array.from(
      { length: MAX_ITENS_FILTRO + 10 },
      (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    const { filtros } = lerFiltrosPainel({ centro: muitos.join(",") }, HOJE);
    expect(filtros.centroIds).toHaveLength(MAX_ITENS_FILTRO);
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
