import { notFound } from "next/navigation";
import { z } from "zod";

import { MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarObras, listarUnidades } from "@/modules/medicao/_shared/queries";
import { AcoesCabecalho } from "@/modules/medicao/planilha-contratual/components/acoes-cabecalho";
import { ItensAcoesCabecalho } from "@/modules/medicao/planilha-contratual/components/itens-acoes-cabecalho";
import { ItensTabela } from "@/modules/medicao/planilha-contratual/components/itens-tabela";
import { PlanilhasTabela } from "@/modules/medicao/planilha-contratual/components/planilhas-tabela";
import {
  buscarPlanilha,
  listarItens,
  listarPlanilhas,
} from "@/modules/medicao/planilha-contratual/queries";

const RECURSO = "medicao.planilha-contratual" as const;
const uuidSchema = z.uuid();

/** Monta o rótulo da obra com o lote, quando houver. */
function rotuloObra(nome: string, lote: string | null): string {
  return lote ? `${nome} (Lote ${lote})` : nome;
}

export default async function PaginaPlanilhaContratual({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  const params = await searchParams;
  const planilhaParam = Array.isArray(params.planilha)
    ? params.planilha[0]
    : params.planilha;
  const planilhaId = uuidSchema.safeParse(planilhaParam);

  // Visão de itens: uma planilha escolhida.
  if (planilhaId.success) {
    const [planilha, obras, unidades] = await Promise.all([
      buscarPlanilha(planilhaId.data),
      listarObras(),
      listarUnidades(),
    ]);

    if (!planilha) notFound();

    const itens = await listarItens(planilha.id);
    const valorContratual = itens.reduce((total, item) => total + item.valor, 0);

    return (
      <>
        <PageHeader
          titulo={planilha.nome}
          descricao={rotuloObra(planilha.obraNome, planilha.obraLote)}
          acoes={
            <ItensAcoesCabecalho
              planilha={planilha}
              obras={obras}
              podeEditar={podeEditar}
            />
          }
        />

        <div className="mb-4 flex flex-wrap gap-6 text-detalhe">
          <div>
            <p className="text-legenda text-muted-foreground">Itens</p>
            <p className="tabular-nums font-medium">{itens.length}</p>
          </div>
          <div>
            <p className="text-legenda text-muted-foreground">
              Valor contratual
            </p>
            <MoneyText valor={valorContratual} className="font-medium" />
          </div>
        </div>

        <ItensTabela
          planilhaId={planilha.id}
          itens={itens}
          unidades={unidades}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      </>
    );
  }

  // Visão de lista: todas as planilhas.
  const [planilhas, obras] = await Promise.all([
    listarPlanilhas(),
    listarObras(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Planilha contratual"
        descricao="Itens contratados de cada obra: quantidades, preços e saldos."
        acoes={podeCriar ? <AcoesCabecalho obras={obras} /> : undefined}
      />
      <PlanilhasTabela
        planilhas={planilhas}
        obras={obras}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
