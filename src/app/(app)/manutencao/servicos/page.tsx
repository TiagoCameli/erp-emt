import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { NovaOsBotao } from "@/modules/manutencao/servicos/components/nova-os-botao";
import { ServicosTabela } from "@/modules/manutencao/servicos/components/servicos-tabela";
import { lerFiltrosServicos } from "@/modules/manutencao/servicos/filtros";
import {
  listarEquipamentosParaFiltro,
  listarEquipamentosParaOs,
  listarServicos,
} from "@/modules/manutencao/servicos/queries";

const RECURSO = "manutencao.servicos" as const;

export default async function PaginaServicos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const filtros = lerFiltrosServicos(await searchParams);

  const [lista, equipamentosFiltro, equipamentosOs, centros] = await Promise.all([
    listarServicos(filtros),
    listarEquipamentosParaFiltro(),
    podeCriar ? listarEquipamentosParaOs() : Promise.resolve([]),
    podeCriar ? listarCentrosCusto() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Caderno de serviços"
        descricao="Ordens de serviço dos equipamentos: peças, óleos e terceiros, com o custo de cada OS"
        acoes={podeCriar ? <NovaOsBotao equipamentos={equipamentosOs} centros={centros} /> : undefined}
      />
      <ServicosTabela
        ordens={lista.itens}
        total={lista.total}
        custoDoFiltro={lista.custoDoFiltro}
        pagina={filtros.pagina}
        tamanho={filtros.tamanho}
        status={filtros.status}
        equipamentoId={filtros.equipamentoId ?? ""}
        tipo={filtros.tipo ?? ""}
        conclusaoDe={filtros.conclusaoDe ?? ""}
        conclusaoAte={filtros.conclusaoAte ?? ""}
        busca={filtros.busca ?? ""}
        equipamentos={equipamentosFiltro}
        idUsuario={usuario.id}
      />
    </>
  );
}
