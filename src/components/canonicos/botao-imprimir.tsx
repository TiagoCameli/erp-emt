"use client";

import { Printer } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Dispara a impressão ao abrir, e fica na tela para reimprimir.
 *
 * Dois quadros de espera: o primeiro monta, o segundo deixa fonte e layout
 * assentarem. Sem isso o Chrome mede a página antes do webfont e a última
 * linha cai para uma folha a mais. O `ref` guarda contra o efeito rodar duas
 * vezes no modo estrito do React, que abriria dois diálogos de impressão.
 */
export function BotaoImprimir({ auto = true }: { auto?: boolean }) {
  const jaDisparou = React.useRef(false);

  React.useEffect(() => {
    if (!auto || jaDisparou.current) return;
    jaDisparou.current = true;
    let interno = 0;
    const externo = requestAnimationFrame(() => {
      interno = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(externo);
      cancelAnimationFrame(interno);
    };
  }, [auto]);

  return (
    <div className="nao-imprime mx-auto flex max-w-[190mm] justify-end px-6 pt-6">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer />
        Imprimir
      </Button>
    </div>
  );
}
