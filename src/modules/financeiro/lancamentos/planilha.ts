import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import { formatarDataHora, formatarMesAno } from "@/lib/formatadores";
import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";
import {
  ROTULO_TIPO_LANCAMENTO,
  SEM_CENTRO_DE_CUSTO,
} from "@/modules/financeiro/_shared/formato";
import { ROTULO_REVISAO_DA_LINHA } from "@/modules/financeiro/lancamentos/lote";
import type { LancamentoPlanilha } from "@/modules/financeiro/lancamentos/queries";
import {
  rotuloOrigemLancamento,
  rotuloStatusLancamento,
} from "@/modules/financeiro/lancamentos/schemas";

/**
 * A planilha de lançamentos: quais colunas, em que ordem, de onde sai cada
 * célula e como o arquivo é montado.
 *
 * Cabeçalho e célula moram no MESMO objeto de propósito. Planilha montada com
 * um array de títulos e outro de valores quebra no dia em que alguém insere uma
 * coluna no meio de um só, e o resultado é a pior falha possível num relatório
 * de dinheiro: o número aparece embaixo do título errado, e a planilha continua
 * abrindo sem erro nenhum.
 *
 * Não fala com banco nem com permissão (isso é da Server Action), então dá para
 * escrever o arquivo num teste e reler o que saiu. **Módulo de servidor**: puxa
 * o exceljs, que é grande; nunca importar de Client Component.
 */

/** Como a célula é escrita e alinhada no Excel. */
export type TipoColunaPlanilha = "texto" | "dinheiro" | "data" | "inteiro";

/** Valor de uma célula. `null` sai como célula em branco. */
export type CelulaPlanilha = string | number | Date | null;

export interface ColunaPlanilha {
  cabecalho: string;
  /** Largura em caracteres, o que o exceljs entende. */
  largura: number;
  tipo: TipoColunaPlanilha;
  celula: (lancamento: LancamentoPlanilha) => CelulaPlanilha;
}

/**
 * Data `yyyy-MM-dd` como célula de data do Excel.
 *
 * Meia-noite **UTC**, e não `TZDate` no fuso de Rio Branco, porque o exceljs
 * converte `Date` em número de série do Excel com aritmética de UTC pura
 * (`25569 + getTime() / 86400000`). Uma data criada no fuso local viraria série
 * fracionária e o Excel mostraria o dia anterior. Aqui a data é um dia do
 * calendário, sem hora nenhuma: o instante não interessa, o dia interessa.
 */
export function dataParaCelula(data: string | null | undefined): Date | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Valor de um item do rateio, dentro da célula de composição.
 *
 * Sem "R$" de propósito, e é por isso que não usa `formatarBRL`: a célula junta
 * vários centros ("Escritório: 1.200,00; BR-364: 800,00") e repetir o símbolo em
 * cada um enche de ruído a única coluna que já é a mais longa da planilha. A
 * moeda está na coluna Valor, que é número de verdade e soma.
 */
function valorDoRateio(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Colunas da planilha, na ordem em que saem.
 *
 * Traz o lançamento INTEIRO, não o resumo da listagem: além do que a tela mostra,
 * vão centro de custo, rateio, forma e condição de pagamento, conta bancária,
 * número do documento de origem e observações.
 *
 * **Uma linha por lançamento, e isso é o que decide a forma do rateio.** Um
 * lançamento pode ser dividido entre várias obras, então "Centro de custo" lista
 * os nomes e "Rateio" traz quanto foi para cada um.
 *
 * Quem precisa somar por obra usa a OUTRA versão, uma linha por rateio
 * (`montarPlanilhaLancamentosPorRateio`, mais abaixo). Ela existe desde
 * 28/08/2026 e não substitui esta: a armadilha do formato é repetir o valor do
 * documento em N linhas, e aí quem soma a coluna conta o mesmo dinheiro várias
 * vezes com o arquivo abrindo sem erro. Lá a coluna que soma é a FATIA, e o
 * valor do documento aparece uma vez só por lançamento — o porquê está escrito
 * em `LinhaRateio`.
 *
 * Parcela também é 1-N (conta, vencimento, pagamento). Aqui entra só o resumo: a
 * quantidade em "Parcelas" e a conta bancária quando é a mesma em todas.
 */
export const COLUNAS_PLANILHA_LANCAMENTOS: ColunaPlanilha[] = [
  {
    cabecalho: "Número",
    largura: 16,
    tipo: "texto",
    celula: (l) => l.numero ?? "",
  },
  {
    // Logo depois do número interno, porque é a pergunta seguinte de quem
    // confere a planilha: "esse lançamento é de qual nota?".
    cabecalho: "Número do documento",
    largura: 22,
    tipo: "texto",
    celula: (l) => l.numeroDocumento ?? "",
  },
  {
    cabecalho: "Tipo",
    largura: 12,
    tipo: "texto",
    celula: (l) => ROTULO_TIPO_LANCAMENTO[l.tipo],
  },
  {
    cabecalho: "Descrição",
    largura: 44,
    tipo: "texto",
    celula: (l) => l.descricao,
  },
  {
    cabecalho: "Categoria",
    largura: 24,
    tipo: "texto",
    celula: (l) => l.categoriaNome ?? "",
  },
  {
    // Mesma regra da tela: a coluna diz QUEM RECEBE, e isso é o fornecedor numa
    // compra e o colaborador num lançamento do RH. Exportar só o fornecedor
    // deixaria a folha inteira com a célula vazia na planilha.
    cabecalho: "Fornecedor",
    largura: 30,
    tipo: "texto",
    celula: (l) => l.fornecedorNome ?? l.colaboradorNome ?? "",
  },
  {
    cabecalho: "Valor",
    largura: 16,
    tipo: "dinheiro",
    // Número cru, com formato de moeda na célula: quem recebe a planilha soma,
    // filtra e faz tabela dinâmica. "R$ 1.234,56" como texto viraria uma coluna
    // que não soma, e o motivo de exportar é justamente somar.
    celula: (l) => l.valor,
  },
  {
    cabecalho: "Data da compra",
    largura: 15,
    tipo: "data",
    celula: (l) => dataParaCelula(l.dataCompra),
  },
  {
    cabecalho: "Mês de referência",
    largura: 16,
    tipo: "texto",
    // mm/aaaa, igual à tela: é competência, não um dia do calendário.
    celula: (l) => formatarMesAno(l.mesCompetencia),
  },
  {
    cabecalho: "Vencimento",
    largura: 14,
    tipo: "data",
    celula: (l) => dataParaCelula(l.dataVencimento),
  },
  {
    cabecalho: "Status",
    largura: 14,
    tipo: "texto",
    celula: (l) => rotuloStatusLancamento(l.status, l.tipo),
  },
  {
    cabecalho: "Parcelas",
    largura: 10,
    tipo: "inteiro",
    celula: (l) => l.qtdParcelas,
  },
  {
    cabecalho: "Revisão",
    largura: 14,
    tipo: "texto",
    celula: (l) => ROTULO_REVISAO_DA_LINHA[l.revisao],
  },
  {
    cabecalho: "Origem",
    largura: 18,
    tipo: "texto",
    celula: (l) => rotuloOrigemLancamento(l.origem),
  },
  {
    cabecalho: "Documento de origem",
    largura: 20,
    tipo: "texto",
    // "Ordem de compra" na coluna Origem não diz QUAL ordem: sem o número, quem
    // confere a planilha volta ao sistema para achar o documento.
    celula: (l) => l.origemNumero,
  },
  {
    // A espinha dorsal do ERP: custo sem centro de custo não existe. Era a
    // ausência mais sentida da planilha.
    cabecalho: "Centro de custo",
    largura: 28,
    tipo: "texto",
    celula: (l) =>
      l.rateios.length === 0
        ? null
        : l.rateios.map((rateio) => rateio.nome).join("; "),
  },
  {
    cabecalho: "Rateio",
    largura: 40,
    tipo: "texto",
    // Só quando há mais de um centro: com um só, a composição repetiria o nome
    // da coluna ao lado e o valor do lançamento, virando ruído em toda linha.
    celula: (l) =>
      l.rateios.length < 2
        ? null
        : l.rateios
            .map((rateio) => `${rateio.nome}: ${valorDoRateio(rateio.valor)}`)
            .join("; "),
  },
  {
    cabecalho: "Forma de pagamento",
    largura: 20,
    tipo: "texto",
    celula: (l) => l.formaPagamentoNome,
  },
  {
    cabecalho: "Condição de pagamento",
    largura: 22,
    tipo: "texto",
    celula: (l) => l.condicaoPagamentoDescricao,
  },
  {
    cabecalho: "Conta bancária",
    largura: 26,
    tipo: "texto",
    celula: (l) => l.contaBancariaNome,
  },
  {
    cabecalho: "Criado em",
    largura: 18,
    tipo: "texto",
    // Texto, e não data: é timestamptz, e o que vale é o horário de Rio Branco
    // (regra do ERP). Como data do Excel, ela abriria no fuso de quem abre.
    celula: (l) => formatarDataHora(l.criadoEm),
  },
  {
    // Última de propósito: é a coluna mais larga e a única com texto de tamanho
    // imprevisível. No meio da planilha ela empurraria tudo que interessa para
    // fora da tela de quem abre o arquivo.
    cabecalho: "Observações",
    largura: 50,
    tipo: "texto",
    celula: (l) => l.observacoes,
  },
];

/** Cabeçalhos, na ordem das colunas. */
export const CABECALHOS_PLANILHA_LANCAMENTOS = COLUNAS_PLANILHA_LANCAMENTOS.map(
  (coluna) => coluna.cabecalho,
);

/* ------------------------------------------------------------------ */
/* A outra versão: uma linha por rateio                               */
/* ------------------------------------------------------------------ */

/**
 * Uma linha da planilha POR RATEIO: o lançamento inteiro repetido, mais a fatia
 * de UM centro de custo.
 *
 * A versão por lançamento (acima) responde "quanto e para quem"; esta responde
 * "quanto foi para cada obra", que é a pergunta de quem monta tabela dinâmica
 * por centro de custo. Um lançamento rateado entre três obras vira três linhas.
 *
 * CENTRO DE CUSTO E ETAPA SÃO DUAS COLUNAS, e essa é a regra que a primeira
 * versão errou. No vocabulário do ERP são coisas diferentes: "001 - Carretas
 * EMT" é o centro de custo, e "Caminhão Cavalo XF 530 FTT SQU9C94 - 03" é uma
 * ETAPA dele. Pôr o nível gravado numa coluna só enchia "Centro de custo" de
 * nome de equipamento, e quem soma por obra não achava a obra. Aqui a coluna
 * "Centro de custo" traz sempre a RAIZ, e a etapa vai na coluna ao lado — vazia
 * nos 6.244 rateios (de 6.561) que foram direto para a raiz.
 *
 * O que impede a soma dupla, que é o defeito clássico deste formato: a coluna de
 * dinheiro que soma é a FATIA, nunca o valor do documento. O total do documento
 * vai numa coluna separada e só na PRIMEIRA linha do lançamento, então somar
 * qualquer uma das duas dá um número certo — uma soma o custo por obra, a outra
 * soma os documentos.
 */
export interface LinhaRateio {
  lancamento: LancamentoPlanilha;
  /** O CENTRO DE CUSTO: a raiz da árvore. Nunca o nome da etapa. */
  centroNome: string;
  /** A ETAPA, quando o rateio foi para uma. Null quando foi direto na raiz. */
  etapaNome: string | null;
  centroCodigo: string | null;
  /** A fatia deste rateio. Soma dos rateios = valor do lançamento. */
  valorRateio: number;
  /** Posição desta fatia dentro do lançamento, base 1. */
  parte: number;
  /** Quantas fatias o lançamento tem depois de juntar as do mesmo destino. */
  partes: number;
}

/**
 * Abre cada lançamento em uma linha por centro de custo.
 *
 * JUNTA AS PARTES DO MESMO CENTRO. Um lançamento vindo de OC grava uma parte por
 * item, então cinco itens da mesma obra são cinco linhas em `lancamento_rateios`
 * apontando o mesmo centro (9 lançamentos hoje, até 5 partes). Sem juntar, o
 * arquivo traria a mesma obra repetida cinco vezes, com valores que só fazem
 * sentido para quem tem a OC na mão. A ordem é a da PRIMEIRA aparição de cada
 * centro, para o arquivo sair na mesma sequência que a tela do lançamento.
 *
 * LANÇAMENTO SEM RATEIO VIRA UMA LINHA, com o nome `SEM_CENTRO_DE_CUSTO` e o
 * valor inteiro. Hoje não existe nenhum (o centro de custo é invariante de
 * banco), mas um `flatMap` sobre uma lista vazia apagaria o lançamento do
 * arquivo em silêncio — e planilha de dinheiro com documento faltando não deixa
 * rastro nenhum de que faltou.
 */
export function expandirPorRateio(
  itens: readonly LancamentoPlanilha[],
): LinhaRateio[] {
  const linhas: LinhaRateio[] = [];

  for (const lancamento of itens) {
    const porCentro = new Map<string, LinhaRateio>();

    for (const rateio of lancamento.rateios) {
      // Sem id (centro apagado do cadastro), cada parte fica na sua linha: a
      // chave por nome juntaria dois centros diferentes que perderam o cadastro.
      const chave = rateio.centroId ?? `sem-centro:${porCentro.size}`;
      const existente = porCentro.get(chave);
      if (existente) {
        existente.valorRateio = arredondarCentavos(
          existente.valorRateio + rateio.valor,
        );
        continue;
      }
      porCentro.set(chave, {
        lancamento,
        centroNome: rateio.raizNome,
        etapaNome: rateio.etapaNome,
        centroCodigo: rateio.codigo,
        valorRateio: rateio.valor,
        parte: porCentro.size + 1,
        partes: 0, // preenchido abaixo, quando o total é conhecido.
      });
    }

    const doLancamento =
      porCentro.size > 0
        ? [...porCentro.values()]
        : [
            {
              lancamento,
              centroNome: SEM_CENTRO_DE_CUSTO,
              etapaNome: null,
              centroCodigo: null,
              valorRateio: lancamento.valor,
              parte: 1,
              partes: 1,
            },
          ];

    for (const linha of doLancamento) linha.partes = doLancamento.length;
    linhas.push(...doLancamento);
  }

  return linhas;
}

/**
 * Soma de fatias em centavos inteiros.
 *
 * Somar `191.40 + 180.96` em float sobra 1e-13, e a planilha exibiria o certo
 * enquanto a célula guarda o errado: a diferença só aparece quando alguém
 * compara o total do arquivo com o do sistema e acha um centavo perdido. Mesma
 * regra do resto do módulo de dinheiro.
 */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Uma coluna da planilha por rateio. */
export interface ColunaRateio {
  cabecalho: string;
  largura: number;
  tipo: TipoColunaPlanilha;
  celula: (linha: LinhaRateio) => CelulaPlanilha;
}

/**
 * As colunas que MUDAM na versão por rateio, pelo cabeçalho da versão por
 * lançamento. Uma entrada pode virar duas colunas (é o caso de "Valor").
 *
 * Herdar o resto em vez de listar tudo de novo é o que mantém as duas planilhas
 * juntas: a coluna que alguém acrescentar amanhã à versão por lançamento
 * aparece nas duas, na mesma posição, sem ninguém lembrar de fazer nada.
 */
const COLUNAS_TROCADAS: Record<string, ColunaRateio[]> = {
  Valor: [
    {
      cabecalho: "Valor do rateio",
      largura: 16,
      tipo: "dinheiro",
      // A coluna que SOMA, e por isso é a fatia: é ela que responde "quanto
      // custou esta obra". Somar o documento repetido em N linhas contaria o
      // mesmo dinheiro N vezes, que é o defeito que este formato costuma ter.
      celula: (linha) => linha.valorRateio,
    },
    {
      cabecalho: "Valor do lançamento",
      largura: 18,
      tipo: "dinheiro",
      // Só na PRIMEIRA linha do lançamento. Repetido em todas, ele seria a
      // armadilha de sempre; em branco nas demais, esta coluna também soma
      // certo, e as duas somas juntas viram a conferência do arquivo: elas têm
      // que dar o mesmo número.
      celula: (linha) => (linha.parte === 1 ? linha.lancamento.valor : null),
    },
  ],
  "Centro de custo": [
    {
      cabecalho: "Centro de custo",
      largura: 34,
      tipo: "texto",
      // SEMPRE A RAIZ, mesmo quando o rateio foi para uma etapa: é o que o ERP
      // chama de centro de custo, e é por ele que se soma por obra. A etapa vai
      // na coluna ao lado.
      celula: (linha) => linha.centroNome,
    },
  ],
  Rateio: [
    {
      cabecalho: "Etapa",
      largura: 34,
      tipo: "texto",
      // Em branco no rateio que foi direto para a raiz, que é a maioria (6.244
      // de 6.561): a etapa é um detalhe do centro, não um segundo nome dele, e
      // repetir a raiz aqui faria as duas colunas parecerem a mesma coisa.
      celula: (linha) => linha.etapaNome,
    },
  ],
};

/**
 * Colunas da planilha por rateio: as da versão por lançamento, com as trocas de
 * `COLUNAS_TROCADAS` aplicadas na mesma posição.
 *
 * Se um cabeçalho de `COLUNAS_TROCADAS` deixar de existir na versão por
 * lançamento (alguém renomeou "Valor", por exemplo), o módulo QUEBRA na carga em
 * vez de exportar calado: sem isso, a troca simplesmente não aconteceria e a
 * planilha sairia com o valor do documento repetido em toda linha — total
 * inflado, arquivo abrindo sem erro.
 */
export const COLUNAS_PLANILHA_RATEIOS: ColunaRateio[] = (() => {
  const existentes = new Set(CABECALHOS_PLANILHA_LANCAMENTOS);
  for (const cabecalho of Object.keys(COLUNAS_TROCADAS)) {
    if (!existentes.has(cabecalho)) {
      throw new Error(
        `A planilha por rateio troca a coluna "${cabecalho}", que não existe mais na planilha por lançamento`,
      );
    }
  }

  return COLUNAS_PLANILHA_LANCAMENTOS.flatMap((coluna) => {
    const trocada = COLUNAS_TROCADAS[coluna.cabecalho];
    if (trocada) return trocada;
    return [
      {
        cabecalho: coluna.cabecalho,
        largura: coluna.largura,
        tipo: coluna.tipo,
        celula: (linha: LinhaRateio) => coluna.celula(linha.lancamento),
      },
    ];
  });
})();

/** Cabeçalhos da planilha por rateio, na ordem das colunas. */
export const CABECALHOS_PLANILHA_RATEIOS = COLUNAS_PLANILHA_RATEIOS.map(
  (coluna) => coluna.cabecalho,
);

/** Uma linha da planilha por rateio, na ordem das colunas. */
export function linhaPlanilhaRateio(linha: LinhaRateio): CelulaPlanilha[] {
  return COLUNAS_PLANILHA_RATEIOS.map((coluna) => coluna.celula(linha));
}

/** Nome do arquivo da versão por rateio. Ver `nomeArquivoPlanilhaLancamentos`. */
export function nomeArquivoPlanilhaRateios(dataISO: string): string {
  return `lancamentos-por-rateio-${dataISO}.xlsx`;
}

/** Uma linha da planilha, na ordem das colunas. */
export function linhaPlanilhaLancamento(
  lancamento: LancamentoPlanilha,
): CelulaPlanilha[] {
  return COLUNAS_PLANILHA_LANCAMENTOS.map((coluna) =>
    coluna.celula(lancamento),
  );
}

/**
 * Nome do arquivo, com a data da exportação: o financeiro exporta a mesma tela
 * várias vezes no mês, e três arquivos chamados "lancamentos.xlsx" na pasta de
 * downloads não dizem qual é o de hoje. Recebe a data em vez de ler o relógio
 * para continuar puro.
 */
export function nomeArquivoPlanilhaLancamentos(dataISO: string): string {
  return `lancamentos-${dataISO}.xlsx`;
}

/* ------------------------------------------------------------------ */
/* Montagem do arquivo                                                */
/* ------------------------------------------------------------------ */

/* Cor do cabeçalho e a marca no topo vivem em src/lib/planilha-marca.ts, para
   toda planilha exportada sair igual. */
/**
 * Formato de moeda. No xlsx o código sempre usa `,` para milhar e `.` para
 * decimal; o Excel renderiza no separador do idioma de quem abre, então em
 * pt-BR isto aparece como R$ 1.234,56.
 */
const FORMATO_BRL = "R$ #,##0.00";
const FORMATO_DATA = "dd/mm/yyyy";

/** Nome da aba. Uma só: é uma listagem, não um relatório com seções. */
export const ABA_PLANILHA_LANCAMENTOS = "Lançamentos";

/**
 * Monta o .xlsx: marca da EMT no topo, cabeçalho destacado e congelado, uma
 * linha por lançamento, filtro do Excel ligado e a linha de total.
 *
 * Nenhuma linha aqui é contada na mão. O cabeçalho de marca informa em que linha
 * o cabeçalho de colunas cai (`linhaCabecalho`), e filtro, congelamento e total
 * saem dessa linha — a planilha exportada é conferida contra o banco, e uma
 * fórmula de total apontando uma linha adiante somaria o intervalo errado sem o
 * arquivo dar erro nenhum.
 */
export function montarPlanilhaLancamentos(
  itens: LancamentoPlanilha[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;

  const worksheet = workbook.addWorksheet(ABA_PLANILHA_LANCAMENTOS);

  escreverCabecalhoMarca(workbook, worksheet, {
    titulo: "Lançamentos financeiros",
    colunas: COLUNAS_PLANILHA_LANCAMENTOS.length,
  });

  // `addRow` cai na linha seguinte à última que o cabeçalho de marca escreveu,
  // e o número dela é quem manda no resto: `linhaHeader.number`, nunca a
  // constante. Se um dia a marca crescer uma linha, filtro, congelamento e a
  // fórmula do total acompanham sozinhos.
  const linhaHeader = worksheet.addRow(CABECALHOS_PLANILHA_LANCAMENTOS);
  estilizarCabecalhoColunas(linhaHeader);

  for (const item of itens) {
    worksheet.addRow(linhaPlanilhaLancamento(item));
  }

  // Largura e formato por coluna, tirados do mesmo desenho que gerou as células.
  COLUNAS_PLANILHA_LANCAMENTOS.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    if (definicao.tipo === "dinheiro") {
      coluna.numFmt = FORMATO_BRL;
      coluna.alignment = { horizontal: "right" };
    } else if (definicao.tipo === "data") {
      coluna.numFmt = FORMATO_DATA;
      coluna.alignment = { horizontal: "center" };
    } else if (definicao.tipo === "inteiro") {
      coluna.alignment = { horizontal: "right" };
    }
  });

  const colunaValor = worksheet.getColumn(
    COLUNAS_PLANILHA_LANCAMENTOS.findIndex(
      (definicao) => definicao.tipo === "dinheiro",
    ) + 1,
  );
  const primeiraLinha = linhaHeader.number + 1;
  const ultimaLinha = linhaHeader.number + itens.length;

  // Congela o cabeçalho e liga o filtro do Excel: rolar 3.000 linhas sem isso
  // deixa a pessoa sem saber que coluna está lendo. O filtro para na última
  // linha de dados, de fora a linha de total.
  worksheet.views = [{ state: "frozen", ySplit: linhaHeader.number }];
  worksheet.autoFilter = {
    from: { row: linhaHeader.number, column: 1 },
    to: { row: ultimaLinha, column: COLUNAS_PLANILHA_LANCAMENTOS.length },
  };

  // Total por FÓRMULA, não por soma calculada aqui: quem recebe a planilha
  // filtra e apaga linha, e um total fixo passaria a mentir na primeira mexida.
  // SUBTOTAL(109) soma só o que está visível, então acompanha o filtro.
  const linhaTotais = worksheet.addRow([]);
  linhaTotais.getCell(1).value =
    `Total (${itens.length.toLocaleString("pt-BR")} lançamentos)`;
  linhaTotais.getCell(colunaValor.number).value = {
    formula: `SUBTOTAL(109,${colunaValor.letter}${primeiraLinha}:${colunaValor.letter}${ultimaLinha})`,
  };
  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return workbook;
}

/** Nome da aba da versão por rateio. */
export const ABA_PLANILHA_RATEIOS = "Rateios";

/**
 * Monta o .xlsx POR RATEIO: mesma marca, mesmo cabeçalho congelado e mesmo
 * filtro, com uma linha por centro de custo de cada lançamento.
 *
 * A linha de total traz as DUAS somas, e é a conferência do arquivo: "Valor do
 * rateio" soma as fatias, "Valor do lançamento" soma os documentos (preenchido
 * uma vez por lançamento), e as duas TÊM que dar o mesmo número, porque a soma
 * dos rateios é o valor do lançamento — conferido no banco, 6.365 de 6.365 sem
 * divergência. Divergência ali é rateio incompleto, e aparece na cara de quem
 * abre o arquivo em vez de virar um centavo perdido meses depois.
 */
export function montarPlanilhaLancamentosPorRateio(
  itens: LancamentoPlanilha[],
): ExcelJS.Workbook {
  const linhas = expandirPorRateio(itens);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;

  const worksheet = workbook.addWorksheet(ABA_PLANILHA_RATEIOS);

  escreverCabecalhoMarca(workbook, worksheet, {
    titulo: "Lançamentos financeiros por centro de custo",
    colunas: COLUNAS_PLANILHA_RATEIOS.length,
  });

  const linhaHeader = worksheet.addRow(CABECALHOS_PLANILHA_RATEIOS);
  estilizarCabecalhoColunas(linhaHeader);

  for (const linha of linhas) {
    worksheet.addRow(linhaPlanilhaRateio(linha));
  }

  COLUNAS_PLANILHA_RATEIOS.forEach((definicao, indice) => {
    const coluna = worksheet.getColumn(indice + 1);
    coluna.width = definicao.largura;
    if (definicao.tipo === "dinheiro") {
      coluna.numFmt = FORMATO_BRL;
      coluna.alignment = { horizontal: "right" };
    } else if (definicao.tipo === "data") {
      coluna.numFmt = FORMATO_DATA;
      coluna.alignment = { horizontal: "center" };
    } else if (definicao.tipo === "inteiro") {
      coluna.alignment = { horizontal: "right" };
    }
  });

  const primeiraLinha = linhaHeader.number + 1;
  const ultimaLinha = linhaHeader.number + linhas.length;

  worksheet.views = [{ state: "frozen", ySplit: linhaHeader.number }];
  worksheet.autoFilter = {
    from: { row: linhaHeader.number, column: 1 },
    to: { row: ultimaLinha, column: COLUNAS_PLANILHA_RATEIOS.length },
  };

  const linhaTotais = worksheet.addRow([]);
  linhaTotais.getCell(1).value =
    `Total (${linhas.length.toLocaleString("pt-BR")} rateios de ${itens.length.toLocaleString("pt-BR")} lançamentos)`;

  // SUBTOTAL(109) nas duas colunas de dinheiro, pelo mesmo motivo da outra
  // planilha: quem recebe filtra e apaga linha, e total fixo passa a mentir na
  // primeira mexida. Aqui ele ainda acompanha o filtro do Excel, então filtrar
  // por uma obra mostra na hora quanto foi para ela.
  COLUNAS_PLANILHA_RATEIOS.forEach((definicao, indice) => {
    if (definicao.tipo !== "dinheiro") return;
    const coluna = worksheet.getColumn(indice + 1);
    linhaTotais.getCell(coluna.number).value = {
      formula: `SUBTOTAL(109,${coluna.letter}${primeiraLinha}:${coluna.letter}${ultimaLinha})`,
    };
  });

  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });

  return workbook;
}
