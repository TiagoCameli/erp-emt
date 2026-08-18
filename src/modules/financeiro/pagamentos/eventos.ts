import type { EventoTrilha, TipoEventoTrilha } from "@/components/canonicos/trilha";
import { formatarBRL, formatarData } from "@/lib/formatadores";

/**
 * Tipo do evento gravado em `parcela_eventos`. Os cinco primeiros são
 * gravados desde sempre pelas funções de aprovação/revisão/reenvio/
 * desaprovação/reprogramação; os dois últimos são as exceções de dinheiro que
 * as Tasks 3 e 4 desta frente passam a gravar (nenhuma grava ainda aqui).
 */
export type TipoParcelaEvento =
  | "aprovou"
  | "revisou"
  | "reenviou"
  | "desaprovou"
  | "reprogramou"
  | "pagou_fora_da_janela"
  | "alterou";

/** Uma linha de `parcela_eventos`, já resolvida para exibição. */
export interface ParcelaEvento {
  id: string;
  tipo: TipoParcelaEvento;
  motivo: string | null;
  dataDe: string | null;
  dataPara: string | null;
  valorDe: number | null;
  valorPara: number | null;
  criadoEm: string;
  usuarioNome: string | null;
}

/** Título em português de cada tipo, com o número da parcela embutido. */
const TITULO_TIPO_EVENTO: Record<TipoParcelaEvento, (numeroParcela: number) => string> = {
  aprovou: (n) => `Parcela ${n} aprovada`,
  revisou: (n) => `Parcela ${n} enviada para revisão`,
  reenviou: (n) => `Parcela ${n} reenviada para aprovação`,
  desaprovou: (n) => `Parcela ${n} desaprovada`,
  reprogramou: (n) => `Parcela ${n} reprogramada`,
  pagou_fora_da_janela: (n) => `Parcela ${n} paga fora da data autorizada`,
  alterou: (n) => `Parcela ${n} alterada`,
};

/**
 * Tipo de destaque da trilha para cada tipo de evento. `alterou` e
 * `pagou_fora_da_janela` são as duas exceções de dinheiro: usam "edicao", o
 * mesmo destaque de `reenviou`/`reprogramou`, porque o componente Trilha não
 * tem uma cor própria para exceção — o texto do título já diz o que houve.
 */
const TIPO_TRILHA: Record<TipoParcelaEvento, TipoEventoTrilha> = {
  aprovou: "aprovacao",
  revisou: "rejeicao",
  reenviou: "edicao",
  desaprovou: "desaprovacao",
  reprogramou: "edicao",
  pagou_fora_da_janela: "edicao",
  alterou: "edicao",
};

/**
 * Converte um evento de `parcela_eventos` num `EventoTrilha` do componente
 * canônico. A descrição junta motivo, mudança de data e mudança de valor (só
 * o que existir no evento), sempre pelos formatadores do sistema.
 */
export function eventoParcelaParaTrilha(
  evento: ParcelaEvento,
  numeroParcela: number,
): EventoTrilha {
  const partes: string[] = [];
  if (evento.motivo) partes.push(evento.motivo);
  if (evento.dataDe && evento.dataPara) {
    partes.push(`de ${formatarData(evento.dataDe)} para ${formatarData(evento.dataPara)}`);
  }
  if (evento.valorDe !== null && evento.valorPara !== null) {
    partes.push(`de ${formatarBRL(evento.valorDe)} para ${formatarBRL(evento.valorPara)}`);
  }

  return {
    id: evento.id,
    data: evento.criadoEm,
    titulo: TITULO_TIPO_EVENTO[evento.tipo](numeroParcela),
    descricao: partes.length > 0 ? partes.join(" · ") : undefined,
    usuario: evento.usuarioNome ?? undefined,
    tipo: TIPO_TRILHA[evento.tipo],
  };
}
