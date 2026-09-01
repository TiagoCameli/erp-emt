/**
 * Como uma linha de `rateio_eventos` vira um evento da trilha. Módulo puro.
 *
 * O evento guarda o rateio INTEIRO dos dois lados (antes e depois), e não o que
 * mudou: assim a trilha continua legível mesmo depois de o rateio mudar mais
 * cinco vezes, e não depende de reconstruir o estado somando deltas. Quem
 * calcula a diferença para exibir é aqui, na leitura.
 *
 * Os nomes dos centros NÃO estão gravados no evento — só os ids. Nome de obra
 * muda, e uma trilha que guardasse o nome contaria a história com o nome errado.
 * Quem lê resolve o nome atual e passa o mapa.
 */

import type { EventoTrilha } from "@/components/canonicos/trilha";
import { formatarBRL } from "@/lib/formatadores";
import { diffDoRateio, type RateioValor } from "./rateio-editavel";

/** O que a coluna jsonb guarda em cada lado do evento. */
export interface LinhaRateioGravada {
  centro_custo_id: string;
  valor: number | string;
}

/** Uma linha de `rateio_eventos` com o autor já resolvido. */
export interface RateioEvento {
  id: string;
  motivo: string;
  antes: unknown;
  depois: unknown;
  criadoEm: string;
  usuarioNome: string | null;
}

/** Nome exibido quando o centro sumiu do cadastro depois do evento. */
const CENTRO_REMOVIDO = "Centro de custo removido";

/**
 * Lê um lado do evento, tolerando o que a coluna jsonb permite guardar.
 *
 * A coluna é `jsonb`: nada no tipo do banco impede uma linha antiga, de outra
 * carga, ou simplesmente torta de chegar aqui. Uma trilha que estoura esconde
 * TODOS os eventos do lançamento, não só o evento torto — então linha que não dá
 * para ler é descartada, e o resto continua aparecendo.
 */
export function linhasDoRateio(valor: unknown): RateioValor[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((linha) => {
    if (typeof linha !== "object" || linha === null) return [];
    const bruto = linha as Partial<LinhaRateioGravada>;
    if (typeof bruto.centro_custo_id !== "string") return [];
    const numero = Number(bruto.valor);
    if (!Number.isFinite(numero)) return [];
    return [{ centroCustoId: bruto.centro_custo_id, valor: numero }];
  });
}

/**
 * Converte um evento de rateio no `EventoTrilha` do componente canônico.
 *
 * A descrição junta o motivo com o que mudou, na ordem em que a pergunta é
 * feita: primeiro quem continuou e mudou de valor, depois quem entrou, por
 * último quem saiu. "De que obra para que obra o custo foi" é o que a pessoa
 * quer saber seis meses depois, e duas listas cruas não respondem isso.
 */
export function eventoRateioParaTrilha(
  evento: RateioEvento,
  nomesPorCentro: Map<string, string>,
): EventoTrilha {
  const antes = linhasDoRateio(evento.antes);
  const depois = linhasDoRateio(evento.depois);
  const diff = diffDoRateio(antes, depois);

  const nome = (id: string) => nomesPorCentro.get(id) ?? CENTRO_REMOVIDO;

  const partes: string[] = [];
  if (evento.motivo) partes.push(evento.motivo);
  for (const linha of diff.mudaram) {
    partes.push(
      `${nome(linha.centroCustoId)}: de ${formatarBRL(linha.valorDe)} para ${formatarBRL(linha.valorPara)}`,
    );
  }
  for (const linha of diff.entraram) {
    partes.push(`${nome(linha.centroCustoId)}: entrou com ${formatarBRL(linha.valor)}`);
  }
  for (const linha of diff.sairam) {
    partes.push(`${nome(linha.centroCustoId)}: saiu (${formatarBRL(linha.valor)})`);
  }

  return {
    id: evento.id,
    data: evento.criadoEm,
    titulo: "Rateio por centro de custo alterado",
    descricao: partes.join(" · "),
    usuario: evento.usuarioNome ?? "Sistema",
    // "edicao" é o mesmo destaque de `alterou` na trilha da parcela: o
    // componente não tem cor própria para reclassificação, e o título já diz.
    tipo: "edicao",
  };
}
