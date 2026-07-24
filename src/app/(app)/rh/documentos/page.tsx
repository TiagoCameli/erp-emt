import { notFound } from "next/navigation";

import { KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorRegistro } from "@/modules/compras/_shared/anexos-actions";
import { DocumentosAcoesCabecalho } from "@/modules/rh/documentos/components/acoes-cabecalho";
import { DocumentosTabela } from "@/modules/rh/documentos/components/documentos-tabela";
import { listarDocumentos } from "@/modules/rh/documentos/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaDocumentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.documentos", "ver")) {
    notFound();
  }

  const [documentos, colaboradores, anexosPorRegistro] = await Promise.all([
    listarDocumentos(),
    listarColaboradores(),
    listarAnexosPorRegistro("rh_documentos"),
  ]);

  const podeCriar = temPermissao(usuario, "rh.documentos", "criar");
  const podeEditar = temPermissao(usuario, "rh.documentos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.documentos", "excluir");

  const qtdVencidos = documentos.filter((d) => d.situacao === "vencido").length;
  const qtdAVencer = documentos.filter((d) => d.situacao === "a_vencer").length;

  return (
    <>
      <PageHeader
        titulo="Documentos e ASO"
        descricao="Documentos por colaborador, com alerta de vencimento de ASO e demais documentos"
        acoes={
          podeCriar ? (
            <DocumentosAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <KPICard titulo="Documentos vencidos" valor={qtdVencidos} />
        <KPICard titulo="A vencer em 30 dias" valor={qtdAVencer} />
      </div>

      <DocumentosTabela
        documentos={documentos}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        anexosPorRegistro={anexosPorRegistro}
      />
    </>
  );
}
