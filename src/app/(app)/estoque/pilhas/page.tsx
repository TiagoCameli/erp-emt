import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PilhasAcoesCabecalho } from "@/modules/estoque/pilhas/components/pilhas-acoes-cabecalho";
import { PilhasTabela } from "@/modules/estoque/pilhas/components/pilhas-tabela";
import { listarPilhas } from "@/modules/estoque/pilhas/queries";
import { listarInsumosAtivos, type InsumoOpcao } from "@/modules/manutencao/almoxarifado/queries";

const RECURSO = "estoque.pilhas" as const;

/**
 * Pilhas de agregado (areia, brita). A entrada e a saída são as do Estoque, como no tanque
 * de material; quando a pilha zera, o banco a deixa inativa.
 */
export default async function PaginaPilhasEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");

  // Insumos (3 mil+) só para quem preenche o formulário.
  const [pilhas, insumos] = await Promise.all([
    listarPilhas(),
    podeCriar || podeEditar ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Pilhas"
        descricao="Pilhas de agregado. A entrada e a saída são feitas nas abas Entradas e Saídas; a pilha que zera fica inativa"
        acoes={<PilhasAcoesCabecalho podeCriar={podeCriar} insumos={insumos} />}
      />
      <PilhasTabela
        pilhas={pilhas}
        insumos={insumos}
        podeEditar={podeEditar}
        podeExcluir={temPermissao(usuario, RECURSO, "excluir")}
      />
    </>
  );
}
