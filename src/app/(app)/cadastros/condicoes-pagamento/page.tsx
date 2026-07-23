import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CondicoesTabela } from "@/modules/cadastros/condicoes-pagamento/components/condicoes-tabela";
import { listarCondicoes } from "@/modules/cadastros/condicoes-pagamento/queries";

export default async function PaginaCondicoesPagamento() {
  const usuario = await getUsuarioLogado();
  if (
    !usuario ||
    !temPermissao(usuario, "cadastros.condicoes-pagamento", "ver")
  ) {
    notFound();
  }

  const condicoes = await listarCondicoes();

  const podeCriar = temPermissao(
    usuario,
    "cadastros.condicoes-pagamento",
    "criar",
  );
  const podeEditar = temPermissao(
    usuario,
    "cadastros.condicoes-pagamento",
    "editar",
  );

  return (
    <>
      <PageHeader
        titulo="Condições de pagamento"
        descricao="Prazos e parcelamento usados em cotações e ordens de compra"
      />
      <CondicoesTabela
        condicoes={condicoes}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
