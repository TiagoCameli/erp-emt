"use client";

import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Boundary de erro do grupo `(espelho)`, compartilhado por lançamento, OC e
 * pagamento. Sem AppShell de propósito, igual ao layout do grupo: a página
 * inteira é o documento (ver comentário de EspelhoImpresso), então o erro
 * também não pode vir com sidebar nem submenu.
 *
 * `buscarLancamentosParaEspelho` (e as leituras irmãs de OC/pagamento) lançam
 * com a mensagem do próprio banco embutida de propósito (ver espelho.ts): sem
 * este boundary, essa mensagem morria só no log e quem tentava imprimir via
 * a tela genérica do Next, sem pista nenhuma do que houve.
 */
export default function ErroEspelho({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erp-emt] erro ao gerar espelho", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-[190mm] flex-col items-center gap-3 px-6 py-16 text-center">
      <AlertTriangle
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="text-corpo font-medium text-foreground">
        Não foi possível gerar o espelho
      </p>
      <p className="max-w-md text-detalhe text-muted-foreground">
        Tente de novo. Se persistir, avise o administrador
        {error.digest ? ` informando o código ${error.digest}` : ""}.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Tentar de novo
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar ao início
          </Link>
        </Button>
      </div>
    </div>
  );
}
