import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PilhasAcoesCabecalho } from "@/modules/estoque/pilhas/components/pilhas-acoes-cabecalho";
import { PilhasTabela } from "@/modules/estoque/pilhas/components/pilhas-tabela";
import { listarPilhas } from "@/modules/estoque/pilhas/queries";

const RECURSO = "estoque.pilhas" as const;

/**
 * Pilhas de agregado (areia, brita). A entrada e a saída são as do Estoque, como no tanque
 * de material; quando a pilha zera, o banco a deixa inativa.
 */
export default async function PaginaPilhasEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const pilhas = await listarPilhas();

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Pilhas"
        descricao="Pilhas de agregado. A entrada e a saída são feitas nas abas Entradas e Saídas; a pilha que zera fica inativa"
        acoes={<PilhasAcoesCabecalho podeCriar={temPermissao(usuario, RECURSO, "criar")} />}
      />
      <PilhasTabela
        pilhas={pilhas}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeExcluir={temPermissao(usuario, RECURSO, "excluir")}
      />
    </>
  );
}
