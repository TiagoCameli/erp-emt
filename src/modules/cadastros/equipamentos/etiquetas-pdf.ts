import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";

import { CORES_MARCA, EMPRESA } from "@/config/marca";
import { urlDoEquipamento } from "@/modules/cadastros/equipamentos/etiqueta-qr";

/**
 * Folha de etiquetas QR dos equipamentos, para imprimir, recortar e colar.
 *
 * Substitui as etiquetas do Gestão Obras. O QR abre a tela de campo do
 * equipamento (`/m/equipamento/{id}`), onde o operador lança horímetro e abre
 * OS sem digitar código nenhum.
 *
 * MÓDULO PURO: monta a definição do documento e não desenha nada. Quem
 * transforma isso em bytes é `src/lib/pdf.ts`, carregado por import dinâmico na
 * action. Separado assim para "cabe 8 por folha" ser provado em teste contando
 * `/Type /Page` no PDF gerado, sem banco nem sessão.
 *
 * ============================================================
 * A GRADE
 * ============================================================
 * A4 retrato, 2 colunas x 4 linhas = 8 etiquetas por folha, cada uma com borda
 * tracejada de recorte. Cada FOLHA é uma tabela própria com quebra de página
 * antes (a partir da segunda): deixar o pdfmake quebrar uma tabela única faria a
 * quebra depender de a soma das alturas caber ou não na folha, e uma etiqueta
 * cortada ao meio entre duas páginas é etiqueta perdida.
 *
 * Medidas em pt (1 mm = 2,8346 pt). A folha tem 595,28 x 841,89; com 7 mm de
 * margem lateral e 12 mm em cima e embaixo, sobram 555,6 x 773,9, e 4 linhas de
 * 190 pt ocupam 760. A folga de 14 pt existe para a espessura das linhas e o
 * arredondamento do pdfmake não empurrarem a quarta linha para a folha seguinte.
 *
 * Nada aqui usa cor de fundo: quem imprime pode desligar "gráficos de fundo", e
 * o QR precisa sair preto no branco de qualquer jeito para a câmera ler.
 */

/** O que a etiqueta mostra de cada equipamento. */
export interface EtiquetaEquipamento {
  id: string;
  codigo: string | null;
  descricao: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
}

const MM = 72 / 25.4;

/** Etiquetas por folha: 2 colunas x 4 linhas. */
export const ETIQUETAS_POR_PAGINA = 8;
const COLUNAS = 2;

const MARGEM_LATERAL = 7 * MM;
const MARGEM_VERTICAL = 12 * MM;
const LARGURA_PAGINA = 595.28;

/** Altura de cada linha de etiquetas, em pt (cerca de 67 mm). */
const ALTURA_ETIQUETA = 190;
/** Respiro interno da etiqueta, em pt. */
const RESPIRO = 6;
/** Lado do QR, em pt (55 mm). */
export const LADO_QR = 55 * MM;
const ESPACO_QR_TEXTO = 8;

const LARGURA_COLUNA = (LARGURA_PAGINA - 2 * MARGEM_LATERAL) / COLUNAS;

/**
 * Tamanho máximo do nome, em caracteres, para caber em duas linhas de 9 pt ao
 * lado do QR (uns 100 pt de largura, perto de 20 caracteres por linha em negrito). É estimativa por média de largura da
 * Helvetica, não medida: um nome todo em maiúscula larga pode quebrar numa
 * terceira linha, e a etiqueta tem altura de sobra para isso sem empurrar a
 * grade (o teste com nomes longos prova).
 */
export const MAX_CARACTERES_NOME = 38;

export const TEXTO_INSTRUCAO = "Aponte a câmera: horímetro e abrir OS";

/** Corta o texto no limite, na última palavra inteira, com reticências. */
export function encurtar(texto: string, limite: number): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > limite / 2 ? corte.slice(0, ultimoEspaco) : corte;
  // Pontuação solta antes das reticências ("B2T093 -…") parece erro de digitação.
  return `${base.replace(/[\s–,.;:/-]+$/, "")}…`;
}

/** O código grande da etiqueta. Sem código cadastrado, a placa; sem os dois, avisa. */
export function codigoDaEtiqueta(etiqueta: EtiquetaEquipamento): string {
  const codigo = etiqueta.codigo?.trim();
  if (codigo) return codigo;
  const placa = etiqueta.placa?.trim();
  if (placa) return placa;
  return "Sem código";
}

/** "Tipo · Marca Modelo", só com o que existe. Vazio quando nada foi cadastrado. */
export function linhaTipoModelo(etiqueta: EtiquetaEquipamento): string {
  const marcaModelo = [etiqueta.marca, etiqueta.modelo]
    .map((parte) => parte?.trim())
    .filter(Boolean)
    .join(" ");
  return [etiqueta.tipo?.trim(), marcaModelo]
    .filter((parte): parte is string => Boolean(parte))
    .join(" · ");
}

/** Uma etiqueta: QR à esquerda, identificação à direita. */
function celulaEtiqueta(etiqueta: EtiquetaEquipamento, base: string): TableCell {
  const tipoModelo = linhaTipoModelo(etiqueta);
  const margemTopo = (ALTURA_ETIQUETA - 2 * RESPIRO - LADO_QR) / 2;

  const texto: Content[] = [
    {
      text: codigoDaEtiqueta(etiqueta),
      fontSize: 18,
      bold: true,
      color: CORES_MARCA.asfalto,
      margin: [0, 0, 0, 2],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 28,
          y2: 0,
          lineWidth: 2,
          lineColor: CORES_MARCA.amarelo,
        },
      ],
      margin: [0, 0, 0, 6],
    },
    {
      text: encurtar(etiqueta.descricao, MAX_CARACTERES_NOME),
      fontSize: 9,
      bold: true,
      color: CORES_MARCA.texto,
      margin: [0, 0, 0, 4],
    },
  ];

  if (tipoModelo) {
    texto.push({
      text: encurtar(tipoModelo, MAX_CARACTERES_NOME),
      fontSize: 8,
      color: CORES_MARCA.textoSecundario,
      margin: [0, 0, 0, 4],
    });
  }

  texto.push(
    {
      text: TEXTO_INSTRUCAO,
      fontSize: 7,
      color: CORES_MARCA.textoSecundario,
      margin: [0, 6, 0, 6],
    },
    {
      text: EMPRESA.nome,
      fontSize: 8,
      bold: true,
      color: CORES_MARCA.verde,
    },
  );

  return {
    columns: [
      {
        qr: urlDoEquipamento(base, etiqueta.id),
        fit: LADO_QR,
        eccLevel: "H",
        width: LADO_QR,
      },
      { width: "*", stack: texto, margin: [0, 4, 0, 0] },
    ],
    columnGap: ESPACO_QR_TEXTO,
    margin: [0, margemTopo, 0, 0],
  };
}

/** Linha tracejada de recorte, fina e cinza, para não competir com o QR. */
const LAYOUT_RECORTE: CustomTableLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => CORES_MARCA.textoSecundario,
  vLineColor: () => CORES_MARCA.textoSecundario,
  hLineStyle: () => ({ dash: { length: 4, space: 3 } }),
  vLineStyle: () => ({ dash: { length: 4, space: 3 } }),
  paddingLeft: () => RESPIRO,
  paddingRight: () => RESPIRO,
  paddingTop: () => RESPIRO,
  paddingBottom: () => RESPIRO,
};

/** Divide a lista em pedaços de `tamanho`. */
function emPedacos<T>(lista: readonly T[], tamanho: number): T[][] {
  const pedacos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    pedacos.push(lista.slice(i, i + tamanho));
  }
  return pedacos;
}

/**
 * Definição do PDF das etiquetas, na ordem recebida (a action já ordena por
 * código). `base` é a URL pública do app, já normalizada por `basePublica`.
 */
export function montarDocumentoEtiquetas(
  etiquetas: readonly EtiquetaEquipamento[],
  base: string,
): TDocumentDefinitions {
  const folhas = emPedacos(etiquetas, ETIQUETAS_POR_PAGINA);

  const content: Content[] = folhas.map((folha, indiceFolha) => {
    const linhas: TableCell[][] = emPedacos(folha, COLUNAS).map((par) => {
      const celulas: TableCell[] = par.map((etiqueta) =>
        celulaEtiqueta(etiqueta, base),
      );
      // Última linha com uma etiqueta só: a vizinha fica em branco e sem borda.
      while (celulas.length < COLUNAS) {
        celulas.push({ text: "", border: [false, false, false, false] });
      }
      return celulas;
    });

    return {
      table: {
        // A largura da tabela no pdfmake é o CONTEÚDO: respiro e linha somam por
        // fora. Tirar os dois aqui é o que faz as duas colunas fecharem na
        // largura útil em vez de passar dela por 2 pt.
        widths: Array.from(
          { length: COLUNAS },
          () => LARGURA_COLUNA - 2 * RESPIRO - 1,
        ),
        heights: ALTURA_ETIQUETA - 2 * RESPIRO,
        dontBreakRows: true,
        body: linhas,
      },
      layout: LAYOUT_RECORTE,
      ...(indiceFolha > 0 ? { pageBreak: "before" as const } : {}),
    };
  });

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [MARGEM_LATERAL, MARGEM_VERTICAL, MARGEM_LATERAL, MARGEM_VERTICAL],
    info: {
      title: "Etiquetas QR de equipamentos",
      author: EMPRESA.nome,
    },
    defaultStyle: { font: "Helvetica", fontSize: 9 },
    content,
  };
}

/** Nome do arquivo baixado, com a data de Rio Branco. */
export function nomeArquivoEtiquetas(agora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return `etiquetas-equipamentos-${dia}.pdf`;
}
