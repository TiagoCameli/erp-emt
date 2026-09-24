import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { AbastecimentoDetalheView } from "@/modules/combustivel/abastecimentos/components/abastecimento-detalhe";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";
import {
  buscarAbastecimento,
  listarCombustivelDaUltimaEntrada,
  listarEquipamentos,
  listarTransportadoras,
  type EquipamentoOpcao,
  type TransportadoraOpcao,
} from "@/modules/combustivel/abastecimentos/queries";
import {
  listarInsumosCombustivel,
  listarTanques,
  type InsumoCombustivel,
  type TanqueOpcao,
} from "@/modules/combustivel/entradas/queries";

const RECURSO = "combustivel.saidas" as const;

export default async function PaginaAbastecimento({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const abastecimento = await buscarAbastecimento(id);
  if (!abastecimento) notFound();

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  // As opções do formulário só servem a quem pode editar.
  const [tanques, equipamentos, transportadoras, insumos, centros, combustivelPorTanque, anexos] = await Promise.all([
    podeEditar ? listarTanques() : Promise.resolve<TanqueOpcao[]>([]),
    podeEditar ? listarEquipamentos() : Promise.resolve<EquipamentoOpcao[]>([]),
    podeEditar ? listarTransportadoras() : Promise.resolve<TransportadoraOpcao[]>([]),
    podeEditar ? listarInsumosCombustivel() : Promise.resolve<InsumoCombustivel[]>([]),
    podeEditar ? listarCentrosCusto() : Promise.resolve([]),
    podeEditar ? listarCombustivelDaUltimaEntrada() : Promise.resolve<Record<string, string>>({}),
    // Fotos e arquivos (os migrados da origem também): a RLS dos vínculos pede "ver".
    listarAnexosDoDocumento("combustivel_saida", id),
  ]);

  return (
    <AbastecimentoDetalheView
      abastecimento={abastecimento}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      anexos={anexos}
      opcoes={{
        tanques,
        equipamentos,
        transportadoras,
        insumos,
        obras: obrasParaAlocacao(centros),
        combustivelPorTanque,
      }}
    />
  );
}
