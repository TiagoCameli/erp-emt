import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EntradasAcoesCabecalho } from "@/modules/estoque/components/acoes-cabecalho";
import { EntradasTabela } from "@/modules/estoque/components/entradas-tabela";
import { listarEntradas, listarItensOcDisponiveis, type ItemOcDisponivel } from "@/modules/estoque/queries";
import { listarDepositos, listarInsumosAtivos, type InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

const RECURSO = "estoque.entradas" as const;

export default async function PaginaEntradasEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const preenche = podeCriar || podeEditar;

  // Insumos (3 mil+) e itens de OC só para quem preenche o formulário.
  const [entradas, depositos, insumos, itensOc] = await Promise.all([
    listarEntradas(),
    listarDepositos(),
    preenche ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
    preenche ? listarItensOcDisponiveis() : Promise.resolve<ItemOcDisponivel[]>([]),
  ]);

  const todosDepositos = depositos.map((d) => ({ id: d.id, nome: d.nome }));
  const depositosAtivos = depositos.filter((d) => d.ativo).map((d) => ({ id: d.id, nome: d.nome }));

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Entradas"
        descricao="Material que entrou no depósito, avulso ou puxado de uma OC aprovada"
        acoes={
          <EntradasAcoesCabecalho
            podeCriar={podeCriar}
            depositos={depositosAtivos}
            insumos={insumos}
            itensOc={itensOc}
          />
        }
      />
      <EntradasTabela
        entradas={entradas}
        depositos={todosDepositos}
        depositosAtivos={depositosAtivos}
        insumos={insumos}
        itensOc={itensOc}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
