import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FichaColaborador } from "@/modules/cadastros/colaboradores/components/ficha-colaborador";
import {
  buscarColaboradorFicha,
  resumoAdiantamentos,
  resumoDiarias,
  resumoDocumentos,
  resumoEpis,
  resumoFerias,
  resumoOcorrencias,
  resumoPonto,
} from "@/modules/cadastros/colaboradores/ficha";

/**
 * Ficha unificada do colaborador (#13): agrega o resumo de ponto, férias,
 * documentos, EPI, ocorrências, adiantamentos e diárias num lugar só,
 * read-only. Exige "ver" em cadastros.colaboradores para abrir a ficha; cada
 * bloco de RH só é buscado e exibido se o usuário também tem "ver" no
 * recurso correspondente (permissão tripla: aqui é a camada de UI/Server
 * Component, além do RLS no banco).
 */
export default async function PaginaFichaColaborador({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.colaboradores", "ver")) {
    notFound();
  }

  const { id } = await params;
  const colaborador = await buscarColaboradorFicha(id);
  if (!colaborador) notFound();

  const podePonto = temPermissao(usuario, "rh.apontamentos", "ver");
  const podeFerias = temPermissao(usuario, "rh.ferias", "ver");
  const podeDocumentos = temPermissao(usuario, "rh.documentos", "ver");
  const podeEpis = temPermissao(usuario, "rh.epis", "ver");
  const podeOcorrencias = temPermissao(usuario, "rh.ocorrencias", "ver");
  const podeAdiantamentos = temPermissao(usuario, "rh.adiantamentos", "ver");
  const podeDiarias = temPermissao(usuario, "rh.diaristas", "ver");

  const [ponto, ferias, documentos, epis, ocorrencias, adiantamentos, diarias] =
    await Promise.all([
      podePonto ? resumoPonto(id) : Promise.resolve(null),
      podeFerias ? resumoFerias(id) : Promise.resolve(null),
      podeDocumentos ? resumoDocumentos(id) : Promise.resolve(null),
      podeEpis ? resumoEpis(id) : Promise.resolve(null),
      podeOcorrencias ? resumoOcorrencias(id) : Promise.resolve(null),
      podeAdiantamentos ? resumoAdiantamentos(id) : Promise.resolve(null),
      podeDiarias ? resumoDiarias(id) : Promise.resolve(null),
    ]);

  return (
    <FichaColaborador
      colaborador={colaborador}
      ponto={ponto}
      ferias={ferias}
      documentos={documentos}
      epis={epis}
      ocorrencias={ocorrencias}
      adiantamentos={adiantamentos}
      diarias={diarias}
    />
  );
}
