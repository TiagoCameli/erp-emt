import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A rota do módulo cai na primeira aba que a pessoa vê (a Posição, para quem a enxerga). */
export default async function EstoquePagina() {
  const usuario = await getUsuarioLogado();
  const primeira = abasVisiveis(usuario, "estoque")[0];
  if (!primeira) notFound();
  redirect(primeira.rota);
}
