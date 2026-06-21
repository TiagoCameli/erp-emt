import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarEquipamentos } from "@/modules/manutencao/_shared/queries";
import { OrdensTabela } from "@/modules/manutencao/ordens-servico/components/ordens-tabela";
import { OsAcoesCabecalho } from "@/modules/manutencao/ordens-servico/components/os-acoes-cabecalho";
import {
  listarOrdens,
  statusParam,
  TAMANHO_PADRAO,
  uuidParam,
} from "@/modules/manutencao/ordens-servico/queries";

export default async function PaginaOrdensServico({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.ordens-servico", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.ordens-servico", "criar");

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
  const equipamentoId = uuidParam(params.equipamento);

  const [{ itens, total }, equipamentos] = await Promise.all([
    listarOrdens({ pagina, tamanho, status, equipamentoId }),
    listarEquipamentos(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Ordens de serviço"
        descricao="Manutenções corretivas e preventivas da frota, com peças, mão de obra e terceiros."
        acoes={
          podeCriar ? (
            <OsAcoesCabecalho equipamentos={equipamentos} />
          ) : undefined
        }
      />
      <OrdensTabela
        ordens={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        equipamentoId={equipamentoId ?? ""}
        equipamentos={equipamentos}
      />
    </>
  );
}
