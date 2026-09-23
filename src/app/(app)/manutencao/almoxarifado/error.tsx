"use client";

import { EstadoErro, PageHeader } from "@/components/canonicos";

export default function ErroAlmoxarifado({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader modulo="Manutenção" titulo="Almoxarifado de peças" />
      <EstadoErro titulo="Não foi possível carregar o almoxarifado" onTentarDeNovo={reset} />
    </>
  );
}
