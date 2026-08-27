import { describe, expect, it } from "vitest";

import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import {
  centrosEfetivos,
  etapasDasRaizes,
  etapasValidas,
  opcoesDeEtapa,
  opcoesDeRaiz,
  rotuloDasEtapas,
  temEtapasParaEscolher,
} from "@/modules/financeiro/relatorios/centros-e-etapas";

const OBRA = "11111111-1111-4111-8111-111111111111";
const MANUT = "22222222-2222-4222-8222-222222222222";
const MAQ_A = "33333333-3333-4333-8333-333333333333";
const MAQ_B = "44444444-4444-4444-8444-444444444444";
const ETAPA_OBRA = "55555555-5555-4555-8555-555555555555";
const ESCRITORIO = "66666666-6666-4666-8666-666666666666";

/**
 * O cadastro do jeito que ele é hoje, em miniatura: raízes sem código, uma raiz
 * de manutenção cheia de equipamentos e uma obra com etapa.
 */
const CADASTRO: CentroCustoOpcao[] = [
  { id: OBRA, nome: "009 - BR-364", codigo: null, paiId: null, tipo: "obra" },
  {
    id: ETAPA_OBRA,
    nome: "Terraplenagem",
    codigo: null,
    paiId: OBRA,
    tipo: null,
  },
  {
    id: MANUT,
    nome: "Manutenção/Documentação de Equipamentos",
    codigo: null,
    paiId: null,
    tipo: "manutencao",
  },
  {
    id: MAQ_A,
    nome: "CAMINHÃO BOIADEIRO/MILHO - L1620",
    codigo: null,
    paiId: MANUT,
    tipo: null,
  },
  {
    id: MAQ_B,
    nome: "ESCAVADEIRA CAT 320",
    codigo: null,
    paiId: MANUT,
    tipo: null,
  },
  {
    id: ESCRITORIO,
    nome: "Escritório Central",
    codigo: null,
    paiId: null,
    tipo: "escritorio",
  },
];

describe("opcoesDeRaiz", () => {
  it("oferece só as raízes — é o defeito que o campo duplo veio consertar", () => {
    // Com as etapas na mesma lista, 61 das 76 linhas do seletor eram a mesma
    // palavra truncada ("Manutenção/Docume…") e o nome que distingue uma da
    // outra ficava depois do corte.
    expect(opcoesDeRaiz(CADASTRO).map((opcao) => opcao.valor)).toEqual([
      OBRA,
      MANUT,
      ESCRITORIO,
    ]);
  });

  it("põe o código na frente quando ele existe", () => {
    const comCodigo = opcoesDeRaiz([
      { id: OBRA, nome: "BR-364", codigo: "009", paiId: null, tipo: "obra" },
    ]);
    expect(comCodigo[0]!.rotulo).toBe("009 · BR-364");
  });
});

describe("etapasDasRaizes / temEtapasParaEscolher", () => {
  it("sem raiz escolhida não há etapa a oferecer", () => {
    expect(etapasDasRaizes(CADASTRO, [])).toEqual([]);
    expect(temEtapasParaEscolher(CADASTRO, [])).toBe(false);
  });

  it("raiz sem filho não abre o segundo campo", () => {
    // O campo aparece quando há o que escolher e some quando não há: fixo, ele
    // ficaria vazio e inerte na maioria das aberturas da tela.
    expect(temEtapasParaEscolher(CADASTRO, [ESCRITORIO])).toBe(false);
  });

  it("traz só as etapas das raízes escolhidas", () => {
    expect(etapasDasRaizes(CADASTRO, [MANUT]).map((etapa) => etapa.id)).toEqual(
      [MAQ_A, MAQ_B],
    );
    expect(temEtapasParaEscolher(CADASTRO, [MANUT])).toBe(true);
  });
});

describe("opcoesDeEtapa", () => {
  it("com uma raiz só, o rótulo é o nome da etapa, sem o pai na frente", () => {
    expect(opcoesDeEtapa(CADASTRO, [MANUT]).map((o) => o.rotulo)).toEqual([
      "CAMINHÃO BOIADEIRO/MILHO - L1620",
      "ESCAVADEIRA CAT 320",
    ]);
  });

  it("com duas raízes com etapa, o pai volta ao rótulo para desempatar", () => {
    expect(opcoesDeEtapa(CADASTRO, [OBRA, MANUT]).map((o) => o.rotulo)).toEqual(
      [
        "009 - BR-364 › Terraplenagem",
        "Manutenção/Documentação de Equipamentos › CAMINHÃO BOIADEIRO/MILHO - L1620",
        "Manutenção/Documentação de Equipamentos › ESCAVADEIRA CAT 320",
      ],
    );
  });
});

describe("rotuloDasEtapas", () => {
  it("na manutenção o segundo campo se chama Equipamentos", () => {
    // Etapa de obra e equipamento são a mesma coisa no schema e coisas
    // diferentes na boca de quem preenche.
    expect(rotuloDasEtapas(CADASTRO, [MANUT])).toEqual({
      rotulo: "Equipamentos",
      todos: "Todos os equipamentos",
    });
  });

  it("na obra, e no misto, ele se chama Etapas", () => {
    expect(rotuloDasEtapas(CADASTRO, [OBRA]).rotulo).toBe("Etapas");
    expect(rotuloDasEtapas(CADASTRO, [OBRA, MANUT]).rotulo).toBe("Etapas");
  });
});

describe("etapasValidas", () => {
  it("desmarcar a raiz apaga as etapas dela", () => {
    // Sem isto o `etapa=<uuid>` fica pendurado na URL, invisível e vivo: basta
    // remarcar a raiz depois para o relatório voltar recortado por um
    // equipamento que ninguém lembra de ter escolhido.
    expect(etapasValidas(CADASTRO, [OBRA], [MAQ_A, ETAPA_OBRA])).toEqual([
      ETAPA_OBRA,
    ]);
  });

  it("etapa que não existe no cadastro não sobrevive", () => {
    expect(etapasValidas(CADASTRO, [MANUT], [ESCRITORIO])).toEqual([]);
  });
});

describe("centrosEfetivos", () => {
  it("sem raiz escolhida, manda lista vazia (= todos os centros)", () => {
    expect(centrosEfetivos(CADASTRO, [], [])).toEqual([]);
    // Etapa sozinha na URL não vira filtro: sem a raiz, o campo dela nem existe
    // na tela.
    expect(centrosEfetivos(CADASTRO, [], [MAQ_A])).toEqual([]);
  });

  it("raiz sem etapa escolhida vai inteira", () => {
    expect(centrosEfetivos(CADASTRO, [MANUT], [])).toEqual([MANUT]);
  });

  it("a etapa SUBSTITUI a raiz — a raiz junto traria as outras 59 máquinas", () => {
    expect(centrosEfetivos(CADASTRO, [MANUT], [MAQ_B])).toEqual([MAQ_B]);
  });

  it("duas raízes, uma recortada e a outra não", () => {
    expect(centrosEfetivos(CADASTRO, [OBRA, MANUT], [MAQ_A, MAQ_B])).toEqual([
      OBRA,
      MAQ_A,
      MAQ_B,
    ]);
  });

  it("etapa órfã é descartada aqui também, não só na tela", () => {
    // Esta função é a última porta antes do banco, e link colado à mão não
    // passa pela tela.
    expect(centrosEfetivos(CADASTRO, [MANUT], [ETAPA_OBRA])).toEqual([MANUT]);
  });
});
