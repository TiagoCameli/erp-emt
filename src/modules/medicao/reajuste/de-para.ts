import { absoluto, comparar, lerDecimal, multiplicar, subtrair, type Decimal } from "@/modules/medicao/_shared/decimal";
import { normalizarUnidade } from "@/modules/medicao/reajuste/unidade";

/**
 * De-para do reajuste (Fase 6): cada linha do SIAC (grupo + código SICRO) aponta para um ou mais
 * itens nossos. O casamento salvo do contrato (`mc_reajuste_de_para`) vale de novo; linha nova
 * recebe uma SUGESTÃO, que o usuário confirma ou corrige na prévia. Só escolhe item: o dinheiro
 * (rateio) é do banco (`fn_mc_reajuste_importar`, D7). Comparações exatas (BigInt, `decimal.ts`).
 *
 * Sugestão, para a linha L (só as de valor a PI diferente de zero):
 *  1. candidatos = serviços da versão da medição com a mesma unidade normalizada e preço a até 0,5%
 *     do preço do SIAC (|p - pL| x 1000 <= 5 x |pL|);
 *  2. ordem: (a) o primeiro nível do código é o número antes da vírgula do grupo SIAC ("2,2" -> "02");
 *     (b) tem valor nesta medição; (c) menor diferença de preço; (d) está no subgrupo dominante do
 *     grupo SIAC (os dois primeiros níveis, "02.07", que mais aparecem entre os casamentos firmes do
 *     grupo, ou seja, linhas com um só candidato em (a) e (b)); (e) menor diferença entre o valor do
 *     item na medição e o valor a PI do SIAC; (f) código;
 *  3. sugere o primeiro; `conferir` = o segundo empata em (a) a (d), ou o sugerido não tem valor;
 *  4. sem candidato: nenhum item, o usuário escolhe.
 */

export interface LinhaParaCasar {
  grupo: string;
  codigo: string;
  unidade: string;
  precoUnitario: string;
  valorPiLiquido: string;
}

export interface ItemCandidato {
  itemId: string;
  codigo: string;
  unidade: string | null;
  /** Preço da linha da planilha (texto do banco). */
  preco: string;
  /** Valor do item nesta medição (texto do banco; "0" se não foi medido). */
  valor: string;
  /** Descrição da linha da planilha (para a tela escolher; o de-para não usa). */
  descricao?: string | null;
}

export interface CasamentoSalvo {
  grupo: string;
  codigo: string;
  itemId: string;
}

export interface Casamento {
  itens: string[];
  origem: "salvo" | "sugerido" | "sem_candidato";
  /** A sugestão precisa de olho: empate ou item sem valor na medição. */
  conferir: boolean;
}

export function chaveLinha(grupo: string, codigo: string): string {
  return `${grupo}|${codigo}`;
}

const MIL = lerDecimal("1000");
const CINCO = lerDecimal("5");
const ZERO = lerDecimal("0");

function precoProximo(preco: Decimal, alvo: Decimal): boolean {
  return comparar(multiplicar(absoluto(subtrair(preco, alvo)), MIL), multiplicar(CINCO, absoluto(alvo))) <= 0;
}

function nivel1DoGrupo(grupo: string): string {
  return grupo.split(",")[0].padStart(2, "0");
}

function prefixo2(codigo: string): string {
  return codigo.split(".").slice(0, 2).join(".");
}

interface Candidato {
  item: ItemCandidato;
  mesmoNivel: boolean;
  temValor: boolean;
  difPreco: Decimal;
  difValor: Decimal;
}

function candidatos(linha: LinhaParaCasar, itens: ItemCandidato[]): Candidato[] {
  const unidade = normalizarUnidade(linha.unidade);
  const alvo = lerDecimal(linha.precoUnitario);
  const pi = lerDecimal(linha.valorPiLiquido);
  const nivel = nivel1DoGrupo(linha.grupo);
  return itens
    .filter((i) => normalizarUnidade(i.unidade) === unidade && precoProximo(lerDecimal(i.preco), alvo))
    .map((i) => {
      const valor = lerDecimal(i.valor);
      return {
        item: i,
        mesmoNivel: i.codigo.split(".")[0] === nivel,
        temValor: comparar(valor, ZERO) !== 0,
        difPreco: absoluto(subtrair(lerDecimal(i.preco), alvo)),
        difValor: absoluto(subtrair(valor, pi)),
      };
    });
}

export function sugerirDePara(linhas: LinhaParaCasar[], itens: ItemCandidato[], salvos: CasamentoSalvo[]): Map<string, Casamento> {
  const comValor = linhas.filter((l) => comparar(lerDecimal(l.valorPiLiquido), ZERO) !== 0);
  const existentes = new Set(itens.map((i) => i.itemId));
  const salvosPorChave = new Map<string, string[]>();
  for (const s of salvos) {
    const k = chaveLinha(s.grupo, s.codigo);
    salvosPorChave.set(k, [...(salvosPorChave.get(k) ?? []), s.itemId]);
  }

  // Casamentos firmes (um só candidato do mesmo nível e com valor): o subgrupo dominante de cada grupo SIAC.
  const contagem = new Map<string, Map<string, number>>();
  for (const l of comValor) {
    const firmes = candidatos(l, itens).filter((c) => c.mesmoNivel && c.temValor);
    if (firmes.length !== 1) continue;
    const p = prefixo2(firmes[0].item.codigo);
    const m = contagem.get(l.grupo) ?? new Map<string, number>();
    m.set(p, (m.get(p) ?? 0) + 1);
    contagem.set(l.grupo, m);
  }
  const dominante = new Map<string, string>();
  for (const [g, m] of contagem) {
    const [p] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    dominante.set(g, p);
  }

  const resultado = new Map<string, Casamento>();
  for (const l of comValor) {
    const chave = chaveLinha(l.grupo, l.codigo);
    const salvo = salvosPorChave.get(chave);
    if (salvo && salvo.length > 0 && salvo.every((i) => existentes.has(i))) {
      resultado.set(chave, { itens: salvo, origem: "salvo", conferir: false });
      continue;
    }
    const dom = dominante.get(l.grupo);
    const chaveOrdem = (c: Candidato) => [c.mesmoNivel ? 0 : 1, c.temValor ? 0 : 1] as const;
    const ordenados = candidatos(l, itens).sort((a, b) => {
      const [a1, a2] = chaveOrdem(a);
      const [b1, b2] = chaveOrdem(b);
      return (
        a1 - b1 ||
        a2 - b2 ||
        comparar(a.difPreco, b.difPreco) ||
        (prefixo2(a.item.codigo) === dom ? 0 : 1) - (prefixo2(b.item.codigo) === dom ? 0 : 1) ||
        comparar(a.difValor, b.difValor) ||
        a.item.codigo.localeCompare(b.item.codigo)
      );
    });
    const [primeiro, segundo] = ordenados;
    if (!primeiro) {
      resultado.set(chave, { itens: [], origem: "sem_candidato", conferir: true });
      continue;
    }
    const empata =
      segundo !== undefined &&
      primeiro.mesmoNivel === segundo.mesmoNivel &&
      primeiro.temValor === segundo.temValor &&
      comparar(primeiro.difPreco, segundo.difPreco) === 0 &&
      (prefixo2(primeiro.item.codigo) === dom) === (prefixo2(segundo.item.codigo) === dom);
    resultado.set(chave, { itens: [primeiro.item.itemId], origem: "sugerido", conferir: empata || !primeiro.temValor });
  }
  return resultado;
}
