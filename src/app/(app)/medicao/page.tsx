import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A Fase 1 não tem painel: a rota do módulo cai na primeira aba que a pessoa vê. */
export default async function MedicaoPagina() {
  const usuario = await getUsuarioLogado();
  const primeira = abasVisiveis(usuario, "medicao")[0];
  if (!primeira) notFound();
  redirect(primeira.rota);
}
