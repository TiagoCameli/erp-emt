import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";
import { ClientesNovoBotao } from "@/modules/cadastros/clientes/components/clientes-novo-botao";
import { ClientesTabela } from "@/modules/cadastros/clientes/components/clientes-tabela";
import { validarImport, importar } from "@/modules/cadastros/clientes/actions";
import { listar } from "@/modules/cadastros/clientes/queries";

export default async function PaginaClientes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.clientes", "ver")) {
    notFound();
  }

  const clientes = await listar();

  const podeCriar = temPermissao(usuario, "cadastros.clientes", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.clientes", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.clientes", "excluir");

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Órgãos e empresas que contratam as obras"
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar clientes"
                modeloHref="/cadastros/clientes/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
              <ClientesNovoBotao />
            </>
          ) : undefined
        }
      />
      <ClientesTabela
        clientes={clientes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
