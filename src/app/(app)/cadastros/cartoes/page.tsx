import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CartoesTabela } from "@/modules/cadastros/cartoes/components/cartoes-tabela";
import { listarCartoes } from "@/modules/cadastros/cartoes/queries";

export default async function PaginaCartoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.cartoes", "ver")) {
    notFound();
  }

  const cartoes = await listarCartoes();

  const podeCriar = temPermissao(usuario, "cadastros.cartoes", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.cartoes", "editar");

  return (
    <>
      <PageHeader
        modulo="Cadastros"
        titulo="Cartões de crédito"
        descricao="Os cartões da empresa. Toda compra paga no crédito diz por qual deles saiu, e é o final de quatro dígitos que casa com a fatura"
      />
      <CartoesTabela
        cartoes={cartoes}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
