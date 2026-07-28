import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A rota do módulo cai na primeira aba que este usuário pode ver. */
export default async function AdministracaoPage() {
  const usuario = await getUsuarioLogado();

  const primeiraAba = abasVisiveis(usuario, "administracao")[0];
  if (!primeiraAba) notFound();

  redirect(primeiraAba.rota);
}
