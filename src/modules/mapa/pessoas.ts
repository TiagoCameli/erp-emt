import { normalizarBusca } from "@/lib/busca";
import type { PessoaMapa } from "@/modules/mapa/tipos";

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
