// @vitest-environment node
/**
 * O resumo da folha em PDF.
 *
 * O arquivo roda em ambiente NODE (o default do projeto é jsdom): gerar o PDF de
 * verdade precisa de `Buffer` e do printer do pdfmake, e sob jsdom o
 * `server-only` resolve pela condição de navegador e estoura.
 */
import { describe, expect, it } from "vitest";

import { formatarBRL } from "@/lib/formatadores";
import { gerarPdf } from "@/lib/pdf";
import {
  documentoDoResumo,
  nomeDoArquivo,
  totaisDoResumo,
  type LinhaResumo,
} from "@/modules/rh/folha/resumo-pdf";

/** Três linhas com acento, vínculos diferentes e centavos que não fecham em float. */
const ITENS: LinhaResumo[] = [
  {
    colaboradorNome: "ANDRÉIA ALENCAR DA SILVA",
    colaboradorVinculo: "clt",
    salarioBase: 2000,
    gratificacao: 1500,
    descontos: 155.68,
    adiantamentos: 0,
    custoTotal: 3500,
    valorLiquido: 3344.32,
  },
  {
    colaboradorNome: "ANTÔNIO FRANCISCO DA SILVA GAMA - TOIN",
    colaboradorVinculo: "terceiro",
    salarioBase: 2289.8,
    gratificacao: 210.2,
    descontos: 0,
    adiantamentos: 0,
    custoTotal: 2500,
    valorLiquido: 2500,
  },
  {
    colaboradorNome: "JOSÉ DA CONCEIÇÃO",
    colaboradorVinculo: "diarista",
    salarioBase: 1621.01,
    gratificacao: 0,
    descontos: 0.1,
    adiantamentos: 0.2,
    custoTotal: 1621.01,
    valorLiquido: 1620.71,
  },
];

const FOLHA = {
  competencia: "2026-08-01",
  statusRotulo: "Pendente de aprovação",
  dataVencimento: "2026-09-11",
  itens: ITENS,
};

/** Data fixa: função que lê o relógio não tem saída determinística. */
const EMITIDO_EM = new Date("2026-08-29T13:45:00.000Z");

describe("totaisDoResumo", () => {
  it("soma cada coluna de dinheiro", () => {
    const totais = totaisDoResumo(ITENS);
    expect(totais.salarioBase).toBe(5910.81);
    expect(totais.gratificacao).toBe(1710.2);
    expect(totais.custoTotal).toBe(7621.01);
    expect(totais.valorLiquido).toBe(7465.03);
  });

  it("soma em centavos: 0,1 + 0,2 não vira 0,30000000000000004", () => {
    // A linha do JOSÉ tem 0,10 de desconto e 0,20 de adiantamento de propósito:
    // é o par clássico que denuncia soma em float. Somado em reais, um dos dois
    // totais sairia com dígitos de lixo e o rodapé do PDF discordaria da
    // calculadora de quem confere.
    const totais = totaisDoResumo(ITENS);
    expect(totais.descontos).toBe(155.78);
    expect(totais.adiantamentos).toBe(0.2);
  });

  it("folha vazia soma zero em tudo, sem quebrar", () => {
    const totais = totaisDoResumo([]);
    expect(totais.custoTotal).toBe(0);
    expect(totais.valorLiquido).toBe(0);
  });
});

describe("nomeDoArquivo", () => {
  it("leva ano e mês, nessa ordem, para ordenar sozinho na pasta", () => {
    expect(nomeDoArquivo("2026-08-01")).toBe("folha-2026-08.pdf");
  });
});

describe("documentoDoResumo", () => {
  /** Extrai o texto de todas as células da tabela do documento. */
  function celulas(): string[] {
    const doc = documentoDoResumo(FOLHA, EMITIDO_EM);
    const conteudo = doc.content as Array<{
      table?: { body: unknown[][] };
    }>;
    // A tabela grande é a última: as duas primeiras "tabelas" são as faixas da
    // Pista, que têm uma célula vazia cada.
    const tabela = conteudo.filter((bloco) => bloco.table).at(-1);
    return (tabela?.table?.body ?? []).flatMap((linha) =>
      linha.map((celula) => {
        const c = celula as { text?: unknown };
        return typeof c.text === "string" ? c.text : "";
      }),
    );
  }

  it("as colunas são as que o Tiago pediu, nesta ordem", () => {
    const doc = documentoDoResumo(FOLHA, EMITIDO_EM);
    const conteudo = doc.content as Array<{ table?: { body: unknown[][] } }>;
    const tabela = conteudo.filter((bloco) => bloco.table).at(-1);
    const cabecalho = (tabela?.table?.body[0] ?? []).map(
      (celula) => (celula as { text: string }).text,
    );

    expect(cabecalho).toEqual([
      "Colaborador",
      "Vínculo",
      "Salário",
      "Gratificação",
      "Descontos",
      "Adiantamentos",
      "Custo total",
      "Líquido",
    ]);
  });

  it("traduz o vínculo em vez de imprimir o código do banco", () => {
    const texto = celulas();
    expect(texto).toContain("CLT");
    expect(texto).toContain("Terceiro");
    expect(texto).toContain("Diarista");
    // O código cru não pode aparecer: "terceiro" minúsculo é o valor da coluna.
    expect(texto).not.toContain("terceiro");
  });

  it("os valores saem formatados em BRL", () => {
    // Asserção pelo formatador, e não pela string literal: o BRL do projeto usa
    // espaço não separável depois do "R$", que não se digita à mão.
    expect(celulas()).toContain(formatarBRL(3344.32));
  });

  it("tem linha de total, e ela fecha com a soma das linhas", () => {
    const texto = celulas();
    expect(texto).toContain("Total");
    expect(texto).toContain(formatarBRL(7621.01));
    expect(texto).toContain(formatarBRL(7465.03));
  });

  it("uma linha por pessoa, mais cabeçalho e total", () => {
    const doc = documentoDoResumo(FOLHA, EMITIDO_EM);
    const conteudo = doc.content as Array<{ table?: { body: unknown[][] } }>;
    const tabela = conteudo.filter((bloco) => bloco.table).at(-1);
    expect(tabela?.table?.body.length).toBe(ITENS.length + 2);
  });

  it("paisagem, e não retrato: são oito colunas", () => {
    expect(documentoDoResumo(FOLHA, EMITIDO_EM).pageOrientation).toBe(
      "landscape",
    );
  });
});

describe("o PDF gerado é um PDF de verdade", () => {
  /**
   * Estas provas geram os BYTES. Testar só a definição do documento não pega o
   * que mais dói aqui: fonte que não existe, imagem base64 inválida, layout que
   * o pdfmake recusa. Nada disso aparece no `tsc`, só na hora em que o Tiago
   * clica no botão.
   */
  it("começa com %PDF e tem conteúdo", async () => {
    const bytes = await gerarPdf(documentoDoResumo(FOLHA, EMITIDO_EM));
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("três pessoas cabem em UMA página", async () => {
    // "Cabe numa página" se mede no PDF, contando `/Type /Page`, e não olhando
    // a definição do documento — quem decide a quebra é o pdfmake, no fim.
    const bytes = await gerarPdf(documentoDoResumo(FOLHA, EMITIDO_EM));
    const texto = bytes.toString("latin1");
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(paginas).toBe(1);
  });

  it("LINHA DE CONTROLE: muita gente passa de uma página", async () => {
    // Sem esta, a prova acima passaria mesmo se a contagem estivesse quebrada e
    // sempre devolvesse 1.
    const muitos = Array.from({ length: 120 }, (_, i) => ({
      ...ITENS[0]!,
      colaboradorNome: `COLABORADOR NUMERO ${i + 1}`,
    }));
    const bytes = await gerarPdf(
      documentoDoResumo({ ...FOLHA, itens: muitos }, EMITIDO_EM),
    );
    const texto = bytes.toString("latin1");
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(paginas).toBeGreaterThan(1);
  });

  it("nome com acento não estoura o gerador", async () => {
    // A Helvetica padrão usa WinAnsi, que tem ã/ç/é. Se um dia alguém trocar a
    // fonte por uma sem esses caracteres, é aqui que aparece.
    const bytes = await gerarPdf(
      documentoDoResumo(
        {
          ...FOLHA,
          itens: [{ ...ITENS[0]!, colaboradorNome: "JOÃO ÇÃÉÊÍÓÔÕÚÜ" }],
        },
        EMITIDO_EM,
      ),
    );
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
