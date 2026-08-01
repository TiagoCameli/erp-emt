import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PainelAlertas } from "@/modules/rh/alertas/components/painel-alertas";
import {
  listarAlertasCadastro,
  listarAlertasDocumentos,
  listarAlertasEpiRecolher,
  listarAlertasFerias,
} from "@/modules/rh/alertas/queries";

/**
 * Painel de alertas de RH (1ª aba do módulo, #Task 3): read-only, sem
 * mutação. Exige "ver" em rh.alertas para abrir a aba; cada categoria
 * (documentos, férias, EPI, cadastro) só é buscada e exibida se o usuário
 * também tem "ver" no recurso de origem correspondente (permissão tripla:
 * RLS no banco, esta checagem de Server Component, e o `PainelAlertas`
 * escondendo o que chega `null`).
 */
export default async function PaginaAlertasRh() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.alertas", "ver")) {
    notFound();
  }

  const podeDocumentos = temPermissao(usuario, "rh.documentos", "ver");
  const podeFerias = temPermissao(usuario, "rh.ferias", "ver");
  const podeEpis = temPermissao(usuario, "rh.epis", "ver");
  const podeCadastro = temPermissao(usuario, "cadastros.colaboradores", "ver");

  const [documentos, ferias, epis, cadastros] = await Promise.all([
    podeDocumentos ? listarAlertasDocumentos() : Promise.resolve(null),
    podeFerias ? listarAlertasFerias() : Promise.resolve(null),
    podeEpis ? listarAlertasEpiRecolher() : Promise.resolve(null),
    podeCadastro ? listarAlertasCadastro() : Promise.resolve(null),
  ]);

  return (
    <>
      {/* Cabeçalho na rota, como nas outras abas do módulo: o título não precisa
          mais dizer "de RH" porque a sobrancelha já diz de onde a aba é. */}
      <PageHeader
        modulo="RH"
        titulo="Alertas"
        descricao="Documentos, férias, EPI e cadastro que precisam de atenção"
      />
      <PainelAlertas
        documentos={documentos}
        ferias={ferias}
        epis={epis}
        cadastros={cadastros}
      />
    </>
  );
}
