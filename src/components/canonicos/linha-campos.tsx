"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Coloca campos lado a lado num grid responsivo: 1 coluna no celular, 2 (ou 3)
 * no desktop. Campos longos ficam FORA dela (largura total do form); campos
 * curtos que andam juntos entram dentro.
 */
export function LinhaCampos({
  colunas = 2,
  children,
  className,
}: {
  colunas?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        colunas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
