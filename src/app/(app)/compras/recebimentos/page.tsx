import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { RecebimentosTabela } from "@/modules/compras/recebimentos/components/recebimentos-tabela";
import {
  listarOrdensReceptiveis,
  listarRecebimentos,
} from "@/modules/compras/recebimentos/queries";

export default async function PaginaRecebimentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.recebimentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.recebimentos", "criar");

  const [recebimentos, ordens] = await Promise.all([
    listarRecebimentos(),
    podeCriar ? listarOrdensReceptiveis() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        titulo="Recebimentos"
        descricao="Registre o recebimento de uma ordem de compra conferindo a nota fiscal e as quantidades"
      />
      <RecebimentosTabela
        recebimentos={recebimentos}
        ordens={ordens}
        podeCriar={podeCriar}
      />
    </>
  );
}
