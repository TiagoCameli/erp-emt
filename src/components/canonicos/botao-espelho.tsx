"use client";

import { Printer } from "lucide-react";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { MAX_ESPELHOS } from "@/lib/ids-do-espelho";

/**
 * Abre o espelho dos registros escolhidos.
 *
 * Aba nova de propósito: a listagem guarda filtro, página e ordenação, e
 * navegar para o espelho os perderia na volta.
 *
 * O limite é checado aqui E na página. Aqui para o usuário saber antes de
 * abrir aba; lá porque o link é colável e guarda que mora só no cliente não é
 * guarda.
 */
export function BotaoEspelho({
  rota,
  ids,
  rotulo = "Imprimir espelho",
}: {
  /** Ex.: "/espelho/lancamentos". */
  rota: string;
  ids: string[];
  rotulo?: string;
}) {
  function abrir() {
    if (ids.length === 0) return;
    if (ids.length > MAX_ESPELHOS) {
      toast.error(
        `Marque no máximo ${MAX_ESPELHOS} para imprimir de uma vez. Você marcou ${ids.length}.`,
      );
      return;
    }
    const url = `${rota}?ids=${encodeURIComponent(ids.join(","))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={ids.length === 0}
      onClick={abrir}
    >
      <Printer />
      {ids.length > 1 ? `${rotulo} (${ids.length})` : rotulo}
    </Button>
  );
}
