import ExcelJS from "exceljs";

import { argb, CORES_MARCA, EMPRESA } from "@/config/marca";
import { escreverCabecalhoMarca, estilizarCabecalhoColunas } from "@/lib/planilha-marca";
import { periodoMedicao } from "@/modules/medicao/boletim/formato";
import type { Boletim, QtdsPorMedicao } from "@/modules/medicao/boletim/tipos";

/**
 * O boletim de medição em .xlsx, uma aba só, no layout de colunas da planilha oficial do DNIT.
 *
 * Toda célula sai do texto que a RPC `fn_mc_boletim` devolveu: nenhuma fórmula, nenhuma conta
 * (D7). O `Number(texto)` daqui só põe o texto do banco dentro da célula. Preço e quantidade
 * vieram de double do xlsx oficial e o banco guarda o texto mais curto que volta ao mesmo double,
 * então `Number` devolve exatamente o double da célula oficial (é o que a Task 8 confere). O
 * total é o da RPC, não a soma das linhas: é ele que reproduz o centavo do Lote 09.
 *
 * Não fala com banco nem com permissão (isso é da Server Action), então dá para escrever o arquivo
 * num teste e reler. **Módulo de servidor**: puxa o exceljs; nunca importar de Client Component.
 */

/** Item, Discriminação, Unid., Preço, Quantidade prevista e Valor previsto: antes das medições. */
export const COLUNAS_FIXAS_BOLETIM = 6;

/**
 * Valor na Nª, Acumulado, % executada, Saldo, % a medir e, da Fase 6, Reajuste na Nª e Reajuste
 * acumulado: depois das medições. As duas do reajuste ficam no fim para as colunas do layout do DNIT
 * não mudarem de lugar (a conferência do Lote 09 acha cada coluna pelo título).
 */
const COLUNAS_FINAIS = 7;

export const ABA_PLANILHA_BOLETIM = "Boletim";

/** Preço e quantidade: 2 casas no mínimo e as escondidas que existirem (até 10), como no oficial. */
const FORMATO_QUANTIDADE = "#,##0.00########";
const FORMATO_DINHEIRO = '"R$" #,##0.00';
const FORMATO_PERCENTUAL = "0.00%";

const LARGURAS = {
  item: 12,
  descricao: 60,
  unidade: 8,
  quantidade: 16,
  medicao: 14,
  dinheiro: 18,
  percentual: 13,
} as const;

/**
 * O texto numérico do banco como número da célula; nulo ou vazio vira célula em branco.
 * Só conversão de formato: nada é somado, arredondado ou comparado aqui.
 */
function numeroDoBanco(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined || texto.trim() === "") return null;
  const numero = Number(texto);
  if (Number.isNaN(numero)) throw new Error(`O banco devolveu um número que não é número: "${texto}"`);
  return numero;
}

/** Quantidade da medição `n`; sem a chave em `qtds`, a célula fica vazia. */
function qtdDaMedicao(qtds: QtdsPorMedicao, n: number): number | null {
  return numeroDoBanco(qtds[String(n)]);
}

/** "Contrato L09 · CT 123/2024 · BR-364 Lote 09 · Até a 10ª medição (01/08 a 31/08/2026) · Planilha v0". */
function linhaDeContexto(boletim: Boletim): string {
  const { contrato, versao, ate } = boletim;
  const partes = [`Contrato ${contrato.codigo}`];
  if (contrato.numero_contrato) partes.push(`CT ${contrato.numero_contrato}`);
  partes.push(contrato.nome_obra);
  if (ate === null) {
    partes.push("Sem medição");
  } else {
    const medicao = boletim.medicoes.find((m) => m.numero === ate);
    partes.push(
      medicao
        ? `Até a ${ate}ª medição (${periodoMedicao(medicao.periodo_inicio, medicao.periodo_fim)})`
        : `Até a ${ate}ª medição`,
    );
  }
  partes.push(versao ? `Planilha v${versao.numero}` : "Sem versão vigente da planilha");
  return partes.join(" · ");
}

/** Os números 1..N das colunas de medição ("boletim até a Nª"). */
function numerosDasMedicoes(ate: number | null): number[] {
  return ate === null ? [] : Array.from({ length: ate }, (_, i) => i + 1);
}

/** Uma linha da planilha: as 6 fixas, uma por medição e as 7 finais. */
type CelulaBoletim = string | number | null;

type Finais = [CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim];

function linhaDeValores(
  fixas: [CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim, CelulaBoletim],
  medicoes: CelulaBoletim[],
  finais: Finais,
): CelulaBoletim[] {
  return [...fixas, ...medicoes, ...finais];
}

/**
 * Monta o .xlsx do boletim.
 *
 * Linhas: marca (1 a 5), contexto, cabeçalho de colunas, uma linha por linha do boletim na ordem
 * da RPC, "Total:" e, só quando existe item medido fora da versão exibida, uma linha em branco, o
 * rótulo do bloco e os itens. Toda posição sai do número que `escreverCabecalhoMarca` devolve,
 * nunca de constante: se a marca crescer, contexto, cabeçalho e congelamento acompanham.
 */
export async function montarPlanilhaBoletim(boletim: Boletim): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;

  const worksheet = workbook.addWorksheet(ABA_PLANILHA_BOLETIM);
  const medicoes = numerosDasMedicoes(boletim.ate);
  const totalColunas = COLUNAS_FIXAS_BOLETIM + medicoes.length + COLUNAS_FINAIS;

  const linhaContexto = escreverCabecalhoMarca(workbook, worksheet, {
    titulo: "Boletim de medição",
    colunas: totalColunas,
  });

  worksheet.mergeCells(linhaContexto, 1, linhaContexto, totalColunas);
  const contexto = worksheet.getCell(linhaContexto, 1);
  contexto.value = linhaDeContexto(boletim);
  contexto.font = { bold: true, size: 10, color: { argb: argb(CORES_MARCA.texto) } };

  const rotuloValorNaMedicao =
    boletim.ate === null ? "Valor (R$) Executado na Medição" : `Valor (R$) Executado na ${boletim.ate}ª Medição`;

  const rotuloReajusteNaMedicao = boletim.ate === null ? "Reajuste na medição" : `Reajuste na ${boletim.ate}ª`;

  const linhaHeader = worksheet.getRow(linhaContexto + 1);
  linhaHeader.values = linhaDeValores(
    ["Item", "Discriminação", "Unid.", "Preço Unitário", "Quantidade Prevista Total", "Valor (R$) Previsto Total"],
    medicoes.map((n) => `${n}ª Medição`),
    [
      rotuloValorNaMedicao,
      "Valor (R$) Executado Acumulado",
      "Porcentagem Executada (%)",
      "Saldo a Medir (R$)",
      "Porcentagem a Medir (%)",
      rotuloReajusteNaMedicao,
      "Reajuste acumulado",
    ],
  );
  estilizarCabecalhoColunas(linhaHeader);
  linhaHeader.alignment = { vertical: "middle", wrapText: true };
  linhaHeader.height = 32;

  // Colunas por posição, a partir de uma conta só (6 fixas + N medições + 7 finais).
  const primeiraMedicao = COLUNAS_FIXAS_BOLETIM + 1;
  const primeiraFinal = COLUNAS_FIXAS_BOLETIM + medicoes.length + 1;
  const col = {
    item: 1,
    descricao: 2,
    unidade: 3,
    preco: 4,
    quantidade: 5,
    previsto: 6,
    valorMedicao: primeiraFinal,
    acumulado: primeiraFinal + 1,
    pctExecutado: primeiraFinal + 2,
    saldo: primeiraFinal + 3,
    pctAMedir: primeiraFinal + 4,
    reajusteMedicao: primeiraFinal + 5,
    reajusteAcumulado: primeiraFinal + 6,
  };

  const formatos = new Map<number, string>([
    [col.preco, FORMATO_QUANTIDADE],
    [col.quantidade, FORMATO_QUANTIDADE],
    [col.previsto, FORMATO_DINHEIRO],
    [col.valorMedicao, FORMATO_DINHEIRO],
    [col.acumulado, FORMATO_DINHEIRO],
    [col.pctExecutado, FORMATO_PERCENTUAL],
    [col.saldo, FORMATO_DINHEIRO],
    [col.pctAMedir, FORMATO_PERCENTUAL],
    [col.reajusteMedicao, FORMATO_DINHEIRO],
    [col.reajusteAcumulado, FORMATO_DINHEIRO],
  ]);
  for (let c = primeiraMedicao; c < primeiraFinal; c += 1) formatos.set(c, FORMATO_QUANTIDADE);

  /** Escreve a linha e põe o formato numérico em cada célula (formato na célula, não só na coluna). */
  function escrever(valores: CelulaBoletim[]): ExcelJS.Row {
    const row = worksheet.addRow(valores);
    for (const [c, numFmt] of formatos) row.getCell(c).numFmt = numFmt;
    return row;
  }

  function destacar(row: ExcelJS.Row, preenchimento: string | null): void {
    for (let c = 1; c <= totalColunas; c += 1) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      if (preenchimento) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(preenchimento) } };
      }
    }
  }

  for (const l of boletim.linhas) {
    const row = escrever(
      linhaDeValores(
        [
          l.codigo,
          l.descricao,
          l.unidade,
          numeroDoBanco(l.preco_unitario),
          numeroDoBanco(l.quantidade_prevista),
          numeroDoBanco(l.previsto),
        ],
        medicoes.map((n) => qtdDaMedicao(l.qtds, n)),
        [
          numeroDoBanco(l.valor_medicao),
          numeroDoBanco(l.acumulado),
          numeroDoBanco(l.pct_executado),
          numeroDoBanco(l.saldo),
          numeroDoBanco(l.pct_a_medir),
          numeroDoBanco(l.reajuste_medicao),
          numeroDoBanco(l.reajuste_acumulado),
        ],
      ),
    );
    if (l.tipo === "titulo") destacar(row, CORES_MARCA.verdeLavado);
  }

  // O total é o da RPC, em valor: a soma das linhas pode diferir no centavo e quem manda é o banco.
  const { total } = boletim;
  const linhaTotal = escrever(
    linhaDeValores(
      ["Total:", null, null, null, null, numeroDoBanco(total.previsto)],
      medicoes.map(() => null),
      [
        numeroDoBanco(total.valor_medicao),
        numeroDoBanco(total.acumulado),
        numeroDoBanco(total.pct_executado),
        numeroDoBanco(total.saldo),
        numeroDoBanco(total.pct_a_medir),
        numeroDoBanco(total.reajuste_medicao),
        numeroDoBanco(total.reajuste_acumulado),
      ],
    ),
  );
  destacar(linhaTotal, CORES_MARCA.superficie);
  for (let c = 1; c <= totalColunas; c += 1) {
    linhaTotal.getCell(c).border = { top: { style: "thin", color: { argb: argb(CORES_MARCA.asfalto) } } };
  }

  // Item medido que saiu da versão exibida: entra no acumulado e no valor da Nª do total, então
  // precisa aparecer no arquivo para o total fechar com as linhas. Sem previsto (não está na versão).
  if (boletim.fora_da_versao.length > 0) {
    worksheet.addRow([]);
    const rotulo = worksheet.addRow(["Itens medidos fora da versão vigente"]);
    rotulo.getCell(1).font = { bold: true, color: { argb: argb(CORES_MARCA.verdeEscuro) } };
    for (const item of boletim.fora_da_versao) {
      escrever(
        linhaDeValores(
          [item.codigo, item.descricao, item.unidade, null, null, null],
          medicoes.map((n) => qtdDaMedicao(item.qtds, n)),
          [
            numeroDoBanco(item.valor_medicao),
            numeroDoBanco(item.acumulado),
            null,
            null,
            null,
            numeroDoBanco(item.reajuste_medicao),
            numeroDoBanco(item.reajuste_acumulado),
          ],
        ),
      );
    }
  }

  // Larguras fixas por tipo de coluna.
  worksheet.getColumn(col.item).width = LARGURAS.item;
  worksheet.getColumn(col.descricao).width = LARGURAS.descricao;
  worksheet.getColumn(col.descricao).alignment = { wrapText: true, vertical: "top" };
  worksheet.getColumn(col.unidade).width = LARGURAS.unidade;
  worksheet.getColumn(col.preco).width = LARGURAS.quantidade;
  worksheet.getColumn(col.quantidade).width = LARGURAS.quantidade;
  for (let c = primeiraMedicao; c < primeiraFinal; c += 1) worksheet.getColumn(c).width = LARGURAS.medicao;
  for (const c of [col.previsto, col.valorMedicao, col.acumulado, col.saldo, col.reajusteMedicao, col.reajusteAcumulado]) {
    worksheet.getColumn(c).width = LARGURAS.dinheiro;
  }
  for (const c of [col.pctExecutado, col.pctAMedir]) worksheet.getColumn(c).width = LARGURAS.percentual;

  // Código e descrição sempre à vista, cabeçalho congelado: 265 linhas e 21 colunas no Lote 09.
  worksheet.views = [{ state: "frozen", xSplit: 2, ySplit: linhaHeader.number }];

  return workbook;
}

/** `boletim-<codigo>-ate-<N>a-medicao.xlsx`; o código vira seguro para nome de arquivo. */
export function nomeArquivoBoletim(boletim: Pick<Boletim, "contrato" | "ate">): string {
  const codigo =
    boletim.contrato.codigo
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "contrato";
  return boletim.ate === null
    ? `boletim-${codigo}-sem-medicao.xlsx`
    : `boletim-${codigo}-ate-${boletim.ate}a-medicao.xlsx`;
}
