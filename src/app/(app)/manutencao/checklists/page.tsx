import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarColaboradores,
  listarEquipamentos,
} from "@/modules/manutencao/_shared/queries";
import { ChecklistsAcoesCabecalho } from "@/modules/manutencao/checklists/components/checklists-acoes-cabecalho";
import { ChecklistsTabela } from "@/modules/manutencao/checklists/components/checklists-tabela";
import { ExecucoesTabela } from "@/modules/manutencao/checklists/components/execucoes-tabela";
import { ExecutarChecklist } from "@/modules/manutencao/checklists/components/executar-checklist";
import {
  listarChecklists,
  listarChecklistsAtivos,
  listarExecucoes,
  statusParam,
  TAMANHO_PADRAO,
  uuidParam,
} from "@/modules/manutencao/checklists/queries";

export default async function PaginaChecklists({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.checklists", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.checklists", "criar");
  const podeEditar = temPermissao(usuario, "manutencao.checklists", "editar");

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

  const [modelos, checklistsAtivos, execucoes, equipamentos, colaboradores] =
    await Promise.all([
      listarChecklists(),
      listarChecklistsAtivos(),
      listarExecucoes({ pagina, tamanho, status, equipamentoId }),
      listarEquipamentos(),
      listarColaboradores(),
    ]);

  return (
    <>
      <PageHeader
        titulo="Checklists"
        descricao="Modelos de checklist pré-uso, execução em campo e histórico de inspeções da frota."
        acoes={podeEditar ? <ChecklistsAcoesCabecalho /> : undefined}
      />

      <div className="flex flex-col gap-8">
        {podeCriar ? (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-secao font-semibold">Executar checklist</h2>
              <p className="text-detalhe text-muted-foreground">
                Escolha o checklist e o equipamento, responda cada item e envie.
              </p>
            </div>
            <div className="max-w-2xl">
              <ExecutarChecklist
                checklistsAtivos={checklistsAtivos}
                equipamentos={equipamentos}
                colaboradores={colaboradores}
              />
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-secao font-semibold">Histórico</h2>
          <ExecucoesTabela
            execucoes={execucoes.itens}
            total={execucoes.total}
            pagina={pagina}
            tamanho={tamanho}
            status={status ?? ""}
            equipamentoId={equipamentoId ?? ""}
            equipamentos={equipamentos}
          />
        </section>

        {podeEditar ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-secao font-semibold">Modelos</h2>
            <ChecklistsTabela modelos={modelos} podeEditar={podeEditar} />
          </section>
        ) : null}
      </div>
    </>
  );
}
