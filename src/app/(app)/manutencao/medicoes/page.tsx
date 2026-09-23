import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { MedicoesAcoesCabecalho } from "@/modules/manutencao/medicoes/components/medicoes-acoes-cabecalho";
import { MedicoesTabela } from "@/modules/manutencao/medicoes/components/medicoes-tabela";
import {
  listarEquipamentosComMedicao,
  listarMedicoes,
  TAMANHO_PADRAO,
} from "@/modules/manutencao/medicoes/queries";
import { paramData, paramPagina, paramUuid } from "@/modules/manutencao/medicoes/schemas";

export default async function PaginaMedicoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.medicoes", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.medicoes", "criar");
  const podeEditar = temPermissao(usuario, "manutencao.medicoes", "editar");

  const params = await searchParams;
  const pagina = paramPagina(params.pagina);
  const tamanhoParam = Number(params.tamanho);
  // Mesmo teto da query (500), para a paginação da tabela casar com o que veio.
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0 ? Math.min(tamanhoParam, 500) : TAMANHO_PADRAO;
  const equipamentoId = paramUuid(params.equipamento);
  // Período invertido troca de lado: senão a lista volta vazia sem dizer por quê.
  let de = paramData(params.de);
  let ate = paramData(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];

  const [{ itens, total }, equipamentos] = await Promise.all([
    listarMedicoes({ pagina, tamanho, equipamentoId, de, ate }),
    listarEquipamentosComMedicao(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Horímetro e km"
        descricao="Leituras de horímetro e quilometragem dos equipamentos"
        acoes={<MedicoesAcoesCabecalho podeCriar={podeCriar} equipamentos={equipamentos} />}
      />
      <MedicoesTabela
        medicoes={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        equipamentoId={equipamentoId ?? ""}
        de={de ?? ""}
        ate={ate ?? ""}
        equipamentos={equipamentos}
        podeEditar={podeEditar}
      />
    </>
  );
}
