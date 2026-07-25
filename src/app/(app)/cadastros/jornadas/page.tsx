import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { JornadasAcoesCabecalho } from "@/modules/cadastros/jornadas/components/jornadas-acoes-cabecalho";
import { JornadasLista } from "@/modules/cadastros/jornadas/components/jornadas-lista";
import { listarJornadas } from "@/modules/cadastros/jornadas/queries";

export default async function PaginaJornadas() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.jornadas", "ver")) {
    notFound();
  }

  const jornadas = await listarJornadas();

  const podeCriar = temPermissao(usuario, "cadastros.jornadas", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.jornadas", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.jornadas", "excluir");

  return (
    <>
      <PageHeader
        titulo="Jornadas"
        descricao="Horas por dia da semana usadas no cadastro de colaboradores e no ponto"
        acoes={<JornadasAcoesCabecalho podeCriar={podeCriar} />}
      />
      <JornadasLista
        jornadas={jornadas}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
