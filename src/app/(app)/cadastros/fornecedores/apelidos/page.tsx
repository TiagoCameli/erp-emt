import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarApelidos } from "@/modules/cadastros/fornecedores/apelidos";
import { ApelidosCliente } from "@/modules/cadastros/fornecedores/components/apelidos-cliente";
import { listar } from "@/modules/cadastros/fornecedores/queries";

/** Apelidos bancários dos fornecedores (Bloco I da conciliação, 05/10/2026). */
export default async function PaginaApelidosBancarios() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.fornecedores", "ver")) {
    notFound();
  }

  const [apelidos, fornecedores] = await Promise.all([listarApelidos(), listar()]);

  return (
    <>
      <PageHeader
        modulo="Cadastros"
        titulo="Apelidos bancários"
        descricao="O nome que o banco escreve no extrato para cada fornecedor"
      />
      <ApelidosCliente
        apelidos={apelidos}
        fornecedores={fornecedores
          .filter((f) => f.ativo)
          .map((f) => ({ id: f.id, nome: f.nomeFantasia ?? f.razaoSocial }))}
        podeEditar={temPermissao(usuario, "cadastros.fornecedores", "editar")}
      />
    </>
  );
}
