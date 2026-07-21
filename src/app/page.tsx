import { redirect } from "next/navigation";

import { getUsuarioLogado, rotaInicial } from "@/lib/permissoes";

export default async function Home() {
  const usuario = await getUsuarioLogado();
  if (!usuario) redirect("/login");
  redirect(rotaInicial(usuario) ?? "/sem-acesso");
}
