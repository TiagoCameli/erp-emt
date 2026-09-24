import type { ReactNode } from "react";
import { Suspense } from "react";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CabecalhoCombustivel } from "@/modules/combustivel/_shared/components/cabecalho-combustivel";
import { GRUPOS_ABAS } from "@/modules/combustivel/_shared/navegacao";

/**
 * O topo comum do Combustível, como a tela única da origem: título, lançamentos, modo de
 * consumidor e as abas. Cada aba segue sendo uma rota com a própria checagem de permissão;
 * aqui só se esconde o que o usuário não pode abrir.
 */
export default async function LayoutCombustivel({ children }: { children: ReactNode }) {
  const usuario = await getUsuarioLogado();
  const grupos = GRUPOS_ABAS.map((grupo) => ({
    ...grupo,
    abas: grupo.abas.filter((aba) => temPermissao(usuario, aba.recurso, "ver")),
  })).filter((grupo) => grupo.abas.length > 0);

  return (
    <>
      {/* useSearchParams no cabeçalho: sem o Suspense, a rota inteira perde o prerender parcial. */}
      <Suspense fallback={<div className="mb-4 h-48" />}>
        <CabecalhoCombustivel
          grupos={grupos}
          podeNovaEntrada={temPermissao(usuario, "combustivel.entradas", "criar")}
          podeNovaSaida={temPermissao(usuario, "combustivel.saidas", "criar")}
          podeNovaTransferencia={temPermissao(usuario, "combustivel.transferencias", "criar")}
        />
      </Suspense>
      {children}
    </>
  );
}
