import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AcessoObra } from "@/modules/execucao/obras/components/acesso-obra";
import { ConfigurarObraDrawer } from "@/modules/execucao/obras/components/configurar-obra-drawer";
import { CronogramasDaObra } from "@/modules/execucao/obras/components/cronogramas-da-obra";
import { LocaisTabela } from "@/modules/execucao/obras/components/locais-tabela";
import { listarCronogramas } from "@/modules/execucao/cronogramas/queries";
import { calendariosModelo, locaisDaObra, pastaDaObra, usuariosDaObra } from "@/modules/execucao/obras/queries";
import { ROTULO_TIPO_OBRA } from "@/modules/execucao/_shared/rotulos";

export default async function PaginaObra({ params }: { params: Promise<{ obraId: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.obras", "ver")) notFound();

  const { obraId } = await params;
  if (!idSchema.safeParse(obraId).success) notFound();

  const podeCriar = temPermissao(usuario, "execucao.cronogramas", "criar");
  const podeEditar = temPermissao(usuario, "execucao.cronogramas", "editar");
  const podeExcluir = temPermissao(usuario, "execucao.cronogramas", "excluir");

  // Sem pasta, ou fora da lista de acesso (a RLS esconde): 404, a existência não vaza.
  const [obra, locais, cronogramas, usuarios, calendarios] = await Promise.all([
    pastaDaObra(obraId),
    locaisDaObra(obraId),
    listarCronogramas({ obraId }),
    podeEditar ? usuariosDaObra(obraId) : Promise.resolve([]),
    podeEditar ? calendariosModelo() : Promise.resolve([]),
  ]);
  if (!obra) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        modulo="Execução"
        voltarPara={{ rota: "/execucao/obras", rotulo: "Obras" }}
        titulo={obra.obraNome}
        selos={<StatusBadge status={obra.tipoObra} rotulo={ROTULO_TIPO_OBRA[obra.tipoObra] ?? obra.tipoObra} discreto />}
        acoes={podeEditar ? <ConfigurarObraDrawer obra={obra} calendarios={calendarios} /> : undefined}
      />
      <CronogramasDaObra cronogramas={cronogramas} />
      <LocaisTabela
        obraId={obraId}
        tipoObra={obra.tipoObra}
        locais={locais}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
      {podeEditar ? <AcessoObra obraId={obraId} usuarios={usuarios} /> : null}
    </div>
  );
}
