import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ConfiguracoesForm } from "@/modules/administracao/configuracoes/components/configuracoes-form";
import { listarConfiguracoes } from "@/modules/administracao/configuracoes/queries";

export default async function ConfiguracoesPage() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "administracao.configuracoes", "ver")) {
    notFound();
  }

  const configuracoes = await listarConfiguracoes();

  return (
    <div>
      <PageHeader
        titulo="Configurações"
        descricao="Parâmetros gerais que afetam as regras do sistema"
      />
      <ConfiguracoesForm
        configuracoes={configuracoes}
        podeEditar={temPermissao(
          usuario,
          "administracao.configuracoes",
          "editar",
        )}
      />
    </div>
  );
}
