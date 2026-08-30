import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { EMPRESA } from "@/config/marca";
import { formatarDataHora } from "@/lib/formatadores";
import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import type { LancamentoPlanilha } from "@/modules/financeiro/lancamentos/queries";
import {
  ABA_PLANILHA_LANCAMENTOS,
  CABECALHOS_PLANILHA_LANCAMENTOS,
  COLUNAS_PLANILHA_LANCAMENTOS,
  dataParaCelula,
  linhaPlanilhaLancamento,
  montarPlanilhaLancamentos,
  nomeArquivoPlanilhaLancamentos,
} from "@/modules/financeiro/lancamentos/planilha";

/** Lançamento a pagar completo, o caso mais comum da lista. */
const lancamento: LancamentoPlanilha = {
  id: "11111111-1111-4111-8111-111111111111",
  numero: "LAN-2026-0015",
  numeroDocumento: "NF 98765",
  anexos: 2,
  tipo: "a_pagar",
  origem: "oc",
  descricao: "Combustível julho",
  categoriaNome: "Combustível",
  centroCustoRotulo: "BR-364 Lote 9",
  fornecedorNome: "Posto Rio Branco",
  colaboradorNome: null,
  valor: 1234.56,
  dataVencimento: "2026-08-10",
  status: "aprovado",
  qtdParcelas: 3,
  dataCompra: "2026-07-10",
  mesCompetencia: "2026-07-01",
  criadoEm: "2026-07-11T14:30:00.000Z",
  revisao: "revisado",
  // Dinheiro repartido pelas parcelas: 3 parcelas, 1 paga. Não sai na planilha
  // (as colunas são explícitas), mas faz parte da linha da listagem.
  valorPago: 411.52,
  valorAberto: 823.04,
  valorVencido: 0,
  descontoObtido: 0,
  // A planilha não tem coluna de recorte: ela exporta o lançamento inteiro, e a
  // fatia é uma leitura da TELA (o drill-down de um relatório).
  valorRecorte: null,
  // Campos que só a planilha usa: em branco aqui, para os testes antigos
  // continuarem falando do que eles falavam. O caso cheio tem describe próprio.
  observacoes: null,
  formaPagamentoNome: null,
  condicaoPagamentoDescricao: null,
  contaBancariaNome: null,
  origemNumero: null,
  rateios: [],
};

/**
 * Linha do cabeçalho de colunas no arquivo gerado. Derivada da marca, para o
 * teste não voltar a contar linha na mão: a marca ocupa
 * `LINHAS_CABECALHO_MARCA` linhas e os títulos entram na seguinte.
 */
const LINHA_HEADER = LINHAS_CABECALHO_MARCA + 1;

/** Índice de uma coluna pelo cabeçalho, para o teste não contar posição na mão. */
function coluna(cabecalho: string): number {
  const indice = CABECALHOS_PLANILHA_LANCAMENTOS.indexOf(cabecalho);
  expect(indice, `coluna "${cabecalho}" não existe`).toBeGreaterThanOrEqual(0);
  return indice;
}

describe("linhaPlanilhaLancamento", () => {
  it("tem uma célula por cabeçalho", () => {
    // A invariante que impede o pior defeito da planilha: número embaixo do
    // título errado, com o arquivo abrindo sem erro nenhum.
    expect(linhaPlanilhaLancamento(lancamento)).toHaveLength(
      CABECALHOS_PLANILHA_LANCAMENTOS.length,
    );
  });

  it("escreve o lançamento nas colunas certas", () => {
    const linha = linhaPlanilhaLancamento(lancamento);

    expect(linha[coluna("Número")]).toBe("LAN-2026-0015");
    expect(linha[coluna("Tipo")]).toBe("A pagar");
    expect(linha[coluna("Descrição")]).toBe("Combustível julho");
    expect(linha[coluna("Categoria")]).toBe("Combustível");
    expect(linha[coluna("Fornecedor")]).toBe("Posto Rio Branco");
    expect(linha[coluna("Mês de referência")]).toBe("07/2026");
    expect(linha[coluna("Status")]).toBe("Aprovado");
    expect(linha[coluna("Parcelas")]).toBe(3);
    expect(linha[coluna("Revisão")]).toBe("Revisado");
    expect(linha[coluna("Origem")]).toBe("Ordem de compra");
    // Pelo formatador, não por literal: o texto sai no fuso de Rio Branco.
    expect(linha[coluna("Criado em")]).toBe(
      formatarDataHora(lancamento.criadoEm),
    );
  });

  it("manda o valor como NÚMERO, para a planilha somar", () => {
    const valor = linhaPlanilhaLancamento(lancamento)[coluna("Valor")];
    expect(typeof valor).toBe("number");
    expect(valor).toBe(1234.56);
  });

  it("manda data da compra e vencimento como data do Excel", () => {
    const linha = linhaPlanilhaLancamento(lancamento);
    expect(linha[coluna("Data da compra")]).toBeInstanceOf(Date);
    expect((linha[coluna("Data da compra")] as Date).toISOString()).toBe(
      "2026-07-10T00:00:00.000Z",
    );
    expect((linha[coluna("Vencimento")] as Date).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("recebível em aberto sai como 'A receber', igual à tela", () => {
    // Todo lançamento nasce com status 'a_pagar', recebível incluído: escrever
    // "A pagar" numa conta a receber faria a planilha contradizer o sistema.
    const linha = linhaPlanilhaLancamento({
      ...lancamento,
      tipo: "a_receber",
      status: "a_pagar",
      revisao: "nao-se-aplica",
    });

    expect(linha[coluna("Tipo")]).toBe("A receber");
    expect(linha[coluna("Status")]).toBe("A receber");
    // Revisão não vale para recebível: célula em branco, não um traço que
    // atrapalharia filtro e tabela dinâmica.
    expect(linha[coluna("Revisão")]).toBe("");
  });

  it("traduz os outros estados de revisão", () => {
    expect(
      linhaPlanilhaLancamento({ ...lancamento, revisao: "sem-conta" })[
        coluna("Revisão")
      ],
    ).toBe("Sem conta");
    expect(
      linhaPlanilhaLancamento({ ...lancamento, revisao: "parcial" })[
        coluna("Revisão")
      ],
    ).toBe("Conta parcial");
  });

  it("campo vazio vira célula em branco, não 'null'", () => {
    const linha = linhaPlanilhaLancamento({
      ...lancamento,
      numero: null,
      categoriaNome: null,
      centroCustoRotulo: "BR-364 Lote 9",
      fornecedorNome: null,
      dataVencimento: null,
    });

    expect(linha[coluna("Número")]).toBe("");
    expect(linha[coluna("Categoria")]).toBe("");
    expect(linha[coluna("Fornecedor")]).toBe("");
    expect(linha[coluna("Vencimento")]).toBeNull();
  });

  it("marca as colunas de dinheiro e de data para o formato da célula", () => {
    const porTipo = (tipo: string) =>
      COLUNAS_PLANILHA_LANCAMENTOS.filter(
        (definicao) => definicao.tipo === tipo,
      ).map((definicao) => definicao.cabecalho);

    expect(porTipo("dinheiro")).toEqual(["Valor"]);
    expect(porTipo("data")).toEqual(["Data da compra", "Vencimento"]);
  });
});

describe("dataParaCelula", () => {
  it("usa meia-noite UTC, que é o que o exceljs converte sem deslocar o dia", () => {
    const data = dataParaCelula("2026-08-01");
    expect(data?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    // Série do Excel é inteira: se fosse fuso local, cairia no dia anterior.
    expect((data as Date).getTime() / 86_400_000).toBe(
      Math.trunc((data as Date).getTime() / 86_400_000),
    );
  });

  it("data ausente ou fora do formato vira célula em branco", () => {
    expect(dataParaCelula(null)).toBeNull();
    expect(dataParaCelula(undefined)).toBeNull();
    expect(dataParaCelula("")).toBeNull();
    expect(dataParaCelula("01/08/2026")).toBeNull();
  });
});

describe("nomeArquivoPlanilhaLancamentos", () => {
  it("carimba a data, para dois downloads no mês não terem o mesmo nome", () => {
    expect(nomeArquivoPlanilhaLancamentos("2026-08-13")).toBe(
      "lancamentos-2026-08-13.xlsx",
    );
  });
});

/**
 * Escreve o arquivo de verdade e relê o que saiu. É o único jeito de saber que a
 * célula de dinheiro é número (e não texto), que a data caiu no dia certo e que
 * o total é fórmula: tudo isso é escolha do exceljs no momento de gravar, e um
 * arquivo errado abre normalmente no Excel, só com o conteúdo errado.
 */
describe("montarPlanilhaLancamentos, arquivo relido", () => {
  const segundo: LancamentoPlanilha = {
    ...lancamento,
    id: "22222222-2222-4222-8222-222222222222",
    numero: "LAN-2026-0016",
    valor: 65.44,
    dataVencimento: null,
    revisao: "sem-conta",
  };

  /** Escreve em buffer e abre de novo, como o Excel faria. */
  async function relerPlanilha(itens: LancamentoPlanilha[]) {
    const buffer = await montarPlanilhaLancamentos(itens).xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buffer);
    const aba = lido.getWorksheet(ABA_PLANILHA_LANCAMENTOS);
    if (!aba) throw new Error("aba não encontrada no arquivo gerado");
    return aba;
  }

  it("embute a logo no arquivo, não um link para ela", async () => {
    const buffer = await montarPlanilhaLancamentos([
      lancamento,
    ]).xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buffer);

    // A imagem tem que viajar DENTRO do .xlsx: a planilha é aberta no Excel de
    // outra máquina, muitas vezes anexada em email, e logo por URL abriria como
    // moldura vazia justo no documento que a pessoa vai imprimir.
    expect(lido.model.media).toHaveLength(1);
    expect(lido.model.media[0].extension).toBe("png");
  });

  it("abre com a marca da EMT antes de qualquer dado", async () => {
    const aba = await relerPlanilha([lancamento]);

    // A razão social sai do config, não escrita aqui: se alguém trocar o CNPJ
    // em src/config/marca.ts, este teste acompanha em vez de brigar.
    expect(aba.getRow(2).getCell(1).value).toBe(
      `${EMPRESA.razaoSocial} · CNPJ: ${EMPRESA.cnpj}`,
    );
    expect(String(aba.getRow(3).getCell(1).value)).toContain(
      "Lançamentos financeiros",
    );
    // A marca ocupa exatamente as linhas que ela promete ocupar. Sem esta
    // conferência, um cabeçalho que crescesse uma linha escreveria o cabeçalho
    // de colunas em cima da Pista e ninguém notaria pelo tipo.
    expect(aba.getRow(LINHA_HEADER).getCell(1).value).toBe("Número");
  });

  it("grava cabeçalho, uma linha por lançamento e a linha de total", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);

    expect(aba.getRow(LINHA_HEADER).getCell(1).value).toBe("Número");
    expect(
      aba.getRow(LINHA_HEADER + 1).getCell(coluna("Número") + 1).value,
    ).toBe("LAN-2026-0015");
    expect(
      aba.getRow(LINHA_HEADER + 2).getCell(coluna("Número") + 1).value,
    ).toBe("LAN-2026-0016");
    // Marca + cabeçalho + 2 lançamentos + total.
    expect(aba.rowCount).toBe(LINHA_HEADER + 3);
    expect(aba.getRow(LINHA_HEADER + 3).getCell(1).value).toBe(
      "Total (2 lançamentos)",
    );
  });

  it("valor é número com formato de moeda, não texto", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);
    const celula = aba.getRow(LINHA_HEADER + 1).getCell(coluna("Valor") + 1);

    expect(celula.value).toBe(1234.56);
    expect(typeof celula.value).toBe("number");
    expect(celula.numFmt).toContain("R$");
  });

  it("data cai no dia certo (e não no anterior) com formato de data", async () => {
    const aba = await relerPlanilha([lancamento]);
    const celula = aba
      .getRow(LINHA_HEADER + 1)
      .getCell(coluna("Data da compra") + 1);

    expect(celula.value).toBeInstanceOf(Date);
    expect((celula.value as Date).toISOString()).toBe(
      "2026-07-10T00:00:00.000Z",
    );
    expect(celula.numFmt).toBe("dd/mm/yyyy");
  });

  it("total é fórmula SUBTOTAL sobre as linhas de dados", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);
    const total = aba.getRow(LINHA_HEADER + 3).getCell(coluna("Valor") + 1);
    const colunaValor = aba.getColumn(coluna("Valor") + 1).letter;

    // Fórmula e não valor fixo: acompanha o filtro e as linhas que sobrarem.
    expect(total.formula).toBe(
      `SUBTOTAL(109,${colunaValor}${LINHA_HEADER + 1}:${colunaValor}${LINHA_HEADER + 2})`,
    );
    // A fórmula precisa cobrir exatamente as linhas de dados: se pegar a própria
    // linha de total, o Excel abre com erro de referência circular.
    expect(total.formula).not.toContain(`${colunaValor}${LINHA_HEADER + 3}`);
  });

  it("congela o cabeçalho e liga o filtro sem incluir a linha de total", async () => {
    const aba = await relerPlanilha([lancamento, segundo]);

    // Uma vista só, congelada na linha do cabeçalho de colunas: rolar a
    // planilha tem que deixar a marca E os títulos das colunas na tela.
    expect(aba.views[0]).toMatchObject({
      state: "frozen",
      ySplit: LINHA_HEADER,
    });
    // Relido do arquivo o filtro volta como faixa ("A6:N8"), não como o objeto
    // que foi gravado. A última linha do filtro é a última de DADOS: a de total
    // dentro do filtro seria somada como se fosse mais um lançamento.
    const ultimaColuna = aba.getColumn(
      COLUNAS_PLANILHA_LANCAMENTOS.length,
    ).letter;
    expect(aba.autoFilter).toBe(
      `A${LINHA_HEADER}:${ultimaColuna}${LINHA_HEADER + 2}`,
    );
  });

  it("vencimento vazio fica em branco, sem virar data de 1900", async () => {
    const aba = await relerPlanilha([segundo]);
    const celula = aba
      .getRow(LINHA_HEADER + 1)
      .getCell(coluna("Vencimento") + 1);

    expect(celula.value).toBeNull();
  });
});

describe("planilha traz o lançamento inteiro, não só o resumo da lista", () => {
  /** O caso completo: rateado em dois centros, com observação e conta. */
  const completo: LancamentoPlanilha = {
    ...lancamento,
    observacoes: "Nota chegou rasgada, conferir com o posto",
    formaPagamentoNome: "Boleto",
    condicaoPagamentoDescricao: "30/60/90",
    contaBancariaNome: "Banco do Brasil 102.124-9",
    origemNumero: "OC-2026-0041",
    rateios: [
      { centroId: "cc-001", nome: "Escritório Central", codigo: "001", valor: 800, raizNome: "Escritório Central", etapaNome: null },
      { centroId: "cc-009", nome: "BR-364 Lote 09", codigo: "009", valor: 434.56, raizNome: "BR-364 Lote 09", etapaNome: null },
    ],
  };

  it("traz observações, que é onde mora o combinado que não cabe na descrição", () => {
    const linha = linhaPlanilhaLancamento(completo);
    expect(linha[coluna("Observações")]).toBe(
      "Nota chegou rasgada, conferir com o posto",
    );
  });

  it("traz forma, condição e conta bancária", () => {
    const linha = linhaPlanilhaLancamento(completo);
    expect(linha[coluna("Forma de pagamento")]).toBe("Boleto");
    expect(linha[coluna("Condição de pagamento")]).toBe("30/60/90");
    expect(linha[coluna("Conta bancária")]).toBe("Banco do Brasil 102.124-9");
  });

  it("traz o número da OC de origem, não só a palavra Origem", () => {
    // "Ordem de compra" na coluna Origem não diz QUAL ordem: sem o número, quem
    // confere a planilha tem que voltar ao sistema para achar o documento.
    const linha = linhaPlanilhaLancamento(completo);
    expect(linha[coluna("Documento de origem")]).toBe("OC-2026-0041");
  });

  it("lista os centros de custo do rateio numa coluna só", () => {
    const linha = linhaPlanilhaLancamento(completo);
    expect(linha[coluna("Centro de custo")]).toBe(
      "Escritório Central; BR-364 Lote 09",
    );
  });

  it("mostra a composição do rateio com o valor de cada centro", () => {
    // Uma linha por lançamento: sem esta coluna o rateio some da planilha, e
    // "Escritório Central; BR-364" não diz quanto foi para cada um.
    const linha = linhaPlanilhaLancamento(completo);
    expect(linha[coluna("Rateio")]).toContain("Escritório Central: 800,00");
    expect(linha[coluna("Rateio")]).toContain("BR-364 Lote 09: 434,56");
  });

  it("não repete a composição quando o centro de custo é único", () => {
    // Rateio de um centro só é o caso normal: repetir "Escritório: 1.234,56" ao
    // lado do nome e do valor do lançamento é ruído em toda linha da planilha.
    const linha = linhaPlanilhaLancamento({
      ...completo,
      rateios: [{ centroId: "cc-001", nome: "Escritório Central", codigo: "001", valor: 1234.56, raizNome: "Escritório Central", etapaNome: null }],
    });
    expect(linha[coluna("Centro de custo")]).toBe("Escritório Central");
    expect(linha[coluna("Rateio")]).toBeNull();
  });

  it("lançamento sem rateio nenhum deixa as duas células em branco", () => {
    const linha = linhaPlanilhaLancamento({ ...completo, rateios: [] });
    expect(linha[coluna("Centro de custo")]).toBeNull();
    expect(linha[coluna("Rateio")]).toBeNull();
  });

  it("campo vazio sai em branco, nunca com a palavra null", () => {
    const linha = linhaPlanilhaLancamento({
      ...completo,
      observacoes: null,
      formaPagamentoNome: null,
      condicaoPagamentoDescricao: null,
      contaBancariaNome: null,
      origemNumero: null,
    });
    for (const rotulo of [
      "Observações",
      "Forma de pagamento",
      "Condição de pagamento",
      "Conta bancária",
      "Documento de origem",
    ]) {
      expect(linha[coluna(rotulo)], rotulo).toBeNull();
    }
  });

  it("continua uma célula por cabeçalho depois das colunas novas", () => {
    expect(linhaPlanilhaLancamento(completo)).toHaveLength(
      CABECALHOS_PLANILHA_LANCAMENTOS.length,
    );
  });
});
