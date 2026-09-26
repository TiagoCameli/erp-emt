"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

/**
 * Tema do app (claro, escuro ou o do sistema), via next-themes.
 *
 * `attribute="class"` porque o CSS escuro mora em `.dark` no `globals.css` e a
 * variante `dark:` do Tailwind procura essa classe. O padrão é `system`: quem
 * nunca escolheu fica com o que o celular ou o computador já usa.
 *
 * `disableTransitionOnChange` porque trocar o tema com as transições de cor
 * ligadas faz cada botão e cada borda "escorregar" para a cor nova num tempo
 * diferente, e a tela passa meio segundo parecendo quebrada.
 *
 * Documento (espelho, holerite, recibo) não depende daqui: ele fica claro pela
 * classe `.tema-claro`, qualquer que seja a escolha.
 */
export function ProvedorTema({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
