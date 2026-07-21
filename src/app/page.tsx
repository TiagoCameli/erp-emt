import { redirect } from "next/navigation";

import { getUsuarioLogado, rotaInicial } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const usuario = await getUsuarioLogado();
  if (!usuario) {
    // Sessão válida com usuário desativado (ou sem cadastro) cairia em loop
    // /login <-> / (o middleware devolve quem tem sessão para /). Conta
    // desativada tem página própria, fora desse ciclo. Mesmo tratamento do
    // layout do grupo (app).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/conta-desativada");
    redirect("/login");
  }
  redirect(rotaInicial(usuario) ?? "/sem-acesso");
}
