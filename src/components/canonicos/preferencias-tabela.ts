/**
 * Preferências de exibição de uma tabela (colunas visíveis, ordem, larguras,
 * filtros visíveis e altura da linha), guardadas no banco por usuário. Funções
 * puras: o DataTable cuida de buscar, salvar e hidratar; aqui só tem
 * serialização e saneamento.
 *
 * Saneamento é obrigatório na leitura: o JSON vem do navegador do usuário e as
 * colunas da tela mudam com o tempo (coluna renomeada, removida, nova). Uma
 * preferência velha nunca pode esconder coluna que não existe mais nem deixar
 * a tabela com largura absurda.
 */

/** Versão do formato. Subir invalida tudo que está salvo (migração descartável). */
// v2: entrou `filtros`. Subir a versão descarta o que estava salvo no formato
// antigo, inclusive o que ficou no localStorage antes de ir para o banco.
//
// `alturaLinha` entrou DEPOIS do v2 e de propósito NÃO subiu a versão: campo
// opcional se resolve na leitura (ausente = automático), e subir invalidaria as
// colunas, larguras e filtros que todo mundo já configurou. Campo novo que só
// acrescenta nunca precisa de versão nova; só mude a versão se o significado de
// um campo existente mudar.
export const VERSAO_PREFERENCIAS = 2;

/** Largura mínima de uma coluna, em px. Abaixo disso o conteúdo desaparece. */
export const LARGURA_MINIMA = 60;

/** Largura máxima de uma coluna, em px. */
export const LARGURA_MAXIMA = 800;

/**
 * Altura mínima de linha, em px.
 *
 * 34 = 32 do botão + 2 de folga de borda. Os 32 são a altura real dos botões que
 * moram DENTRO da linha: o `⋮` de ações é `size="icon-sm"` (size-8) e os botões
 * Aprovar/Revisar da fila de aprovação são `size="sm"` (h-8). Com altura fixa o
 * conteúdo da célula entra num contêiner com `maxHeight` e `overflow-hidden`, e
 * um mínimo menor que o botão o decepa em TODA listagem do app, porque o preset
 * "Compacta" usa exatamente este valor.
 *
 * Não baixe para 28 achando que "cabe uma linha de texto": texto cabe, botão
 * não, e é o botão que manda aqui.
 */
export const ALTURA_LINHA_MINIMA = 34;

/** Altura máxima de linha, em px. Acima disso a tabela vira uma lista de cards. */
export const ALTURA_LINHA_MAXIMA = 160;

export interface PreferenciasTabela {
  versao: number;
  /** id da coluna -> visível. Coluna ausente segue o padrão definido na tela. */
  visiveis: Record<string, boolean>;
  /** Ordem dos ids. Ids conhecidos que ficarem de fora entram no fim. */
  ordem: string[];
  /** id da coluna -> largura em px. */
  larguras: Record<string, number>;
  /** id do filtro -> visível. Filtro ausente segue o padrão da tela. */
  filtros: Record<string, boolean>;
  /**
   * Altura de toda linha da tabela, em px. `null` = automática: a linha tem
   * altura mínima e cresce com o conteúdo (é o padrão, e o que mantém visível a
   * segunda linha das células de duas linhas).
   */
  alturaLinha: number | null;
}

/** Preferência neutra: nada escondido, nada reordenado, nada redimensionado. */
export function preferenciasVazias(): PreferenciasTabela {
  return {
    versao: VERSAO_PREFERENCIAS,
    visiveis: {},
    ordem: [],
    larguras: {},
    filtros: {},
    alturaLinha: null,
  };
}

/**
 * Chave antiga do localStorage. Mantida só para o teste que garante o formato;
 * a preferência agora vive no banco, por usuário, e segue a pessoa em qualquer
 * máquina (o localStorage morria ao trocar de navegador ou limpar cache, e
 * máquina compartilhada de escritório é comum na EMT).
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
 * Altura da linha salva. Qualquer coisa que não seja número utilizável cai em
 * `null` (automática), que é o comportamento padrão da tabela: preferência velha
 * ou corrompida nunca pode clipar o conteúdo de quem nunca pediu isso.
 */
function saneiaAlturaLinha(bruto: unknown): number | null {
  if (typeof bruto !== "number" || !Number.isFinite(bruto)) return null;
  return Math.min(
    ALTURA_LINHA_MAXIMA,
    Math.max(ALTURA_LINHA_MINIMA, Math.round(bruto)),
  );
}

/**
 * Interpreta o que estava salvo. Devolve null quando não há nada aproveitável
 * (ausente, JSON inválido, versão antiga, formato estranho) — nesse caso a tela
 * usa o padrão dela. `idsValidos` são as colunas que a tela tem hoje.
 */
export function lerPreferenciasTabela(
  bruto: string | null | undefined,
  idsValidos: string[],
  idsFiltros: string[] = [],
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
    filtros: saneiaVisiveis(dados.filtros, new Set(idsFiltros)),
    // Blob gravado antes da altura existir não tem o campo: lê como automática,
    // sem perder o resto da configuração.
    alturaLinha: saneiaAlturaLinha(dados.alturaLinha),
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
