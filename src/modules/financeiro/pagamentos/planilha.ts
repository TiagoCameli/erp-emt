import ExcelJS from "exceljs";

import { EMPRESA } from "@/config/marca";
import { formatarMesAno } from "@/lib/formatadores";
import {
  escreverCabecalhoMarca,
  estilizarCabecalhoColunas,
} from "@/lib/planilha-marca";
import {
  SEM_CENTRO_DE_CUSTO,
  STATUS_PARCELA,
  type StatusParcela,
} from "@/modules/financeiro/_shared/formato";
import {
  dataParaCelula,
  type CelulaPlanilha,
  type TipoColunaPlanilha,
} from "@/modules/financeiro/lancamentos/planilha";
import { rotuloOrigemLancamento } from "@/modules/financeiro/lancamentos/schemas";
import { ratearEmCentavos } from "@/modules/financeiro/pagamentos/recorte";

/**
 * A planilha de Pagamentos: quais colunas, em que ordem, de onde sai cada célula
 * e como o arquivo é montado.
 *
 * Cabeçalho e célula moram no MESMO objeto, como na planilha de Lançamentos.
 * Planilha montada com um array de títulos e outro de valores quebra no dia em
 * que alguém insere uma coluna no meio de um só, e o resultado é a pior falha
 * possível num relatório de dinheiro: o número aparece embaixo do título errado,
 * e a planilha continua abrindo sem erro nenhum.
 *
 * ## O que este arquivo tem que a planilha de Lançamentos não tem
 *
 * Lá a linha É o lançamento, e o rateio pertence ao lançamento: a fatia de cada
 * obra é exata, sem divisão nenhuma. Aqui a linha é a PARCELA, e o rateio
 * continua sendo do lançamento — então a fatia sai de uma DIVISÃO, e é aí que
 * dinheiro se perde. Por isso a repartição usa `ratearEmCentavos` (maior resto),
 * a mesma do recorte da tela.
 *
 * Não fala com banco nem com permissão (isso é da Server Action), então dá para
 * escrever o arquivo num teste e reler o que saiu. **Módulo de servidor**: puxa
 * o exceljs, que é grande; nunca importar de Client Component.
 */

/** Qual das duas abas da tela a linha veio. */
export type AbaPagamentos = "a-pagar" | "pagas";

/**
 * Como a planilha reparte as linhas.
 *
 * `pagamento`: uma linha por parcela, com o rateio resumido em duas colunas.
 * `centro`: uma linha por CENTRO DE CUSTO (a raiz), juntando as etapas dele.
 * `rateio`: uma linha por rateio, no nível exato em que ele foi gravado.
 */
export type FormatoPlanilhaPagamentos = "pagamento" | "centro" | "rateio";

/** Um rateio do lançamento por trás da parcela. */
export interface RateioDoPagamento {
  /**
   * Id do NÍVEL GRAVADO (a raiz, ou a etapa quando o rateio foi para uma).
   * `null` no rateio que perdeu o cadastro do centro.
   */
  centroId: string | null;
  /**
   * Id da RAIZ da árvore. É por ele que o formato `centro` junta, e não pelo
   * nome: agrupar por nome funcionaria hoje e passaria a somar dois centros num
   * só no dia em que dois cadastros tiverem o mesmo nome — dinheiro trocando de
   * obra sem erro nenhum.
   */
  raizId: string | null;
  /** O CENTRO DE CUSTO: sempre a raiz. Nunca o nome da etapa. */
  raizNome: string;
  /** A ETAPA, quando o rateio foi para uma. Null quando foi direto na raiz. */
  etapaNome: string | null;
  /**
   * A parte do LANÇAMENTO que é deste centro. Aqui ela é só o PESO da divisão:
   * o que a planilha mostra é a fatia da parcela, não a do lançamento.
   */
  valor: number;
}

/** A parcela como a planilha precisa dela. */
export interface PagamentoPlanilha {
  id: string;
  lancamentoNumero: string | null;
  /** NF, boleto: o número do documento de verdade, não o do lançamento. */
  numeroDocumento: string | null;
  numeroParcela: number;
  /** Quantas parcelas o lançamento tem, para a célula sair "3/10". */
  totalParcelas: number | null;
  descricao: string;
  categoriaNome: string | null;
  fornecedorNome: string;
  origem: string | null;
  /** yyyy-MM-dd (primeiro dia do mês de referência). */
  mesCompetencia: string | null;
  dataCompra: string | null;
  dataVencimento: string | null;
  /** Data em que o pagamento está autorizado. Só a aba "A pagar" mostra. */
  dataProgramada: string | null;
  /** Quando saiu da conta. Só a aba "Pagas" mostra. */
  dataPagamento: string | null;
  contaNome: string | null;
  formaPagamentoNome: string | null;
  status: string;
  /** Valor devido da parcela. O desconto não o reescreve. */
  valor: number;
  desconto: number;
  juros: number;
  outrasDespesas: number;
  /** valor − desconto + juros + outras despesas: o que saiu da conta. */
  valorLiquido: number;
  rateios: RateioDoPagamento[];
}

/** Uma linha da planilha: a parcela mais o destino e a fatia dele. */
export interface LinhaPagamento {
  pagamento: PagamentoPlanilha;
  /** O CENTRO DE CUSTO (a raiz). Sem sentido no formato `pagamento`. */
  centroNome: string;
  /** A ETAPA. Sempre null no formato `centro`: a linha É o centro. */
  etapaNome: string | null;
  /** A fatia desta linha. A soma das fatias é EXATAMENTE o valor da parcela. */
  valorFatia: number;
  /** Posição desta fatia dentro da parcela, base 1. */
  parte: number;
  /** Quantas fatias a parcela tem depois de juntar as do mesmo destino. */
  partes: number;
}

/**
 * O valor da parcela que a planilha reparte entre os centros.
 *
 * Na fila a pagar é o VALOR DEVIDO. Nas pagas é o LÍQUIDO — desconto, juros e
 * outras despesas mudam o que a conta pagou, e ratear o bruto poria na obra um
 * dinheiro que nunca saiu.
 *
 * Não é a mesma coisa que escolher a coluna: `valor_liquido` é coluna calculada
 * no banco e vem preenchida mesmo em parcela EM ABERTO. Usá-la na fila a pagar
 * não mudaria o número hoje (sem pagamento não há desconto nem juros), mas
 * chamaria de "o que saiu da conta" um dinheiro que ainda está lá dentro.
 */
export function valorBaseDoPagamento(
  pagamento: PagamentoPlanilha,
  aba: AbaPagamentos,
): number {
  return aba === "pagas" ? pagamento.valorLiquido : pagamento.valor;
}

/** Reais para centavos inteiros. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

/**
 * Abre cada parcela nas linhas do formato pedido.
 *
 * ## A repartição
 *
 * A fatia de cada destino sai de `ratearEmCentavos`, POR MAIOR RESTO, e o
 * denominador é o rateio INTEIRO do lançamento. R$ 100.000,00 entre três dá
 * 33.333,3333 para cada; arredondando cada fatia sozinha as três somam
 * R$ 99.999,99, e o centavo que falta aparece depois como "as partes não
 * fecham". Aqui a soma das fatias é exatamente o valor da parcela, e isso vale
 * em qualquer agrupamento.
 *
 * A soma das fatias de destinos juntados é feita em CENTAVOS INTEIROS e
 * convertida no fim: somar `191.40 + 180.96` em float sobra 1e-13, e a planilha
 * exibiria o certo enquanto a célula guarda o errado.
 *
 * ## Os agrupamentos
 *
 * `pagamento` não agrupa nada: é uma linha por parcela, com o valor cheio.
 *
 * `rateio` junta as partes do MESMO NÍVEL GRAVADO. Uma OC de N itens na mesma
 * obra grava N rateios apontando o mesmo centro, e sem juntar a obra apareceria
 * repetida com valores que só fazem sentido para quem tem a OC na mão.
 *
 * `centro` junta pela RAIZ: duas etapas da mesma obra viram uma linha só, e a
 * coluna Etapa nem existe nesse formato — a linha É o centro, e pôr o nome de
 * uma das etapas ali seria mentira.
 *
 * PARCELA SEM RATEIO VIRA UMA LINHA, com o nome `SEM_CENTRO_DE_CUSTO` e o valor
 * inteiro. Hoje não existe nenhuma (o centro é invariante de banco), mas um
 * `flatMap` sobre lista vazia apagaria a parcela do arquivo em silêncio — e
 * planilha de dinheiro com pagamento faltando não deixa rastro de que faltou.
 */
export function expandirPagamentos(
  itens: readonly PagamentoPlanilha[],
  formato: FormatoPlanilhaPagamentos,
  aba: AbaPagamentos,
): LinhaPagamento[] {
  const linhas: LinhaPagamento[] = [];

  for (const pagamento of itens) {
    const base = valorBaseDoPagamento(pagamento, aba);

    if (formato === "pagamento" || pagamento.rateios.length === 0) {
      linhas.push({
        pagamento,
        centroNome:
          pagamento.rateios.length === 0
            ? SEM_CENTRO_DE_CUSTO
            : pagamento.rateios[0].raizNome,
        etapaNome: null,
        valorFatia: base,
        parte: 1,
        partes: 1,
      });
      continue;
    }

    // Reparte primeiro entre TODOS os rateios, e só depois junta os destinos
    // repetidos. Juntar antes e repartir depois daria o mesmo total, mas as
    // fatias individuais mudariam conforme a ordem em que o banco devolveu as
    // linhas -- e o mesmo pagamento sairia diferente em duas exportações.
    const fatias = ratearEmCentavos(
      centavos(base),
      pagamento.rateios.map((rateio) => centavos(rateio.valor)),
    );

    const porDestino = new Map<string, LinhaPagamento & { centavos: number }>();
    for (const [indice, rateio] of pagamento.rateios.entries()) {
      const id = formato === "centro" ? rateio.raizId : rateio.centroId;
      // Sem id (centro apagado do cadastro), cada parte fica na sua linha: a
      // chave por nome juntaria dois centros diferentes que perderam o cadastro.
      const chave = id ?? `sem-centro:${indice}`;
      const existente = porDestino.get(chave);
      if (existente) {
        existente.centavos += fatias[indice];
        continue;
      }
      porDestino.set(chave, {
        pagamento,
        centroNome: rateio.raizNome,
        // No formato por CENTRO a etapa não vai: a linha soma todas as etapas
        // daquele centro, então nomear uma delas descreveria a linha errado.
        etapaNome: formato === "centro" ? null : rateio.etapaNome,
        valorFatia: 0, // preenchido abaixo, quando a soma em centavos fecha.
        parte: porDestino.size + 1,
        partes: 0, // preenchido abaixo, quando o total é conhecido.
        centavos: fatias[indice],
      });
    }

    const doPagamento = [...porDestino.values()];
    for (const linha of doPagamento) {
      linha.partes = doPagamento.length;
      linha.valorFatia = linha.centavos / 100;
    }
    linhas.push(...doPagamento);
  }

  return linhas;
}

/* ------------------------------------------------------------------ */
/* As colunas                                                          */
/* ------------------------------------------------------------------ */

/** Uma coluna da planilha de pagamentos. */
export interface ColunaPagamentos {
  cabecalho: string;
  /** Largura em caracteres, o que o exceljs entende. */
  largura: number;
  tipo: TipoColunaPlanilha;
  celula: (linha: LinhaPagamento) => CelulaPlanilha;
}

/** Rótulo da situação da parcela, o mesmo que o selo da tela mostra. */
function rotuloSituacao(status: string): string {
  return status in STATUS_PARCELA
    ? STATUS_PARCELA[status as StatusParcela].rotulo
    : status;
}

/**
 * As raízes distintas do rateio, na ordem em que aparecem.
 *
 * Distintas por ID, não por nome, pelo mesmo motivo do agrupamento: dois
 * cadastros homônimos são dois centros, e juntá-los aqui faria a coluna dizer
 * "1 centro de custo" sobre um custo que está em dois lugares.
 */
function raizesDoRateio(pagamento: PagamentoPlanilha): string[] {
  const nomes = new Map<string, string>();
  for (const [indice, rateio] of pagamento.rateios.entries()) {
    nomes.set(rateio.raizId ?? `sem-centro:${indice}`, rateio.raizNome);
  }
  return [...nomes.values()];
}

/**
 * As colunas comuns às duas abas, na ordem em que saem no arquivo.
 *
 * A coluna "Centro de custo" aqui é o RESUMO (o nome quando é um só, "N centros
 * de custo" quando rateia), a mesma regra da célula da tela. Nos formatos por
 * centro e por rateio ela é trocada pelo nome da raiz da linha.
 */
function colunasComuns(): ColunaPagamentos[] {
  return [
    {
      cabecalho: "Lançamento",
      largura: 16,
      tipo: "texto",
      celula: (l) => l.pagamento.lancamentoNumero ?? "",
    },
    {
      cabecalho: "Nº do documento",
      largura: 16,
      tipo: "texto",
      // A NF ou o boleto. É por ele que se concilia com o extrato e com a
      // planilha do contador, não pelo número do lançamento.
      celula: (l) => l.pagamento.numeroDocumento ?? "",
    },
    {
      cabecalho: "Parcela",
      largura: 10,
      tipo: "texto",
      // Texto, e não número: "3/10" diz onde a parcela está na série, e é a
      // pergunta que quem confere um pagamento faz primeiro.
      celula: (l) =>
        l.pagamento.totalParcelas
          ? `${l.pagamento.numeroParcela}/${l.pagamento.totalParcelas}`
          : `${l.pagamento.numeroParcela}`,
    },
    {
      cabecalho: "Fornecedor",
      largura: 32,
      tipo: "texto",
      celula: (l) => l.pagamento.fornecedorNome,
    },
    {
      cabecalho: "Descrição",
      largura: 46,
      tipo: "texto",
      celula: (l) => l.pagamento.descricao,
    },
    {
      cabecalho: "Categoria",
      largura: 26,
      tipo: "texto",
      celula: (l) => l.pagamento.categoriaNome ?? "",
    },
    {
      cabecalho: "Origem",
      largura: 16,
      tipo: "texto",
      celula: (l) =>
        l.pagamento.origem ? rotuloOrigemLancamento(l.pagamento.origem) : "",
    },
    {
      cabecalho: "Mês de referência",
      largura: 16,
      tipo: "texto",
      celula: (l) => formatarMesAno(l.pagamento.mesCompetencia),
    },
    {
      cabecalho: "Data da compra",
      largura: 14,
      tipo: "data",
      celula: (l) => dataParaCelula(l.pagamento.dataCompra),
    },
    {
      cabecalho: "Vencimento",
      largura: 13,
      tipo: "data",
      celula: (l) => dataParaCelula(l.pagamento.dataVencimento),
    },
    {
      cabecalho: "Forma de pagamento",
      largura: 20,
      tipo: "texto",
      celula: (l) => l.pagamento.formaPagamentoNome ?? "",
    },
    {
      cabecalho: "Conta bancária",
      largura: 24,
      tipo: "texto",
      celula: (l) => l.pagamento.contaNome ?? "",
    },
    {
      cabecalho: "Centro de custo",
      largura: 34,
      tipo: "texto",
      celula: (l) => {
        const raizes = raizesDoRateio(l.pagamento);
        if (raizes.length === 0) return SEM_CENTRO_DE_CUSTO;
        if (raizes.length === 1) return raizes[0];
        return `${raizes.length} centros de custo`;
      },
    },
    {
      cabecalho: "Centros do rateio",
      largura: 44,
      tipo: "texto",
      // Todos os nomes, sem teto: numa célula de planilha a lista inteira cabe,
      // e é ela que evita abrir o sistema para saber entre quais obras o
      // pagamento foi dividido. (A tela corta em cinco porque lá é um `title`.)
      celula: (l) => raizesDoRateio(l.pagamento).join(", "),
    },
  ];
}

/** As colunas de dinheiro e data que só uma das abas tem. */
function colunasDaAba(aba: AbaPagamentos): ColunaPagamentos[] {
  if (aba === "pagas") {
    return [
      {
        cabecalho: "Data do pagamento",
        largura: 15,
        tipo: "data",
        celula: (l) => dataParaCelula(l.pagamento.dataPagamento),
      },
      {
        cabecalho: "Valor da parcela",
        largura: 16,
        tipo: "dinheiro",
        celula: (l) => l.pagamento.valor,
      },
      {
        cabecalho: "Desconto",
        largura: 13,
        tipo: "dinheiro",
        celula: (l) => l.pagamento.desconto,
      },
      {
        cabecalho: "Juros e multa",
        largura: 14,
        tipo: "dinheiro",
        celula: (l) => l.pagamento.juros,
      },
      {
        cabecalho: "Outras despesas",
        largura: 16,
        tipo: "dinheiro",
        celula: (l) => l.pagamento.outrasDespesas,
      },
      {
        cabecalho: "Valor líquido",
        largura: 16,
        tipo: "dinheiro",
        // O que saiu da conta. No formato por pagamento a fatia É o líquido
        // inteiro, então a mesma expressão serve para os dois.
        celula: (l) => l.valorFatia,
      },
    ];
  }

  return [
    {
      cabecalho: "Data autorizada",
      largura: 15,
      tipo: "data",
      celula: (l) => dataParaCelula(l.pagamento.dataProgramada),
    },
    {
      cabecalho: "Situação",
      largura: 14,
      tipo: "texto",
      // Pendente, Em revisão ou Aprovado. A fila mostra as três, e só a
      // aprovada pode ser paga: sem esta coluna a planilha misturaria o que já
      // está liberado com o que ainda depende de alguém.
      celula: (l) => rotuloSituacao(l.pagamento.status),
    },
    {
      cabecalho: "Valor do pagamento",
      largura: 18,
      tipo: "dinheiro",
      celula: (l) => l.valorFatia,
    },
  ];
}

/** Uma coluna que só é preenchida na PRIMEIRA linha da parcela. */
function soNaPrimeira(coluna: ColunaPagamentos): ColunaPagamentos {
  return {
    ...coluna,
    // Repetido em todas as linhas do rateio, o valor da parcela infla a soma em
    // N vezes com o arquivo abrindo sem erro nenhum — a armadilha clássica
    // deste formato. Em branco nas demais, a coluna também soma certo, e as
    // duas somas juntas viram a conferência do arquivo.
    celula: (linha) => (linha.parte === 1 ? coluna.celula(linha) : null),
  };
}

/**
 * As colunas que MUDAM nos formatos por centro e por rateio, pelo cabeçalho da
 * versão por pagamento.
 *
 * Herdar o resto em vez de listar tudo de novo é o que mantém os três formatos
 * juntos: a coluna que alguém acrescentar amanhã aparece nos três, na mesma
 * posição, sem ninguém lembrar de fazer nada.
 */
function colunasTrocadas(
  aba: AbaPagamentos,
  comEtapa: boolean,
): Record<string, ColunaPagamentos[]> {
  const base = colunasDaAba(aba);
  const daAba = (cabecalho: string): ColunaPagamentos => {
    const coluna = base.find((c) => c.cabecalho === cabecalho);
    if (!coluna) {
      throw new Error(
        `A planilha de pagamentos troca a coluna "${cabecalho}", que não existe na aba "${aba}"`,
      );
    }
    return coluna;
  };

  const trocas: Record<string, ColunaPagamentos[]> = {
    "Centro de custo": [
      {
        cabecalho: "Centro de custo",
        largura: 34,
        tipo: "texto",
        // SEMPRE A RAIZ, mesmo quando o rateio foi para uma etapa: é o que o
        // ERP chama de centro de custo, e é por ele que se soma por obra.
        celula: (l) => l.centroNome,
      },
    ],
    // No formato por rateio, o resumo dá lugar à ETAPA; no formato por centro
    // ele some, porque a linha já É um centro e a lista dos outros ao lado dela
    // faria parecer que a fatia é de todos eles.
    "Centros do rateio": comEtapa
      ? [
          {
            cabecalho: "Etapa",
            largura: 34,
            tipo: "texto",
            // Em branco no rateio que foi direto para a raiz, que é a maioria:
            // a etapa é um detalhe do centro, não um segundo nome dele.
            celula: (l) => l.etapaNome,
          },
        ]
      : [],
  };

  if (aba === "pagas") {
    trocas["Valor líquido"] = [
      {
        cabecalho: "Líquido no centro",
        largura: 18,
        tipo: "dinheiro",
        // A coluna que SOMA, e por isso é a fatia: é ela que responde "quanto
        // esta obra pagou". Somar o líquido repetido em N linhas contaria o
        // mesmo dinheiro N vezes.
        celula: (l) => l.valorFatia,
      },
      soNaPrimeira({ ...daAba("Valor líquido"), celula: (l) => l.pagamento.valorLiquido }),
    ];
    // Os ajustes do pagamento são da PARCELA, não do centro: repetidos por
    // linha, um desconto de R$ 100 numa parcela de três obras viraria R$ 300 de
    // desconto no total do arquivo.
    for (const cabecalho of ["Valor da parcela", "Desconto", "Juros e multa", "Outras despesas"]) {
      trocas[cabecalho] = [soNaPrimeira(daAba(cabecalho))];
    }
  } else {
    trocas["Valor do pagamento"] = [
      {
        cabecalho: "Valor no centro",
        largura: 18,
        tipo: "dinheiro",
        celula: (l) => l.valorFatia,
      },
      soNaPrimeira({
        ...daAba("Valor do pagamento"),
        celula: (l) => l.pagamento.valor,
      }),
    ];
  }

  return trocas;
}

/**
 * As colunas da planilha, para uma aba e um formato.
 *
 * Se um cabeçalho trocado deixar de existir na versão por pagamento (alguém
 * renomeou "Valor do pagamento", por exemplo), a montagem QUEBRA em vez de
 * exportar calada: sem isso, a troca simplesmente não aconteceria e a planilha
 * sairia com o valor da parcela repetido em toda linha — total inflado, arquivo
 * abrindo sem erro.
 */
export function colunasPagamentos(
  aba: AbaPagamentos,
  formato: FormatoPlanilhaPagamentos,
): ColunaPagamentos[] {
  const basicas = [...colunasComuns(), ...colunasDaAba(aba)];
  if (formato === "pagamento") return basicas;

  const trocas = colunasTrocadas(aba, formato === "rateio");
  const existentes = new Set(basicas.map((coluna) => coluna.cabecalho));
  for (const cabecalho of Object.keys(trocas)) {
    if (!existentes.has(cabecalho)) {
      throw new Error(
        `A planilha de pagamentos troca a coluna "${cabecalho}", que não existe mais na versão por pagamento`,
      );
    }
  }

  return basicas.flatMap((coluna) => trocas[coluna.cabecalho] ?? [coluna]);
}

/** Cabeçalhos da planilha, na ordem das colunas. */
export function cabecalhosPagamentos(
  aba: AbaPagamentos,
  formato: FormatoPlanilhaPagamentos,
): string[] {
  return colunasPagamentos(aba, formato).map((coluna) => coluna.cabecalho);
}

/** Uma linha da planilha, na ordem das colunas. */
export function linhaPlanilhaPagamento(
  linha: LinhaPagamento,
  aba: AbaPagamentos,
  formato: FormatoPlanilhaPagamentos,
): CelulaPlanilha[] {
  return colunasPagamentos(aba, formato).map((coluna) => coluna.celula(linha));
}

/**
 * Nome do arquivo. O formato entra no nome porque os três exportam o mesmo
 * recorte repartido de outro jeito: sem isso, três downloads seguidos viram
 * `pagamentos (1).xlsx` e ninguém sabe qual é qual na pasta.
 */
export function nomeArquivoPlanilhaPagamentos(
  dataISO: string,
  formato: FormatoPlanilhaPagamentos,
): string {
  const sufixo =
    formato === "centro"
      ? "-por-centro-de-custo"
      : formato === "rateio"
        ? "-por-rateio"
        : "";
  return `pagamentos${sufixo}-${dataISO}.xlsx`;
}

/* ------------------------------------------------------------------ */
/* Montagem do arquivo                                                 */
/* ------------------------------------------------------------------ */

const FORMATO_BRL = "R$ #,##0.00";
const FORMATO_DATA = "dd/mm/yyyy";

/** O nome de cada aba dentro do arquivo. */
const NOME_DA_ABA: Record<AbaPagamentos, string> = {
  "a-pagar": "A pagar",
  pagas: "Pagas",
};

const TITULO_DA_ABA: Record<AbaPagamentos, string> = {
  "a-pagar": "Pagamentos a pagar",
  pagas: "Pagamentos realizados",
};

/**
 * Escreve uma aba: marca no topo, cabeçalho destacado e congelado, as linhas,
 * filtro do Excel e a linha de total.
 *
 * Nenhuma linha é contada na mão. O cabeçalho de marca informa em que linha o
 * cabeçalho de colunas cai, e filtro, congelamento e total saem dessa linha —
 * uma fórmula de total apontando uma linha adiante somaria o intervalo errado
 * sem o arquivo dar erro nenhum.
 */
function escreverAba(
  workbook: ExcelJS.Workbook,
  aba: AbaPagamentos,
  formato: FormatoPlanilhaPagamentos,
  itens: readonly PagamentoPlanilha[],
): void {
  const colunas = colunasPagamentos(aba, formato);
  const linhas = expandirPagamentos(itens, formato, aba);

  const worksheet = workbook.addWorksheet(NOME_DA_ABA[aba]);
  escreverCabecalhoMarca(workbook, worksheet, {
    titulo: TITULO_DA_ABA[aba],
    colunas: colunas.length,
  });

  const linhaHeader = worksheet.addRow(colunas.map((coluna) => coluna.cabecalho));
  estilizarCabecalhoColunas(linhaHeader);

  for (const linha of linhas) {
    worksheet.addRow(colunas.map((coluna) => coluna.celula(linha)));
  }

  colunas.forEach((definicao, indice) => {
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
  // Aba vazia não ganha filtro: o intervalo terminaria antes de começar e o
  // Excel recusa o arquivo inteiro por causa disso.
  if (linhas.length > 0) {
    worksheet.autoFilter = {
      from: { row: linhaHeader.number, column: 1 },
      to: { row: ultimaLinha, column: colunas.length },
    };
  }

  const linhaTotais = worksheet.addRow([]);
  linhaTotais.getCell(1).value =
    formato === "pagamento"
      ? `Total (${linhas.length.toLocaleString("pt-BR")} pagamentos)`
      : `Total (${linhas.length.toLocaleString("pt-BR")} linhas de ${itens.length.toLocaleString("pt-BR")} pagamentos)`;

  // Total por FÓRMULA, não por soma calculada aqui: quem recebe a planilha
  // filtra e apaga linha, e um total fixo passaria a mentir na primeira mexida.
  // SUBTOTAL(109) soma só o que está visível, então filtrar por uma obra mostra
  // na hora quanto foi para ela.
  if (linhas.length > 0) {
    colunas.forEach((definicao, indice) => {
      if (definicao.tipo !== "dinheiro") return;
      const coluna = worksheet.getColumn(indice + 1);
      linhaTotais.getCell(coluna.number).value = {
        formula: `SUBTOTAL(109,${coluna.letter}${primeiraLinha}:${coluna.letter}${ultimaLinha})`,
      };
    });
  }

  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });
}

/**
 * Monta o .xlsx com as DUAS abas: "A pagar" e "Pagas".
 *
 * Uma aba por lado, e não um arquivo por lado, porque a pergunta que motiva a
 * exportação ("quanto já saiu e quanto ainda sai desta obra") precisa dos dois
 * juntos. Elas ficam separadas em vez de numa aba só com uma coluna "Situação"
 * porque as colunas de dinheiro não são as mesmas: o que saiu da conta tem
 * desconto, juros e despesas, e o que ainda vai sair não tem nenhum dos três.
 *
 * Cada aba respeita os filtros da SUA aba na tela — elas são independentes lá,
 * e seriam mentira aqui se o arquivo misturasse os dois recortes.
 *
 * Aba sem nenhuma linha continua no arquivo, com cabeçalho e sem filtro: sumir
 * com ela faria parecer que a exportação saiu errada, em vez de "não há nada
 * neste recorte".
 */
export function montarPlanilhaPagamentos({
  aPagar,
  pagas,
  formato,
}: {
  aPagar: readonly PagamentoPlanilha[];
  pagas: readonly PagamentoPlanilha[];
  formato: FormatoPlanilhaPagamentos;
}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.company = EMPRESA.razaoSocial;

  escreverAba(workbook, "a-pagar", formato, aPagar);
  escreverAba(workbook, "pagas", formato, pagas);

  return workbook;
}
