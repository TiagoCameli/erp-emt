import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type ModuloNavegacao } from "@/components/canonicos";
import { MODULOS, recursosDoModulo, type RecursoId } from "@/config/recursos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { sair } from "@/modules/auth/actions";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario) redirect("/login");

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
