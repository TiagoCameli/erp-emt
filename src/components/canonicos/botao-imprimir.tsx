"use client";

import { Printer } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

/**
 * Dispara a impressão ao abrir, e fica na tela para reimprimir.
 *
 * Dois quadros de espera: o primeiro monta, o segundo deixa fonte e layout
 * assentarem. Sem isso o Chrome mede a página antes do webfont e a última
 * linha cai para uma folha a mais.
 *
 * SEM ref de "já disparou": o modo estrito do React roda
 * montagem -> desmontagem -> montagem no mount, e o cleanup da PRIMEIRA
 * montagem cancela o `requestAnimationFrame` dela antes de ele disparar. Sobra
 * só o rAF da SEGUNDA montagem, que dispara uma vez — esse é o padrão correto
 * sob StrictMode. Uma ref travando "já disparei" fazia o efeito da segunda
 * montagem abortar por causa da primeira, e `window.print()` nunca saía (era
 * exatamente o bug que existia aqui).
 */
export function BotaoImprimir({ auto = true }: { auto?: boolean }) {
  React.useEffect(() => {
    if (!auto) return;
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
