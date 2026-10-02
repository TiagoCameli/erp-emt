import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { ContratoDetalhe } from "@/modules/medicao/contratos/components/contrato-detalhe";
import {
  carregarContrato,
  listarAditivos,
  listarUsuariosAtivos,
  listarUsuariosDoContrato,
  trilhaContrato,
} from "@/modules/medicao/contratos/queries";
import { carregarConfigReajuste } from "@/modules/medicao/reajuste/queries";

const RECURSO = "medicao.contratos" as const;
const RECURSO_REAJUSTE = "medicao.reajuste" as const;

export default async function PaginaContrato({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  // A RLS já esconde o contrato fora da lista de acesso (D3): fora da lista é
  // 404, e não "sem permissão" (a existência do contrato não vaza).
  const contrato = await carregarContrato(id);
  if (!contrato) notFound();

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  // Contrato na lixeira: quem não pode excluir (a mesma permissão que abre a lixeira na
  // lista) também não vê o detalhe dele. Mesmo raciocínio do 404 acima: existência não vaza.
  if (contrato.excluido_em !== null && !podeExcluir) notFound();
  const podeRestaurar = podeExcluir && temPermissao(usuario, "administracao.lixeira", "editar");

  // Reajuste (Fase 6): a seção e o dado dela só para quem tem `medicao.reajuste/ver`; a RLS da
  // config deixaria ler quem só vê o contrato.
  const podeVerReajuste = temPermissao(usuario, RECURSO_REAJUSTE, "ver");
  const podeEditarReajuste = podeVerReajuste && temPermissao(usuario, RECURSO_REAJUSTE, "editar");

  const [usuarios, usuariosAtivos, aditivos, anexos, trilha, configReajuste] = await Promise.all([
    listarUsuariosDoContrato(id),
    podeEditar ? listarUsuariosAtivos() : Promise.resolve([]),
    listarAditivos(id),
    listarAnexosDoDocumento("mc_contrato", id),
    trilhaContrato(id),
    podeVerReajuste ? carregarConfigReajuste(id) : Promise.resolve(null),
  ]);

  return (
    <ContratoDetalhe
      contrato={contrato}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      podeRestaurar={podeRestaurar}
      usuarios={usuarios}
      usuariosAtivos={usuariosAtivos}
      aditivos={aditivos}
      anexos={anexos}
      trilha={trilha}
      reajuste={configReajuste ? { config: configReajuste, podeEditar: podeEditarReajuste } : null}
    />
  );
}
