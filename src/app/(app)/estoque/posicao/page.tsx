import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PosicaoTabela } from "@/modules/estoque/components/posicao-tabela";
import { listarPosicao } from "@/modules/estoque/queries";

export default async function PaginaPosicaoEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.posicao", "ver")) {
    notFound();
  }

  const linhas = await listarPosicao();

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Posição do estoque"
        descricao="Materiais, combustível e peças por local. Combustível e peças entram e saem pelos módulos deles"
      />
      <PosicaoTabela linhas={linhas} />
    </>
  );
}
