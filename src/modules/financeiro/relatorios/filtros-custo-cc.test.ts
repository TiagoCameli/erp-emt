import { describe, expect, it } from "vitest";

import {
  comparacaoPermitida,
  lerFiltrosCustoCc,
  periodoAnterior,
  periodoDoModo,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";

const MES_CORRENTE = "2026-08";
const CENTRO = "fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0";
const OUTRO_CENTRO = "bfbd54dc-f303-4d5b-a505-f441d0f81142";
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const FORNECEDOR = "22222222-2222-4222-8222-222222222222";
const FORMA = "33333333-3333-4333-8333-333333333333";

/**
 * Mesmo contrato do de lançamentos: só o que passou na validação chega na tela,
 * porque filtro inválido aparecendo preenchido na barra faz o usuário ler que o
 * relatório está filtrado quando ele não está — e o número na tela é dinheiro.
 */
describe("lerFiltrosCustoCc", () => {
  it("sem parâmetro nenhum, é o mês corrente e nada filtrado", () => {
    const { filtros } = lerFiltrosCustoCc({}, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
    expect(filtros.mes).toBe(MES_CORRENTE);
    expect(filtros.comparar).toBe(false);
    // Falso = previsto DENTRO, que é o comportamento do relatório de hoje. O
    // filtro é o exclude, para o padrão não mudar um número de dinheiro calado.
    expect(filtros.excluirPrevisto).toBe(false);
    expect(filtros.centroIds).toEqual([]);
    expect(filtros.categoriaIds).toEqual([]);
    expect(filtros.fornecedorIds).toEqual([]);
    expect(filtros.formaIds).toEqual([]);
    expect(filtros.semForma).toBe(false);
    expect(filtros.status).toEqual([]);
    expect(filtros.tiposCentro).toEqual([]);
  });

  it("modo inválido cai no mês, sem inventar período", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "sempre" }, MES_CORRENTE);
    expect(filtros.modo).toBe("mes");
  });

  it("mês inválido na URL não vira filtro", () => {
    for (const mes of ["2026-13", "2026-00", "2026-7", "julho", ""]) {
      const { filtros } = lerFiltrosCustoCc({ mes }, MES_CORRENTE);
      expect(filtros.mes).toBe(MES_CORRENTE);
    }
  });

  it("período invertido é trocado de lado", () => {
    // Período invertido traria a tela vazia sem explicação nenhuma.
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2026-07", ate: "2025-01" },
      MES_CORRENTE,
    );
    expect(filtros.de).toBe("2025-01");
    expect(filtros.ate).toBe("2026-07");
  });

  it("modo vida sem centro devolve o motivo", () => {
    // Vida é por centro: sem centro escolhido o modo não tem de onde tirar o
    // início, e precisa DIZER isso em vez de cair calado em outro período.
    const { filtros, erroDoModo } = lerFiltrosCustoCc(
      { modo: "vida" },
      MES_CORRENTE,
    );
    expect(filtros.modo).toBe("vida");
    expect(erroDoModo).toMatch(/centro de custo/i);
  });

  it("modo vida com um centro não tem erro", () => {
    const { erroDoModo } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(erroDoModo).toBeUndefined();
  });

  it("modo vida com vários centros não tem erro", () => {
    // Vida de várias obras ao mesmo tempo é o pedido: uma linha por obra, cada
    // uma começando quando ela começou.
    const { filtros, erroDoModo } = lerFiltrosCustoCc(
      { modo: "vida", centro: `${CENTRO},${OUTRO_CENTRO}` },
      MES_CORRENTE,
    );
    expect(erroDoModo).toBeUndefined();
    expect(filtros.centroIds).toEqual([CENTRO, OUTRO_CENTRO]);
  });

  it("lê os filtros de escolha como lista", () => {
    const { filtros } = lerFiltrosCustoCc(
      {
        centro: `${CENTRO},${OUTRO_CENTRO}`,
        categoria: CATEGORIA,
        fornecedor: FORNECEDOR,
        forma: FORMA,
        sem_forma: "1",
        status: "pago,aprovado",
        tipo_centro: "obra,escritorio",
        sem_previsto: "1",
        comparar: "1",
      },
      MES_CORRENTE,
    );
    expect(filtros.centroIds).toEqual([CENTRO, OUTRO_CENTRO]);
    expect(filtros.categoriaIds).toEqual([CATEGORIA]);
    expect(filtros.fornecedorIds).toEqual([FORNECEDOR]);
    expect(filtros.formaIds).toEqual([FORMA]);
    expect(filtros.semForma).toBe(true);
    // Na ordem do catálogo, não na de clique: o texto do gatilho não pode mudar
    // conforme a sequência em que a pessoa marcou.
    expect(filtros.status).toEqual(["aprovado", "pago"]);
    expect(filtros.tiposCentro).toEqual(["obra", "escritorio"]);
    expect(filtros.excluirPrevisto).toBe(true);
    expect(filtros.comparar).toBe(true);
  });

  it("link antigo com um valor por filtro continua valendo", () => {
    // A tela viveu meses escrevendo um id por parâmetro. Link salvo não pode
    // virar "sem filtro" em silêncio.
    const { filtros } = lerFiltrosCustoCc(
      { centro: CENTRO, categoria: CATEGORIA, fornecedor: FORNECEDOR },
      MES_CORRENTE,
    );
    expect(filtros.centroIds).toEqual([CENTRO]);
    expect(filtros.categoriaIds).toEqual([CATEGORIA]);
    expect(filtros.fornecedorIds).toEqual([FORNECEDOR]);
  });

  it("sem_previsto, sem_forma e comparar ligam só no literal 1", () => {
    for (const valor of ["0", "true", "sim", ""]) {
      const { filtros } = lerFiltrosCustoCc(
        { sem_previsto: valor, comparar: valor, sem_forma: valor },
        MES_CORRENTE,
      );
      expect(filtros.excluirPrevisto).toBe(false);
      expect(filtros.comparar).toBe(false);
      expect(filtros.semForma).toBe(false);
    }
  });

  it("tipo_centro e status fora do catálogo não viram filtro", () => {
    const { filtros } = lerFiltrosCustoCc(
      { tipo_centro: "almoxarifado", status: "cancelado,previsto" },
      MES_CORRENTE,
    );
    expect(filtros.tiposCentro).toEqual([]);
    // `cancelado` o relatório exclui sempre e `previsto` tem marcador próprio:
    // aceitar os dois aqui deixaria a tela dizer duas coisas ao mesmo tempo.
    expect(filtros.status).toEqual([]);
  });

  it("catálogo aceita o que vale e descarta o resto na mesma lista", () => {
    const { filtros } = lerFiltrosCustoCc(
      { status: "pago,cancelado", tipo_centro: "obra,fazenda" },
      MES_CORRENTE,
    );
    expect(filtros.status).toEqual(["pago"]);
    expect(filtros.tiposCentro).toEqual(["obra"]);
  });

  it("uuid inválido em qualquer lista não vira filtro", () => {
    const { filtros } = lerFiltrosCustoCc(
      { centro: "abc", categoria: "123", fornecedor: "x-y-z", forma: "nada" },
      MES_CORRENTE,
    );
    expect(filtros.centroIds).toEqual([]);
    expect(filtros.categoriaIds).toEqual([]);
    expect(filtros.fornecedorIds).toEqual([]);
    expect(filtros.formaIds).toEqual([]);
  });

  it("id válido no meio de lixo sobrevive", () => {
    const { filtros } = lerFiltrosCustoCc(
      { centro: `abc,${CENTRO},,123` },
      MES_CORRENTE,
    );
    expect(filtros.centroIds).toEqual([CENTRO]);
  });

  it("chave repetida vira lista nos filtros de escolha, e não no modo", () => {
    const { filtros } = lerFiltrosCustoCc(
      {
        modo: ["mes", "total"],
        mes: ["2026-07", "2026-08"],
        centro: [CENTRO, OUTRO_CENTRO],
      },
      MES_CORRENTE,
    );
    // Modo e mês são valor único: chave repetida ali é URL mal montada.
    expect(filtros.modo).toBe("mes");
    expect(filtros.mes).toBe(MES_CORRENTE);
    // Já centro é lista: chave repetida é como um formulário mandaria.
    expect(filtros.centroIds).toEqual([CENTRO, OUTRO_CENTRO]);
  });

  it("centro repetido é contado uma vez", () => {
    const { filtros } = lerFiltrosCustoCc(
      { centro: `${CENTRO},${CENTRO}` },
      MES_CORRENTE,
    );
    expect(filtros.centroIds).toEqual([CENTRO]);
  });
});

describe("periodoDoModo", () => {
  it("mes devolve o mês", () => {
    const { filtros } = lerFiltrosCustoCc({ mes: "2026-07" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({ mes: "2026-07" });
  });

  it("periodo devolve as duas pontas", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "periodo", de: "2025-01", ate: "2026-07" },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros)).toEqual({ de: "2025-01", ate: "2026-07" });
  });

  it("total não devolve limite nenhum", () => {
    const { filtros } = lerFiltrosCustoCc({ modo: "total" }, MES_CORRENTE);
    expect(periodoDoModo(filtros)).toEqual({});
  });

  it("vida vai do primeiro mês recebido até o mês corrente", () => {
    const { filtros } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros, "2025-01")).toEqual({
      de: "2025-01",
      ate: MES_CORRENTE,
    });
  });

  it("vida com vários centros usa o primeiro mês mais antigo recebido", () => {
    // A janela tem que caber a vida mais antiga. O recorte de cada linha por
    // centro é feito no banco, não aqui.
    const { filtros } = lerFiltrosCustoCc(
      { modo: "vida", centro: `${CENTRO},${OUTRO_CENTRO}` },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros, "2024-03")).toEqual({
      de: "2024-03",
      ate: MES_CORRENTE,
    });
  });

  it("vida sem primeiro mês devolve período vazio", () => {
    // Centro sem lançamento nenhum: período vazio é honesto, um período inventado
    // mostraria zero como se fosse um dado medido.
    const { filtros } = lerFiltrosCustoCc(
      { modo: "vida", centro: CENTRO },
      MES_CORRENTE,
    );
    expect(periodoDoModo(filtros, undefined)).toEqual({});
  });
});

describe("periodoAnterior", () => {
  it("do mês, é o mês anterior", () => {
    expect(periodoAnterior({ mes: "2026-01" })).toEqual({ mes: "2025-12" });
    expect(periodoAnterior({ mes: "2026-08" })).toEqual({ mes: "2026-07" });
  });

  it("do período, é a janela de mesmo tamanho imediatamente antes", () => {
    // 3 meses (jan, fev, mar) -> os 3 anteriores (out, nov, dez)
    expect(periodoAnterior({ de: "2026-01", ate: "2026-03" })).toEqual({
      de: "2025-10",
      ate: "2025-12",
    });
  });

  it("de um mês só em de/ate, é o mês anterior", () => {
    expect(periodoAnterior({ de: "2026-03", ate: "2026-03" })).toEqual({
      de: "2026-02",
      ate: "2026-02",
    });
  });

  it("janela de 12 meses recua 12 meses", () => {
    expect(periodoAnterior({ de: "2026-01", ate: "2026-12" })).toEqual({
      de: "2025-01",
      ate: "2025-12",
    });
  });

  it("não existe anterior a tudo", () => {
    expect(periodoAnterior({})).toBeNull();
  });

  it("período com uma ponta só não tem anterior definido", () => {
    expect(periodoAnterior({ de: "2026-01" })).toBeNull();
    expect(periodoAnterior({ ate: "2026-01" })).toBeNull();
  });
});

describe("comparacaoPermitida", () => {
  it("vale no mês e no período, não no total nem na vida", () => {
    // Em total não existe anterior a "tudo", e em vida o anterior ao primeiro
    // lançamento é vazio: os dois mostrariam variação de 100% contra zero, que se
    // lê como a obra tendo dobrado de custo.
    expect(comparacaoPermitida("mes")).toBe(true);
    expect(comparacaoPermitida("periodo")).toBe(true);
    expect(comparacaoPermitida("total")).toBe(false);
    expect(comparacaoPermitida("vida")).toBe(false);
  });
});
