import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarObras } from "@/modules/medicao/_shared/queries";
import { MedicoesAcoesCabecalho } from "@/modules/medicao/medicoes/components/medicoes-acoes-cabecalho";
import { MedicoesTabela } from "@/modules/medicao/medicoes/components/medicoes-tabela";
import {
  listarMedicoes,
  statusParam,
  TAMANHO_PADRAO,
  uuidParam,
} from "@/modules/medicao/medicoes/queries";

export default async function PaginaMedicoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "medicao.medicoes", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "medicao.medicoes", "criar");

  const params = await searchParams;
  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;
  const status = statusParam(params.status);
  const obraId = uuidParam(params.obra);

  const [{ itens, total }, obras] = await Promise.all([
    listarMedicoes({ pagina, tamanho, status, obraId }),
    listarObras(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Medições"
        descricao="Avanço medido do período por planilha contratual. A aprovação gera a fatura."
        acoes={
          podeCriar ? <MedicoesAcoesCabecalho obras={obras} /> : undefined
        }
      />
      <MedicoesTabela
        medicoes={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        obraId={obraId ?? ""}
        obras={obras}
      />
    </>
  );
}
