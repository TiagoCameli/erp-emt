import { redirect } from "next/navigation";

import { PageHeader, SecaoFormulario } from "@/components/canonicos";
import { urlAssinadaDaFoto } from "@/lib/foto-perfil";
import { getUsuarioLogado } from "@/lib/permissoes";
import { AlterarSenhaForm } from "@/modules/auth/components/alterar-senha-form";
import { FotoForm } from "@/modules/conta/components/foto-form";
import { PerfilForm } from "@/modules/conta/components/perfil-form";
import { buscarMeuPerfil } from "@/modules/conta/queries";

/**
 * Minha conta: os dados do próprio usuário e a troca de senha.
 *
 * SEM CHECAGEM DE PERMISSÃO, de propósito: esta tela é de todo mundo que entra
 * no sistema e não é uma aba de `config/recursos.ts`. Exigir um recurso aqui
 * deixaria quem não é Admin sem poder preencher o próprio celular.
 *
 * O que substitui a permissão é o ESCOPO: a leitura sai de `auth.getUser()` e a
 * gravação de `auth.uid()`, e nenhuma das duas aceita id de usuário. A policy de
 * SELECT de `usuarios` já libera a própria linha para qualquer usuário.
 *
 * Nome e email ficam em LEITURA. Nome é do Admin (aba Usuários); email é a
 * credencial de login, e trocar mexe na autenticação, não no perfil.
 */
export default async function PaginaConta() {
  const usuario = await getUsuarioLogado();
  if (!usuario) redirect("/login");

  const perfil = await buscarMeuPerfil();
  // Sessão válida sem linha em `usuarios` é conta removida. O layout já desvia
  // essa pessoa para /conta-desativada antes de chegar aqui; o redirect existe
  // para não renderizar meia tela se a ordem mudar algum dia.
  if (!perfil) redirect("/conta-desativada");

  // Assina só quando existe foto: o bucket é privado, o caminho da coluna não
  // serve como `src`, e quem não tem foto não precisa de uma ida ao Storage.
  const fotoUrl = perfil.fotoPath
    ? await urlAssinadaDaFoto(perfil.fotoPath)
    : null;

  return (
    <>
      <PageHeader
        titulo="Minha conta"
        descricao="Seus dados e a sua senha. Só você edita o que está aqui."
      />

      <div className="flex max-w-3xl flex-col gap-8">
        <SecaoFormulario titulo="Acesso">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-detalhe text-muted-foreground">Nome</span>
              <span className="text-corpo font-medium">{perfil.nome}</span>
              <span className="text-legenda text-muted-foreground">
                Quem altera é a Administração, na aba Usuários.
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-detalhe text-muted-foreground">Email</span>
              <span className="text-corpo font-medium">{perfil.email}</span>
              <span className="text-legenda text-muted-foreground">
                É com ele que você entra no sistema.
              </span>
            </div>
          </div>
        </SecaoFormulario>

        <FotoForm nome={perfil.nome} fotoUrl={fotoUrl} />

        <PerfilForm perfil={perfil} />

        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <span className="text-corpo font-medium">Alterar senha</span>
          <span className="text-detalhe text-muted-foreground">
            Troca a sua senha na hora, sem precisar de ninguém.
          </span>
          <AlterarSenhaForm />
        </div>
      </div>
    </>
  );
}
