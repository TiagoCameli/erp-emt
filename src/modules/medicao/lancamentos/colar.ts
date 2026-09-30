/**
 * Leitura pura do bloco colado do Excel para Lançamentos (Fase 4, Task 5). Sem rede: só
 * INTERPRETA o texto colado contra os serviços das medições abertas (o mesmo formato de
 * `servicosParaLancar`, ver tipos.ts) e devolve as linhas prontas para a RPC OU o erro de cada
 * uma. O banco confere de novo tudo isto e mais (spec 8); esta leitura existe só para não mandar
 * lixo (texto que a RPC leria com um erro de CAST cru) e para resolver, no lado do cliente, o
 * código do item, que a RPC recebe pronto (`item_id`).
 *
 * D7: quantidade e km saem como TEXTO com ponto decimal ("1234.5"), nunca convertidos para
 * `Number` — só trocam o separador. Colunas por POSIÇÃO (não por cabeçalho nomeado): Data | Item
 * | Quantidade | Km inicial | Km final | Estaca | Observação.
 */

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import type { ServicoParaLancar } from "./tipos";

/** Teto de linhas por colagem (o mesmo da RPC `fn_mc_lancamentos_colar`). */
export const MAX_LINHAS_COLAGEM = 500;

/** Uma linha do bloco colado já resolvida contra as medições abertas, pronta para a RPC. */
export interface LinhaColada {
  /** Posição da linha no bloco colado (1-based): casa com o `linha` que a RPC devolver no erro. */
  linha: number;
  /** yyyy-mm-dd. */
  data: string;
  itemId: string;
  /** Texto normalizado, ponto decimal. Nunca passa por `Number` (D7). */
  quantidade: string;
  kmInicial: string | null;
  kmFinal: string | null;
  estaca: string | null;
  observacao: string | null;
}

export interface ErroColagem {
  /** 0 é erro geral do bloco (ex.: mais linhas que o teto), sem linha específica. */
  linha: number;
  erro: string;
}

export interface ResultadoLeituraColagem {
  linhas: LinhaColada[];
  erros: ErroColagem[];
}

/** Data | Item | Quantidade | Km inicial | Km final | Estaca | Observação, por posição. */
const NUMERO_COLUNAS = 7;

function celulasDaLinha(linhaBruta: string): string[] {
  const partes = linhaBruta.split("\t").map((celula) => celula.trim());
  const cortadas = partes.slice(0, NUMERO_COLUNAS);
  while (cortadas.length < NUMERO_COLUNAS) cortadas.push("");
  return cortadas;
}

function todasVazias(celulas: string[]): boolean {
  return celulas.every((c) => c === "");
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" -> "aaaa-mm-dd". Confere o calendário (31/02 não existe). */
function normalizarData(texto: string): string | null {
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  let ano: number;
  let mes: number;
  let dia: number;
  if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else if (br) {
    dia = Number(br[1]);
    mes = Number(br[2]);
    ano = Number(br[3]);
  } else {
    return null;
  }
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Número pt-BR ("1.234,5") ou já com ponto decimal ("1234.5") -> texto normalizado com PONTO
 * ("1234.5"), o formato que a coluna `numeric` do banco lê sem passar por double.
 * `normalizarNumeroDigitado` (já usado no formulário) faz a interpretação; aqui só troca o
 * separador de saída de vírgula para ponto. Exportada para `actions.ts` usar a MESMA regra no
 * formulário de um lançamento só (nunca duplicar a conversão em dois lugares).
 */
export function normalizarNumeroParaBanco(texto: string): string | null {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  return normalizado === null ? null : normalizado.replace(",", ".");
}

/**
 * Lê o bloco colado do Excel. Cada linha é resolvida contra `servicos` (os serviços das medições
 * ABERTAS do contrato, com o período de cada uma já embutido): a data escolhe a medição (spec
 * 7.3, períodos não se sobrepõem) e o código do item é procurado só entre os serviços DAQUELA
 * medição. Código repetido na mesma medição (aconteceu no Lote 09, "02.02" duas vezes) não é
 * resolvido sozinho — a linha vira erro, pedindo o lançamento pelo formulário.
 */
export function lerColagem(
  texto: string,
  servicos: ServicoParaLancar[],
  tipoLocalizacao: "rodovia" | "texto",
): ResultadoLeituraColagem {
  const linhasBrutas = texto.replace(/\r\n?/g, "\n").split("\n");

  // Cabeçalho colado junto: só a 1ª linha do bloco é candidata, e só pela 1ª célula.
  const primeiraLinhaEhCabecalho =
    linhasBrutas.length > 0 && celulasDaLinha(linhasBrutas[0])[0].toLowerCase() === "data";
  const inicio = primeiraLinhaEhCabecalho ? 1 : 0;

  const linhasComConteudo: { numero: number; celulas: string[] }[] = [];
  for (let i = inicio; i < linhasBrutas.length; i++) {
    const celulas = celulasDaLinha(linhasBrutas[i]);
    if (todasVazias(celulas)) continue; // linha em branco: ignorada, não conta como linha nem erro.
    linhasComConteudo.push({ numero: i + 1, celulas });
  }

  if (linhasComConteudo.length > MAX_LINHAS_COLAGEM) {
    return {
      linhas: [],
      erros: [
        {
          linha: 0,
          erro: `Cole no máximo ${MAX_LINHAS_COLAGEM} linhas por vez (${linhasComConteudo.length} coladas)`,
        },
      ],
    };
  }

  const linhas: LinhaColada[] = [];
  const erros: ErroColagem[] = [];

  for (const { numero, celulas } of linhasComConteudo) {
    const [dataTexto, codigoTexto, quantidadeTexto, kmInicialTexto, kmFinalTexto, estacaTexto, observacaoTexto] =
      celulas;

    const data = normalizarData(dataTexto);
    if (data === null) {
      erros.push({ linha: numero, erro: `Data inválida: "${dataTexto}"` });
      continue;
    }

    const medicao = servicos.find((s) => s.periodoInicio <= data && data <= s.periodoFim);
    if (!medicao) {
      erros.push({ linha: numero, erro: `Não há medição aberta para ${dataTexto}. Abra a medição do período antes de colar` });
      continue;
    }

    if (codigoTexto === "") {
      erros.push({ linha: numero, erro: "Informe o código do item" });
      continue;
    }
    const candidatos = servicos.filter((s) => s.medicaoId === medicao.medicaoId && s.codigo === codigoTexto);
    if (candidatos.length === 0) {
      erros.push({
        linha: numero,
        erro: `Código não encontrado na planilha da ${medicao.medicaoNumero}ª medição: ${codigoTexto}`,
      });
      continue;
    }
    if (candidatos.length > 1) {
      erros.push({ linha: numero, erro: "Código repetido na planilha: lance esta linha pelo formulário" });
      continue;
    }
    const item = candidatos[0];

    const quantidade = normalizarNumeroParaBanco(quantidadeTexto);
    if (quantidade === null) {
      erros.push({ linha: numero, erro: `Quantidade inválida: "${quantidadeTexto}"` });
      continue;
    }

    if (tipoLocalizacao === "rodovia" && (kmInicialTexto === "" || kmFinalTexto === "")) {
      erros.push({ linha: numero, erro: "Informe o km inicial e o km final" });
      continue;
    }

    let kmInicial: string | null = null;
    if (kmInicialTexto !== "") {
      kmInicial = normalizarNumeroParaBanco(kmInicialTexto);
      if (kmInicial === null) {
        erros.push({ linha: numero, erro: `Km inicial inválido: "${kmInicialTexto}"` });
        continue;
      }
    }
    let kmFinal: string | null = null;
    if (kmFinalTexto !== "") {
      kmFinal = normalizarNumeroParaBanco(kmFinalTexto);
      if (kmFinal === null) {
        erros.push({ linha: numero, erro: `Km final inválido: "${kmFinalTexto}"` });
        continue;
      }
    }

    linhas.push({
      linha: numero,
      data,
      itemId: item.itemId,
      quantidade,
      kmInicial,
      kmFinal,
      estaca: estacaTexto === "" ? null : estacaTexto,
      observacao: observacaoTexto === "" ? null : observacaoTexto,
    });
  }

  return { linhas, erros };
}
