import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ObrasAcoesCabecalho } from "@/modules/cadastros/obras/components/obras-acoes-cabecalho";
import { ObrasTabela } from "@/modules/cadastros/obras/components/obras-tabela";
import { listarClientes, listarObras } from "@/modules/cadastros/obras/queries";

export default async function PaginaObras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.obras", "ver")) {
    notFound();
  }

  const [obras, clientes] = await Promise.all([
    listarObras(),
    listarClientes(),
  ]);

  const podeCriar = temPermissao(usuario, "cadastros.obras", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.obras", "editar");

  return (
    <>
      <PageHeader
        titulo="Obras"
        descricao="Contratos de obra. Cada obra gera o centro de custo raiz dela"
        acoes={<ObrasAcoesCabecalho clientes={clientes} podeCriar={podeCriar} />}
      />
      <ObrasTabela obras={obras} clientes={clientes} podeEditar={podeEditar} />
    </>
  );
}
