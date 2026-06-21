import { notFound, redirect } from "next/navigation";

import { recursosDoModulo, type RecursoId } from "@/config/recursos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

export default async function GestaoPage() {
  const usuario = await getUsuarioLogado();

  const abasVisiveis = recursosDoModulo("gestao").filter((recurso) =>
    temPermissao(usuario, recurso.id as RecursoId, "ver"),
  );

  const primeiraAba = abasVisiveis[0];
  if (!primeiraAba) notFound();

  redirect(primeiraAba.rota);
}
