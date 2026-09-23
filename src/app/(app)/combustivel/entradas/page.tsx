import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EntradasAcoesCabecalho } from "@/modules/combustivel/entradas/components/entradas-acoes-cabecalho";
import { EntradasTabela } from "@/modules/combustivel/entradas/components/entradas-tabela";
import {
  listarEntradas,
  listarFornecedoresAtivos,
  listarInsumosCombustivel,
  listarTanques,
  type InsumoCombustivel,
  type Opcao,
} from "@/modules/combustivel/entradas/queries";

const RECURSO = "combustivel.entradas" as const;

export default async function PaginaEntradasCombustivel() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const carregaFormulario = podeCriar || podeEditar;

  const [entradas, tanques, insumos, fornecedores] = await Promise.all([
    listarEntradas(),
    listarTanques(),
    carregaFormulario ? listarInsumosCombustivel() : Promise.resolve<InsumoCombustivel[]>([]),
    carregaFormulario ? listarFornecedoresAtivos() : Promise.resolve<Opcao[]>([]),
  ]);

  // Entrada nunca vai para tanque externo (o estoque é do dono): nem o filtro nem o
  // formulário oferecem.
  const tanquesDaEmt = tanques.filter((tanque) => !tanque.ehExterno);
  const tanquesParaLancar = tanquesDaEmt.filter((tanque) => tanque.ativo);

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Entradas"
        descricao="Combustível que entrou nos tanques por nota fiscal. Cada entrada é uma camada do PEPS do tanque"
        acoes={
          <EntradasAcoesCabecalho
            podeCriar={podeCriar}
            tanques={tanquesParaLancar}
            insumos={insumos}
            fornecedores={fornecedores}
          />
        }
      />
      <EntradasTabela
        entradas={entradas}
        tanquesFiltro={tanquesDaEmt.map((tanque) => ({
          id: tanque.id,
          nome: tanque.ativo ? tanque.rotulo : `${tanque.rotulo} (inativo)`,
        }))}
        tanquesEdicao={tanquesParaLancar}
        insumos={insumos}
        fornecedores={fornecedores}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
