"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Agrupa um bloco do formulário com título e ação opcional à direita. O título
 * leva a Faixa âmbar de 3px à esquerda (assinatura do design system EMT).
 */
export function SecaoFormulario({
  titulo,
  acao,
  children,
  className,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="border-l-[3px] border-primary pl-2 text-detalhe font-semibold">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}
