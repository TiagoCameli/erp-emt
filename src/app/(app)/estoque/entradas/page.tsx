import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EntradasAcoesCabecalho } from "@/modules/estoque/components/acoes-cabecalho";
import { EntradasTabela } from "@/modules/estoque/components/entradas-tabela";
import {
  listarEntradas,
  listarItensOcDisponiveis,
  listarLocais,
  type ItemOcDisponivel,
} from "@/modules/estoque/queries";
import { listarInsumosAtivos, type InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

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
  const [entradas, locais, insumos, itensOc] = await Promise.all([
    listarEntradas(),
    listarLocais(),
    preenche ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
    preenche ? listarItensOcDisponiveis() : Promise.resolve<ItemOcDisponivel[]>([]),
  ]);

  const todosLocais = locais.map((l) => ({ id: l.id, nome: l.nome }));
  const locaisAtivos = locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }));

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Entradas"
        descricao="Material que entrou no depósito ou no tanque, avulso ou puxado de uma OC aprovada"
        acoes={
          <EntradasAcoesCabecalho
            podeCriar={podeCriar}
            locais={locaisAtivos}
            insumos={insumos}
            itensOc={itensOc}
          />
        }
      />
      <EntradasTabela
        entradas={entradas}
        locais={todosLocais}
        locaisAtivos={locaisAtivos}
        insumos={insumos}
        itensOc={itensOc}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
