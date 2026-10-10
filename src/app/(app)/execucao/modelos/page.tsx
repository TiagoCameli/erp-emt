import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CalendariosTabela } from "@/modules/execucao/modelos/components/calendarios-tabela";
import { FeriadosTabela } from "@/modules/execucao/modelos/components/feriados-tabela";
import { ServicosTabela } from "@/modules/execucao/modelos/components/servicos-tabela";
import {
  excecoesDoCalendario,
  listarCalendarios,
  listarFeriados,
  listarServicos,
  unidadesMedida,
  type Excecao,
} from "@/modules/execucao/modelos/queries";

export default async function PaginaModelos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.modelos", "ver")) notFound();
  const podeCriar = temPermissao(usuario, "execucao.modelos", "criar");
  const podeEditar = temPermissao(usuario, "execucao.modelos", "editar");
  const podeExcluir = temPermissao(usuario, "execucao.modelos", "excluir");

  const [servicos, unidades, calendarios, feriados] = await Promise.all([
    listarServicos(),
    unidadesMedida(),
    listarCalendarios(),
    listarFeriados(),
  ]);
  const listasDeExcecoes = await Promise.all(calendarios.map((c) => excecoesDoCalendario(c.id)));
  const excecoesPorCalendario: Record<string, Excecao[]> = Object.fromEntries(calendarios.map((c, i) => [c.id, listasDeExcecoes[i]]));

  return (
    <>
      <PageHeader
        modulo="Execução"
        titulo="Modelos"
        descricao="Biblioteca de serviços, calendários e feriados que os cronogramas usam como ponto de partida"
      />
      <div className="flex flex-col gap-10">
        <ServicosTabela servicos={servicos} unidades={unidades} podeCriar={podeCriar} podeEditar={podeEditar} />
        <CalendariosTabela calendarios={calendarios} excecoesPorCalendario={excecoesPorCalendario} podeCriar={podeCriar} podeEditar={podeEditar} />
        <FeriadosTabela
          feriados={feriados}
          anoAtual={Number(dataHojeISO().slice(0, 4))}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      </div>
    </>
  );
}
