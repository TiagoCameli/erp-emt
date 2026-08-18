"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Barra que aparece acima da tabela quando há linha marcada.
 *
 * Só o invólucro: quantas linhas, um resumo opcional, o slot de ações e o
 * "limpar seleção". As ações são de quem chama, porque definir conta em lote e
 * imprimir espelho não têm nada em comum além de acontecerem sobre a seleção.
 *
 * Com zero marcado, não renderiza nada: barra vazia ocupando linha acima de
 * tabela densa é ruído, e foi assim que a de lançamentos sempre se comportou.
 */
export function BarraSelecao({
  quantidade,
  onLimpar,
  resumo,
  children,
  limparDesabilitado = false,
}: {
  quantidade: number;
  onLimpar: () => void;
  /** Ex.: o valor somado dos marcados. */
  resumo?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Desabilita "Limpar seleção" enquanto a ação da barra está em voo. Limpar
   * a seleção no meio de uma ação em andamento deixa o lote sem as linhas que
   * ele está gravando — quem chama sabe quando isso está acontecendo, a barra
   * não.
   */
  limparDesabilitado?: boolean;
}) {
  if (quantidade === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-[13px] font-medium">
        {quantidade === 1 ? "1 selecionado" : `${quantidade} selecionados`}
      </span>
      {resumo ? (
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {resumo}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLimpar}
          disabled={limparDesabilitado}
        >
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
