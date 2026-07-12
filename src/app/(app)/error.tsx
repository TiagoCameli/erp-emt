"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Boundary de erro de todas as telas do app: mensagem amigável no lugar
 * da tela crua do Next, com o digest pro usuário reportar.
 */
export default function ErroApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erp-emt] erro de tela", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-corpo font-medium text-foreground">
        Algo deu errado ao carregar esta tela
      </p>
      <p className="max-w-md text-detalhe text-muted-foreground">
        Tente de novo. Se persistir, avise o administrador
        {error.digest ? ` informando o código ${error.digest}` : ""}.
      </p>
      <Button variant="outline" size="sm" onClick={reset}>
        <RotateCcw className="size-4" aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  );
}
