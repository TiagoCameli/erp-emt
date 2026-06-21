import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { TabNavAtivo } from "@/components/canonicos/tab-nav-client";
import { recursosDoModulo, type RecursoId } from "@/config/recursos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";

export default async function GestaoLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await getUsuarioLogado();

  const abasVisiveis = recursosDoModulo("gestao").filter((recurso) =>
    temPermissao(usuario, recurso.id as RecursoId, "ver"),
  );
  if (abasVisiveis.length === 0) notFound();

  return (
    <>
      <TabNavAtivo recursos={abasVisiveis} />
      <div className="mt-4">{children}</div>
    </>
  );
}
