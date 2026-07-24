import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorRegistro } from "@/modules/compras/_shared/anexos-actions";
import { OcorrenciasAcoesCabecalho } from "@/modules/rh/ocorrencias/components/ocorrencias-acoes-cabecalho";
import { OcorrenciasTabela } from "@/modules/rh/ocorrencias/components/ocorrencias-tabela";
import { listarOcorrencias } from "@/modules/rh/ocorrencias/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaOcorrencias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.ocorrencias", "ver")) {
    notFound();
  }

  const [ocorrencias, colaboradores, anexosPorRegistro] = await Promise.all([
    listarOcorrencias(),
    listarColaboradores(),
    listarAnexosPorRegistro("rh_ocorrencias"),
  ]);

  const podeCriar = temPermissao(usuario, "rh.ocorrencias", "criar");
  const podeEditar = temPermissao(usuario, "rh.ocorrencias", "editar");
  const podeExcluir = temPermissao(usuario, "rh.ocorrencias", "excluir");

  return (
    <>
      <PageHeader
        titulo="Ausências e ocorrências"
        descricao="Advertências, suspensões, atestados, acidentes e elogios por colaborador"
        acoes={
          podeCriar ? (
            <OcorrenciasAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />
      <OcorrenciasTabela
        ocorrencias={ocorrencias}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        anexosPorRegistro={anexosPorRegistro}
      />
    </>
  );
}
