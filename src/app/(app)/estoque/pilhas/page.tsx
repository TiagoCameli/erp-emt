import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PilhasAcoesCabecalho } from "@/modules/estoque/pilhas/components/pilhas-acoes-cabecalho";
import { PilhasTabela } from "@/modules/estoque/pilhas/components/pilhas-tabela";
import { listarPilhas } from "@/modules/estoque/pilhas/queries";
import { listarLocalidadesAtivas } from "@/modules/frete/fretes/queries";
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
  const preenche = podeCriar || podeEditar;
  const [pilhas, insumos, localidades] = await Promise.all([
    listarPilhas(),
    preenche ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
    preenche ? listarLocalidadesAtivas() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Pilhas"
        descricao="Pilhas de agregado. O frete que chega no local entra sozinho na pilha; a pilha que zera fica inativa"
        acoes={<PilhasAcoesCabecalho podeCriar={podeCriar} insumos={insumos} localidades={localidades} />}
      />
      <PilhasTabela
        pilhas={pilhas}
        insumos={insumos}
        localidades={localidades}
        podeEditar={podeEditar}
        podeExcluir={temPermissao(usuario, RECURSO, "excluir")}
      />
    </>
  );
}
