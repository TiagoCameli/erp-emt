import { describe, expect, it } from "vitest";

import { FILTROS_REVISAO } from "@/modules/financeiro/lancamentos/schemas";
import {
  ALIAS_PENDENTES,
  ALIAS_RESOLVIDAS,
  aplicarRevisaoNoEmbed,
  revisaoNoEmbed,
  type ConsultaComSondaDeRevisao,
} from "@/modules/financeiro/lancamentos/revisao-no-embed";

/**
 * A tradução do filtro de revisão em pergunta de existência sobre as parcelas.
 *
 * O que estes testes travam é a EQUIVALÊNCIA com a classificação que a coluna
 * "Revisão" da tela faz por lançamento (em `queries.ts`), porque filtro e coluna
 * mostrando conjuntos diferentes é o pior defeito possível aqui: a pessoa
 * filtraria "Revisado" e veria linha marcada "Parcial".
 *
 * A tabela de estados, com `comConta` = parcelas pagas ou com conta bancária:
 *
 * | estado      | regra da coluna              | sondas                        |
 * | ----------- | ---------------------------- | ----------------------------- |
 * | `revisado`  | `comConta === total`, tot>0  | pendentes VAZIO + resolvidas  |
 * | `sem_conta` | `comConta === 0`, tot>0      | resolvidas VAZIO + pendentes  |
 * | `parcial`   | entre os dois                | as duas com linha             |
 */

/** Um dublê do builder que só anota o que recebeu. */
interface Chamada {
  metodo: string;
  coluna: string;
  valor: unknown;
  referencedTable?: string;
}

function dubleDeConsulta() {
  const chamadas: Chamada[] = [];
  const consulta: ConsultaComSondaDeRevisao<typeof consulta> = {
    eq: (coluna, valor) => {
      chamadas.push({ metodo: "eq", coluna, valor });
      return consulta;
    },
    neq: (coluna, valor) => {
      chamadas.push({ metodo: "neq", coluna, valor });
      return consulta;
    },
    is: (coluna, valor) => {
      chamadas.push({ metodo: "is", coluna, valor });
      return consulta;
    },
    not: (coluna, operador, valor) => {
      chamadas.push({ metodo: `not.${operador}`, coluna, valor });
      return consulta;
    },
    or: (filtro, opcoes) => {
      chamadas.push({
        metodo: "or",
        coluna: opcoes?.referencedTable ?? "",
        valor: filtro,
        referencedTable: opcoes?.referencedTable,
      });
      return consulta;
    },
  };
  return { consulta, chamadas };
}

/** As chamadas de um estado, já aplicadas no dublê. */
function chamadasDe(revisao: Parameters<typeof revisaoNoEmbed>[0]): Chamada[] {
  const { consulta, chamadas } = dubleDeConsulta();
  aplicarRevisaoNoEmbed(consulta, revisaoNoEmbed(revisao));
  return chamadas;
}

/** O teste do PAI: o embed entrou como "tem linha" ou como "vazio"? */
function presencaDo(chamadas: Chamada[], alias: string) {
  const teste = chamadas.find(
    (c) => c.coluna === alias && (c.metodo === "is" || c.metodo === "not.is"),
  );
  if (!teste) return "ausente";
  return teste.metodo === "is" ? "vazio" : "tem";
}

describe("revisaoNoEmbed", () => {
  it("todo estado do contrato tem tradução, e nenhuma é vazia", () => {
    // Trava de cobertura: estado novo em FILTROS_REVISAO sem tradução aqui
    // deixaria o filtro sair da URL para o banco sem nada, e a tela mostraria a
    // lista INTEIRA dizendo que filtrou.
    for (const estado of FILTROS_REVISAO) {
      const traducao = revisaoNoEmbed(estado);
      expect(
        traducao.pendentes ?? traducao.resolvidas,
        `estado sem sonda: ${estado}`,
      ).toBeDefined();
    }
  });

  it("revisado: nenhuma parcela pendente, e pelo menos uma resolvida", () => {
    const chamadas = chamadasDe("revisado");

    // Pendente é "sem conta e não paga", as duas condições ANDadas no embed.
    expect(chamadas).toEqual(
      expect.arrayContaining([
        {
          metodo: "neq",
          coluna: `${ALIAS_PENDENTES}.status`,
          valor: "pago",
        },
        {
          metodo: "is",
          coluna: `${ALIAS_PENDENTES}.conta_bancaria_id`,
          valor: null,
        },
      ]),
    );

    expect(presencaDo(chamadas, ALIAS_PENDENTES)).toBe("vazio");
    // Sem esta segunda sonda, lançamento SEM PARCELA entraria em "Revisado" — e
    // na coluna da tela ele é "-" (não se aplica).
    expect(presencaDo(chamadas, ALIAS_RESOLVIDAS)).toBe("tem");
    expect(
      chamadas.find((c) => c.metodo === "or")?.referencedTable,
    ).toBe(ALIAS_RESOLVIDAS);
  });

  it("sem_conta: nenhuma resolvida, e pelo menos uma pendente", () => {
    const chamadas = chamadasDe("sem_conta");

    expect(presencaDo(chamadas, ALIAS_RESOLVIDAS)).toBe("vazio");
    expect(presencaDo(chamadas, ALIAS_PENDENTES)).toBe("tem");
    // "Resolvida" tem dois ramos (paga OU com conta), e os dois têm que valer:
    // só `conta_bancaria_id.not.is.null` deixaria a parcela PAGA fora, e aí
    // lançamento quitado apareceria em "Sem conta".
    expect(
      chamadas.find((c) => c.referencedTable === ALIAS_RESOLVIDAS)?.valor,
    ).toBe("status.eq.pago,conta_bancaria_id.not.is.null");
  });

  it("parcial: tem pendente E tem resolvida", () => {
    const chamadas = chamadasDe("parcial");

    expect(presencaDo(chamadas, ALIAS_PENDENTES)).toBe("tem");
    expect(presencaDo(chamadas, ALIAS_RESOLVIDAS)).toBe("tem");
    // Nenhum anti-join aqui: os dois lados existem.
    expect(
      chamadas.some(
        (c) =>
          c.metodo === "is" &&
          (c.coluna === ALIAS_PENDENTES || c.coluna === ALIAS_RESOLVIDAS),
      ),
    ).toBe(false);
  });

  it("nao_revisado: basta uma parcela pendente", () => {
    const chamadas = chamadasDe("nao_revisado");

    expect(presencaDo(chamadas, ALIAS_PENDENTES)).toBe("tem");
    expect(presencaDo(chamadas, ALIAS_RESOLVIDAS)).toBe("ausente");
  });

  it("em_revisao é status de parcela, e vale nos dois tipos", () => {
    const chamadas = chamadasDe("em_revisao");

    expect(chamadas).toEqual(
      expect.arrayContaining([
        {
          metodo: "eq",
          coluna: `${ALIAS_PENDENTES}.status`,
          valor: "em_revisao",
        },
      ]),
    );
    expect(presencaDo(chamadas, ALIAS_PENDENTES)).toBe("tem");
    // O único que não é exclusivo de "a pagar": lançamento a receber também tem
    // parcela em revisão, e a consulta antiga não filtrava tipo neste ramo.
    expect(revisaoNoEmbed("em_revisao").soAPagar).toBe(false);
  });

  it("os quatro estados de conta são só de lançamento a pagar", () => {
    for (const estado of ["revisado", "sem_conta", "parcial", "nao_revisado"] as const) {
      expect(revisaoNoEmbed(estado).soAPagar, estado).toBe(true);
    }
  });

  it("nenhuma sonda encosta no embed que alimenta o dinheiro da linha", () => {
    // `lancamento_parcelas` sem alias é o que traz valor, desconto e a coluna
    // Revisão de cada linha. Filtrá-lo esconderia parcela da conta, e a linha
    // passaria a somar um PEDAÇO do lançamento.
    for (const estado of FILTROS_REVISAO) {
      for (const chamada of chamadasDe(estado)) {
        expect(
          `${chamada.coluna}`.startsWith("lancamento_parcelas"),
          `${estado} encostou em ${chamada.coluna}`,
        ).toBe(false);
      }
    }
  });
});
