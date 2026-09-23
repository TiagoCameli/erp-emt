import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { osEditavel } from "@/modules/manutencao/_shared/rotulos";
import { OsDetalheView } from "@/modules/manutencao/servicos/components/os-detalhe";
import {
  buscarOs,
  listarEquipamentosParaOs,
  listarFornecedoresAtivos,
  listarLinhasOs,
  listarSaldosParaOs,
  trilhaOs,
  type SaldosParaOs,
} from "@/modules/manutencao/servicos/queries";

const RECURSO = "manutencao.servicos" as const;

const SEM_SALDOS: SaldosParaOs = { pecas: [], oleos: [] };

export default async function PaginaOsDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const os = await buscarOs(id);
  if (!os) notFound();

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  // As listas dos formulários só servem quando dá para editar esta OS agora.
  const carregaFormularios = podeEditar && osEditavel(os.status);

  const [linhas, trilha, equipamentos, centros, fornecedores, saldos] = await Promise.all([
    listarLinhasOs(id),
    trilhaOs(id, { id: usuario.id, nome: usuario.nome }),
    carregaFormularios ? listarEquipamentosParaOs() : Promise.resolve([]),
    carregaFormularios ? listarCentrosCusto() : Promise.resolve([]),
    carregaFormularios ? listarFornecedoresAtivos() : Promise.resolve([]),
    carregaFormularios ? listarSaldosParaOs() : Promise.resolve(SEM_SALDOS),
  ]);

  return (
    <OsDetalheView
      os={os}
      linhas={linhas}
      trilha={trilha}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      equipamentos={equipamentos}
      centros={centros}
      fornecedores={fornecedores}
      saldos={saldos}
    />
  );
}
