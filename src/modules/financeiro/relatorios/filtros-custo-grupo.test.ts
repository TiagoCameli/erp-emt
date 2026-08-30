import { describe, expect, it } from "vitest";

import { centrosEfetivos } from "@/modules/_shared/centro-custo/filtro";
import { lerFiltrosCustoGrupo } from "@/modules/financeiro/relatorios/filtros-custo-grupo";

const OBRA = "11111111-1111-4111-8111-111111111111";
const MANUTENCAO = "22222222-2222-4222-8222-222222222222";
const ESCAVADEIRA = "33333333-3333-4333-8333-333333333333";
const CATEGORIA = "44444444-4444-4444-8444-444444444444";
const CORRENTE = "2026-08";

/**
 * A URL do custo por grupo de insumo. O que estes testes travam é que só o que
 * passou na validação chega na tela: filtro inválido aparecendo preenchido na
 * barra faz a pessoa ler que o relatório está filtrado quando ele não está, e o
 * número ao lado é dinheiro.
 */
describe("lerFiltrosCustoGrupo", () => {
  it("sem parâmetro nenhum, é o mês corrente e nada filtrado", () => {
    expect(lerFiltrosCustoGrupo({}, CORRENTE)).toEqual({
      modo: "mes",
      mes: CORRENTE,
      de: "",
      ate: "",
      centroId: "",
      etapaId: "",
      categoriaId: "",
    });
  });

  it("lê centro, etapa e categoria", () => {
    const filtros = lerFiltrosCustoGrupo(
      { centro: MANUTENCAO, etapa: ESCAVADEIRA, categoria: CATEGORIA },
      CORRENTE,
    );
    expect(filtros.centroId).toBe(MANUTENCAO);
    expect(filtros.etapaId).toBe(ESCAVADEIRA);
    expect(filtros.categoriaId).toBe(CATEGORIA);
  });

  it("o que não é uuid não vira filtro", () => {
    const filtros = lerFiltrosCustoGrupo(
      { centro: "todos", categoria: "12" },
      CORRENTE,
    );
    expect(filtros.centroId).toBe("");
    expect(filtros.categoriaId).toBe("");
  });

  it("link do custo por centro de custo, com vários centros, abre pelo primeiro", () => {
    // Os dois relatórios compartilham os nomes dos parâmetros de propósito (é o
    // mesmo recorte de competência), mas lá a escolha é múltipla e aqui a RPC
    // recebe `p_centro_custo uuid`. Vale o primeiro, e é ele que a barra mostra:
    // a tela e o número continuam dizendo a mesma coisa.
    expect(
      lerFiltrosCustoGrupo({ centro: `${OBRA},${MANUTENCAO}` }, CORRENTE)
        .centroId,
    ).toBe(OBRA);
  });

  it("o período vem do contrato compartilhado", () => {
    const filtros = lerFiltrosCustoGrupo(
      { modo: "periodo", de: "2026-01", ate: "2026-03" },
      CORRENTE,
    );
    expect(filtros.modo).toBe("periodo");
    expect(filtros.de).toBe("2026-01");
    expect(filtros.ate).toBe("2026-03");
  });
});

describe("a escada de centro vira o id que vai ao banco", () => {
  const CADASTRO = [
    { id: OBRA, nome: "BR-364", codigo: "009", paiId: null, tipo: "obra" },
    {
      id: MANUTENCAO,
      nome: "Manutenção",
      codigo: null,
      paiId: null,
      tipo: "manutencao",
    },
    {
      id: ESCAVADEIRA,
      nome: "ESCAVADEIRA CAT 320",
      codigo: null,
      paiId: MANUTENCAO,
      tipo: null,
    },
  ] as const;

  /** O que a página monta: um id só, ou nenhum. */
  function idParaOBanco(centroId: string, etapaId: string): string | undefined {
    return centrosEfetivos(
      [...CADASTRO],
      centroId ? [centroId] : [],
      etapaId ? [etapaId] : [],
    )[0];
  }

  it("sem escolha, vai indefinido (todos os centros)", () => {
    expect(idParaOBanco("", "")).toBeUndefined();
  });

  it("só a raiz vale pela subárvore dela", () => {
    expect(idParaOBanco(MANUTENCAO, "")).toBe(MANUTENCAO);
  });

  it("a etapa SUBSTITUI a raiz", () => {
    // Mandar as duas traria a raiz inteira junto — as outras 60 máquinas — e o
    // número contradiria o filtro que a pessoa acabou de montar.
    expect(idParaOBanco(MANUTENCAO, ESCAVADEIRA)).toBe(ESCAVADEIRA);
  });

  it("etapa órfã (de outra raiz) é descartada", () => {
    expect(idParaOBanco(OBRA, ESCAVADEIRA)).toBe(OBRA);
  });
});
