import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { lerParametrosLista } from "@/modules/compras/_shared/lista";
import { RecebimentosTabela } from "@/modules/compras/recebimentos/components/recebimentos-tabela";
import {
  listarOrdensReceptiveis,
  listarRecebimentos,
} from "@/modules/compras/recebimentos/queries";

export default async function PaginaRecebimentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.recebimentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.recebimentos", "criar");

  const params = await searchParams;
  const { pagina, tamanho, busca } = lerParametrosLista(params);

  const [{ itens, total }, ordens] = await Promise.all([
    listarRecebimentos({ pagina, tamanho, busca }),
    podeCriar ? listarOrdensReceptiveis() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        titulo="Recebimentos"
        descricao="Registre o recebimento de uma ordem de compra conferindo a nota fiscal e as quantidades"
      />
      <RecebimentosTabela
        recebimentos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        busca={busca ?? ""}
        ordens={ordens}
        podeCriar={podeCriar}
      />
    </>
  );
}
