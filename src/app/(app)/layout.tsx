import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type ModuloNavegacao } from "@/components/canonicos";
import { MODULOS, recursosDoModulo, type RecursoId } from "@/config/recursos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
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

  const modulosVisiveis: ModuloNavegacao[] = MODULOS.filter((modulo) =>
    recursosDoModulo(modulo.id).some((recurso) =>
      temPermissao(usuario, recurso.id as RecursoId, "ver"),
    ),
  ).map((modulo) => ({
    id: modulo.id,
    nome: modulo.nome,
    rota: modulo.rota,
    icone: modulo.id,
  }));

  return (
    <AppShell
      usuario={{ nome: usuario.nome, email: usuario.email }}
      modulos={modulosVisiveis}
      onSair={sair}
    >
      {children}
    </AppShell>
  );
}
