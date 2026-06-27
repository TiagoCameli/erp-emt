import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { OrcamentoArvore } from "@/modules/cadastros/orcamentos/components/orcamento-arvore";
import { obterOrcamento } from "@/modules/cadastros/orcamentos/queries";

export default async function PaginaOrcamentoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.orcamentos", "ver")) {
    notFound();
  }

  const orcamento = await obterOrcamento(id);
  if (!orcamento) notFound();

  return (
    <OrcamentoArvore
      cabecalho={orcamento.cabecalho}
      itens={orcamento.itens}
    />
  );
}
