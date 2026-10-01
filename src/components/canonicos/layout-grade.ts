/**
 * Como cada pessoa arrumou uma grade de cards ou gráficos: ordem, o que tirou
 * da tela e o tamanho de cada um. Funções puras; quem busca, salva e hidrata é
 * o ProvedorGrades. Mesma ideia das preferências de tabela, e mora na MESMA
 * tabela do banco (`preferencias_tabela`), com a chave prefixada por `painel.`.
 *
 * Saneamento é obrigatório na leitura: o JSON vem do navegador e os cards de
 * uma tela mudam com o tempo (card novo, card removido, título trocado). Uma
 * preferência velha nunca pode esconder card que acabou de nascer nem deixar
 * um card com tamanho absurdo.
 */

/** Versão do formato. Subir invalida tudo que está salvo. */
export const VERSAO_LAYOUT_GRADE = 1;

/** A grade tem 12 colunas. Largura de card é quantas delas ele ocupa. */
export const COLUNAS_GRADE = 12;

/** Menos que isso o número do card não cabe nem em R$ 0,00. */
export const LARGURA_MINIMA_GRADE = 2;

/** Altura mínima de um card redimensionado, em px. */
export const ALTURA_MINIMA_GRADE = 80;

/** Altura máxima, em px. Acima disso o card vira a página. */
export const ALTURA_MAXIMA_GRADE = 1200;

/** O que o menu oferece de largura. O arrasto aceita qualquer coluna entre 2 e 12. */
export const LARGURAS_GRADE: { colunas: number; rotulo: string }[] = [
  { colunas: 3, rotulo: "1/4 da linha" },
  { colunas: 4, rotulo: "1/3 da linha" },
  { colunas: 6, rotulo: "Metade da linha" },
  { colunas: 8, rotulo: "2/3 da linha" },
  { colunas: 9, rotulo: "3/4 da linha" },
  { colunas: 12, rotulo: "Linha inteira" },
];

/** Alturas prontas do menu, em px. */
export const ALTURAS_GRADE: { px: number; rotulo: string }[] = [
  { px: 160, rotulo: "Baixa" },
  { px: 320, rotulo: "Média" },
  { px: 480, rotulo: "Alta" },
  { px: 640, rotulo: "Muito alta" },
];

export interface TamanhoItemGrade {
  /** Colunas de 12. Ausente = a largura padrão da tela. */
  largura?: number;
  /** Altura em px. Ausente = a altura do conteúdo. */
  altura?: number;
}

export interface LayoutGrade {
  versao: number;
  /** Ordem dos ids. Card que não está aqui entra na posição padrão dele. */
  ordem: string[];
  /** Cards que a pessoa tirou da tela. */
  ocultos: string[];
  /** id do card -> tamanho escolhido. */
  tamanhos: Record<string, TamanhoItemGrade>;
}

/** Layout neutro: tudo na ordem da tela, nada oculto, nada redimensionado. */
export function layoutGradeVazio(): LayoutGrade {
  return { versao: VERSAO_LAYOUT_GRADE, ordem: [], ocultos: [], tamanhos: {} };
}

/** Layout que não muda nada em relação ao padrão da tela. */
export function layoutGradeEhPadrao(layout: LayoutGrade): boolean {
  return (
    layout.ordem.length === 0 &&
    layout.ocultos.length === 0 &&
    Object.keys(layout.tamanhos).length === 0
  );
}

/**
 * Chave da grade na tabela de preferências. O formato tem que passar no mesmo
 * regex das tabelas (`modulo.aba[.sufixo]`), por isso o prefixo é com ponto.
 */
export function chaveLayoutGrade(idGrade: string): string {
  return `painel.${idGrade}`;
}

/** Id de card a partir do título, quando quem chama não deu um id explícito. */
export function idDoTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function listaDeIds(bruto: unknown, idsValidos: Set<string>): string[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const limpo: string[] = [];
  for (const id of bruto) {
    if (typeof id !== "string" || !idsValidos.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    limpo.push(id);
  }
  return limpo;
}

export function limitarLargura(colunas: number): number {
  return Math.min(COLUNAS_GRADE, Math.max(LARGURA_MINIMA_GRADE, Math.round(colunas)));
}

export function limitarAltura(px: number): number {
  return Math.min(ALTURA_MAXIMA_GRADE, Math.max(ALTURA_MINIMA_GRADE, Math.round(px)));
}

function saneiaTamanhos(
  bruto: unknown,
  idsValidos: Set<string>,
): Record<string, TamanhoItemGrade> {
  if (!ehObjeto(bruto)) return {};
  const limpo: Record<string, TamanhoItemGrade> = {};
  for (const [id, valor] of Object.entries(bruto)) {
    if (!idsValidos.has(id) || !ehObjeto(valor)) continue;
    const tamanho: TamanhoItemGrade = {};
    if (typeof valor.largura === "number" && Number.isFinite(valor.largura)) {
      tamanho.largura = limitarLargura(valor.largura);
    }
    if (typeof valor.altura === "number" && Number.isFinite(valor.altura)) {
      tamanho.altura = limitarAltura(valor.altura);
    }
    if (tamanho.largura !== undefined || tamanho.altura !== undefined) {
      limpo[id] = tamanho;
    }
  }
  return limpo;
}

/**
 * Lê o layout salvo e descarta o que não serve mais: id de card que sumiu da
 * tela, tamanho fora dos limites, versão antiga. Nunca lança.
 */
export function lerLayoutGrade(bruto: unknown, idsDaTela: string[]): LayoutGrade {
  if (!ehObjeto(bruto) || bruto.versao !== VERSAO_LAYOUT_GRADE) {
    return layoutGradeVazio();
  }
  const validos = new Set(idsDaTela);
  return {
    versao: VERSAO_LAYOUT_GRADE,
    ordem: listaDeIds(bruto.ordem, validos),
    ocultos: listaDeIds(bruto.ocultos, validos),
    tamanhos: saneiaTamanhos(bruto.tamanhos, validos),
  };
}

/**
 * A ordem que a tela mostra: a salva, com os cards novos encaixados logo depois
 * do vizinho que eles têm na ordem padrão. Card novo no fim da grade (o jeito
 * fácil) faria o "Vencido" nascer depois do "A revisar" só porque alguém tinha
 * arrumado a tela antes de ele existir.
 */
export function ordemDaGrade(idsPadrao: string[], ordemSalva: string[]): string[] {
  const padrao = new Set(idsPadrao);
  const resultado = ordemSalva.filter((id) => padrao.has(id));
  const presentes = new Set(resultado);
  idsPadrao.forEach((id, indice) => {
    if (presentes.has(id)) return;
    let posicao = 0;
    for (let anterior = indice - 1; anterior >= 0; anterior--) {
      const onde = resultado.indexOf(idsPadrao[anterior]);
      if (onde !== -1) {
        posicao = onde + 1;
        break;
      }
    }
    resultado.splice(posicao, 0, id);
    presentes.add(id);
  });
  return resultado;
}

/** Move `id` para antes (ou depois) de `alvo`. Devolve a ordem nova. */
export function moverNaOrdem(
  ordem: string[],
  id: string,
  alvo: string,
  depois: boolean,
): string[] {
  if (id === alvo) return ordem;
  const sem = ordem.filter((x) => x !== id);
  const indiceAlvo = sem.indexOf(alvo);
  if (indiceAlvo === -1) return ordem;
  sem.splice(depois ? indiceAlvo + 1 : indiceAlvo, 0, id);
  return sem;
}

/** Troca o card de lugar com o vizinho visível (passo -1 = antes, +1 = depois). */
export function moverUmPasso(
  ordem: string[],
  visiveis: Set<string>,
  id: string,
  passo: -1 | 1,
): string[] {
  const indice = ordem.indexOf(id);
  if (indice === -1) return ordem;
  for (let i = indice + passo; i >= 0 && i < ordem.length; i += passo) {
    if (visiveis.has(ordem[i])) return moverNaOrdem(ordem, id, ordem[i], passo === 1);
  }
  return ordem;
}

/**
 * Converte uma largura em px (vinda do arrasto) para colunas, considerando o
 * espaço entre os cards: 12 colunas e 11 vãos somam a largura da grade.
 */
export function colunasDaLargura(px: number, larguraGrade: number, vao: number): number {
  if (larguraGrade <= 0) return COLUNAS_GRADE;
  const coluna = (larguraGrade - vao * (COLUNAS_GRADE - 1)) / COLUNAS_GRADE;
  return limitarLargura((px + vao) / (coluna + vao));
}

/**
 * `flex-basis` CSS de um card de N colunas, com o vão da grade em `--vao-grade`.
 * O meio pixel a menos é folga de arredondamento: três cards de 4 colunas somam
 * exatamente 100%, e o navegador que arredondar um subpixel para cima quebraria
 * o terceiro para a linha de baixo.
 */
export function baseDaLargura(colunas: number): string {
  const n = limitarLargura(colunas);
  return `calc((100% - ${COLUNAS_GRADE - 1} * var(--vao-grade)) / ${COLUNAS_GRADE} * ${n} + ${n - 1} * var(--vao-grade) - 0.5px)`;
}

/**
 * Devolve ao layout novo o que estava salvo para cards que NÃO estão na tela
 * agora. Sem isso, salvar numa tela sem o card condicional ("Total no recorte"
 * só existe com recorte) apagaria a ordem, o oculto e o tamanho dele, e o card
 * voltaria visível e no lugar padrão da próxima vez que aparecesse.
 */
export function preservarForaDaTela(
  novo: LayoutGrade,
  bruto: unknown,
  idsDaTela: string[],
): LayoutGrade {
  if (!ehObjeto(bruto) || bruto.versao !== VERSAO_LAYOUT_GRADE) return novo;
  const naTela = new Set(idsDaTela);
  const ordemSalva = Array.isArray(bruto.ordem)
    ? bruto.ordem.filter((id): id is string => typeof id === "string")
    : [];
  const foraNaOrdem = ordemSalva.filter((id) => !naTela.has(id));
  const ocultosSalvos = Array.isArray(bruto.ocultos)
    ? bruto.ocultos.filter((id): id is string => typeof id === "string" && !naTela.has(id))
    : [];
  const todosSalvos = [...ordemSalva, ...ocultosSalvos, ...(ehObjeto(bruto.tamanhos) ? Object.keys(bruto.tamanhos) : [])];
  const tamanhosFora = saneiaTamanhos(
    bruto.tamanhos,
    new Set(todosSalvos.filter((id) => !naTela.has(id))),
  );
  if (foraNaOrdem.length === 0 && ocultosSalvos.length === 0 && Object.keys(tamanhosFora).length === 0) {
    return novo;
  }

  // A ordem salva manda a posição dos que estão fora; a nova manda a dos que
  // estão na tela. Os de fora entram logo depois do vizinho que tinham.
  let ordem = novo.ordem;
  if (foraNaOrdem.length > 0) {
    const base = [...ordemSalva, ...idsDaTela.filter((id) => !ordemSalva.includes(id))];
    const naTelaNaOrdem = novo.ordem.length > 0 ? novo.ordem : idsDaTela;
    ordem = ordemDaGrade(base, naTelaNaOrdem);
  }
  return {
    versao: VERSAO_LAYOUT_GRADE,
    ordem,
    ocultos: [...novo.ocultos, ...ocultosSalvos.filter((id) => !novo.ocultos.includes(id))],
    tamanhos: { ...tamanhosFora, ...novo.tamanhos },
  };
}
