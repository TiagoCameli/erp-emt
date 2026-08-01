import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EncargosAcoesCabecalho } from "@/modules/rh/encargos/components/encargos-acoes-cabecalho";
import { EncargosLista } from "@/modules/rh/encargos/components/encargos-lista";
import { listarEncargos } from "@/modules/rh/encargos/queries";

export default async function PaginaEncargos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.encargos", "ver")) {
    notFound();
  }

  const encargos = await listarEncargos();

  const ativos = encargos.filter((encargo) => encargo.ativo);
  const percentualTotal = ativos.reduce(
    (soma, encargo) => soma + encargo.percentual,
    0,
  );

  const podeCriar = temPermissao(usuario, "rh.encargos", "criar");
  const podeEditar = temPermissao(usuario, "rh.encargos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.encargos", "excluir");

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo="Encargos da folha"
        descricao="Encargos e alíquotas usados no cálculo da folha de pagamento"
        acoes={<EncargosAcoesCabecalho podeCriar={podeCriar} />}
      />
      {/* O percentual total é exatamente o que a geração da folha grava em
          `folhas.encargos_percentual` (soma dos ativos), então o cartão
          responde "por que o custo da folha deu isso" sem abrir a folha. */}
      {encargos.length > 0 ? (
        <GradeKpis className="mb-4">
          <KPICard
            titulo="Encargos ativos"
            valor={ativos.length}
            detalhe={`De ${encargos.length} cadastrado${encargos.length === 1 ? "" : "s"}`}
          />
          <KPICard
            titulo="Percentual total aplicado"
            valor={formatarPercentual(percentualTotal, 3)}
            detalhe="Soma dos encargos ativos, usada no cálculo da folha"
          />
        </GradeKpis>
      ) : null}

      <EncargosLista
        encargos={encargos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
