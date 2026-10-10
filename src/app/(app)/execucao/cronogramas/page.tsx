import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { STATUS_CRONOGRAMA, type StatusCronograma } from "@/modules/execucao/_shared/rotulos";
import { CronogramasTabela } from "@/modules/execucao/cronogramas/components/cronogramas-tabela";
import { listarCronogramas } from "@/modules/execucao/cronogramas/queries";
import { NovoCronogramaDrawer } from "@/modules/execucao/obras/components/novo-cronograma-drawer";
import { calendariosModelo, listarPastas, obrasDisponiveis } from "@/modules/execucao/obras/queries";

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

export default async function PaginaCronogramas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.cronogramas", "ver")) notFound();
  const podeCriar = temPermissao(usuario, "execucao.cronogramas", "criar");

  const params = await searchParams;
  const obraParam = primeiro(params.obra);
  const statusParam = primeiro(params.status);
  const obraId = idSchema.safeParse(obraParam).success ? obraParam : "";
  const status = (STATUS_CRONOGRAMA as readonly string[]).includes(statusParam) ? (statusParam as StatusCronograma) : "";

  const [cronogramas, pastas, obras, calendarios] = await Promise.all([
    listarCronogramas({ obraId: obraId || undefined, status: status || undefined }),
    listarPastas(),
    podeCriar ? obrasDisponiveis() : Promise.resolve([]),
    podeCriar ? calendariosModelo() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Execução"
        titulo="Cronogramas"
        descricao="Cronogramas das obras em que você está na lista de acesso"
        acoes={podeCriar ? <NovoCronogramaDrawer obras={obras} calendarios={calendarios} /> : undefined}
      />
      <CronogramasTabela
        cronogramas={cronogramas}
        obraId={obraId}
        status={status}
        obrasFiltro={pastas.map((p) => ({ id: p.obraId, nome: p.obraNome }))}
        podeCriar={podeCriar}
        obras={obras}
        calendarios={calendarios}
      />
    </>
  );
}
