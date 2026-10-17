import { normalizarBusca } from "@/lib/busca";
import { deslocar } from "@/modules/mapa/geo";
import type { PessoaMapa, Posicao } from "@/modules/mapa/tipos";

/**
 * Onde o boneco de quem opera uma máquina aparece: encostado na lateral esquerda dela (pedido do
 * Tiago, 17/10/2026: "ao lado do equipamento... bem ao lado mesmo"). Esquerda da própria máquina,
 * pelo rumo dela (frente em `heading`, graus do norte em sentido horário): assim o boneco fica na
 * lateral de qualquer jeito que ela esteja virada. `afastamentoM` vem de `afastamentoDoOperadorM`.
 */
export function posicaoDoOperador(
  maquina: Posicao,
  heading: number,
  afastamentoM: number,
): Posicao {
  return deslocar(maquina, heading - 90, afastamentoM);
}

/**
 * Destino de `fn_mapa_mover_colaboradores` para uma pessoa posta no mapa. Tocou (ou soltou) dentro
 * do raio de um local: trabalha nele E fica no ponto tocado — o centro do local (o pátio do Silo
 * tem dezenas de máquinas em volta) esconde o boneco, e a pessoa não ficava onde foi posta.
 * Sem ponto (local escolhido na ficha), vai para o local.
 *
 * Obra como local (Tiago, 17/10/2026: "uma obra pode ser o local de trabalho de um funcionario
 * enquanto a obra estiver ativa"): grava a obra sem local; a RPC zera o local e a máquina.
 */
export function destinoDaPessoa(
  para: Posicao | null,
  local: { id: string } | null,
  obra: { id: string } | null = null,
): {
  localidade_id?: string;
  obra_id?: string;
  lng?: number;
  lat?: number;
} | null {
  const ponto = para ? { lng: para[0], lat: para[1] } : null;
  if (local) return { localidade_id: local.id, ...ponto };
  if (obra) return { obra_id: obra.id, ...ponto };
  return ponto;
}

/**
 * Valor do campo "Local de trabalho" da ficha: "local:<id>", "obra:<id>" ou "" (nenhum).
 * A obra só vale quando é a do Mapa (a do RH não foi escolhida aqui), está ativa e a pessoa não
 * está numa máquina nem numa área, que já dizem onde ela trabalha.
 */
export function lugarDaPessoa(
  p: PessoaMapa,
  obrasAtivas: ReadonlySet<string>,
): string {
  if (p.localidadeId) return `local:${p.localidadeId}`;
  if (
    p.obraMapaId &&
    !p.equipamentoId &&
    !p.areaId &&
    obrasAtivas.has(p.obraMapaId)
  )
    return `obra:${p.obraMapaId}`;
  return "";
}

/**
 * Recorte das listas de pessoas do painel pela barra de filtros (busca e obra), o mesmo que vale
 * para as máquinas. Sem isso a lista "sem posição" traz o quadro inteiro e ninguém acha a pessoa.
 */
export function pessoaNoFiltro(
  p: PessoaMapa,
  filtros: { busca: string; obraId: string },
): boolean {
  if (filtros.obraId && p.obraId !== filtros.obraId) return false;
  const termo = normalizarBusca(filtros.busca);
  if (!termo) return true;
  return normalizarBusca(
    [p.nome, p.funcao, p.equipeNome, p.vinculo].join(" "),
  ).includes(termo);
}
