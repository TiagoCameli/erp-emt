/**
 * Regras da tela de transferência, iguais ao TransferenciaForm do Gestão Obras.
 *
 * Módulo PURO (sem "use client", sem server-only): o Vitest importa direto e o
 * formulário só chama. O banco confere de novo ao salvar (espaço no destino e
 * saldo na linha do tempo); aqui é o que a tela da origem bloqueia antes.
 */

/**
 * Valor que a tela preenche sozinha na CRIAÇÃO: litros x preço médio da vida
 * do tanque de origem, com 4 casas (`parseFloat((litros * preco).toFixed(4))`
 * da origem). Null quando não há o que preencher (litros ou preço zerados): aí
 * o campo fica como está.
 */
export function valorAutomatico(litros: number, precoMedio: number): number | null {
  if (!(litros > 0) || !(precoMedio > 0)) return null;
  return Number.parseFloat((litros * precoMedio).toFixed(4));
}

/**
 * Se o valor do campo vai para a RPC. Na criação vai sempre (preenchido pela
 * tela ou digitado). Na edição, só se a pessoa mexeu no campo: senão vai null e
 * o banco mantém o valor salvo, com todas as casas que ele tem (a origem guarda
 * até 12, e o campo mostra 4).
 */
export function enviaValor(editando: boolean, valorEditado: boolean): boolean {
  return !editando || valorEditado;
}

export interface CamposFisicos {
  origemId: string;
  destinoId: string;
  litros: number;
  /** `datetime-local` ("2026-09-23T14:30"). */
  dataHora: string;
}

/**
 * Edição só de metadados (valor, observação) numa transferência que já existe:
 * nenhum campo físico mudou. A origem pula a checagem de mistura de
 * combustível nesse caso (a transferência já foi aceita).
 */
export function ehEdicaoSoDeMetadados(inicial: CamposFisicos | null, atual: CamposFisicos): boolean {
  if (!inicial) return false;
  return (
    atual.origemId === inicial.origemId &&
    atual.destinoId === inicial.destinoId &&
    atual.litros === inicial.litros &&
    atual.dataHora === inicial.dataHora
  );
}

export interface TanqueDaRegra {
  capacidade: number;
  nivel: number;
  combustivelId: string | null;
}

export interface Bloqueios {
  /** Litros acima do estoque da origem na data. */
  semEstoqueOrigem: boolean;
  /** Litros acima do espaço livre do destino na data. */
  semEspacoDestino: boolean;
  /** Capacidade menos o estoque do destino na data (sem contar a própria transferência). */
  espacoDestino: number | null;
}

/**
 * Estoque da origem e espaço do destino NA DATA, como a origem. Estoque
 * desconhecido (consulta em andamento) é null e não bloqueia aqui: a tela
 * segura o botão enquanto consulta.
 *
 * Capacidade zero não trava, igual à RPC (`v_cap > 0`): no ERP capacidade zero
 * é "sem trava de capacidade".
 */
export function avaliarBloqueios(
  litros: number,
  origemSelecionada: boolean,
  estoqueOrigem: number | null,
  destino: TanqueDaRegra | null,
  estoqueDestino: number | null,
): Bloqueios {
  const semEstoqueOrigem = origemSelecionada && estoqueOrigem !== null && litros > estoqueOrigem;
  const espacoDestino =
    destino && destino.capacidade > 0 && estoqueDestino !== null ? destino.capacidade - estoqueDestino : null;
  const semEspacoDestino = espacoDestino !== null && litros > espacoDestino;
  return { semEstoqueOrigem, semEspacoDestino, espacoDestino };
}

/**
 * Mistura de combustível no destino, pelo combustível ATUAL dos dois tanques
 * (como a origem). Não acusa quando é edição só de metadados, quando falta um
 * dos tanques, quando o destino está vazio ou sem combustível, quando a origem
 * não tem combustível conhecido, ou quando os dois são iguais.
 */
export function conflitoDeCombustivel(
  origem: TanqueDaRegra | null,
  destino: TanqueDaRegra | null,
  soMetadados: boolean,
): { origemId: string; destinoId: string } | null {
  if (soMetadados) return null;
  if (!origem || !destino) return null;
  if (destino.nivel <= 0) return null;
  if (!destino.combustivelId) return null;
  if (!origem.combustivelId) return null;
  if (destino.combustivelId === origem.combustivelId) return null;
  return { origemId: origem.combustivelId, destinoId: destino.combustivelId };
}

export type RecursoDeMovimento = "combustivel.transferencias" | "combustivel.esvaziamentos";

/**
 * Quem restaura um movimento excluído (Lixeira da origem,
 * `restaurar_lixeira_combustivel`): a lixeira (`administracao.lixeira`/editar)
 * E a exclusão do recurso, as mesmas duas que `fn_comb_restaurar` confere. A
 * página usa para mostrar "Mostrar excluídos" e "Restaurar"; a action confere
 * de novo e o banco por último.
 */
export function podeRestaurarMovimento(
  temPermissao: (recurso: "administracao.lixeira" | RecursoDeMovimento, acao: "editar" | "excluir") => boolean,
  recurso: RecursoDeMovimento,
): boolean {
  return temPermissao("administracao.lixeira", "editar") && temPermissao(recurso, "excluir");
}
