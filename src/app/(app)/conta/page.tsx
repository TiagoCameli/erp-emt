import { redirect } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado } from "@/lib/permissoes";
import { AlterarSenhaForm } from "@/modules/auth/components/alterar-senha-form";

/** Minha conta: dados de acesso do próprio usuário e troca de senha. */
export default async function PaginaConta() {
  const usuario = await getUsuarioLogado();
  if (!usuario) redirect("/login");

  return (
    <>
      <PageHeader titulo="Minha conta" descricao="Seus dados de acesso" />
      <div className="flex max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-detalhe text-muted-foreground">Nome</span>
          <span className="text-corpo font-medium">{usuario.nome}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-detalhe text-muted-foreground">Email</span>
          <span className="text-corpo font-medium">{usuario.email}</span>
        </div>
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
