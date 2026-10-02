import { comparar, lerDecimal, somar, type Decimal } from "@/modules/medicao/_shared/decimal";

/**
 * Leitor do relatório SIAC "Resumo da Medição" do DNIT (Fase 6). Recebe os pedaços de texto de cada
 * página com a posição (x, y em pontos, origem no canto de cima à esquerda, já com a rotação da
 * página aplicada: `extrair.ts`) e devolve cabeçalho, tabela de índices, grupos com SUBTOTAL, linhas
 * e a SOMA. Números saem como TEXTO no formato do banco ("-1082.16"), sem passar por float (D7).
 *
 * Formato conferido no PDF real da 4ª do L09 (3 páginas, landscape girado 90°):
 * - toda página repete o cabeçalho (CONTRATO, Data Base, Período Líquido, título "4ª MEDIÇÃO ... -
 *   ÍNDICES ...", "Processado dd/mm/aaaa") e a tabela de índices (sigla, I0, I1, K, duas por linha);
 * - a tabela começa na linha que tem "Serviço"; as duas linhas seguintes do cabeçalho da tabela
 *   ("Código ... Preço ...", "SICRO ... Líquido") são puladas;
 * - grupo: "2,2 - CONSERVAÇÃO ..."; linha: código SICRO (só dígitos, x < 60), descrição (uma ou mais
 *   linhas), "Não"/"Sim", unidade e 7 números (preço, quantidade acumulada, valor a PI acumulado,
 *   valor a PI líquido, fator, reajustamento líquido, ajuste contratual líquido);
 * - a descrição pode continuar na linha de baixo e até na página seguinte (3,3 / 92446);
 * - "SUBTOTAL" (4 números: acumulado, líquido, reajuste, ajuste), "SOMA" (os mesmos 4), "A DEDUZIR",
 *   "LÍQUIDO À PAGAR" e o rodapé "Solicitado por ...".
 */

export interface PedacoTexto {
  texto: string;
  x: number;
  y: number;
}

export interface IndiceSiac {
  sigla: string;
  i0: string;
  i1: string;
  k: string;
}

export interface LinhaSiac {
  grupo: string;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string;
  quantidadeAcumulada: string;
  valorPiAcumulado: string;
  valorPiLiquido: string;
  fator: string;
  reajuste: string;
}

export interface SomaSiac {
  valorPiAcumulado: string;
  valorPiLiquido: string;
  reajuste: string;
}

export interface GrupoSiac {
  grupo: string;
  descricao: string;
  subtotal: SomaSiac;
  linhas: LinhaSiac[];
}

export interface CabecalhoSiac {
  /** O texto inteiro depois de "CONTRATO:", ex.: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I". */
  contratoTexto: string;
  medicaoNumero: number;
  /** "PROVISÓRIA", "FINAL"...: o que vem entre "MEDIÇÃO" e "- ÍNDICES". */
  medicaoTipo: string;
  /** Situação dos ÍNDICES do relatório. */
  situacao: "provisorio" | "definitivo";
  /** yyyy-mm-dd */
  periodoInicio: string;
  periodoFim: string;
  dataBase: string;
  processadoEm: string | null;
}

export interface RelatorioSiac {
  cabecalho: CabecalhoSiac;
  indices: IndiceSiac[];
  grupos: GrupoSiac[];
  linhas: LinhaSiac[];
  soma: SomaSiac;
}

export class ErroRelatorioSiac extends Error {}

const NUMERO = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
const TITULO = /^(\d+)ª MEDIÇÃO (.+) - ÍNDICES (PROVISÓRIOS|DEFINITIVOS)$/;
const GRUPO = /^(\d+,\d+) - (.+)$/;
const SIGLA = /^[A-Z][A-Z0-9-]*$/;
const PERIODO = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2})\/(\d{2})\/(\d{4})$/;
const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "1.234,56" -> "1234.56"; "-0,1763" -> "-0.1763". Texto que não é número pt-BR é recusado. */
export function numeroSiac(texto: string): string {
  if (!NUMERO.test(texto)) throw new ErroRelatorioSiac(`Número inválido no relatório: "${texto}"`);
  return texto.replace(/\./g, "").replace(",", ".");
}

function dataIso(texto: string | undefined): string {
  const m = texto ? DATA.exec(texto) : null;
  if (!m) throw new ErroRelatorioSiac(`Data inválida no cabeçalho do relatório: "${texto ?? ""}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

interface Linha {
  y: number;
  pedacos: PedacoTexto[];
}

/** Junta os pedaços da mesma altura (tolerância 2,5 pt) e ordena cada linha da esquerda para a direita. */
export function agruparLinhas(pedacos: PedacoTexto[], tolerancia = 2.5): Linha[] {
  const ordenados = [...pedacos].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const p of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(p.y - ultima.y) <= tolerancia) ultima.pedacos.push(p);
    else linhas.push({ y: p.y, pedacos: [p] });
  }
  for (const l of linhas) l.pedacos.sort((a, b) => a.x - b.x);
  return linhas;
}

function soma(textos: string[], onde: string): SomaSiac {
  if (textos.length !== 4) throw new ErroRelatorioSiac(`${onde} com ${textos.length} números (esperado 4)`);
  const [valorPiAcumulado, valorPiLiquido, reajuste] = textos.map(numeroSiac);
  return { valorPiAcumulado, valorPiLiquido, reajuste };
}

const IGNORAR = ["A DEDUZIR", "LÍQUIDO À PAGAR", "OS SERVIÇOS OBJETOS", "(*)"];
const CABECALHO_TABELA = new Set(["Código", "SICRO", "Preço", "Unitário"]);

export function lerRelatorioSiac(paginas: PedacoTexto[][]): RelatorioSiac {
  if (paginas.length === 0) throw new ErroRelatorioSiac("O PDF não tem páginas");
  const cab: Partial<CabecalhoSiac> = {};
  const indices = new Map<string, IndiceSiac>();
  const grupos: GrupoSiac[] = [];
  const linhas: LinhaSiac[] = [];
  let grupo: GrupoSiac | null = null;
  let ultima: LinhaSiac | null = null;
  let somaFinal: SomaSiac | null = null;
  let temTabela = false;

  paginas.forEach((pedacos, p) => {
    const ls = agruparLinhas(pedacos);
    const inicio = ls.findIndex((l) => l.pedacos.some((x) => x.texto === "Serviço"));
    if (inicio < 0) {
      // Página sem a tabela (em branco ou só com a SOMA): não tem linha de serviço, mas SUBTOTAL e SOMA valem.
      for (const l of ls) {
        const t = l.pedacos.map((x) => x.texto);
        if (t[0] === "SUBTOTAL" && grupo) grupo.subtotal = soma(t.slice(1), `SUBTOTAL do grupo ${grupo.grupo}`);
        if (t[0] === "SOMA") somaFinal = soma(t.slice(1), "SOMA");
      }
      return;
    }
    const primeiraComTabela = !temTabela;
    temTabela = true;

    for (const l of ls.slice(0, inicio)) {
      const t = l.pedacos.map((x) => x.texto);
      for (let k = 0; k < t.length; k++) {
        if (primeiraComTabela) {
          if (t[k] === "CONTRATO:") cab.contratoTexto = t[k + 1];
          if (t[k] === "Data Base:") cab.dataBase = dataIso(t[k + 1]);
          if (t[k] === "Processado") cab.processadoEm = dataIso(t[k + 1]);
          if (t[k] === "Período Líquido:") {
            const m = PERIODO.exec(t[k + 1] ?? "");
            if (!m) throw new ErroRelatorioSiac(`Período líquido inválido: "${t[k + 1] ?? ""}"`);
            cab.periodoInicio = `${m[3]}-${m[2]}-${m[1]}`;
            cab.periodoFim = `${m[6]}-${m[5]}-${m[4]}`;
          }
          const titulo = TITULO.exec(t[k]);
          if (titulo) {
            cab.medicaoNumero = Number.parseInt(titulo[1], 10);
            cab.medicaoTipo = titulo[2];
            cab.situacao = titulo[3] === "DEFINITIVOS" ? "definitivo" : "provisorio";
          }
        }
        if (SIGLA.test(t[k]) && [1, 2, 3].every((d) => NUMERO.test(t[k + d] ?? ""))) {
          indices.set(t[k], { sigla: t[k], i0: numeroSiac(t[k + 1]), i1: numeroSiac(t[k + 2]), k: numeroSiac(t[k + 3]) });
          k += 3;
        }
      }
    }

    for (const l of ls.slice(inicio + 1)) {
      const t = l.pedacos.map((x) => x.texto);
      if (t[0].startsWith("Solicitado por")) continue;
      if (t.some((x) => CABECALHO_TABELA.has(x))) continue;
      if (IGNORAR.some((i) => t[0].startsWith(i))) continue;

      const g = GRUPO.exec(t[0]);
      if (g) {
        grupo = { grupo: g[1], descricao: g[2], subtotal: { valorPiAcumulado: "0", valorPiLiquido: "0", reajuste: "0" }, linhas: [] };
        grupos.push(grupo);
        ultima = null;
        continue;
      }
      if (t[0] === "SUBTOTAL") {
        if (!grupo) throw new ErroRelatorioSiac("SUBTOTAL antes do primeiro grupo");
        grupo.subtotal = soma(t.slice(1), `SUBTOTAL do grupo ${grupo.grupo}`);
        ultima = null;
        continue;
      }
      if (t[0] === "SOMA") {
        somaFinal = soma(t.slice(1), "SOMA");
        continue;
      }
      if (/^\d+$/.test(t[0]) && l.pedacos[0].x < 60) {
        const iFlag = t.findIndex((x, k) => k > 0 && (x === "Não" || x === "Sim"));
        const numeros = iFlag < 0 ? [] : t.slice(iFlag + 2);
        if (!grupo || iFlag < 0 || numeros.length !== 7) {
          throw new ErroRelatorioSiac(`A linha do serviço ${t[0]} (página ${p + 1}) não está no formato do Resumo da Medição`);
        }
        const [precoUnitario, quantidadeAcumulada, valorPiAcumulado, valorPiLiquido, fator, reajuste] = numeros.map(numeroSiac);
        ultima = {
          grupo: grupo.grupo,
          codigo: t[0],
          descricao: t.slice(1, iFlag).join(" "),
          unidade: t[iFlag + 1],
          precoUnitario,
          quantidadeAcumulada,
          valorPiAcumulado,
          valorPiLiquido,
          fator,
          reajuste,
        };
        grupo.linhas.push(ultima);
        linhas.push(ultima);
        continue;
      }
      // Continuação da descrição (inclusive na página seguinte): só texto na coluna da descrição.
      if (ultima && l.pedacos.every((x) => x.x > 60 && x.x < 300)) {
        ultima.descricao = `${ultima.descricao} ${t.join(" ")}`;
        continue;
      }
      throw new ErroRelatorioSiac(`Linha não reconhecida na página ${p + 1}: "${t.join(" ")}"`);
    }
  });

  if (!temTabela) throw new ErroRelatorioSiac("A página 1 não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?");
  if (!cab.contratoTexto || !cab.medicaoNumero || !cab.situacao || !cab.periodoInicio || !cab.periodoFim || !cab.dataBase) {
    throw new ErroRelatorioSiac("Cabeçalho do relatório incompleto: contrato, medição, situação dos índices, período ou data-base");
  }
  if (!somaFinal) throw new ErroRelatorioSiac("O relatório não tem a linha SOMA");
  return {
    cabecalho: { processadoEm: null, ...cab } as CabecalhoSiac,
    indices: [...indices.values()],
    grupos,
    linhas,
    soma: somaFinal,
  };
}

function somaDe(textos: string[]): Decimal {
  return textos.reduce((acc, t) => somar(acc, lerDecimal(t)), lerDecimal("0"));
}

function brl(texto: string): string {
  const [i, d = ""] = texto.replace("-", "").split(".");
  const milhar = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${texto.startsWith("-") ? "-" : ""}${milhar},${(d + "00").slice(0, 2)}`;
}

/**
 * Confere as somas do relatório (exatas, BigInt): linhas de cada grupo = SUBTOTAL (valor a PI
 * acumulado, líquido e reajuste) e SUBTOTAIS = SOMA. Devolve as diferenças em pt-BR; vazio = fecha.
 * O banco confere de novo o líquido e o reajuste na gravação.
 */
export function conferirRelatorio(r: RelatorioSiac): string[] {
  const erros: string[] = [];
  const campos: [keyof SomaSiac, string][] = [
    ["valorPiAcumulado", "valor a PI acumulado"],
    ["valorPiLiquido", "valor a PI líquido"],
    ["reajuste", "reajuste"],
  ];
  for (const g of r.grupos) {
    for (const [campo, nome] of campos) {
      const s = somaDe(g.linhas.map((l) => l[campo]));
      if (comparar(s, lerDecimal(g.subtotal[campo])) !== 0) {
        erros.push(`Grupo ${g.grupo}: as linhas somam ${brl(textoDe(s))} de ${nome} e o SUBTOTAL diz ${brl(g.subtotal[campo])}`);
      }
    }
  }
  for (const [campo, nome] of campos) {
    const s = somaDe(r.grupos.map((g) => g.subtotal[campo]));
    if (comparar(s, lerDecimal(r.soma[campo])) !== 0) {
      erros.push(`Os SUBTOTAIS somam ${brl(textoDe(s))} de ${nome} e a SOMA diz ${brl(r.soma[campo])}`);
    }
  }
  return erros;
}

function textoDe(d: Decimal): string {
  const negativo = d.digitos < BigInt(0);
  const s = (negativo ? -d.digitos : d.digitos).toString().padStart(d.escala + 1, "0");
  const corpo = d.escala > 0 ? `${s.slice(0, s.length - d.escala)}.${s.slice(s.length - d.escala)}` : s;
  return negativo ? `-${corpo}` : corpo;
}
