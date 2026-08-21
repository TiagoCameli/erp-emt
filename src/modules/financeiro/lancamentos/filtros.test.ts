import { describe, expect, it } from "vitest";

import {
  TAMANHO_PADRAO,
  TIPO_PADRAO,
  lerFiltrosLancamentos,
  parametrosDaQueryString,
} from "@/modules/financeiro/lancamentos/filtros";

const FORNECEDOR = "11111111-1111-4111-8111-111111111111";

/**
 * A leitura da URL é o contrato entre a lista da tela e a planilha do Excel: as
 * duas passam por aqui. Se um filtro válido cair no caminho, a planilha sai com
 * mais lançamentos do que a tela mostra; se um filtro inválido passar, sai com
 * menos. Nos dois casos o relatório contradiz o sistema sem avisar ninguém.
 */
describe("lerFiltrosLancamentos", () => {
  it("sem parâmetro nenhum, só o TIPO vem preenchido, no padrão", () => {
    const { filtros, valores, pagina, tamanho } = lerFiltrosLancamentos({});

    // Tipo é o único filtro obrigatório desta tela: a lista é sempre de "a
    // pagar" ou de "a receber", nunca das duas juntas, porque os cartões do topo
    // somam o filtro inteiro e misturar entrada com saída faz "Total no filtro"
    // não querer dizer nada.
    expect(filtros.tipo).toBe(TIPO_PADRAO);
    expect(valores.tipo).toBe(TIPO_PADRAO);
    // Linha de controle: o padrão é "a pagar" mesmo, e não "o primeiro da lista"
    // por acidente.
    expect(TIPO_PADRAO).toBe("a_pagar");

    expect(filtros.status).toBeUndefined();
    expect(filtros.mesCompetencia).toBeUndefined();
    expect(filtros.busca).toBe("");
    expect(pagina).toBe(0);
    expect(tamanho).toBe(TAMANHO_PADRAO);
  });

  it("aceita os filtros válidos e devolve os mesmos valores para a tela", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      tipo: "a_receber",
      status: "pago",
      revisao: "nao_revisado",
      origem: "oc",
      fornecedor: FORNECEDOR,
      mes: "2026-07",
      busca: "combustível",
    });

    expect(filtros.tipo).toBe("a_receber");
    expect(filtros.status).toBe("pago");
    expect(filtros.revisao).toBe("nao_revisado");
    expect(filtros.origem).toBe("oc");
    expect(filtros.fornecedorIds).toEqual([FORNECEDOR]);
    // O banco guarda a competência normalizada no dia 1; a tela mostra yyyy-MM.
    expect(filtros.mesCompetencia).toBe("2026-07-01");
    expect(valores.mes).toBe("2026-07");
    expect(valores.status).toBe("pago");
    expect(valores.fornecedores).toEqual([FORNECEDOR]);
  });

  it("aceita o filtro de atraso e devolve para a barra", () => {
    const vencido = lerFiltrosLancamentos({ atraso: "vencido" });
    expect(vencido.filtros.atraso).toBe("vencido");
    expect(vencido.valores.atraso).toBe("vencido");

    const aVencer = lerFiltrosLancamentos({ atraso: "a_vencer" });
    expect(aVencer.filtros.atraso).toBe("a_vencer");
  });

  it("atraso fora do catálogo cai fora, sem filtrar por lixo", () => {
    // "vencidos" no plural e "atrasado" são os erros de digitação prováveis em
    // link colado na mão.
    for (const valor of ["vencidos", "atrasado", "true", ""]) {
      const { filtros, valores } = lerFiltrosLancamentos({ atraso: valor });
      expect(filtros.atraso).toBeUndefined();
      expect(valores.atraso).toBe("");
    }
  });

  it("descarta valor fora do catálogo em vez de mandar lixo pro banco", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      tipo: "a_pagar_talvez",
      status: "em_revisao", // status de PARCELA, não de lançamento
      origem: "cotacao", // cotação não gera lançamento
      revisao: "quase",
    });

    // Tipo inválido cai no PADRÃO, e não em "todos": esta tela não tem "todos".
    expect(filtros.tipo).toBe(TIPO_PADRAO);
    expect(valores.tipo).toBe(TIPO_PADRAO);
    expect(filtros.status).toBeUndefined();
    expect(filtros.origem).toBeUndefined();
    expect(filtros.revisao).toBeUndefined();
    // E não pode aparecer preenchido na barra como se estivesse valendo.
    expect(valores.status).toBe("");
  });

  it("descarta uuid malformado (senão o PostgREST devolve erro cru)", () => {
    const { filtros } = lerFiltrosLancamentos({
      fornecedor: "123",
      categoria: "'; drop table lancamentos; --",
      centro: FORNECEDOR,
    });

    expect(filtros.fornecedorIds).toEqual([]);
    expect(filtros.categoriaIds).toEqual([]);
    expect(filtros.centroCustoIds).toEqual([FORNECEDOR]);
  });

  it("endireita período invertido em vez de devolver lista vazia", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      venc_de: "2026-08-31",
      venc_ate: "2026-08-01",
    });

    expect(filtros.vencimentoDe).toBe("2026-08-01");
    expect(filtros.vencimentoAte).toBe("2026-08-31");
    expect(valores.vencDe).toBe("2026-08-01");
  });

  it("endireita faixa de valor invertida e recusa valor negativo", () => {
    const { filtros } = lerFiltrosLancamentos({
      valor_de: "5000",
      valor_ate: "100",
    });
    expect(filtros.valorDe).toBe(100);
    expect(filtros.valorAte).toBe(5000);

    const negativo = lerFiltrosLancamentos({ valor_de: "-1" });
    expect(negativo.filtros.valorDe).toBeUndefined();
  });

  it("página da URL conta de 1, o banco conta de 0", () => {
    expect(lerFiltrosLancamentos({ pagina: "3" }).pagina).toBe(2);
    // Página inválida volta para a primeira, não para NaN.
    expect(lerFiltrosLancamentos({ pagina: "0" }).pagina).toBe(0);
    expect(lerFiltrosLancamentos({ pagina: "abc" }).pagina).toBe(0);
    expect(lerFiltrosLancamentos({ tamanho: "100" }).tamanho).toBe(100);
    expect(lerFiltrosLancamentos({ tamanho: "-5" }).tamanho).toBe(
      TAMANHO_PADRAO,
    );
  });

  it("chave repetida na URL não vale como filtro (é array, não string)", () => {
    const { filtros } = lerFiltrosLancamentos({
      tipo: ["a_pagar", "a_receber"],
    });
    // Não vale como escolha, então cai no padrão -- nunca em "os dois tipos",
    // que é exatamente o que este parâmetro repetido parecia pedir.
    expect(filtros.tipo).toBe(TIPO_PADRAO);
  });

  /**
   * O tipo tem três degraus de precedência, e o do meio existe para não quebrar o
   * drill-down do relatório de aging.
   */
  describe("de onde vem o tipo quando a URL não escolhe", () => {
    it("a escolha da URL ganha de tudo", () => {
      const { filtros } = lerFiltrosLancamentos({
        tipo: "a_receber",
        recorte: "aging:v_1_7:a_pagar",
      });
      expect(filtros.tipo).toBe("a_receber");
    });

    it("sem tipo na URL, o recorte de AGING manda o dele", () => {
      const { filtros, valores } = lerFiltrosLancamentos({
        recorte: "aging:v_1_7:a_receber",
      });
      // Sem este degrau, clicar numa faixa de aging de A RECEBER abriria a lista
      // filtrada em "a pagar" e ela viria vazia -- o pior tipo de defeito, o que
      // não dá erro. `drillAging` é o único drill que não manda `tipo` na URL,
      // justamente porque o recorte já carrega ele dentro.
      expect(filtros.tipo).toBe("a_receber");
      expect(valores.tipo).toBe("a_receber");
    });

    it("recorte que NÃO carrega tipo cai no padrão", () => {
      // Fluxo e conta paga misturam os dois tipos por natureza, e por isso os
      // drills deles mandam `tipo` na URL. Chegando aqui sem ele, o padrão vale.
      expect(
        lerFiltrosLancamentos({ recorte: "fluxo:2026-08:realizado" }).filtros
          .tipo,
      ).toBe(TIPO_PADRAO);
      expect(
        lerFiltrosLancamentos({ recorte: "conta_paga" }).filtros.tipo,
      ).toBe(TIPO_PADRAO);
    });

    it("recorte de aging inválido não sequestra o tipo", () => {
      const { filtros } = lerFiltrosLancamentos({
        recorte: "aging:faixa_inventada:a_receber",
      });
      expect(filtros.tipo).toBe(TIPO_PADRAO);
    });
  });
});

/**
 * A exportação recebe a query string crua da tela e precisa enxergá-la do MESMO
 * jeito que a página enxerga os searchParams do App Router, chave repetida
 * incluída: senão a planilha aceitaria um filtro que a lista descarta.
 */
describe("parametrosDaQueryString", () => {
  it("lê a query string como a página lê os searchParams", () => {
    const params = parametrosDaQueryString(
      "tipo=a_pagar&mes=2026-07&busca=combust%C3%ADvel",
    );
    expect(params).toEqual({
      tipo: "a_pagar",
      mes: "2026-07",
      busca: "combustível",
    });
  });

  it("chave repetida vira array, igual ao App Router", () => {
    expect(parametrosDaQueryString("tipo=a_pagar&tipo=a_receber")).toEqual({
      tipo: ["a_pagar", "a_receber"],
    });
  });

  it("query vazia não inventa parâmetro", () => {
    expect(parametrosDaQueryString("")).toEqual({});
  });

  it("query da tela e searchParams da página levam ao mesmo filtro", () => {
    const query = `tipo=a_pagar&status=aprovado&fornecedor=${FORNECEDOR}&venc_de=2026-08-01&pagina=2`;
    const daQuery = lerFiltrosLancamentos(parametrosDaQueryString(query));
    const daPagina = lerFiltrosLancamentos({
      tipo: "a_pagar",
      status: "aprovado",
      fornecedor: FORNECEDOR,
      venc_de: "2026-08-01",
      pagina: "2",
    });

    expect(daQuery.filtros).toEqual(daPagina.filtros);
  });
});

/**
 * Os dois parâmetros que o drill-down dos relatórios acrescenta, mais a faixa de
 * mês de referência que o modo "período" do relatório de centro de custo precisa.
 *
 * `recorte` é o mais delicado: um recorte inválido que passasse faria os cartões
 * da tela somarem uma fatia que ninguém pediu, e um que fosse descartado do
 * filtro mas sobrasse na barra diria ao usuário que a lista está recortada quando
 * ela não está.
 */
describe("lerFiltrosLancamentos: sem_cancelado, recorte e faixa de competência", () => {
  it("lê sem_cancelado=1 como filtro e devolve o valor para a barra", () => {
    const { filtros, valores } = lerFiltrosLancamentos({ sem_cancelado: "1" });
    expect(filtros.semCancelado).toBe(true);
    expect(valores.semCancelado).toBe("1");
  });

  it("ignora sem_cancelado com qualquer outro valor", () => {
    for (const valor of ["0", "sim", "true", ""]) {
      const { filtros, valores } = lerFiltrosLancamentos({
        sem_cancelado: valor,
      });
      expect(filtros.semCancelado).toBeUndefined();
      expect(valores.semCancelado).toBe("");
    }
  });

  it("lê o recorte válido", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      recorte: "aging:v_16_30:a_pagar",
    });
    expect(filtros.recorte).toEqual({
      tipo: "aging",
      faixa: "v_16_30",
      tipoLancamento: "a_pagar",
    });
    expect(valores.recorte).toBe("aging:v_16_30:a_pagar");
  });

  it("descarta recorte inválido do filtro E da barra", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      recorte: "aging:banana:a_pagar",
    });
    expect(filtros.recorte).toBeUndefined();
    expect(valores.recorte).toBe("");
  });

  it("lê a faixa de mês de referência como período de datas", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      comp_de: "2025-01-01",
      comp_ate: "2026-07-31",
    });
    expect(filtros.competenciaDe).toBe("2025-01-01");
    expect(filtros.competenciaAte).toBe("2026-07-31");
    expect(valores.compDe).toBe("2025-01-01");
    expect(valores.compAte).toBe("2026-07-31");
  });

  it("troca de lado a faixa de competência invertida", () => {
    const { filtros } = lerFiltrosLancamentos({
      comp_de: "2026-07-31",
      comp_ate: "2025-01-01",
    });
    expect(filtros.competenciaDe).toBe("2025-01-01");
    expect(filtros.competenciaAte).toBe("2026-07-31");
  });

  it("convive com os filtros que já existiam", () => {
    const { filtros } = lerFiltrosLancamentos({
      centro: "0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e",
      mes: "2026-07",
      tipo: "a_pagar",
      sem_cancelado: "1",
    });
    expect(filtros.centroCustoIds).toEqual([
      "0a327d7e-6e2d-40d9-a87b-cf9b4a76be2e",
    ]);
    expect(filtros.mesCompetencia).toBe("2026-07-01");
    expect(filtros.tipo).toBe("a_pagar");
    expect(filtros.semCancelado).toBe(true);
  });
});

/**
 * "A pagar" no filtro de status passou a significar A SITUAÇÃO DO DINHEIRO, não
 * o status exato do documento.
 *
 * Medido em 15/08/2026: 86 lançamentos têm status `a_pagar` (R$ 1,90 mi) e 107
 * têm status `aprovado` — TODOS com saldo em aberto, somando R$ 9,84 mi. Quem
 * filtrava "A pagar" para achar o que a empresa deve encontrava 16% da dívida e
 * ia embora achando que tinha visto tudo.
 */
describe("lerFiltrosLancamentos: 'A pagar' é situação, não status exato", () => {
  it("status=a_pagar vira filtro de saldo em aberto, não igualdade de status", () => {
    const { filtros, valores } = lerFiltrosLancamentos({ status: "a_pagar" });

    expect(filtros.comSaldoAberto).toBe(true);
    // Não pode ir como igualdade: `.eq("status","a_pagar")` traria só os 86.
    expect(filtros.status).toBeUndefined();
    // A barra continua mostrando a escolha da pessoa.
    expect(valores.status).toBe("a_pagar");
  });

  it("os outros status continuam sendo igualdade exata", () => {
    for (const status of ["aprovado", "pago", "cancelado", "previsto"]) {
      const { filtros } = lerFiltrosLancamentos({ status });
      expect(filtros.status).toBe(status);
      expect(filtros.comSaldoAberto).toBeUndefined();
    }
  });

  it("sem filtro de status, não filtra por saldo", () => {
    const { filtros } = lerFiltrosLancamentos({});
    expect(filtros.comSaldoAberto).toBeUndefined();
    expect(filtros.status).toBeUndefined();
  });
});

/**
 * Os filtros de múltipla escolha e os parâmetros que o clique num relatório usa.
 *
 * Existem porque o relatório de custo por centro de custo filtra vários de cada
 * dimensão. Se esta lista lesse só o primeiro valor, o clique numa barra do
 * relatório abriria um conjunto MAIOR que a célula clicada, e nada na tela diria
 * isso.
 */
describe("lerFiltrosLancamentos: filtros de múltipla escolha", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("lê lista por vírgula em centro, categoria, fornecedor e forma", () => {
    const { filtros, valores } = lerFiltrosLancamentos({
      centro: `${A},${B}`,
      categoria: `${B},${A}`,
      fornecedor: A,
      forma: `${A},${B}`,
    });
    expect(filtros.centroCustoIds).toEqual([A, B]);
    expect(filtros.categoriaIds).toEqual([B, A]);
    expect(filtros.fornecedorIds).toEqual([A]);
    expect(filtros.formaPagamentoIds).toEqual([A, B]);
    // A barra mostra a lista inteira: mostrar um valor só faria a tela dizer que
    // está filtrada por um quando está filtrada por dois.
    expect(valores.centros).toEqual([A, B]);
    expect(valores.formas).toEqual([A, B]);
  });

  it("sem_forma entra como filtro próprio e volta para a barra", () => {
    const { filtros, valores } = lerFiltrosLancamentos({ sem_forma: "1" });
    expect(filtros.semForma).toBe(true);
    expect(valores.semForma).toBe("1");
  });

  it("sem_forma liga só no literal 1", () => {
    for (const valor of ["0", "true", "sim", ""]) {
      const { filtros } = lerFiltrosLancamentos({ sem_forma: valor });
      expect(filtros.semForma).toBeUndefined();
    }
  });

  it("status_in é status LITERAL e não mexe no status de situação", () => {
    const { filtros } = lerFiltrosLancamentos({ status_in: "aprovado,pago" });
    expect(filtros.statusIn).toEqual(["aprovado", "pago"]);
    // O `status` da tela (situação do dinheiro) continua intocado: são duas
    // perguntas diferentes, e misturá-las abriria outro conjunto.
    expect(filtros.status).toBeUndefined();
    expect(filtros.comSaldoAberto).toBeUndefined();
  });

  it("status_in fora do catálogo é descartado", () => {
    const { filtros } = lerFiltrosLancamentos({ status_in: "inventado,pago" });
    expect(filtros.statusIn).toEqual(["pago"]);
  });

  it("sem status_in na URL, o filtro não existe", () => {
    const { filtros } = lerFiltrosLancamentos({});
    expect(filtros.statusIn).toEqual([]);
  });
});
