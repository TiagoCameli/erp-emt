import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FormasTabela } from "@/modules/cadastros/formas-pagamento/components/formas-tabela";
import { listarFormas } from "@/modules/cadastros/formas-pagamento/queries";

export default async function PaginaFormasPagamento() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.formas-pagamento", "ver")) {
    notFound();
  }

  const formas = await listarFormas();

  const podeCriar = temPermissao(usuario, "cadastros.formas-pagamento", "criar");
  const podeEditar = temPermissao(
    usuario,
    "cadastros.formas-pagamento",
    "editar",
  );

  return (
    <>
      <PageHeader
        titulo="Formas de pagamento"
        descricao="O tipo de cada forma decide o caminho do pagamento: bancário e cheque passam pela aprovação, dinheiro vai direto para Pagamentos e cartão de crédito nasce quitado"
      />
      <FormasTabela
        formas={formas}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
