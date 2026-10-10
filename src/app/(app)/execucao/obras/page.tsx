import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { NovoCronogramaDrawer } from "@/modules/execucao/obras/components/novo-cronograma-drawer";
import { PastasGrade } from "@/modules/execucao/obras/components/pastas-grade";
import { calendariosModelo, listarPastas, obrasDisponiveis } from "@/modules/execucao/obras/queries";

export default async function PaginaObras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.obras", "ver")) notFound();
  const podeCriar = temPermissao(usuario, "execucao.cronogramas", "criar");
  const [pastas, obras, calendarios] = await Promise.all([
    listarPastas(),
    podeCriar ? obrasDisponiveis() : Promise.resolve([]),
    podeCriar ? calendariosModelo() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        modulo="Execução"
        titulo="Obras"
        descricao="Uma pasta para cada obra com cronograma. Você só vê as obras em que está na lista de acesso"
        acoes={podeCriar ? <NovoCronogramaDrawer obras={obras} calendarios={calendarios} /> : undefined}
      />
      <PastasGrade pastas={pastas} podeCriar={podeCriar} obras={obras} calendarios={calendarios} />
    </>
  );
}
