import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { RateioDoPagamento } from "@/modules/financeiro/pagamentos/planilha";
import { VALORES_FILTROS_A_RECEBER_VAZIOS, valoresFiltrosAReceberSchema } from "@/modules/financeiro/recebimentos/fila-a-receber";
import {
  cabecalhosRecebimentos,
  colunasRecebimentos,
  expandirRecebimentos,
  montarPlanilhaRecebimentos,
  nomeArquivoPlanilhaRecebimentos,
  type AbaRecebimentos,
  type FormatoPlanilhaRecebimentos,
  type RecebimentoPlanilha,
} from "@/modules/financeiro/recebimentos/planilha";
// `import type` é apagado na compilação: o `server-only` do queries.ts não roda.
import type { FiltrosRecebidas } from "@/modules/financeiro/recebimentos/queries";
import { filtrosRecebidasSchema } from "@/modules/financeiro/recebimentos/schemas";

/** `true` só quando os dois lados têm o MESMO conjunto de chaves. */
type MesmasChaves<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : never
  : never;

const CHAVES_RECEBIDAS_CONFEREM: MesmasChaves<
  FiltrosRecebidas,
  ReturnType<typeof filtrosRecebidasSchema.parse>
> = true;

const OBRA = "c-obra";
const ESCRITORIO = "c-escritorio";

function rateio(sobrescrever: Partial<RateioDoPagamento> = {}): RateioDoPagamento {
  return {
    centroId: OBRA,
    raizId: OBRA,
    raizNome: "BR-364 Lote 2",
    etapaNome: null,
    valor: 100,
    ...sobrescrever,
  };
}

function recebimento(
  sobrescrever: Partial<RecebimentoPlanilha> = {},
): RecebimentoPlanilha {
  return {
    id: "r1",
    lancamentoNumero: "LAN-2026-7001",
    numeroDocumento: "Medição 12",
    numeroParcela: 1,
    totalParcelas: 1,
    descricao: "12ª medição BR-364",
    categoriaNome: "Receita de obra",
    clienteNome: "DNIT",
    mesCompetencia: "2026-09-01",
    dataVencimento: "2026-10-10",
    dataRecebimento: "2026-10-09",
    contaNome: "Conta movimento - Caixa",
    status: "pago",
    valor: 1_000,
    desconto: 0,
    juros: 0,
    valorLiquido: 1_000,
    rateios: [rateio({ valor: 1_000 })],
    ...sobrescrever,
  };
}

const ABAS: AbaRecebimentos[] = ["a-receber", "recebidos"];
const FORMATOS: FormatoPlanilhaRecebimentos[] = ["pagamento", "centro", "rateio"];

function centavos(valores: readonly unknown[]): number {
  return valores
    .filter((v): v is number => typeof v === "number")
    .reduce((soma, v) => soma + Math.round(v * 100), 0);
}

describe("filtros da exportação de recebimentos", () => {
  it("o schema da aba A receber cobre TODAS as chaves da interface", () => {
    expect(Object.keys(valoresFiltrosAReceberSchema.shape).sort()).toEqual(
      Object.keys(VALORES_FILTROS_A_RECEBER_VAZIOS).sort(),
    );
    expect(
      valoresFiltrosAReceberSchema.safeParse(VALORES_FILTROS_A_RECEBER_VAZIOS)
        .success,
    ).toBe(true);
  });

  it("recusa chave desconhecida em vez de descartá-la", () => {
    expect(
      valoresFiltrosAReceberSchema.safeParse({
        ...VALORES_FILTROS_A_RECEBER_VAZIOS,
        fornecedor: "",
      }).success,
    ).toBe(false);
    expect(filtrosRecebidasSchema.safeParse({ fornecedorIds: [] }).success).toBe(
      false,
    );
  });

  it("recusa status fora da fila em aberto", () => {
    expect(
      valoresFiltrosAReceberSchema.safeParse({
        ...VALORES_FILTROS_A_RECEBER_VAZIOS,
        status: "pago",
      }).success,
    ).toBe(false);
  });

  it("as chaves do histórico conferem com FiltrosRecebidas", () => {
    // A trava de verdade é o tipo acima: discordando, não compila.
    expect(CHAVES_RECEBIDAS_CONFEREM).toBe(true);
    expect(filtrosRecebidasSchema.safeParse({}).success).toBe(true);
  });
});

describe("expandirRecebimentos", () => {
  it("nos recebidos reparte o LÍQUIDO, na fila o valor devido", () => {
    const comJuros = recebimento({ valor: 1_000, juros: 30, valorLiquido: 1_030 });
    expect(expandirRecebimentos([comJuros], "pagamento", "recebidos")[0].valorFatia).toBe(1_030);
    expect(expandirRecebimentos([comJuros], "pagamento", "a-receber")[0].valorFatia).toBe(1_000);
  });

  it("rateado entre duas obras, as fatias somam exatamente o recebimento", () => {
    const dividido = recebimento({
      valor: 100,
      valorLiquido: 100,
      rateios: [
        rateio({ centroId: OBRA, raizId: OBRA, valor: 1 }),
        rateio({ centroId: ESCRITORIO, raizId: ESCRITORIO, raizNome: "Escritório", valor: 2 }),
      ],
    });
    const linhas = expandirRecebimentos([dividido], "centro", "recebidos");
    expect(linhas.map((l) => l.centroNome)).toEqual(["BR-364 Lote 2", "Escritório"]);
    expect(centavos(linhas.map((l) => l.valorFatia))).toBe(10_000);
  });
});

describe("colunas da planilha de recebimentos", () => {
  it("tem uma célula por cabeçalho, nas seis combinações", () => {
    for (const aba of ABAS) {
      for (const formato of FORMATOS) {
        const colunas = colunasRecebimentos(aba, formato);
        const [linha] = expandirRecebimentos([recebimento()], formato, aba);
        expect(colunas.map((c) => c.celula(linha))).toHaveLength(colunas.length);
      }
    }
  });

  it("fala de recebimento: cliente no lugar de fornecedor, sem forma de pagamento", () => {
    const cabecalhos = cabecalhosRecebimentos("recebidos", "pagamento");
    expect(cabecalhos).toContain("Cliente");
    expect(cabecalhos).toContain("Data do recebimento");
    expect(cabecalhos).toContain("Valor recebido");
    expect(cabecalhos).not.toContain("Fornecedor");
    expect(cabecalhos).not.toContain("Forma de pagamento");
    expect(cabecalhosRecebimentos("a-receber", "pagamento")).not.toContain(
      "Data do recebimento",
    );
  });

  it("a coluna Etapa existe só no formato por rateio", () => {
    expect(cabecalhosRecebimentos("recebidos", "rateio")).toContain("Etapa");
    expect(cabecalhosRecebimentos("recebidos", "centro")).not.toContain("Etapa");
    expect(cabecalhosRecebimentos("recebidos", "pagamento")).not.toContain("Etapa");
  });

  it("no formato por rateio o valor da parcela só aparece na PRIMEIRA linha", () => {
    const dividido = recebimento({
      valor: 300,
      valorLiquido: 300,
      rateios: [
        rateio({ centroId: "x", raizId: "x", valor: 1 }),
        rateio({ centroId: "y", raizId: "y", valor: 1 }),
        rateio({ centroId: "z", raizId: "z", valor: 1 }),
      ],
    });
    for (const aba of ABAS) {
      const colunas = colunasRecebimentos(aba, "rateio");
      const linhas = expandirRecebimentos([dividido], "rateio", aba);
      const cabecalhoTotal = aba === "recebidos" ? "Valor recebido" : "Valor a receber";
      const cabecalhoFatia = aba === "recebidos" ? "Recebido no centro" : "A receber no centro";
      const total = colunas.findIndex((c) => c.cabecalho === cabecalhoTotal);
      const fatia = colunas.findIndex((c) => c.cabecalho === cabecalhoFatia);
      const celulas = linhas.map((l) => colunas.map((c) => c.celula(l)));
      // As duas somas, por caminhos diferentes, dão o mesmo número.
      expect(centavos(celulas.map((linha) => linha[total]))).toBe(30_000);
      expect(centavos(celulas.map((linha) => linha[fatia]))).toBe(30_000);
    }
  });
});

describe("montarPlanilhaRecebimentos", () => {
  it("escreve as DUAS abas, mesmo com a fila a receber vazia, e relê o total", async () => {
    const workbook = montarPlanilhaRecebimentos({
      aReceber: [],
      recebidos: [recebimento({ id: "a" }), recebimento({ id: "b", valor: 500, valorLiquido: 500 })],
      formato: "pagamento",
    });
    expect(workbook.worksheets.map((aba) => aba.name)).toEqual([
      "A receber",
      "Recebidos",
    ]);

    // Escreve o arquivo e relê: é o que o Excel vai abrir.
    const relido = new ExcelJS.Workbook();
    await relido.xlsx.load(await workbook.xlsx.writeBuffer());
    const aba = relido.getWorksheet("Recebidos");
    expect(aba).toBeDefined();
    const ultima = aba!.getRow(aba!.rowCount);
    expect(String(ultima.getCell(1).value)).toBe("Total (2 recebimentos)");
    expect(relido.getWorksheet("A receber")!.rowCount).toBeGreaterThan(0);
  });

  it("o arquivo se distingue pelo formato na pasta de downloads", () => {
    expect(nomeArquivoPlanilhaRecebimentos("2026-10-16", "pagamento")).toBe(
      "recebimentos-2026-10-16.xlsx",
    );
    expect(nomeArquivoPlanilhaRecebimentos("2026-10-16", "centro")).toBe(
      "recebimentos-por-centro-de-custo-2026-10-16.xlsx",
    );
    expect(nomeArquivoPlanilhaRecebimentos("2026-10-16", "rateio")).toBe(
      "recebimentos-por-rateio-2026-10-16.xlsx",
    );
  });
});
