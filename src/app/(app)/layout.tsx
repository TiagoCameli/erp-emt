import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type ModuloNavegacao } from "@/components/canonicos";
import { abasVisiveis, getUsuarioLogado, modulosVisiveis } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { sair } from "@/modules/auth/actions";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await getUsuarioLogado();

  if (!usuario) {
    // Sessão válida com usuário desativado (ou sem cadastro) iria
    // em loop /login <-> /: o middleware devolve quem tem sessão.
    // Conta desativada tem página própria, fora desse ciclo.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/conta-desativada");
    redirect("/login");
  }

  // Senha temporária (fallback de convite sem email): força a troca
  // antes de qualquer outra tela.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.user_metadata?.senha_temporaria === true) {
    redirect("/definir-senha");
  }

  // As abas de cada módulo alimentam o submenu da sidebar. Vêm do mesmo
  // catálogo (RECURSOS) e do mesmo filtro de permissão que as abas
  // horizontais dentro do módulo, então os dois nunca divergem.
  const modulos: ModuloNavegacao[] = modulosVisiveis(usuario).map((modulo) => ({
    id: modulo.id,
    nome: modulo.nome,
    rota: modulo.rota,
    icone: modulo.id,
    abas: abasVisiveis(usuario, modulo.id).map((aba) => ({
      id: aba.id,
      nome: aba.nome,
      rota: aba.rota,
    })),
  }));

  return (
    <AppShell
      usuario={{ nome: usuario.nome, email: usuario.email }}
      modulos={modulos}
      onSair={sair}
    >
      {children}
    </AppShell>
  );
}
