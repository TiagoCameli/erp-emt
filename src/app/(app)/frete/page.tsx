import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { recursosDoModulo, type RecursoId } from "@/config/recursos";
import { abasVisiveis, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { podeConfigurarCards } from "@/modules/frete/painel/calculo";
import { PainelFrete } from "@/modules/frete/painel/components/painel-frete";
import { carregarPainelFrete } from "@/modules/frete/painel/queries";

/** O painel lê todos os fretes, pedidos, pagamentos e saídas de carreta, página por página. */
export const maxDuration = 60;

/**
 * Painel do Frete: o Dashboard da origem. Sem permissão de vê-lo, a rota do módulo cai
 * na primeira aba que a pessoa pode ver (mesmo padrão do Combustível).
 */
export default async function PainelFretePagina() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "frete.painel", "ver")) {
    const primeiraAba = abasVisiveis(usuario, "frete").find((aba) => aba.rota !== "/frete");
    if (!primeiraAba) notFound();
    redirect(primeiraAba.rota);
  }

  // A RLS de combustivel_saidas abre para quem vê o Combustível ou a conta corrente do Frete.
  const veAbastecimentos =
    temPermissao(usuario, "frete.conta-corrente", "ver") ||
    recursosDoModulo("combustivel").some((r) => temPermissao(usuario, r.id as RecursoId, "ver"));
  const veContaCorrente = temPermissao(usuario, "frete.conta-corrente", "ver");

  const { dados, opcoesCards } = await carregarPainelFrete(veAbastecimentos);

  return (
    <>
      <PageHeader modulo="Frete" titulo="Painel" descricao="Fretes, pagamentos, saldos das transportadoras e saldo na pedreira" />
      <PainelFrete
        dados={dados}
        opcoesCards={opcoesCards}
        podeConfigurarCards={podeConfigurarCards((recurso, acao) => temPermissao(usuario, recurso, acao))}
        veAbastecimentos={veAbastecimentos}
        hrefContaCorrente={veContaCorrente ? "/frete/conta-corrente" : undefined}
      />
    </>
  );
}
