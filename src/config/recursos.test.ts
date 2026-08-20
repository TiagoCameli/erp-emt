import { describe, expect, it } from "vitest";

import {
  ACOES,
  MODULOS,
  RECURSOS,
  recursoPorId,
  recursosDoModulo,
  type Acao,
  type RecursoId,
} from "@/config/recursos";

const idsDeModulos = new Set<string>(MODULOS.map((m) => m.id));
const acoesValidas = new Set<Acao>(ACOES);

describe("RECURSOS", () => {
  it("todo recurso tem id no formato modulo.aba", () => {
    for (const recurso of RECURSOS) {
      const partes = recurso.id.split(".");
      expect(partes, `id mal formado: ${recurso.id}`).toHaveLength(2);
      expect(partes[0].length, `modulo vazio em: ${recurso.id}`).toBeGreaterThan(0);
      expect(partes[1].length, `aba vazia em: ${recurso.id}`).toBeGreaterThan(0);
    }
  });

  it("o prefixo do id bate com o campo modulo do recurso", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.id.split(".")[0], `id ${recurso.id} não bate com modulo ${recurso.modulo}`).toBe(
        recurso.modulo,
      );
    }
  });

  it("o modulo de todo recurso existe em MODULOS", () => {
    for (const recurso of RECURSOS) {
      expect(
        idsDeModulos.has(recurso.modulo),
        `modulo ${recurso.modulo} do recurso ${recurso.id} não existe em MODULOS`,
      ).toBe(true);
    }
  });

  it("ids são únicos", () => {
    const ids = RECURSOS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rotas são únicas", () => {
    const rotas = RECURSOS.map((r) => r.rota);
    expect(new Set(rotas).size).toBe(rotas.length);
  });

  it("acoes só contém ações do catálogo ACOES e nunca é vazia", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.acoes.length, `recurso ${recurso.id} sem ações`).toBeGreaterThan(0);
      for (const acao of recurso.acoes) {
        expect(
          acoesValidas.has(acao),
          `ação ${acao} do recurso ${recurso.id} não existe em ACOES`,
        ).toBe(true);
      }
    }
  });

  it("todo recurso de ver tem a ação ver (pré-requisito das demais)", () => {
    for (const recurso of RECURSOS) {
      expect(recurso.acoes, `recurso ${recurso.id} sem ação ver`).toContain("ver");
    }
  });
});

describe("recursoPorId", () => {
  it("retorna o recurso para um id conhecido", () => {
    const recurso = recursoPorId("administracao.usuarios");
    expect(recurso.nome).toBe("Usuários e permissões");
    expect(recurso.rota).toBe("/administracao/usuarios");
  });

  it("lança para id desconhecido", () => {
    expect(() => recursoPorId("modulo.inexistente" as RecursoId)).toThrowError(
      /Recurso desconhecido/,
    );
  });
});

describe("recursosDoModulo", () => {
  it("retorna os 5 recursos de administracao", () => {
    const recursos = recursosDoModulo("administracao");
    expect(recursos).toHaveLength(5);
    expect(recursos.map((r) => r.id).sort()).toEqual([
      "administracao.auditoria",
      "administracao.configuracoes",
      "administracao.lixeira",
      "administracao.perfis",
      "administracao.usuarios",
    ]);
  });

  /**
   * A ORDEM desta lista é a ordem do submenu da sidebar: `abasVisiveis` só
   * filtra por permissão, não reordena. Por isso ela se testa — mover um item
   * aqui move a aba na tela de todo mundo, e a ordem do Financeiro foi pedida
   * pelo Tiago (20/08/2026), não é acidente de digitação.
   *
   * Recebimentos vem logo depois de Pagamentos porque é o par dele: o dinheiro
   * que sai e o dinheiro que entra, lidos na mesma sequência. Transferências
   * fecha o trio na sequência seguinte: o dinheiro que só muda de conta.
   */
  it("o Financeiro sai na ordem pedida, com Recebimentos logo depois de Pagamentos", () => {
    expect(recursosDoModulo("financeiro").map((r) => r.id)).toEqual([
      "financeiro.lancamentos",
      "financeiro.aprovacao-pagamentos",
      "financeiro.pagamentos",
      "financeiro.recebimentos",
      "financeiro.transferencias",
      "financeiro.competencias",
      "financeiro.programados",
      "financeiro.contas-bancarias",
      "financeiro.conciliacao",
      "financeiro.relatorios",
    ]);
  });

  /**
   * As duas categorias moram em Cadastros e são cadastros diferentes: insumo e
   * plano de contas. O que se testa aqui é que elas continuam DUAS e vizinhas —
   * fundir as chaves faria a permissão de uma abrir a outra.
   */
  it("Cadastros tem as duas categorias, com nomes que se distinguem", () => {
    const cadastros = recursosDoModulo("cadastros");
    const ids = cadastros.map((r) => r.id);

    const posInsumo = ids.indexOf("cadastros.categorias");
    const posFinanceiras = ids.indexOf("cadastros.categorias-financeiras");
    expect(posInsumo).toBeGreaterThanOrEqual(0);
    expect(posFinanceiras).toBe(posInsumo + 1);

    // Nome distinto é requisito, não estética: "Categorias" duas vezes no mesmo
    // submenu faz escolher a errada, e aí um custo é classificado no lugar
    // errado do relatório.
    const nomes = cadastros
      .filter((r) => r.id.startsWith("cadastros.categorias"))
      .map((r) => r.nome);
    expect(nomes).toEqual(["Categorias de insumo", "Categorias financeiras"]);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("LINHA DE CONTROLE: nenhum recurso sobrou no Financeiro chamado Categorias", () => {
    // Se a entrada antiga tivesse ficado para trás, a aba apareceria nos dois
    // módulos e as duas apontariam para rotas diferentes da mesma tabela.
    expect(
      recursosDoModulo("financeiro").map((r) => r.id),
    ).not.toContain("financeiro.categorias");
  });

  it("LINHA DE CONTROLE: Recebimentos é o vizinho imediato de Pagamentos", () => {
    // Asserção independente da lista inteira: se alguém acrescentar uma aba
    // nova ao Financeiro, o teste de cima passa a falhar por um motivo legítimo
    // (a lista cresceu) e este continua guardando o que foi pedido de fato.
    const ids = recursosDoModulo("financeiro").map((r) => r.id);
    const posPagamentos = ids.indexOf("financeiro.pagamentos");
    const posRecebimentos = ids.indexOf("financeiro.recebimentos");

    expect(posPagamentos).toBeGreaterThanOrEqual(0);
    expect(posRecebimentos).toBe(posPagamentos + 1);
  });
});

describe("módulo Gestão", () => {
  it("Gestão é o primeiro módulo (vira a home de quem o vê)", () => {
    expect(MODULOS[0].id).toBe("gestao");
    expect(MODULOS[0].rota).toBe("/gestao");
  });

  it("existe o recurso gestao.painel só com a ação ver", () => {
    const painel = RECURSOS.find((r) => r.id === "gestao.painel");
    expect(painel, "recurso gestao.painel não encontrado").toBeDefined();
    expect(painel?.modulo).toBe("gestao");
    expect(painel?.rota).toBe("/gestao");
    expect([...(painel?.acoes ?? [])]).toEqual(["ver"]);
  });
});
