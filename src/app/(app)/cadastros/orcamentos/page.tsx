import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { OrcamentosTabela } from "@/modules/cadastros/orcamentos/components/orcamentos-tabela";
import { listarOrcamentos } from "@/modules/cadastros/orcamentos/queries";

export default async function PaginaOrcamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.orcamentos", "ver")) {
    notFound();
  }

  const orcamentos = await listarOrcamentos();
  const podeExcluir = temPermissao(usuario, "cadastros.orcamentos", "excluir");

  return (
    <>
      <PageHeader
        titulo="Orçamentos"
        descricao="Orçamentos por obra, com a estrutura analítica de etapas, subetapas e itens"
      />
      <OrcamentosTabela orcamentos={orcamentos} podeExcluir={podeExcluir} />
    </>
  );
}
