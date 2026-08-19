import type ExcelJS from "exceljs";

import { LOGO_EMT_PNG_BASE64 } from "@/config/marca-logo";
import { argb, CORES_MARCA, EMPRESA } from "@/config/marca";

/**
 * O cabeçalho de marca de toda planilha que o sistema exporta: logo, razão
 * social com CNPJ, o nome do relatório e a Pista (asfalto com o eixo amarelo)
 * separando a marca dos dados.
 *
 * **Módulo de servidor**: mexe com exceljs. Nunca importar de Client Component.
 *
 * Existe como helper, e não copiado dentro de cada export, porque a exigência é
 * de igualdade: a planilha de lançamentos e qualquer export futuro precisam sair
 * com a mesma marca. E porque quem escreve um export novo não deve ter que
 * lembrar de deslocar `autoFilter`, `frozen` e a linha de total — a função
 * devolve o número da linha do cabeçalho de colunas, e o resto se calcula a
 * partir dele.
 *
 * A logo é imagem FLUTUANTE (âncora, não célula): planilha com imagem dentro de
 * célula mesclada quebra a largura das colunas quando alguém ordena ou filtra. A
 * linha 1 fica só para ela, sem texto nenhum embaixo, para nunca haver imagem
 * sobre número.
 */

/** Quantas linhas o cabeçalho de marca ocupa antes da linha de colunas. */
export const LINHAS_CABECALHO_MARCA = 5;

/** Altura, em pontos, de cada linha do cabeçalho de marca. */
const ALTURAS = {
  logo: 40,
  razaoSocial: 16,
  contexto: 13,
  asfalto: 3,
  eixo: 2,
} as const;

/**
 * Escreve o cabeçalho de marca no topo da aba.
 *
 * @returns o número da linha em que o cabeçalho de COLUNAS deve ser escrito.
 *   Sempre `LINHAS_CABECALHO_MARCA + 1`; devolvido para o chamador não repetir
 *   a conta e não sair de sincronia se o cabeçalho crescer.
 */
export function escreverCabecalhoMarca(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  {
    titulo,
    colunas,
  }: {
    /** O que a planilha é: "Lançamentos financeiros". */
    titulo: string;
    /** Quantas colunas a planilha tem, para mesclar e pintar na largura certa. */
    colunas: number;
  },
): number {
  const ultimaColuna = Math.max(1, colunas);

  const logo = workbook.addImage({
    base64: LOGO_EMT_PNG_BASE64,
    extension: "png",
  });
  worksheet.getRow(1).height = ALTURAS.logo;
  worksheet.addImage(logo, {
    tl: { col: 0.2, row: 0.15 },
    ext: { width: 74, height: 47 },
    editAs: "oneCell",
  });

  worksheet.mergeCells(2, 1, 2, ultimaColuna);
  const razaoSocial = worksheet.getCell(2, 1);
  razaoSocial.value = `${EMPRESA.razaoSocial} · CNPJ: ${EMPRESA.cnpj}`;
  razaoSocial.font = {
    bold: true,
    size: 12,
    color: { argb: argb(CORES_MARCA.verdeEscuro) },
  };
  worksheet.getRow(2).height = ALTURAS.razaoSocial;

  worksheet.mergeCells(3, 1, 3, ultimaColuna);
  const contexto = worksheet.getCell(3, 1);
  contexto.value = `${titulo} · ${EMPRESA.endereco} · ${EMPRESA.telefones}`;
  contexto.font = {
    size: 9,
    color: { argb: argb(CORES_MARCA.textoSecundario) },
  };
  worksheet.getRow(3).height = ALTURAS.contexto;

  // A Pista: uma linha fina de asfalto e uma do eixo amarelo, o mesmo desenho
  // que separa o cabeçalho no espelho impresso.
  pintarFaixa(worksheet, 4, ultimaColuna, CORES_MARCA.asfalto, ALTURAS.asfalto);
  pintarFaixa(worksheet, 5, ultimaColuna, CORES_MARCA.amarelo, ALTURAS.eixo);

  return LINHAS_CABECALHO_MARCA + 1;
}

/** Linha inteira de uma cor só, usada para desenhar a Pista. */
function pintarFaixa(
  worksheet: ExcelJS.Worksheet,
  linha: number,
  ultimaColuna: number,
  cor: string,
  altura: number,
): void {
  const alvo = worksheet.getRow(linha);
  alvo.height = altura;
  for (let coluna = 1; coluna <= ultimaColuna; coluna += 1) {
    alvo.getCell(coluna).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(cor) },
    };
  }
}

/**
 * Estilo da linha de cabeçalho de colunas: fundo no verde da marca, texto
 * branco em negrito. Verde CHAPADO aqui, e não o verde lavado do papel, porque
 * planilha é lida na tela e não sai na impressora na maioria das vezes — e o
 * contraste do branco sobre o verde é o que faz o cabeçalho aguentar 3.000
 * linhas de rolagem.
 */
export function estilizarCabecalhoColunas(linha: ExcelJS.Row): void {
  linha.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(CORES_MARCA.verde) },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: argb(CORES_MARCA.verdeEscuro) } },
    };
    cell.alignment = { vertical: "middle" };
  });
}
