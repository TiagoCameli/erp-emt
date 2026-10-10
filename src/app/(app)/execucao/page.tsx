import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A rota do módulo cai na primeira aba que a pessoa vê (o Painel, para quem o enxerga). */
export default async function ExecucaoPagina() {
  const usuario = await getUsuarioLogado();
  const primeira = abasVisiveis(usuario, "execucao")[0];
  if (!primeira) notFound();
  redirect(primeira.rota);
}
