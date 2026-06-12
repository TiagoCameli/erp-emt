// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  gerarModeloXlsx,
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";

interface LinhaMaterial {
  nome: string;
  quantidade: number;
  unidade: string;
}

function colunasMaterial(): ColunaImportacao<LinhaMaterial>[] {
  return [
    { chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "Brita 1" },
    {
      chave: "quantidade",
      rotulo: "Quantidade",
      obrigatoria: true,
      exemplo: "10,5",
      transformar: (valorCelula) => {
        const numero =
          typeof valorCelula === "number"
            ? valorCelula
            : Number(String(valorCelula).replace(",", "."));
        if (Number.isNaN(numero)) throw new Error("número inválido");
        return numero;
      },
      validar: (valor) =>
        typeof valor === "number" && valor > 0
          ? null
          : "Coluna Quantidade deve ser maior que zero",
    },
    { chave: "unidade", rotulo: "Unidade", exemplo: "m3" },
  ];
}

function paraArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copia = new Uint8Array(buffer.byteLength);
  copia.set(buffer);
  return copia.buffer;
}

async function montarArquivo(linhas: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Importacao");
  worksheet.addRow(["Nome", "Quantidade", "Unidade"]);
  for (const linha of linhas) worksheet.addRow(linha);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("gerarModeloXlsx", () => {
  it("gera buffer não-vazio que o exceljs relê com os headers certos", async () => {
    const arquivo = await gerarModeloXlsx(
      [
        { rotulo: "Nome", exemplo: "Brita 1" },
        { rotulo: "Quantidade", exemplo: "10,5" },
        { rotulo: "Unidade", exemplo: "m3" },
      ],
      "Materiais",
    );

    expect(Buffer.isBuffer(arquivo)).toBe(true);
    expect(arquivo.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(paraArrayBuffer(arquivo));

    const worksheet = workbook.worksheets[0];
    expect(worksheet).toBeDefined();
    expect(worksheet.name).toBe("Materiais");

    const header = worksheet.getRow(1);
    expect(header.getCell(1).value).toBe("Nome");
    expect(header.getCell(2).value).toBe("Quantidade");
    expect(header.getCell(3).value).toBe("Unidade");

    const exemplos = worksheet.getRow(2);
    expect(exemplos.getCell(1).value).toBe("Brita 1");
    expect(exemplos.getCell(2).value).toBe("10,5");
    expect(exemplos.getCell(3).value).toBe("m3");
  });

  it("sanitiza nome de planilha com caracteres proibidos pelo Excel", async () => {
    const arquivo = await gerarModeloXlsx(
      [{ rotulo: "Nome" }],
      "Centros [Custo] / Obra: BR-364?",
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(paraArrayBuffer(arquivo));
    const nome = workbook.worksheets[0].name;
    expect(nome.length).toBeLessThanOrEqual(31);
    expect(nome).not.toMatch(/[\\/?*[\]:]/);
  });
});

describe("lerEValidarXlsx", () => {
  it("separa válidas e inválidas com erros e números de linha originais", async () => {
    const arquivo = await montarArquivo([
      ["Brita 1", "10,5", "m3"], // linha 2: válida
      ["", 2, "t"], // linha 3: sem campo obrigatório (Nome)
      ["Areia", -3, "m3"], // linha 4: validar custom falha (quantidade negativa)
    ]);

    const resultado = await lerEValidarXlsx<LinhaMaterial>(
      arquivo,
      colunasMaterial(),
    );

    expect(resultado.totalLinhas).toBe(3);
    expect(resultado.validas).toHaveLength(1);
    expect(resultado.invalidas).toHaveLength(2);

    const valida = resultado.validas[0];
    expect(valida.linha).toBe(2);
    expect(valida.erros).toEqual([]);
    expect(valida.dados.nome).toBe("Brita 1");
    expect(valida.dados.quantidade).toBe(10.5);
    expect(valida.dados.unidade).toBe("m3");

    const semNome = resultado.invalidas.find((item) => item.linha === 3);
    expect(semNome).toBeDefined();
    expect(semNome?.erros).toContain("Coluna Nome é obrigatória");

    const quantidadeInvalida = resultado.invalidas.find(
      (item) => item.linha === 4,
    );
    expect(quantidadeInvalida).toBeDefined();
    expect(quantidadeInvalida?.erros).toContain(
      "Coluna Quantidade deve ser maior que zero",
    );
  });

  it("reporta erro de transformar com o rótulo da coluna", async () => {
    const arquivo = await montarArquivo([["Cimento", "abc", "sc"]]);

    const resultado = await lerEValidarXlsx<LinhaMaterial>(
      arquivo,
      colunasMaterial(),
    );

    expect(resultado.validas).toHaveLength(0);
    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].linha).toBe(2);
    expect(resultado.invalidas[0].erros).toContain(
      "Coluna Quantidade: número inválido",
    );
  });

  it("ignora linhas totalmente vazias sem contar no total", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Importacao");
    worksheet.addRow(["Nome", "Quantidade", "Unidade"]);
    worksheet.addRow(["Brita 1", 5, "m3"]);
    worksheet.addRow(["", "", ""]);
    worksheet.addRow(["Areia", 8, "m3"]);
    const arquivo = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultado = await lerEValidarXlsx<LinhaMaterial>(
      arquivo,
      colunasMaterial(),
    );

    expect(resultado.totalLinhas).toBe(2);
    expect(resultado.validas.map((item) => item.linha)).toEqual([2, 4]);
  });

  it("lança quando coluna obrigatória não existe no header", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Importacao");
    worksheet.addRow(["Nome", "Unidade"]); // sem a coluna Quantidade
    worksheet.addRow(["Brita 1", "m3"]);
    const arquivo = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(
      lerEValidarXlsx<LinhaMaterial>(arquivo, colunasMaterial()),
    ).rejects.toThrowError(/Colunas obrigatórias não encontradas/);
  });

  it("casa headers com diferença de caixa e espaços extras", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Importacao");
    worksheet.addRow(["  NOME ", "quantidade", " Unidade"]);
    worksheet.addRow(["Brita 1", 5, "m3"]);
    const arquivo = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultado = await lerEValidarXlsx<LinhaMaterial>(
      arquivo,
      colunasMaterial(),
    );

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].dados.nome).toBe("Brita 1");
  });
});
