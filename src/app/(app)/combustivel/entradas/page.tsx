import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TituloAba } from "@/modules/combustivel/_shared/components/titulo-aba";
import { EntradasTabela } from "@/modules/combustivel/entradas/components/entradas-tabela";
import { lerFiltrosEntradas } from "@/modules/combustivel/entradas/filtros";
import {
  listarEntradas,
  listarFornecedoresAtivos,
  listarInsumosCombustivel,
  listarTanques,
  type EntradaLinha,
  type InsumoCombustivel,
  type Opcao,
} from "@/modules/combustivel/entradas/queries";

const RECURSO = "combustivel.entradas" as const;

export default async function PaginaEntradasCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const carregaFormulario = podeCriar || podeEditar;
  // Restaurar é a Lixeira da origem: pede editar a Lixeira e excluir na aba (a
  // fn_comb_restaurar confere as duas de novo).
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;
  // Sem `de`/`ate` na URL é qualquer data, como no resto do ERP. Os últimos 30 dias da
  // origem eram reinjetados aqui, e limpar o período nunca desligava o filtro (24/09/2026).
  const filtrosUrl = lerFiltrosEntradas(await searchParams);

  const [entradas, excluidas, tanques, insumos, fornecedores] = await Promise.all([
    listarEntradas(),
    podeRestaurar ? listarEntradas(true) : Promise.resolve<EntradaLinha[]>([]),
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
      <TituloAba titulo="Entradas" />
      <EntradasTabela
        entradas={entradas}
        excluidas={excluidas}
        podeRestaurar={podeRestaurar}
        filtrosUrl={filtrosUrl}
        tanquesFiltro={tanquesDaEmt.map((tanque) => ({
          id: tanque.id,
          nome: tanque.ativo ? tanque.rotulo : `${tanque.rotulo} (inativo)`,
        }))}
        tanquesEdicao={tanquesParaLancar}
        insumos={insumos}
        fornecedores={fornecedores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
