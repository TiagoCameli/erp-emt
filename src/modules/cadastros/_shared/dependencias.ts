/**
 * Tradução dos códigos de bloqueio de exclusão que vêm do banco.
 *
 * A regra de "pode ou não excluir" mora no Postgres (fn_obra_bloqueio e
 * fn_centro_custo_bloqueio), que devolve NULL quando libera ou um código
 * quando barra. Aqui só viramos esse código em texto pt-BR. Módulo puro:
 * sem React, sem acesso a banco, testável em Vitest.
 *
 * O texto vive num lugar só e é reusado pelo tooltip do botão desabilitado,
 * pela descrição do diálogo de confirmação e pela mensagem de erro da
 * Server Action quando a corrida perde (alguém vinculou algo no meio).
 */

/** Códigos devolvidos por fn_obra_bloqueio. */
export const CODIGOS_BLOQUEIO_OBRA = [
  "nao_encontrado",
  "tem_filhos",
  "em_uso",
  "centro_em_uso",
  "centros_duplicados",
] as const;
export type CodigoBloqueioObra = (typeof CODIGOS_BLOQUEIO_OBRA)[number];

/** Códigos devolvidos por fn_centro_custo_bloqueio. */
export const CODIGOS_BLOQUEIO_CENTRO = [
  "nao_encontrado",
  "sistema",
  "raiz_de_obra",
  "nivel_1",
  "tem_filhos",
  "em_uso",
] as const;
export type CodigoBloqueioCentro = (typeof CODIGOS_BLOQUEIO_CENTRO)[number];

const MOTIVO_OBRA: Record<CodigoBloqueioObra, string> = {
  nao_encontrado: "Esta obra não existe mais. Atualize a página",
  tem_filhos:
    "O centro de custo desta obra tem etapas ou itens abaixo dele. Exclua-os primeiro",
  em_uso: "Esta obra tem colaborador, diária ou ponto vinculado",
  centro_em_uso:
    "O centro de custo desta obra já tem custo lançado (compra, folha ou financeiro)",
  centros_duplicados:
    "Esta obra tem mais de um centro de custo raiz. Ajuste isso antes de excluir",
};

const MOTIVO_CENTRO: Record<CodigoBloqueioCentro, string> = {
  nao_encontrado: "Este centro de custo não existe mais. Atualize a página",
  sistema: "Centro de custo do sistema não pode ser excluído",
  raiz_de_obra:
    "Este é o centro raiz de uma obra. Exclua a obra, que o centro sai junto",
  nivel_1: "Centro de custo raiz não pode ser excluído",
  tem_filhos:
    "Este centro tem etapas ou itens abaixo dele. Exclua-os primeiro",
  em_uso:
    "Este centro de custo já tem custo ou colaborador vinculado",
};

/** Fallback para código que o banco passe a devolver e o app ainda não conheça. */
const MOTIVO_DESCONHECIDO = "Este registro não pode ser excluído";

function traduz<T extends string>(
  mapa: Record<T, string>,
  codigo: string | null,
): string | null {
  if (codigo === null) return null;
  return codigo in mapa ? mapa[codigo as T] : MOTIVO_DESCONHECIDO;
}

/**
 * Motivo pelo qual a obra não pode ser excluída, ou null quando pode.
 * Recebe direto o valor de fn_obra_bloqueio.
 */
export function motivoBloqueioObra(codigo: string | null): string | null {
  return traduz(MOTIVO_OBRA, codigo);
}

/**
 * Motivo pelo qual o centro de custo não pode ser excluído, ou null quando
 * pode. Recebe direto o valor de fn_centro_custo_bloqueio.
 */
export function motivoBloqueioCentroCusto(
  codigo: string | null,
): string | null {
  return traduz(MOTIVO_CENTRO, codigo);
}

/**
 * Extrai o código de bloqueio da mensagem de erro do Postgres. As funções
 * fn_excluir_obra e fn_excluir_centro_custo estouram no formato
 * "... nao pode ser excluida (tem_filhos)". Devolve null quando a mensagem
 * não tem esse formato, ou seja, quando o erro veio de outra causa.
 */
export function codigoBloqueio(mensagem: string | undefined): string | null {
  const achado = /\(([a-z_]+)\)\s*$/.exec(mensagem ?? "");
  return achado?.[1] ?? null;
}
