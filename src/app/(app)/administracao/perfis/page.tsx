import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  buscarPermissoesPerfil,
  listarPerfis,
  type PermissaoPerfil,
} from "@/modules/administracao/perfis/queries";
import { PerfisTab } from "@/modules/administracao/perfis/components/perfis-tab";

export const metadata = {
  title: "Perfis",
};

export default async function PaginaPerfis() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "administracao.perfis", "ver")) {
    notFound();
  }

  const perfis = await listarPerfis();

  const pares = await Promise.all(
    perfis.map(
      async (perfil): Promise<[string, PermissaoPerfil[]]> => [
        perfil.id,
        await buscarPermissoesPerfil(perfil.id),
      ],
    ),
  );
  const permissoesPorPerfil = Object.fromEntries(pares);

  return (
    <PerfisTab
      perfis={perfis}
      permissoesPorPerfil={permissoesPorPerfil}
      podeCriar={temPermissao(usuario, "administracao.perfis", "criar")}
      podeEditar={temPermissao(usuario, "administracao.perfis", "editar")}
      podeExcluir={temPermissao(usuario, "administracao.perfis", "excluir")}
    />
  );
}
