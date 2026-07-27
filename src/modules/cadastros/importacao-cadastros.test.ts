// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";
import {
  COLUNAS_FORNECEDOR,
  type FornecedorImportacao,
} from "@/modules/cadastros/fornecedores/importacao";
import { TIPOS_UNIDADE, type TipoUnidade } from "@/modules/cadastros/unidades/schemas";

/**
 * Monta um .xlsx em memória: primeira linha é o header, demais são dados.
 * Reproduz o que o usuário sobe no <ImportarCadastro>.
 */
async function montarXlsx(
  header: string[],
  linhas: (string | number | null)[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Importacao");
  worksheet.addRow(header);
  for (const linha of linhas) {
    worksheet.addRow(linha.map((celula) => (celula === null ? "" : celula)));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Mesmas colunas de unidades_medida usadas na server action (que tem 'use server'
// e não é importável). Replicadas aqui para exercitar um cadastro simples real.
interface LinhaImportUnidade {
  sigla: string;
  nome: string;
  tipo: TipoUnidade;
}

const TIPOS_VALIDOS = TIPOS_UNIDADE.join(", ");

const COLUNAS_UNIDADE: ColunaImportacao<LinhaImportUnidade>[] = [
  { chave: "sigla", rotulo: "Sigla", obrigatoria: true, exemplo: "t" },
  { chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "Tonelada" },
  {
    chave: "tipo",
    rotulo: "Tipo",
    obrigatoria: true,
    exemplo: "massa",
    transformar: (valor) => String(valor).trim().toLowerCase(),
    validar: (valor) =>
      TIPOS_UNIDADE.includes(valor as TipoUnidade)
        ? null
        : `Tipo inválido. Use um destes: ${TIPOS_VALIDOS}`,
  },
];

describe("importação de unidades de medida", () => {
  it("separa válidas e inválidas com erros e números de linha originais", async () => {
    const arquivo = await montarXlsx(
      ["Sigla", "Nome", "Tipo"],
      [
        ["t", "Tonelada", "massa"], // linha 2: válida
        ["", "Sem sigla", "volume"], // linha 3: sigla obrigatória vazia
        ["x", "Tipo errado", "peso"], // linha 4: tipo fora da lista
      ],
    );

    const resultado = await lerEValidarXlsx<LinhaImportUnidade>(
      arquivo,
      COLUNAS_UNIDADE,
    );

    expect(resultado.totalLinhas).toBe(3);
    expect(resultado.validas).toHaveLength(1);
    expect(resultado.invalidas).toHaveLength(2);

    const valida = resultado.validas[0];
    expect(valida.linha).toBe(2);
    expect(valida.erros).toEqual([]);
    expect(valida.dados.sigla).toBe("t");
    expect(valida.dados.nome).toBe("Tonelada");
    expect(valida.dados.tipo).toBe("massa");

    const semSigla = resultado.invalidas.find((item) => item.linha === 3);
    expect(semSigla).toBeDefined();
    expect(semSigla?.erros).toContain("Coluna Sigla é obrigatória");

    const tipoInvalido = resultado.invalidas.find((item) => item.linha === 4);
    expect(tipoInvalido).toBeDefined();
    expect(tipoInvalido?.erros).toContain(
      `Tipo inválido. Use um destes: ${TIPOS_VALIDOS}`,
    );
  });

  it("normaliza o tipo para minúsculas antes de validar", async () => {
    const arquivo = await montarXlsx(
      ["Sigla", "Nome", "Tipo"],
      [["M3", "Metro cúbico", "VOLUME"]],
    );

    const resultado = await lerEValidarXlsx<LinhaImportUnidade>(
      arquivo,
      COLUNAS_UNIDADE,
    );

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].dados.tipo).toBe("volume");
  });

  it("ignora linhas totalmente vazias sem contar no total", async () => {
    const arquivo = await montarXlsx(
      ["Sigla", "Nome", "Tipo"],
      [
        ["t", "Tonelada", "massa"],
        ["", "", ""],
        ["m", "Metro", "comprimento"],
      ],
    );

    const resultado = await lerEValidarXlsx<LinhaImportUnidade>(
      arquivo,
      COLUNAS_UNIDADE,
    );

    expect(resultado.totalLinhas).toBe(2);
    expect(resultado.validas.map((item) => item.linha)).toEqual([2, 4]);
  });

  it("lança quando uma coluna obrigatória falta no cabeçalho", async () => {
    const arquivo = await montarXlsx(
      ["Sigla", "Nome"], // sem a coluna Tipo
      [["t", "Tonelada"]],
    );

    await expect(
      lerEValidarXlsx<LinhaImportUnidade>(arquivo, COLUNAS_UNIDADE),
    ).rejects.toThrowError(/Colunas obrigatórias não encontradas/);
  });
});

describe("importação de fornecedores (colunas reais de produção)", () => {
  it("valida tipo, exige razão social e normaliza UF", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [
        ["pj", "Brita Acre LTDA", "00.000.000/0001-00", "Rio Branco", "ac"], // linha 2: válida
        ["sa", "Tipo invalido SA", null, "Rio Branco", "AC"], // linha 3: tipo fora de pf/pj
        ["pf", "", "000.000.000-00", "Cruzeiro do Sul", "AC"], // linha 4: razão social vazia
        ["pj", "UF errada LTDA", null, "Rio Branco", "ACR"], // linha 5: UF com 3 letras
      ],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.totalLinhas).toBe(4);
    expect(resultado.validas).toHaveLength(1);
    expect(resultado.invalidas).toHaveLength(3);

    const valida = resultado.validas[0];
    expect(valida.linha).toBe(2);
    expect(valida.dados.tipo).toBe("pj");
    expect(valida.dados.razaoSocial).toBe("Brita Acre LTDA");
    expect(valida.dados.uf).toBe("AC"); // normalizada para maiúsculas

    const tipoInvalido = resultado.invalidas.find((item) => item.linha === 3);
    expect(tipoInvalido?.erros).toContain("Tipo deve ser pf ou pj");

    const semRazao = resultado.invalidas.find((item) => item.linha === 4);
    expect(semRazao?.erros).toContain("Coluna Razao social é obrigatória");

    const ufInvalida = resultado.invalidas.find((item) => item.linha === 5);
    expect(ufInvalida?.erros).toContain("UF deve ter 2 letras");
  });

  it("aceita campos opcionais vazios como null", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [["pj", "Fornecedor sem detalhes LTDA", "", "", ""]],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.validas).toHaveLength(1);
    const valida = resultado.validas[0];
    expect(valida.dados.cnpjCpf).toBeNull();
    expect(valida.dados.cidade).toBeNull();
    expect(valida.dados.uf).toBeNull();
  });
});

describe("normalização de fornecedores (CNPJ, razão social, traço)", () => {
  it("mascara CNPJ e CPF crus na importação", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [
        ["pj", "Brita Acre LTDA", "00000000000100", "Rio Branco", "AC"],
        ["pf", "Jose da Silva", "00000000000", "Rio Branco", "AC"],
      ],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.validas).toHaveLength(2);
    expect(resultado.validas[0].dados.cnpjCpf).toBe("00.000.000/0001-00");
    expect(resultado.validas[1].dados.cnpjCpf).toBe("000.000.000-00");
  });

  it("rejeita CNPJ/CPF com contagem de dígitos inválida", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [["pj", "Fornecedor CNPJ curto LTDA", "123", "Rio Branco", "AC"]],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].erros).toContain(
      "CNPJ/CPF deve ter 11 ou 14 dígitos",
    );
  });

  it("rejeita razão social puramente numérica", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [["pj", "12345678000199", "", "Rio Branco", "AC"]],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].erros).toContain(
      "Razão social não pode ser só números — confira se o CNPJ caiu na coluna errada",
    );
  });

  it("remove prefixo de código legado da razão social", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [["pj", "101 - XAPURI", "", "Rio Branco", "AC"]],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].dados.razaoSocial).toBe("XAPURI");
  });

  it("trata traço isolado como campo vazio (null)", async () => {
    const arquivo = await montarXlsx(
      ["Tipo", "Razao social", "CNPJ/CPF", "Cidade", "UF"],
      [["pj", "Fornecedor Traço LTDA", "-", "—", "AC"]],
    );

    const resultado = await lerEValidarXlsx<FornecedorImportacao>(
      arquivo,
      COLUNAS_FORNECEDOR,
    );

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].dados.cnpjCpf).toBeNull();
    expect(resultado.validas[0].dados.cidade).toBeNull();
  });
});

// Réplica de colunasImportInsumo: a server action tem 'use server' e não é
// importável, então reproduzimos aqui a mesma validação de nome de produção.
interface LinhaImportInsumo {
  codigo: string | null;
  nome: string;
  categoria: string;
  unidade: string;
}

const COLUNAS_INSUMO: ColunaImportacao<LinhaImportInsumo>[] = [
  { chave: "codigo", rotulo: "Codigo", exemplo: "MAT-001" },
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Brita 1",
    validar: (valor, linha) => {
      const nome = String(valor ?? "").trim();
      const codigo = String(linha.codigo ?? "").trim();
      if (/^\d+$/.test(nome) || (codigo !== "" && nome === codigo)) {
        return "Nome do insumo não pode ser igual ao código nem ser só números";
      }
      return null;
    },
  },
  {
    chave: "categoria",
    rotulo: "Categoria",
    obrigatoria: true,
    exemplo: "Materiais de construcao",
  },
  { chave: "unidade", rotulo: "Unidade", obrigatoria: true, exemplo: "m3" },
];

describe("importação de insumos (validação de nome)", () => {
  it("rejeita nome puramente numérico", async () => {
    const arquivo = await montarXlsx(
      ["Codigo", "Nome", "Categoria", "Unidade"],
      [["MAT-001", "12345", "Materiais de construcao", "m3"]],
    );

    const resultado = await lerEValidarXlsx<LinhaImportInsumo>(
      arquivo,
      COLUNAS_INSUMO,
    );

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].erros).toContain(
      "Nome do insumo não pode ser igual ao código nem ser só números",
    );
  });

  it("rejeita nome igual ao código", async () => {
    const arquivo = await montarXlsx(
      ["Codigo", "Nome", "Categoria", "Unidade"],
      [["MAT-001", "MAT-001", "Materiais de construcao", "m3"]],
    );

    const resultado = await lerEValidarXlsx<LinhaImportInsumo>(
      arquivo,
      COLUNAS_INSUMO,
    );

    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0].erros).toContain(
      "Nome do insumo não pode ser igual ao código nem ser só números",
    );
  });

  it("aceita um nome descritivo normal", async () => {
    const arquivo = await montarXlsx(
      ["Codigo", "Nome", "Categoria", "Unidade"],
      [["MAT-001", "Brita 1", "Materiais de construcao", "m3"]],
    );

    const resultado = await lerEValidarXlsx<LinhaImportInsumo>(
      arquivo,
      COLUNAS_INSUMO,
    );

    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].dados.nome).toBe("Brita 1");
  });
});
