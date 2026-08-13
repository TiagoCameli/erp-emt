import { describe, expect, it } from "vitest";

import {
  ALTURA_CABECALHO_MAXIMA,
  ALTURA_CABECALHO_MINIMA,
  ALTURA_LINHA_MAXIMA,
  ALTURA_LINHA_MINIMA,
  PESOS_CABECALHO,
  chavePreferenciasTabela,
  escreverPreferenciasTabela,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  lerPreferenciasTabela,
  ordemEfetiva,
  preferenciasVazias,
  VERSAO_PREFERENCIAS,
} from "./preferencias-tabela";

const IDS = ["numero", "fornecedor", "valorTotal", "status"];

describe("chavePreferenciasTabela", () => {
  it("separa por tabela e por usuário", () => {
    expect(chavePreferenciasTabela("compras.ordens", "u1")).not.toBe(
      chavePreferenciasTabela("compras.ordens", "u2"),
    );
    expect(chavePreferenciasTabela("compras.ordens", "u1")).not.toBe(
      chavePreferenciasTabela("compras.cotacoes", "u1"),
    );
  });

  it("cai em anonimo sem usuário e carrega a versão", () => {
    const chave = chavePreferenciasTabela("compras.ordens");
    expect(chave).toContain("anonimo");
    expect(chave).toContain(`v${VERSAO_PREFERENCIAS}`);
  });
});

describe("lerPreferenciasTabela", () => {
  it("devolve null para ausente, vazio e JSON inválido", () => {
    expect(lerPreferenciasTabela(null, IDS)).toBeNull();
    expect(lerPreferenciasTabela(undefined, IDS)).toBeNull();
    expect(lerPreferenciasTabela("", IDS)).toBeNull();
    expect(lerPreferenciasTabela("{isso não é json", IDS)).toBeNull();
    expect(lerPreferenciasTabela("[1,2,3]", IDS)).toBeNull();
    expect(lerPreferenciasTabela("null", IDS)).toBeNull();
  });

  it("descarta versão diferente da atual", () => {
    const antigo = JSON.stringify({ versao: 0, visiveis: { numero: false } });
    expect(lerPreferenciasTabela(antigo, IDS)).toBeNull();
  });

  it("lê visíveis, ordem e larguras válidas", () => {
    const salvo = escreverPreferenciasTabela({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: ["status", "numero"],
      larguras: { numero: 120 },
      filtros: {},
      alturaLinha: null,
      alturaCabecalho: null,
      pesoCabecalho: null,
    });

    expect(lerPreferenciasTabela(salvo, IDS)).toEqual({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: ["status", "numero"],
      larguras: { numero: 120 },
      filtros: {},
      alturaLinha: null,
      alturaCabecalho: null,
      pesoCabecalho: null,
    });
  });

  it("joga fora coluna que não existe mais na tela", () => {
    const salvo = escreverPreferenciasTabela({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { colunaMorta: false, status: false },
      ordem: ["colunaMorta", "status"],
      larguras: { colunaMorta: 300, status: 100 },
      filtros: {},
      alturaLinha: null,
      alturaCabecalho: null,
      pesoCabecalho: null,
    });

    const lido = lerPreferenciasTabela(salvo, IDS);

    expect(lido?.visiveis).toEqual({ status: false });
    expect(lido?.ordem).toEqual(["status"]);
    expect(lido?.larguras).toEqual({ status: 100 });
  });

  it("ignora tipos errados em vez de quebrar a tela", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { numero: "sim", status: false },
      ordem: "numero",
      larguras: { numero: "grande", status: Number.NaN },
    });

    expect(lerPreferenciasTabela(salvo, IDS)).toEqual({
      versao: VERSAO_PREFERENCIAS,
      visiveis: { status: false },
      ordem: [],
      larguras: {},
      filtros: {},
      alturaLinha: null,
      alturaCabecalho: null,
      pesoCabecalho: null,
    });
  });

  it("trava largura no mínimo e no máximo, e arredonda", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      larguras: { numero: 1, fornecedor: 99999, status: 120.6 },
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.larguras).toEqual({
      numero: LARGURA_MINIMA,
      fornecedor: LARGURA_MAXIMA,
      status: 121,
    });
  });

  it("não repete id na ordem", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      ordem: ["numero", "numero", "status"],
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.ordem).toEqual(["numero", "status"]);
  });
});

describe("preferenciasVazias", () => {
  it("é neutra e sobrevive à ida e volta", () => {
    const vazias = preferenciasVazias();
    expect(vazias.visiveis).toEqual({});
    expect(vazias.ordem).toEqual([]);
    expect(vazias.larguras).toEqual({});
    expect(lerPreferenciasTabela(escreverPreferenciasTabela(vazias), IDS)).toEqual(
      vazias,
    );
  });
});

describe("ordemEfetiva", () => {
  it("respeita a ordem salva e joga coluna nova pro fim", () => {
    expect(ordemEfetiva(["status", "numero"], IDS)).toEqual([
      "status",
      "numero",
      "fornecedor",
      "valorTotal",
    ]);
  });

  it("sem ordem salva devolve a ordem natural", () => {
    expect(ordemEfetiva([], IDS)).toEqual(IDS);
  });

  it("ignora id salvo que não existe mais", () => {
    expect(ordemEfetiva(["morta", "status"], IDS)).toEqual([
      "status",
      "numero",
      "fornecedor",
      "valorTotal",
    ]);
  });
});

describe("filtros visíveis na preferência", () => {
  it("guarda e sanea os filtros contra os ids que a tela tem hoje", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      visiveis: {},
      ordem: [],
      larguras: {},
      filtros: { status: false, inventado: true, tipo: "sim" },
    });

    const lido = lerPreferenciasTabela(salvo, IDS, ["status", "tipo"]);

    // "inventado" não existe mais na tela e "tipo" veio com tipo errado: nenhum
    // dos dois pode sobrar, senão uma preferência velha esconde filtro que a
    // pessoa não tem como trazer de volta.
    expect(lido?.filtros).toEqual({ status: false });
  });

  it("sem lista de filtros, nada é aproveitado", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      visiveis: {},
      ordem: [],
      larguras: {},
      filtros: { status: false },
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.filtros).toEqual({});
  });
});

describe("altura da linha na preferência", () => {
  function lerAltura(alturaLinha: unknown): number | null | undefined {
    const salvo = JSON.stringify({ versao: VERSAO_PREFERENCIAS, alturaLinha });
    return lerPreferenciasTabela(salvo, IDS)?.alturaLinha;
  }

  it("trava no mínimo e no máximo, e arredonda", () => {
    expect(lerAltura(1)).toBe(ALTURA_LINHA_MINIMA);
    expect(lerAltura(-40)).toBe(ALTURA_LINHA_MINIMA);
    expect(lerAltura(99999)).toBe(ALTURA_LINHA_MAXIMA);
    expect(lerAltura(40.6)).toBe(41);
  });

  it("aceita valor dentro dos limites como está", () => {
    expect(lerAltura(ALTURA_LINHA_MINIMA)).toBe(ALTURA_LINHA_MINIMA);
    expect(lerAltura(52)).toBe(52);
    expect(lerAltura(ALTURA_LINHA_MAXIMA)).toBe(ALTURA_LINHA_MAXIMA);
  });

  it("ignora valor absurdo e cai em automática", () => {
    // Tudo que não é número utilizável tem que virar automática, nunca uma
    // altura inventada: altura fixa errada CLIPA o conteúdo da pessoa.
    expect(lerAltura("alta")).toBeNull();
    expect(lerAltura(Number.NaN)).toBeNull();
    expect(lerAltura(Number.POSITIVE_INFINITY)).toBeNull();
    expect(lerAltura(true)).toBeNull();
    expect(lerAltura({ px: 40 })).toBeNull();
    expect(lerAltura([40])).toBeNull();
  });

  it("null sobrevive à ida e à volta", () => {
    const salvo = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      larguras: { numero: 120 },
      alturaLinha: null,
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.alturaLinha).toBeNull();
  });

  it("altura escolhida sobrevive à ida e à volta", () => {
    const salvo = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      alturaLinha: 52,
    });

    expect(lerPreferenciasTabela(salvo, IDS)?.alturaLinha).toBe(52);
  });

  it("blob v2 sem alturaLinha continua sendo lido inteiro", () => {
    // ESTE é o teste que protege a configuração de todo mundo: a altura entrou
    // sem subir VERSAO_PREFERENCIAS, então o que foi salvo antes dela existir
    // tem que continuar valendo. Se alguém subir a versão, isto quebra primeiro.
    const salvoAntesDaAltura = JSON.stringify({
      versao: 2,
      visiveis: { status: false },
      ordem: ["status", "numero", "fornecedor", "valorTotal"],
      larguras: { numero: 120, fornecedor: 240 },
      filtros: { status: false },
    });

    const lido = lerPreferenciasTabela(salvoAntesDaAltura, IDS, ["status"]);

    expect(lido).toEqual({
      versao: 2,
      visiveis: { status: false },
      ordem: ["status", "numero", "fornecedor", "valorTotal"],
      larguras: { numero: 120, fornecedor: 240 },
      filtros: { status: false },
      alturaLinha: null,
      alturaCabecalho: null,
      pesoCabecalho: null,
    });
  });

  it("a versão do formato continua 2: subir apaga a configuração de todo mundo", () => {
    expect(VERSAO_PREFERENCIAS).toBe(2);
  });

  it("blob sem os campos do cabeçalho continua sendo lido inteiro", () => {
    // Mesma proteção do teste acima, para os dois campos que entraram depois:
    // altura e peso do cabeçalho também não subiram a versão.
    const salvoAntesDoCabecalho = JSON.stringify({
      versao: 2,
      visiveis: { status: false },
      ordem: ["status", "numero", "fornecedor", "valorTotal"],
      larguras: { numero: 120 },
      filtros: {},
      alturaLinha: 52,
    });

    const lido = lerPreferenciasTabela(salvoAntesDoCabecalho, IDS, ["status"]);

    expect(lido?.alturaLinha).toBe(52);
    expect(lido?.alturaCabecalho).toBeNull();
    expect(lido?.pesoCabecalho).toBeNull();
  });

  it("o mínimo é 34, a altura do botão de ação da linha", () => {
    // 32 do botão + 2 de folga de borda. Os 32 são o `size="icon-sm"` do `⋮` e o
    // `size="sm"` dos botões Aprovar/Revisar, que moram DENTRO da linha. O preset
    // "Compacta" usa exatamente este mínimo, então baixar para 28 volta a decepar
    // esses botões em toda listagem do app. Não é detalhe de gosto.
    expect(ALTURA_LINHA_MINIMA).toBe(34);
    expect(ALTURA_LINHA_MINIMA).toBeGreaterThanOrEqual(32);
  });
});

describe("altura do cabeçalho na preferência", () => {
  function ler(alturaCabecalho: unknown): number | null | undefined {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      alturaCabecalho,
    });
    return lerPreferenciasTabela(salvo, IDS)?.alturaCabecalho;
  }

  it("trava no mínimo e no máximo, e arredonda", () => {
    expect(ler(1)).toBe(ALTURA_CABECALHO_MINIMA);
    expect(ler(-40)).toBe(ALTURA_CABECALHO_MINIMA);
    expect(ler(99999)).toBe(ALTURA_CABECALHO_MAXIMA);
    expect(ler(44.6)).toBe(45);
  });

  it("ignora valor absurdo e cai em automática", () => {
    // Altura fixa errada CLIPA o rótulo, e rótulo cortado esconde qual coluna a
    // pessoa está lendo. Qualquer lixo tem que virar automática.
    expect(ler("alto")).toBeNull();
    expect(ler(Number.NaN)).toBeNull();
    expect(ler(true)).toBeNull();
    expect(ler({ px: 40 })).toBeNull();
  });

  it("sobrevive à ida e à volta", () => {
    const salvo = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      alturaCabecalho: 56,
    });
    expect(lerPreferenciasTabela(salvo, IDS)?.alturaCabecalho).toBe(56);
  });

  it("o mínimo cabe uma linha de rótulo", () => {
    // Abaixo disso o texto do cabeçalho sai decepado no meio da letra, o que é
    // pior que qualquer densidade que a pessoa queira.
    expect(ALTURA_CABECALHO_MINIMA).toBeGreaterThanOrEqual(28);
  });
});

describe("peso do rótulo do cabeçalho na preferência", () => {
  function ler(pesoCabecalho: unknown): number | null | undefined {
    const salvo = JSON.stringify({ versao: VERSAO_PREFERENCIAS, pesoCabecalho });
    return lerPreferenciasTabela(salvo, IDS)?.pesoCabecalho;
  }

  it("aceita só os pesos que o menu oferece", () => {
    for (const peso of PESOS_CABECALHO) {
      expect(ler(peso)).toBe(peso);
    }
  });

  it("recusa peso fora da lista em vez de inventar um", () => {
    // Peso arbitrário viraria fonte sintética em alguns navegadores (Inter não
    // tem todos os pesos), então a lista é fechada de propósito.
    expect(ler(450)).toBeNull();
    expect(ler(900)).toBeNull();
    expect(ler(0)).toBeNull();
    expect(ler("bold")).toBeNull();
    expect(ler(true)).toBeNull();
  });

  it("sobrevive à ida e à volta", () => {
    const salvo = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      pesoCabecalho: 600,
    });
    expect(lerPreferenciasTabela(salvo, IDS)?.pesoCabecalho).toBe(600);
  });

  it("500 está na lista, porque é o peso de hoje", () => {
    // Se 500 sair da lista, a preferência de quem escolheu "Médio" morre calada.
    expect(PESOS_CABECALHO).toContain(500);
  });
});
