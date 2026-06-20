import { notFound } from "next/navigation";

import { KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarEquipamentos } from "@/modules/manutencao/_shared/queries";
import { AcoesCabecalho } from "@/modules/manutencao/planos-preventivos/components/acoes-cabecalho";
import { AtribuicoesTabela } from "@/modules/manutencao/planos-preventivos/components/atribuicoes-tabela";
import { PlanosTabela } from "@/modules/manutencao/planos-preventivos/components/planos-tabela";
import {
  listarAtribuicoes,
  listarPlanos,
} from "@/modules/manutencao/planos-preventivos/queries";

export default async function PaginaPlanosPreventivos() {
  const usuario = await getUsuarioLogado();
  if (
    !usuario ||
    !temPermissao(usuario, "manutencao.planos-preventivos", "ver")
  ) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "manutencao.planos-preventivos", "criar");
  const podeEditar = temPermissao(
    usuario,
    "manutencao.planos-preventivos",
    "editar",
  );
  const podeGerarOs = temPermissao(usuario, "manutencao.ordens-servico", "criar");

  const [planos, atribuicoes, equipamentos] = await Promise.all([
    listarPlanos(),
    listarAtribuicoes(),
    listarEquipamentos(),
  ]);

  const vencidos = atribuicoes.filter((a) => a.status === "vencido").length;

  return (
    <>
      <PageHeader
        titulo="Planos preventivos"
        descricao="Modelos de manutenção preventiva, atribuição aos equipamentos e previsão da próxima manutenção."
        acoes={
          podeCriar || podeEditar ? (
            <AcoesCabecalho
              equipamentos={equipamentos}
              planos={planos}
              podeCriar={podeCriar}
              podeEditar={podeEditar}
            />
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:max-w-xs">
        <KPICard
          titulo="Manutenções vencidas"
          valor={vencidos}
          detalhe={
            vencidos === 0
              ? "Tudo em dia"
              : `${vencidos} de ${atribuicoes.length} atribuições`
          }
        />
      </div>

      <section className="mb-8 flex flex-col gap-4">
        <div className="min-w-0">
          <h2 className="text-secao font-semibold text-foreground">
            Equipamentos com plano
          </h2>
          <p className="text-detalhe text-muted-foreground">
            Previsão da próxima manutenção por atividade. Gere a OS quando uma
            atividade vencer.
          </p>
        </div>
        <AtribuicoesTabela
          atribuicoes={atribuicoes}
          podeEditar={podeEditar}
          podeGerarOs={podeGerarOs}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="min-w-0">
          <h2 className="text-secao font-semibold text-foreground">
            Modelos de plano
          </h2>
          <p className="text-detalhe text-muted-foreground">
            Cada plano agrupa as atividades e o intervalo de manutenção.
          </p>
        </div>
        <PlanosTabela
          planos={planos}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
        />
      </section>
    </>
  );
}
