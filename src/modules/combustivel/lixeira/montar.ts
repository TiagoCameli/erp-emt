import { formatarBRL } from "@/lib/formatadores";
import { formatarDataHoraRioBranco, formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import type { TipoLixeira } from "@/modules/combustivel/lixeira/permissoes";

/**
 * Os itens da Lixeira do Combustível, no resumo da LixeiraTab da origem: uma linha com
 * litros e valor, outra com data e o contexto (consumidor, obra, tanque, fornecedor, NF),
 * e "Excluído por X em Y". Módulo puro: a query monta, o teste confere.
 */

export interface ItemLixeira {
  tipo: TipoLixeira;
  id: string;
  titulo: string;
  subtitulo: string;
  /** O motivo digitado na exclusão (o ERP exige; a origem não tinha). */
  motivo: string | null;
  excluidoEm: string | null;
  /** Nome de quem excluiu; null quando não se sabe. */
  excluidoPor: string | null;
}

function juntar(...partes: (string | null | undefined | false)[]): string {
  return partes.filter(Boolean).join(" · ");
}

export function montarItemSaida(s: {
  id: string;
  data: string;
  litros: number;
  valorTotal: number;
  consumidor: string | null;
  obra: string | null;
  tanque: string | null;
  motivo: string | null;
  excluidoEm: string | null;
  excluidoPor: string | null;
}): ItemLixeira {
  return {
    tipo: "saida",
    id: s.id,
    titulo: juntar(formatarLitros(s.litros), formatarBRL(s.valorTotal)),
    subtitulo: juntar(formatarDataHoraRioBranco(s.data), s.consumidor, s.obra, s.tanque),
    motivo: s.motivo,
    excluidoEm: s.excluidoEm,
    excluidoPor: s.excluidoPor,
  };
}

export function montarItemEntrada(e: {
  id: string;
  dataHora: string;
  litros: number;
  valorTotal: number;
  fornecedor: string | null;
  tanque: string | null;
  notaFiscal: string | null;
  motivo: string | null;
  excluidoEm: string | null;
  excluidoPor: string | null;
}): ItemLixeira {
  return {
    tipo: "entrada",
    id: e.id,
    titulo: juntar(formatarLitros(e.litros), formatarBRL(e.valorTotal)),
    subtitulo: juntar(
      formatarDataHoraRioBranco(e.dataHora),
      e.fornecedor,
      e.tanque ?? "—",
      e.notaFiscal?.trim() ? `NF ${e.notaFiscal.trim()}` : null,
    ),
    motivo: e.motivo,
    excluidoEm: e.excluidoEm,
    excluidoPor: e.excluidoPor,
  };
}

export function montarItemTransferencia(t: {
  id: string;
  dataHora: string;
  litros: number;
  tanqueOrigem: string | null;
  tanqueDestino: string | null;
  motivo: string | null;
  excluidoEm: string | null;
  excluidoPor: string | null;
}): ItemLixeira {
  return {
    tipo: "transferencia",
    id: t.id,
    titulo: formatarLitros(t.litros),
    subtitulo: juntar(formatarDataHoraRioBranco(t.dataHora), `${t.tanqueOrigem ?? "?"} → ${t.tanqueDestino ?? "?"}`),
    motivo: t.motivo,
    excluidoEm: t.excluidoEm,
    excluidoPor: t.excluidoPor,
  };
}

export function montarItemEsvaziamento(e: {
  id: string;
  dataHora: string;
  litros: number;
  valorPerda: number;
  tanque: string | null;
  motivoEsvaziamento: string;
  motivo: string | null;
  excluidoEm: string | null;
  excluidoPor: string | null;
}): ItemLixeira {
  return {
    tipo: "esvaziamento",
    id: e.id,
    titulo: juntar(formatarLitros(e.litros), e.valorPerda > 0 ? `perda ${formatarBRL(e.valorPerda)}` : null),
    subtitulo: juntar(formatarDataHoraRioBranco(e.dataHora), e.tanque, e.motivoEsvaziamento),
    motivo: e.motivo,
    excluidoEm: e.excluidoEm,
    excluidoPor: e.excluidoPor,
  };
}

/** "Excluído por Fulano em 23/09/2026 07:05" (a linha de auditoria da origem). */
export function textoExclusao(item: Pick<ItemLixeira, "excluidoPor" | "excluidoEm">): string {
  const quando = item.excluidoEm ? formatarDataHoraRioBranco(item.excluidoEm) : "—";
  return `Excluído por ${item.excluidoPor ?? "—"} em ${quando}`;
}
