"use client";

import { EstadoErro, PageHeader } from "@/components/canonicos";

export default function ErroCotacoes({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        titulo="Cotações"
        descricao="Compare preços de fornecedores e escolha o vencedor"
      />
      <EstadoErro
        titulo="Não foi possível carregar as cotações"
        onTentarDeNovo={reset}
      />
    </>
  );
}
