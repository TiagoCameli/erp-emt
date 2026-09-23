"use client";

import { EstadoErro, PageHeader } from "@/components/canonicos";

export default function ErroServicos({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Caderno de serviços"
        descricao="Ordens de serviço dos equipamentos: peças, óleos e terceiros, com o custo de cada OS"
      />
      <EstadoErro titulo="Não foi possível carregar as ordens de serviço" onTentarDeNovo={reset} />
    </>
  );
}
