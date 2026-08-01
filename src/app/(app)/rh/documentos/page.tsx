import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { DocumentosAcoesCabecalho } from "@/modules/rh/documentos/components/acoes-cabecalho";
import { DocumentosTabela } from "@/modules/rh/documentos/components/documentos-tabela";
import { listarDocumentos } from "@/modules/rh/documentos/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaDocumentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.documentos", "ver")) {
    notFound();
  }

  const [documentos, colaboradores] = await Promise.all([
    listarDocumentos(),
    listarColaboradores(),
  ]);

  // Anexos de todos os registros numa consulta só, para o drawer não buscar
  // nada no client.
  const anexosPorRegistro = await listarAnexosPorDocumento(
    "rh_documento",
    documentos.map((registro) => registro.id),
  );

  const podeCriar = temPermissao(usuario, "rh.documentos", "criar");
  const podeEditar = temPermissao(usuario, "rh.documentos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.documentos", "excluir");

  const qtdVencidos = documentos.filter((d) => d.situacao === "vencido").length;
  const qtdAVencer = documentos.filter((d) => d.situacao === "a_vencer").length;

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Documentos e ASO"
        descricao="Documentos por colaborador, com alerta de vencimento de ASO e demais documentos"
        acoes={
          podeCriar ? (
            <DocumentosAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />

      <GradeKpis className="mb-4">
        <KPICard
          titulo="Documentos vencidos"
          valor={qtdVencidos}
          detalhe="Passaram da data de vencimento"
        />
        <KPICard
          titulo="A vencer em 30 dias"
          valor={qtdAVencer}
          detalhe="Vencem nos próximos 30 dias"
        />
      </GradeKpis>

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
