import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TanquesAcoesCabecalho } from "@/modules/combustivel/tanques/components/tanques-acoes-cabecalho";
import { TanquesLista } from "@/modules/combustivel/tanques/components/tanques-lista";
import {
  listarFornecedoresAtivos,
  listarTanques,
  type FornecedorOpcao,
} from "@/modules/combustivel/tanques/queries";

const RECURSO = "combustivel.tanques" as const;

export default async function PaginaTanques() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  // O dono só aparece no formulário: quem não cria nem edita não paga a leitura dos fornecedores.
  const [tanques, fornecedores] = await Promise.all([
    listarTanques(),
    podeCriar || podeEditar ? listarFornecedoresAtivos() : Promise.resolve<FornecedorOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Tanques"
        descricao="Tanques da EMT e de terceiros, com o nível calculado pelos movimentos"
        acoes={<TanquesAcoesCabecalho podeCriar={podeCriar} fornecedores={fornecedores} />}
      />
      <TanquesLista tanques={tanques} fornecedores={fornecedores} podeEditar={podeEditar} podeExcluir={podeExcluir} />
    </>
  );
}
