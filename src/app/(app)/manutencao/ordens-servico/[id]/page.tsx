import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarColaboradores,
  listarDepositosAlmoxarifado,
  listarEquipamentos,
  listarFornecedores,
  listarInsumos,
} from "@/modules/manutencao/_shared/queries";
import { OsDetalheView } from "@/modules/manutencao/ordens-servico/components/os-detalhe";
import {
  buscarOrdem,
  trilhaOrdem,
} from "@/modules/manutencao/ordens-servico/queries";

export default async function PaginaOrdemServicoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.ordens-servico", "ver")) {
    notFound();
  }

  const { id } = await params;
  const ordem = await buscarOrdem(id);
  if (!ordem) notFound();

  const [trilha, insumos, depositos, colaboradores, fornecedores, equipamentos] =
    await Promise.all([
      trilhaOrdem(id),
      listarInsumos(),
      listarDepositosAlmoxarifado(),
      listarColaboradores(),
      listarFornecedores(),
      listarEquipamentos(),
    ]);

  const podeEditar = temPermissao(
    usuario,
    "manutencao.ordens-servico",
    "editar",
  );

  // Controle do equipamento da OS define qual leitura de fechamento mostrar.
  const controlePor =
    equipamentos.find((eq) => eq.id === ordem.equipamentoId)?.controlePor ??
    "nenhum";

  return (
    <OsDetalheView
      ordem={ordem}
      trilha={trilha}
      controlePor={controlePor}
      insumos={insumos}
      depositos={depositos}
      colaboradores={colaboradores}
      fornecedores={fornecedores}
      podeEditar={podeEditar}
    />
  );
}
