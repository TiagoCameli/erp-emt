import { describe, expect, it } from "vitest";

import {
  facetasNoServidor,
  filtrarFacetado,
  restringirOpcoes,
  selecao,
} from "@/modules/_shared/filtros-facetados";

interface Ordem {
  fornecedor: string;
  status: string;
  categorias: string[];
  valor: number;
  nota: boolean;
}

const ORDENS: Ordem[] = [
  { fornecedor: "f1", status: "aprovado", categorias: ["pecas"], valor: 100, nota: true },
  { fornecedor: "f1", status: "pendente", categorias: ["material"], valor: 200, nota: false },
  { fornecedor: "f2", status: "aprovado", categorias: ["material", "frete"], valor: 300, nota: true },
  { fornecedor: "f3", status: "rascunho", categorias: ["pecas"], valor: 5000, nota: false },
];

const FORNECEDORES = [
  { valor: "f1", rotulo: "Fornecedor 1" },
  { valor: "f2", rotulo: "Fornecedor 2" },
  { valor: "f3", rotulo: "Fornecedor 3" },
  { valor: "f4", rotulo: "Fornecedor sem compra" },
];
const STATUS = [
  { valor: "rascunho", rotulo: "Rascunho" },
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "aprovado", rotulo: "Aprovado" },
];
const CATEGORIAS = [
  { valor: "pecas", rotulo: "Peças" },
  { valor: "material", rotulo: "Material" },
  { valor: "frete", rotulo: "Frete" },
];
const NOTA = [
  { valor: "com", rotulo: "Com nota" },
  { valor: "sem", rotulo: "Sem nota" },
];

function montar(filtros: {
  fornecedor?: string;
  status?: string[];
  categoria?: string;
  nota?: string;
  valorAte?: number;
}) {
  return filtrarFacetado(
    ORDENS,
    {
      fornecedor: { selecionados: selecao(filtros.fornecedor), chave: (o) => o.fornecedor },
      status: { selecionados: filtros.status ?? [], chave: (o) => o.status },
      categoria: { selecionados: selecao(filtros.categoria), chave: (o) => o.categorias },
      nota: {
        selecionados: selecao(filtros.nota),
        casa: (o, valor) => (valor === "com" ? o.nota : !o.nota),
      },
    },
    filtros.valorAte === undefined ? [] : [(o) => o.valor <= filtros.valorAte!],
  );
}

const valores = (opcoes: { valor: string }[]) => opcoes.map((o) => o.valor);

describe("filtrarFacetado", () => {
  it("sem filtro, tudo passa e só some a opção que não tem linha nenhuma", () => {
    const r = montar({});
    expect(r.linhas).toHaveLength(4);
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2", "f3"]);
  });

  it("um filtro restringe as opções dos OUTROS", () => {
    const r = montar({ fornecedor: "f1" });
    expect(r.linhas).toHaveLength(2);
    expect(valores(r.opcoes("status", STATUS))).toEqual(["pendente", "aprovado"]);
    expect(valores(r.opcoes("categoria", CATEGORIAS))).toEqual(["pecas", "material"]);
  });

  it("o filtro não se restringe por ele mesmo: dá para trocar de opção", () => {
    const r = montar({ fornecedor: "f1" });
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2", "f3"]);
  });

  it("dois filtros: cada um vê o recorte do outro", () => {
    const r = montar({ fornecedor: "f1", status: ["aprovado"] });
    expect(r.linhas).toHaveLength(1);
    // Fornecedores com alguma OC aprovada; status do f1.
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2"]);
    expect(valores(r.opcoes("status", STATUS))).toEqual(["pendente", "aprovado"]);
  });

  it("filtro livre (valor, data, busca) restringe as listas", () => {
    const r = montar({ valorAte: 1000 });
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2"]);
    expect(valores(r.opcoes("status", STATUS))).toEqual(["pendente", "aprovado"]);
  });

  it("o valor escolhido nunca some, mesmo sem linha", () => {
    const r = montar({ fornecedor: "f3", valorAte: 1000 });
    expect(r.linhas).toHaveLength(0);
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2", "f3"]);
  });

  it("seleção múltipla junta as linhas de cada valor", () => {
    const r = montar({ status: ["aprovado", "rascunho"] });
    expect(r.linhas).toHaveLength(3);
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f2", "f3"]);
    expect(valores(r.opcoes("categoria", CATEGORIAS))).toEqual(["pecas", "material", "frete"]);
  });

  it("chave com vários valores (array) casa qualquer um", () => {
    const r = montar({ categoria: "frete" });
    expect(r.linhas).toHaveLength(1);
    expect(valores(r.opcoes("fornecedor", FORNECEDORES))).toEqual(["f2"]);
  });

  it("predicado livre (`casa`) para opção que não é valor da linha", () => {
    expect(valores(montar({ fornecedor: "f2" }).opcoes("nota", NOTA))).toEqual(["com"]);
    expect(valores(montar({ nota: "sem" }).opcoes("fornecedor", FORNECEDORES))).toEqual(["f1", "f3"]);
  });

  it("filtro desconhecido devolve a base intacta", () => {
    const r = montar({});
    // @ts-expect-error id que não existe
    expect(r.opcoes("outro", STATUS)).toEqual(STATUS);
  });
});

describe("restringirOpcoes", () => {
  it("mantém a ordem da base e o escolhido", () => {
    expect(
      valores(restringirOpcoes(FORNECEDORES, new Set(["f3", "f1"]), ["f4"])),
    ).toEqual(["f1", "f3", "f4"]);
  });
});

describe("facetasNoServidor", () => {
  it("uma consulta para os vazios e uma por filtro preenchido, sem ele", async () => {
    const chamadas: (string | null)[] = [];
    const facetas = await facetasNoServidor(
      {
        fornecedor: { ativo: true, chave: (o: Ordem) => o.fornecedor },
        status: { ativo: false, chave: (o: Ordem) => o.status },
        categoria: { ativo: false, chave: (o: Ordem) => o.categorias },
      },
      async (exceto) => {
        chamadas.push(exceto);
        // Simula o banco: fornecedor = f1 aplicado, exceto quando excluído.
        return ORDENS.filter((o) => exceto === "fornecedor" || o.fornecedor === "f1");
      },
    );
    expect(chamadas.sort()).toEqual(["fornecedor", null].sort());
    expect(facetas.fornecedor.sort()).toEqual(["f1", "f2", "f3"]);
    expect(facetas.status.sort()).toEqual(["aprovado", "pendente"]);
    expect(facetas.categoria.sort()).toEqual(["material", "pecas"]);
  });

  it("sem filtro vazio, não roda a consulta com tudo", async () => {
    const chamadas: (string | null)[] = [];
    await facetasNoServidor(
      { status: { ativo: true, chave: (o: Ordem) => o.status } },
      async (exceto) => {
        chamadas.push(exceto);
        return ORDENS;
      },
    );
    expect(chamadas).toEqual(["status"]);
  });
});
