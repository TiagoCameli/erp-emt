// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions do reajuste: permissão `medicao.reajuste/editar` antes de ir ao banco, ids por
 * `idSchema`, o PDF lido de novo no servidor a cada prévia e gravação (o número nunca vem do
 * navegador), `conferirRelatorio` antes da RPC, a recusa P0001 como está e a revalidação das 5
 * rotas. O PDF é o real da 4ª do L09 (fixture da Task 3); o `lerBinario` é fingido.
 */

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  revalidadas: [] as string[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  bytes: new Uint8Array() as Uint8Array,
  pdf: { path: "medicao/siac.pdf", nome: "siac.pdf" } as { path: string; nome: string } | null,
  medicao: null as null | { id: string; contratoId: string; numero: number; periodoInicio: string; periodoFim: string; status: string },
  itens: [] as unknown[],
  salvos: [] as unknown[],
  adulterarSubtotal: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (rota: string) => estado.revalidadas.push(rota) }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return estado.resposta;
    },
  }),
}));
vi.mock("@/lib/arquivos", () => ({
  lerBinario: async () => ({ blob: new Blob([estado.bytes as BlobPart]), tamanhoBytes: estado.bytes.byteLength }),
}));
vi.mock("@/modules/medicao/reajuste/queries", () => ({
  pdfDaMedicao: async () => estado.pdf,
  medicaoParaReajuste: async () => estado.medicao,
  itensParaCasar: async () => estado.itens,
  casamentosSalvos: async () => estado.salvos,
}));
vi.mock("@/modules/medicao/reajuste/siac/ler-relatorio", async (original) => {
  const real = await original<typeof import("@/modules/medicao/reajuste/siac/ler-relatorio")>();
  return {
    ...real,
    lerRelatorioSiac: (paginas: Parameters<typeof real.lerRelatorioSiac>[0]) => {
      const r = real.lerRelatorioSiac(paginas);
      if (estado.adulterarSubtotal) r.grupos[0].subtotal = { ...r.grupos[0].subtotal, reajuste: "999.99" };
      return r;
    },
  };
});

import itensL09 from "./__fixtures__/l09-4a-itens.json";

import {
  excluirRelatorioReajuste,
  gravarReajuste,
  lancarReajusteManual,
  lerPdfSiac,
  previaReajuste,
  salvarConfigReajuste,
} from "@/modules/medicao/reajuste/actions";

const MED = "33333333-3333-4333-8333-333333333333";
const ARQ = "0cc175b9-c0f1-b6a8-31c3-99e269772661"; // formato md5, como os ids da carga
const CONTRATO = "c4109738-9af7-4ddb-8982-3b2c79fe6e43";
const ROTAS = [`/medicao/medicoes/${MED}`, "/medicao/reajuste", "/medicao/boletim", "/medicao/painel", "/medicao/alertas"];

const codigoDe = new Map((itensL09 as { itemId: string; codigo: string }[]).map((i) => [i.itemId, i.codigo]));
const idDe = new Map((itensL09 as { itemId: string; codigo: string }[]).map((i) => [i.codigo, i.itemId]));

let PDF_L09: Uint8Array;

/** PDF de uma página só com texto ("Nota fiscal"), montado à mão com o xref certo. */
function pdfDeOutroTipo(): Uint8Array {
  const conteudo = "BT /F1 18 Tf 72 720 Td (NOTA FISCAL 123) Tj ET";
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let corpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) corpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(corpo);
}

const PREVIA = { linhas: [], pendencias: 0, total: "-40021.28", valor_pi: "2616306.26", situacao: "definitivo", medicao_valor: "2615053.13", anterior: null, diferenca: null };

beforeAll(async () => {
  PDF_L09 = new Uint8Array(await readFile(path.join(__dirname, "siac", "__fixtures__", "siac-l09-4a.pdf")));
});

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.revalidadas = [];
  estado.resposta = { data: PREVIA, error: null };
  estado.bytes = PDF_L09;
  estado.pdf = { path: "medicao/siac.pdf", nome: "siac.pdf" };
  estado.medicao = { id: MED, contratoId: CONTRATO, numero: 4, periodoInicio: "2026-02-01", periodoFim: "2026-02-28", status: "enviada" };
  estado.itens = itensL09;
  estado.salvos = [];
  estado.adulterarSubtotal = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

type RelatorioEnviado = { linhas: { grupo: string; codigo: string; itens: string[]; destino: string | null }[]; arquivo_id: string; total: string };

describe("lerPdfSiac", () => {
  it("sem medicao.reajuste/editar não chama o banco", async () => {
    estado.negadas = ["medicao.reajuste/editar"];
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "Sem permissão para importar reajuste" });
    expect(estado.chamadas).toEqual([]);
  });

  it("id inválido recusado; id de carga (md5) aceito", async () => {
    await expect(lerPdfSiac("x", ARQ)).resolves.toEqual({ erro: "Medição inválida" });
    await expect(lerPdfSiac(MED, "x")).resolves.toEqual({ erro: "PDF inválido" });
    expect(estado.chamadas).toEqual([]);
  });

  it("com o PDF real: RPC com 34 linhas, p_gravar false e as escolhas sugeridas", async () => {
    const r = await lerPdfSiac(MED, ARQ);
    if (!("ok" in r)) throw new Error(r.erro);
    expect(estado.chamadas).toHaveLength(1);
    const { fn, args } = estado.chamadas[0];
    expect(fn).toBe("fn_mc_reajuste_importar");
    expect(args.p_medicao).toBe(MED);
    expect(args.p_gravar).toBe(false);
    const rel = args.p_relatorio as RelatorioEnviado;
    expect(rel.linhas).toHaveLength(34);
    expect(rel.arquivo_id).toBe(ARQ);
    expect(rel.total).toBe("-40021.28");
    const cap = rel.linhas.find((l) => l.grupo === "4,0" && l.codigo === "60112");
    expect(cap?.itens.map((i) => codigoDe.get(i))).toEqual(["04.03.02"]);
    expect(r.escolhas["4,0|60112"]).toEqual({ itens: [idDe.get("04.03.02")], destino: null });
    expect(r.origem["4,0|60112"]).toBe("sugerido");
    expect(r.conferir).toEqual(["2,2|51269"]);
    expect(r.cabecalho.medicaoNumero).toBe(4);
    expect(r.candidatos).toHaveLength(245);
    expect(r.avisos).toEqual([]);
    expect(r.previa).toEqual(PREVIA);
    expect(estado.revalidadas).toEqual([]);
  });

  it("período do relatório diferente do da medição vira aviso, não recusa", async () => {
    estado.medicao = { ...estado.medicao!, periodoInicio: "2026-03-01", periodoFim: "2026-03-31" };
    const r = await lerPdfSiac(MED, ARQ);
    if (!("ok" in r)) throw new Error(r.erro);
    expect(r.avisos).toEqual(["O relatório é do período 01/02/2026 a 28/02/2026 e a medição de 01/03/2026 a 31/03/2026"]);
  });

  it("casamento salvo vem com origem salvo", async () => {
    estado.salvos = [{ grupo: "4,0", codigo: "60112", itemId: idDe.get("04.03.03") }];
    const r = await lerPdfSiac(MED, ARQ);
    if (!("ok" in r)) throw new Error(r.erro);
    expect(r.origem["4,0|60112"]).toBe("salvo");
    expect(r.escolhas["4,0|60112"].itens).toEqual([idDe.get("04.03.03")]);
  });

  it("PDF de outro tipo: a mensagem do leitor", async () => {
    estado.bytes = pdfDeOutroTipo();
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "A página 1 não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?" });
    expect(estado.chamadas).toEqual([]);
  });

  it("arquivo que não é PDF: a mensagem em pt-BR", async () => {
    estado.bytes = new TextEncoder().encode("isto não é pdf");
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "O arquivo não é um PDF válido ou está corrompido." });
    expect(estado.chamadas).toEqual([]);
  });

  it("relatório com SUBTOTAL errado: 'O relatório não fecha' sem chamar a RPC", async () => {
    estado.adulterarSubtotal = true;
    const r = await lerPdfSiac(MED, ARQ);
    expect("erro" in r && r.erro).toMatch(/^O relatório não fecha: Grupo 1,0: as linhas somam .* de reajuste e o SUBTOTAL diz 999,99/);
    expect(estado.chamadas).toEqual([]);
  });

  it("PDF que não está anexado à medição", async () => {
    estado.pdf = null;
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "O PDF não está anexado a esta medição" });
    expect(estado.chamadas).toEqual([]);
  });

  it("medição fora da lista de acesso", async () => {
    estado.medicao = null;
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "Medição não encontrada" });
  });

  it("recusa do banco (P0001) volta como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "O relatório é da 4ª medição, não da 5ª" } };
    await expect(lerPdfSiac(MED, ARQ)).resolves.toEqual({ erro: "O relatório é da 4ª medição, não da 5ª" });
  });
});

describe("previaReajuste e gravarReajuste", () => {
  const escolhas = { "4,0|60112": { itens: ["1c086b48-50b6-469c-87e2-b4f61cfda9b7"], destino: null } };

  it("prévia lê o PDF de novo e manda as escolhas da tela com p_gravar false, sem revalidar", async () => {
    await expect(previaReajuste(MED, ARQ, escolhas)).resolves.toEqual({ ok: true, previa: PREVIA });
    const rel = estado.chamadas[0].args.p_relatorio as RelatorioEnviado;
    expect(estado.chamadas[0].args.p_gravar).toBe(false);
    expect(rel.linhas).toHaveLength(34);
    expect(rel.linhas.find((l) => l.grupo === "4,0" && l.codigo === "60112")?.itens).toEqual(escolhas["4,0|60112"].itens);
    // Linha sem escolha vai sem item (a RPC devolve a pendência).
    expect(rel.linhas.find((l) => l.grupo === "8,0" && l.codigo === "49408")?.itens).toEqual([]);
    expect(estado.revalidadas).toEqual([]);
  });

  it("escolhas fora do formato não chamam o banco", async () => {
    await expect(previaReajuste(MED, ARQ, { "4.0|60112": { itens: [], destino: null } })).resolves.toEqual({ erro: "Escolhas de itens inválidas" });
    await expect(gravarReajuste(MED, ARQ, { "4,0|60112": { itens: ["x"], destino: null } })).resolves.toEqual({ erro: "Escolhas de itens inválidas" });
    expect(estado.chamadas).toEqual([]);
  });

  it("gravar manda p_gravar true e revalida as 5 rotas", async () => {
    estado.resposta = { data: { ...PREVIA, relatorio_id: "r1", sequencia: 1 }, error: null };
    await expect(gravarReajuste(MED, ARQ, escolhas)).resolves.toEqual({ ok: true, relatorioId: "r1", previa: { ...PREVIA, relatorio_id: "r1", sequencia: 1 } });
    expect(estado.chamadas[0].args.p_gravar).toBe(true);
    expect(estado.revalidadas).toEqual(ROTAS);
  });

  it("recusa do banco na gravação volta como está e não revalida", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Escolha os itens que recebem o reajuste das linhas: 2,2 51269" } };
    await expect(gravarReajuste(MED, ARQ, escolhas)).resolves.toEqual({ erro: "Escolha os itens que recebem o reajuste das linhas: 2,2 51269" });
    expect(estado.revalidadas).toEqual([]);
  });

  it("erro de infraestrutura vira mensagem genérica", async () => {
    estado.resposta = { data: null, error: { code: "42501", message: "permission denied" } };
    await expect(gravarReajuste(MED, ARQ, escolhas)).resolves.toEqual({ erro: "Não foi possível gravar o reajuste. Tente novamente" });
  });

  it("sem editar não chama o banco", async () => {
    estado.negadas = ["medicao.reajuste/editar"];
    await expect(gravarReajuste(MED, ARQ, escolhas)).resolves.toEqual({ erro: "Sem permissão para importar reajuste" });
    await expect(previaReajuste(MED, ARQ, escolhas)).resolves.toEqual({ erro: "Sem permissão para importar reajuste" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("lancarReajusteManual", () => {
  const dados = { valor: "1.234,56", sentido: "negativo" as const, situacao: "provisorio" as const, observacao: " Obra 012 ", arquivoId: null };

  it("manual negativo vai como '-1234.56'", async () => {
    estado.resposta = { data: "r9", error: null };
    await expect(lancarReajusteManual(MED, dados)).resolves.toEqual({ ok: true, relatorioId: "r9" });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_reajuste_manual", args: { p_medicao: MED, p_dados: { total: "-1234.56", situacao: "provisorio", observacao: "Obra 012", arquivo_id: null } } },
    ]);
    expect(estado.revalidadas).toEqual(ROTAS);
  });

  it("anexo opcional vai junto", async () => {
    await lancarReajusteManual(MED, { ...dados, sentido: "positivo", arquivoId: ARQ });
    expect(estado.chamadas[0].args.p_dados).toMatchObject({ total: "1234.56", arquivo_id: ARQ });
  });

  it("valor ambíguo não chama o banco", async () => {
    const r = await lancarReajusteManual(MED, { ...dados, valor: "1.234" });
    expect("erro" in r && r.erro).toMatch(/^Número ambíguo/);
    expect(estado.chamadas).toEqual([]);
  });

  it("sem permissão e id inválido não chamam o banco", async () => {
    await expect(lancarReajusteManual("x", dados)).resolves.toEqual({ erro: "Medição inválida" });
    estado.negadas = ["medicao.reajuste/editar"];
    await expect(lancarReajusteManual(MED, dados)).resolves.toEqual({ erro: "Sem permissão para lançar reajuste" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("excluirRelatorioReajuste", () => {
  const REL = "55555555-5555-4555-8555-555555555555";

  it("com motivo chama fn_mc_reajuste_excluir e revalida", async () => {
    await expect(excluirRelatorioReajuste(REL, MED, "  PDF errado ")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_reajuste_excluir", args: { p_id: REL, p_motivo: "PDF errado" } }]);
    expect(estado.revalidadas).toEqual(ROTAS);
  });

  it("motivo curto e id inválido não chamam o banco", async () => {
    await expect(excluirRelatorioReajuste(REL, MED, "ab")).resolves.toEqual({ erro: "Informe o motivo da exclusão, com ao menos 3 letras" });
    await expect(excluirRelatorioReajuste("x", MED, "PDF errado")).resolves.toEqual({ erro: "Relatório inválido" });
    expect(estado.chamadas).toEqual([]);
  });

  it("recusa do banco volta como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "O relatório de reajuste 2 já foi excluído" } };
    await expect(excluirRelatorioReajuste(REL, MED, "PDF errado")).resolves.toEqual({ erro: "O relatório de reajuste 2 já foi excluído" });
  });
});

describe("salvarConfigReajuste", () => {
  const dados = { temReajuste: true, dataBase: "2025-01", periodicidadeMeses: 12, indiceDescricao: "SICRO" };

  it("chama fn_mc_reajuste_config_salvar e revalida o contrato", async () => {
    await expect(salvarConfigReajuste(CONTRATO, dados)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_reajuste_config_salvar", args: { p_contrato: CONTRATO, p_dados: { tem_reajuste: true, data_base: "2025-01", periodicidade_meses: "12", indice_descricao: "SICRO" } } },
    ]);
    expect(estado.revalidadas).toContain(`/medicao/contratos/${CONTRATO}`);
    expect(estado.revalidadas).toContain("/medicao/alertas");
  });

  it("com reajuste sem data-base não chama o banco", async () => {
    await expect(salvarConfigReajuste(CONTRATO, { ...dados, dataBase: "" })).resolves.toEqual({ erro: "Informe o mês da data-base do reajuste" });
    expect(estado.chamadas).toEqual([]);
  });

  it("sem permissão não chama o banco", async () => {
    estado.negadas = ["medicao.reajuste/editar"];
    await expect(salvarConfigReajuste(CONTRATO, dados)).resolves.toEqual({ erro: "Sem permissão para configurar o reajuste" });
    expect(estado.chamadas).toEqual([]);
  });
});
