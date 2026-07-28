/**
 * Preferências de exibição de uma tabela (colunas visíveis, ordem e larguras),
 * guardadas no navegador do usuário. Funções puras: o DataTable cuida do
 * localStorage e da hidratação, aqui só tem serialização e saneamento.
 *
 * Saneamento é obrigatório na leitura: o JSON vem do navegador do usuário e as
 * colunas da tela mudam com o tempo (coluna renomeada, removida, nova). Uma
 * preferência velha nunca pode esconder coluna que não existe mais nem deixar
 * a tabela com largura absurda.
 */

/** Versão do formato. Subir invalida tudo que está salvo (migração descartável). */
export const VERSAO_PREFERENCIAS = 1;

/** Largura mínima de uma coluna, em px. Abaixo disso o conteúdo desaparece. */
export const LARGURA_MINIMA = 60;

/** Largura máxima de uma coluna, em px. */
export const LARGURA_MAXIMA = 800;

export interface PreferenciasTabela {
  versao: number;
  /** id da coluna -> visível. Coluna ausente segue o padrão definido na tela. */
  visiveis: Record<string, boolean>;
  /** Ordem dos ids. Ids conhecidos que ficarem de fora entram no fim. */
  ordem: string[];
  /** id da coluna -> largura em px. */
  larguras: Record<string, number>;
}

/** Preferência neutra: nada escondido, nada reordenado, nada redimensionado. */
export function preferenciasVazias(): PreferenciasTabela {
  return { versao: VERSAO_PREFERENCIAS, visiveis: {}, ordem: [], larguras: {} };
}

/**
 * Chave do localStorage. Inclui o usuário porque duas pessoas podem usar o
 * mesmo navegador (máquina compartilhada de escritório é comum na EMT).
 */
export function chavePreferenciasTabela(
  idTabela: string,
  idUsuario?: string,
): string {
  return `erp-emt:tabela:${idTabela}:${idUsuario ?? "anonimo"}:v${VERSAO_PREFERENCIAS}`;
}

/** Objeto simples (não nulo, não array). */
function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function saneiaVisiveis(
  bruto: unknown,
  idsValidos: Set<string>,
): Record<string, boolean> {
  if (!ehObjeto(bruto)) return {};
  const limpo: Record<string, boolean> = {};
  for (const [id, valor] of Object.entries(bruto)) {
    if (idsValidos.has(id) && typeof valor === "boolean") limpo[id] = valor;
  }
  return limpo;
}

function saneiaOrdem(bruto: unknown, idsValidos: Set<string>): string[] {
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

function saneiaLarguras(
  bruto: unknown,
  idsValidos: Set<string>,
): Record<string, number> {
  if (!ehObjeto(bruto)) return {};
  const limpo: Record<string, number> = {};
  for (const [id, valor] of Object.entries(bruto)) {
    if (!idsValidos.has(id)) continue;
    if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
    limpo[id] = Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, Math.round(valor)));
  }
  return limpo;
}

/**
 * Interpreta o que estava salvo. Devolve null quando não há nada aproveitável
 * (ausente, JSON inválido, versão antiga, formato estranho) — nesse caso a tela
 * usa o padrão dela. `idsValidos` são as colunas que a tela tem hoje.
 */
export function lerPreferenciasTabela(
  bruto: string | null | undefined,
  idsValidos: string[],
): PreferenciasTabela | null {
  if (!bruto) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (!ehObjeto(dados)) return null;
  if (dados.versao !== VERSAO_PREFERENCIAS) return null;

  const validos = new Set(idsValidos);
  return {
    versao: VERSAO_PREFERENCIAS,
    visiveis: saneiaVisiveis(dados.visiveis, validos),
    ordem: saneiaOrdem(dados.ordem, validos),
    larguras: saneiaLarguras(dados.larguras, validos),
  };
}

/** Serializa para gravar. */
export function escreverPreferenciasTabela(
  preferencias: PreferenciasTabela,
): string {
  return JSON.stringify({ ...preferencias, versao: VERSAO_PREFERENCIAS });
}

/**
 * Ordem final das colunas: o que o usuário arrumou primeiro, e as colunas que
 * ele nunca viu (adicionadas depois) no fim, na ordem natural da tela.
 */
export function ordemEfetiva(
  ordemSalva: string[],
  idsNaturais: string[],
): string[] {
  const salvos = ordemSalva.filter((id) => idsNaturais.includes(id));
  const restantes = idsNaturais.filter((id) => !salvos.includes(id));
  return [...salvos, ...restantes];
}
