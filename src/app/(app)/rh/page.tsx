import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A rota do módulo cai na primeira aba que este usuário pode ver. */
export default async function RhPage() {
  const usuario = await getUsuarioLogado();

  const primeiraAba = abasVisiveis(usuario, "rh")[0];
  if (!primeiraAba) notFound();

  redirect(primeiraAba.rota);
}
