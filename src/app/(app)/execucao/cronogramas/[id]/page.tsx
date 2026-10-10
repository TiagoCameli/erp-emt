import { notFound } from "next/navigation";

import { GradeKpis, KPICard, PageHeader, StatusBadge } from "@/components/canonicos";
import { formatarData, formatarDataHora } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ROTULO_STATUS_CRONOGRAMA, SELO_STATUS_CRONOGRAMA } from "@/modules/execucao/_shared/rotulos";
import { CalendarioDoCronograma, SituacaoCronograma } from "@/modules/execucao/cronogramas/components/acoes-cronograma";
import { EditarCronogramaDrawer } from "@/modules/execucao/cronogramas/components/editar-cronograma-drawer";
import { AtividadesCelular, GradeCronograma } from "@/modules/execucao/cronogramas/components/grade-cronograma";
import { atividadesDoCronograma, cronogramaDetalhe } from "@/modules/execucao/cronogramas/queries";
import { calendarioPorId, excecoesDoCalendario, listarServicos, unidadesMedida } from "@/modules/execucao/modelos/queries";
import { locaisDaObra } from "@/modules/execucao/obras/queries";

export default async function PaginaCronograma({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.cronogramas", "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  // Fora da lista de acesso da obra, a RLS esconde: 404, a existência não vaza.
  const cronograma = await cronogramaDetalhe(id);
  if (!cronograma) notFound();

  const podeCriar = temPermissao(usuario, "execucao.cronogramas", "criar");
  const podeEditar = temPermissao(usuario, "execucao.cronogramas", "editar");
  const podeExcluir = temPermissao(usuario, "execucao.cronogramas", "excluir");
  // O calendário próprio do cronograma só abre para quem pode editar o cronograma.
  const comCalendario = podeEditar && cronograma.calendarioId !== null;

  const [atividades, servicos, unidades, locais, calendario, excecoes] = await Promise.all([
    atividadesDoCronograma(id),
    listarServicos(),
    unidadesMedida(),
    locaisDaObra(cronograma.obraId),
    comCalendario ? calendarioPorId(cronograma.calendarioId!) : Promise.resolve(null),
    comCalendario ? excecoesDoCalendario(cronograma.calendarioId!) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        modulo="Execução"
        voltarPara={{ rota: `/execucao/obras/${cronograma.obraId}`, rotulo: cronograma.obraNome || "Voltar para a obra" }}
        titulo={
          <>
            <span className="font-mono">{cronograma.codigo}</span> · {cronograma.nome}
          </>
        }
        selos={
          <StatusBadge
            status={SELO_STATUS_CRONOGRAMA[cronograma.status] ?? cronograma.status}
            rotulo={ROTULO_STATUS_CRONOGRAMA[cronograma.status] ?? cronograma.status}
          />
        }
        acoes={
          podeEditar ? (
            <>
              <EditarCronogramaDrawer cronograma={cronograma} />
              {calendario ? <CalendarioDoCronograma calendario={calendario} excecoes={excecoes} /> : null}
              <SituacaoCronograma id={cronograma.id} status={cronograma.status} />
            </>
          ) : undefined
        }
      />

      <GradeKpis>
        <KPICard titulo="Início previsto" valor={formatarData(cronograma.inicioPrevisto) || "Sem datas"} />
        <KPICard titulo="Término previsto" valor={formatarData(cronograma.terminoPrevisto) || "Sem datas"} />
        <KPICard titulo="Atividades" valor={cronograma.nAtividades} />
        <KPICard titulo="No caminho crítico" valor={cronograma.nCriticas} />
        <KPICard
          titulo="Datas calculadas em"
          valor={formatarDataHora(cronograma.calculadoEm) || "Ainda não calculadas"}
        />
      </GradeKpis>

      <div className="flex flex-col gap-3 md:hidden">
        <p role="note" className="text-detalhe text-muted-foreground">
          A grade do cronograma é feita para computador. No celular, a lista abaixo é só leitura
        </p>
        <AtividadesCelular atividades={atividades} />
      </div>
      <div className="hidden md:block">
        <GradeCronograma
          cronogramaId={cronograma.id}
          atividades={atividades}
          servicos={servicos.map((s) => ({ id: s.id, codigo: s.codigo }))}
          unidades={unidades.map((u) => ({ id: u.id, sigla: u.sigla }))}
          locais={locais.map((l) => ({ id: l.id, codigo: l.codigo }))}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      </div>
    </div>
  );
}
