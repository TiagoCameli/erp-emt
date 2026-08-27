import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type ModuloNavegacao } from "@/components/canonicos";
import { urlAssinadaDaFoto } from "@/lib/foto-perfil";
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

  // A URL da foto é assinada AQUI, no servidor, e só quando existe foto: o
  // AppShell é componente de cliente e não pode falar com o Storage, e o
  // caminho da coluna não serve como src (o bucket é privado). O `if` evita uma
  // ida ao Storage em toda página de quem não tem foto, que hoje é quase todo
  // mundo. Se a assinatura falhar, `urlAssinadaDaFoto` devolve null e o avatar
  // cai nas iniciais — o layout não pode quebrar por causa de um avatar.
  const fotoUrl = usuario.fotoPath
    ? await urlAssinadaDaFoto(usuario.fotoPath)
    : null;

  return (
    <AppShell
      usuario={{ nome: usuario.nome, email: usuario.email, fotoUrl }}
      modulos={modulos}
      onSair={sair}
    >
      {children}
    </AppShell>
  );
}
