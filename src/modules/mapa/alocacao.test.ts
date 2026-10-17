import { describe, expect, it } from "vitest";

import {
  avisoDaTrocaPelaMaquina,
  avisoDaTrocaPelaPessoa,
  itemDeVolta,
  itemParaRpc,
  loteDeVolta,
  maquinaRepetida,
  montarLote,
  opcoesMaquinaParaPessoa,
  opcoesOperadorParaMaquina,
  sugestaoDaMaquina,
  sugestaoDoLocal,
  textoDaAlocacao,
} from "@/modules/mapa/alocacao";
import { alocarSchema } from "@/modules/mapa/schemas";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";

describe("itemParaRpc", () => {
  it("campo ausente não vai, null vai como null", () => {
    expect(itemParaRpc({ colaboradorId: P1, equipamentoId: null })).toEqual({
      colaborador_id: P1,
      equipamento_id: null,
    });
    const saida = itemParaRpc({ colaboradorId: P1, centroCustoId: C1 });
    expect(saida).toEqual({ colaborador_id: P1, centro_custo_id: C1 });
    expect("equipamento_id" in saida).toBe(false);
  });

  it("o null sobrevive ao JSON (é ele que limpa no banco)", () => {
    const json = JSON.parse(
      JSON.stringify(itemParaRpc({ colaboradorId: P1, localidadeId: null })),
    );
    expect(json).toEqual({ colaborador_id: P1, localidade_id: null });
  });
});

describe("montarLote", () => {
  it("junta as edições da mesma pessoa; a última vence no mesmo campo", () => {
    expect(
      montarLote([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P2, centroCustoId: C1 },
        { colaboradorId: P1, centroCustoId: C1 },
        { colaboradorId: P1, equipamentoId: null },
      ]),
    ).toEqual([
      { colaboradorId: P1, equipamentoId: null, centroCustoId: C1 },
      { colaboradorId: P2, centroCustoId: C1 },
    ]);
  });

  it("edição sem campo some, e undefined não apaga o que veio antes", () => {
    expect(
      montarLote([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P1, equipamentoId: undefined },
        { colaboradorId: P2 },
      ]),
    ).toEqual([{ colaboradorId: P1, equipamentoId: M1 }]);
  });
});

describe("maquinaRepetida", () => {
  it("acha a máquina posta em duas pessoas e ignora null", () => {
    expect(
      maquinaRepetida([
        { colaboradorId: P1, equipamentoId: null },
        { colaboradorId: P2, equipamentoId: null },
      ]),
    ).toBeNull();
    expect(
      maquinaRepetida([
        { colaboradorId: P1, equipamentoId: M1 },
        { colaboradorId: P2, equipamentoId: M1 },
      ]),
    ).toBe(M1);
  });
});

describe("alocarSchema", () => {
  it("recusa lote vazio e campo desconhecido", () => {
    expect(alocarSchema.safeParse({ itens: [] }).success).toBe(false);
    expect(
      alocarSchema.safeParse({ itens: [{ colaboradorId: P1, frenteId: M1 }] })
        .success,
    ).toBe(false);
  });

  it("aceita null explícito para limpar", () => {
    const r = alocarSchema.safeParse({
      itens: [{ colaboradorId: P1, equipamentoId: null, centroCustoId: null }],
    });
    expect(r.success).toBe(true);
  });
});

const OBRA = "55555555-5555-4555-8555-555555555555";
const OUTRA_OBRA = "66666666-6666-4666-8666-666666666666";
const SILO = "77777777-7777-4777-8777-777777777777";

const maquina = (
  id: string,
  codigo: string,
  extra: Partial<{
    obraId: string | null;
    localidadeId: string | null;
    operadorId: string | null;
    operadorNome: string;
  }> = {},
) => ({
  id,
  codigo,
  descricao: "Escavadeira",
  placa: "",
  obraId: null,
  localidadeId: null,
  operadorId: null,
  operadorNome: "",
  ...extra,
});
const pessoa = (
  id: string,
  nome: string,
  extra: Partial<{
    funcao: string;
    obraId: string | null;
    localidadeId: string | null;
    equipamentoId: string | null;
    centroCustoId: string | null;
  }> = {},
) => ({
  id,
  nome,
  funcao: "",
  obraId: null,
  localidadeId: null,
  equipamentoId: null,
  centroCustoId: null,
  ...extra,
});

describe("opcoesMaquinaParaPessoa", () => {
  it("livres da obra da pessoa, depois ocupadas, depois o resto", () => {
    const joao = pessoa(P1, "João", { obraId: OBRA });
    const opcoes = opcoesMaquinaParaPessoa(joao, [
      maquina("a", "CB-009"),
      maquina("b", "CB-002", { obraId: OBRA, operadorId: P2, operadorNome: "Ana" }),
      maquina("c", "CB-005", { obraId: OBRA }),
      maquina("d", "CB-001"),
    ]);
    expect(opcoes.map((o) => o.valor)).toEqual(["c", "b", "d", "a"]);
    expect(opcoes[1]?.rotulo).toBe("CB-002 · Escavadeira · com Ana");
  });

  it("a máquina que a própria pessoa opera não conta como ocupada", () => {
    const joao = pessoa(P1, "João", { obraId: OBRA, equipamentoId: "b" });
    const opcoes = opcoesMaquinaParaPessoa(joao, [
      maquina("b", "CB-002", { obraId: OBRA, operadorId: P1, operadorNome: "João" }),
    ]);
    expect(opcoes[0]?.rotulo).toBe("CB-002 · Escavadeira");
  });
});

describe("opcoesOperadorParaMaquina", () => {
  it("operadores livres da obra primeiro; quem opera outra diz qual", () => {
    const cb = maquina(M1, "CB-001", { obraId: OBRA });
    const opcoes = opcoesOperadorParaMaquina(
      cb,
      [
        pessoa("z", "Zé", { obraId: OUTRA_OBRA, funcao: "Operador" }),
        pessoa("b", "Bia", { obraId: OBRA, funcao: "Servente" }),
        pessoa("c", "Caio", { obraId: OBRA, funcao: "Operador de máquinas", equipamentoId: "x" }),
        pessoa("d", "Davi", { obraId: OBRA, funcao: "Operadora de rolo" }),
      ],
      new Map([["x", "RL-003"]]),
    );
    expect(opcoes.map((o) => o.valor)).toEqual(["d", "b", "c", "z"]);
    expect(opcoes[2]?.rotulo).toBe("Caio · Operador de máquinas · opera RL-003");
  });
});

describe("avisos da troca", () => {
  it("pela pessoa: quem sai da máquina escolhida e a máquina que ela deixa", () => {
    const joao = pessoa(P1, "João", { equipamentoId: "velha" });
    expect(
      avisoDaTrocaPelaPessoa(
        joao,
        maquina(M1, "CB-001", { operadorId: P2, operadorNome: "Ana" }),
        "RL-003",
      ),
    ).toEqual(["Ana sai da CB-001", "João deixa a RL-003"]);
    expect(
      avisoDaTrocaPelaPessoa(pessoa(P1, "João"), maquina(M1, "CB-001"), null),
    ).toEqual([]);
  });

  it("pela máquina: de onde a pessoa sai e quem fica sem máquina", () => {
    const cb = maquina(M1, "CB-001", { operadorId: P2, operadorNome: "Ana" });
    expect(
      avisoDaTrocaPelaMaquina(
        cb,
        pessoa(P1, "João", { equipamentoId: "x" }),
        new Map([["x", "RL-003"]]),
      ),
    ).toEqual(["João sai da RL-003", "Ana fica sem máquina"]);
    expect(avisoDaTrocaPelaMaquina(cb, null, new Map())).toEqual([
      "Ana fica sem máquina",
    ]);
  });
});

describe("sugestões de um clique", () => {
  it("máquina: o local dela e o centro pela obra quando há centro escolhido", () => {
    const cb = maquina(M1, "CB-001", { localidadeId: SILO });
    expect(
      sugestaoDaMaquina(pessoa(P1, "João", { centroCustoId: C1 }), cb),
    ).toEqual({ colaboradorId: P1, localidadeId: SILO, centroCustoId: null });
    expect(
      sugestaoDaMaquina(pessoa(P1, "João", { localidadeId: SILO }), cb),
    ).toBeNull();
  });

  it("local: centro da obra só com centro escolhido e local de obra", () => {
    const comCentro = pessoa(P1, "João", { centroCustoId: C1 });
    expect(sugestaoDoLocal(comCentro, { obraId: OBRA })).toEqual({
      colaboradorId: P1,
      centroCustoId: null,
    });
    expect(sugestaoDoLocal(comCentro, { obraId: null })).toBeNull();
    expect(sugestaoDoLocal(pessoa(P1, "João"), { obraId: OBRA })).toBeNull();
  });
});

describe("textoDaAlocacao", () => {
  const ana = pessoa(P2, "Ana", { equipamentoId: M1 });
  const joao = pessoa(P1, "João", { equipamentoId: "rl" });
  const ctx = {
    pessoa: (id: string) => [ana, joao].find((p) => p.id === id),
    maquina: (id: string) =>
      [
        maquina(M1, "CB-001", { operadorId: P2, operadorNome: "Ana" }),
        maquina("rl", "RL-003", { operadorId: P1, operadorNome: "João" }),
      ].find((m) => m.id === id),
    nomeDoLocal: () => "Silo",
  };

  it("troca de máquina diz quem sai de onde", () => {
    expect(textoDaAlocacao([{ colaboradorId: P1, equipamentoId: M1 }], ctx)).toBe(
      "João opera CB-001 · Ana sai da CB-001 · João deixa a RL-003",
    );
    expect(textoDaAlocacao([{ colaboradorId: P2, equipamentoId: null }], ctx)).toBe(
      "Ana saiu da CB-001",
    );
  });

  it("local e centro, e lote de várias", () => {
    expect(
      textoDaAlocacao([{ colaboradorId: P1, localidadeId: SILO, centroCustoId: null }], ctx),
    ).toBe("João trabalha em Silo · centro pela obra");
    expect(textoDaAlocacao([{ colaboradorId: P1 }, { colaboradorId: P2 }], ctx)).toBe(
      "2 pessoas alocadas",
    );
  });
});

describe("itemDeVolta", () => {
  const antes = {
    ...pessoa(P1, "João", { localidadeId: SILO, centroCustoId: C1 }),
    obraMapaId: OBRA,
  };

  it("devolve só os campos mexidos; máquina traz a obra de volta junto", () => {
    expect(itemDeVolta(antes, { colaboradorId: P1, centroCustoId: null })).toEqual({
      colaboradorId: P1,
      centroCustoId: C1,
    });
    expect(itemDeVolta(antes, { colaboradorId: P1, equipamentoId: M1 })).toEqual({
      colaboradorId: P1,
      equipamentoId: null,
      localidadeId: SILO,
      obraId: OBRA,
    });
  });

  it("lote de volta: a pessoa volta e o operador de antes retoma a máquina", () => {
    const joao = { ...pessoa(P1, "João"), obraMapaId: null };
    expect(
      loteDeVolta(
        [{ colaboradorId: P1, equipamentoId: M1 }],
        new Map([[P1, joao]]),
        new Map([[M1, P2]]),
      ),
    ).toEqual([
      { colaboradorId: P1, equipamentoId: null, obraId: null },
      { colaboradorId: P2, equipamentoId: M1 },
    ]);
    // máquina que estava livre, ou cujo operador também está no lote: ninguém retoma
    expect(
      loteDeVolta(
        [{ colaboradorId: P1, equipamentoId: M1 }],
        new Map([[P1, joao]]),
        new Map([[M1, null]]),
      ),
    ).toHaveLength(1);
  });

  it("sem local antes, volta para a obra como local (ou nenhuma)", () => {
    const semLocal = { ...antes, localidadeId: null, obraMapaId: null };
    expect(itemDeVolta(semLocal, { colaboradorId: P1, localidadeId: SILO })).toEqual({
      colaboradorId: P1,
      obraId: null,
    });
  });
});
