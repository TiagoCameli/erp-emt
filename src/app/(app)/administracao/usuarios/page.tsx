import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ConvidarUsuarioDrawer } from "@/modules/administracao/usuarios/components/convidar-usuario-drawer";
import { UsuariosTabela } from "@/modules/administracao/usuarios/components/usuarios-tabela";
import {
  listarPerfis,
  listarUsuarios,
} from "@/modules/administracao/usuarios/queries";

export default async function PaginaUsuarios() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "administracao.usuarios", "ver")) {
    notFound();
  }

  const [usuarios, perfis] = await Promise.all([
    listarUsuarios(),
    listarPerfis(),
  ]);

  const podeCriar = temPermissao(usuario, "administracao.usuarios", "criar");
  const podeEditar = temPermissao(usuario, "administracao.usuarios", "editar");

  return (
    <>
      <PageHeader
        titulo="Usuários e permissões"
        descricao="Quem acessa o sistema e o que cada um pode fazer"
        acoes={podeCriar ? <ConvidarUsuarioDrawer perfis={perfis} /> : undefined}
      />
      <UsuariosTabela
        usuarios={usuarios}
        perfis={perfis}
        podeEditar={podeEditar}
      />
    </>
  );
}
