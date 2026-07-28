"use client";

import { EstadoErro, PageHeader } from "@/components/canonicos";

export default function ErroOrdens({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        titulo="Ordens de compra"
        descricao="Emita a OC, envie para aprovação e gere o lançamento financeiro previsto"
      />
      <EstadoErro
        titulo="Não foi possível carregar as ordens de compra"
        onTentarDeNovo={reset}
      />
    </>
  );
}
