import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FeriasAcoesCabecalho } from "@/modules/rh/ferias/components/ferias-acoes-cabecalho";
import { FeriasTabela } from "@/modules/rh/ferias/components/ferias-tabela";
import { listarFerias } from "@/modules/rh/ferias/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaFerias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.ferias", "ver")) {
    notFound();
  }

  const [ferias, colaboradores] = await Promise.all([
    listarFerias(),
    listarColaboradores(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.ferias", "criar");
  const podeEditar = temPermissao(usuario, "rh.ferias", "editar");
  const podeExcluir = temPermissao(usuario, "rh.ferias", "excluir");

  const vencidas = ferias.filter((item) => item.situacao === "vencida").length;
  const aVencer = ferias.filter((item) => item.situacao === "a_vencer").length;

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Férias"
        descricao="Períodos aquisitivos e gozo de férias por colaborador, com alerta de vencimento"
        acoes={
          podeCriar ? (
            <FeriasAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />

      {/* mb-4 porque a grade encostava na tabela: o main não tem gap. */}
      <GradeKpis className="mb-4">
        <KPICard
          titulo="Férias vencidas"
          valor={vencidas}
          detalhe="Passaram do limite de gozo e ainda programadas"
        />
        <KPICard
          titulo="A vencer (60 dias)"
          valor={aVencer}
          detalhe="Faltam 60 dias ou menos para o limite"
        />
      </GradeKpis>

      <FeriasTabela
        ferias={ferias}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
