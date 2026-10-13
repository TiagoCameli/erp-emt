import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TanquesLista } from "@/modules/combustivel/tanques/components/tanques-lista";
import {
  listarFornecedoresAtivos,
  listarTanques,
  type FornecedorOpcao,
} from "@/modules/combustivel/tanques/queries";

const RECURSO = "estoque.tanques" as const;

/**
 * Cadastro dos tanques. Desde 13/10/2026 o tanque é criado aqui; entradas, abastecimentos,
 * transferências e esvaziamentos continuam no Combustível, que é quem mexe no nível.
 */
export default async function PaginaTanquesEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");

  // O dono só aparece no formulário: quem não cria nem edita não paga a leitura dos fornecedores.
  const [tanques, fornecedores] = await Promise.all([
    listarTanques("todos"),
    podeCriar || podeEditar ? listarFornecedoresAtivos() : Promise.resolve<FornecedorOpcao[]>([]),
  ]);

  return (
    <TanquesLista
      tanques={tanques}
      fornecedores={fornecedores}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      titulo="Tanques"
      descricao="O nível muda pelas entradas e abastecimentos do módulo Combustível"
      abreDetalhe={temPermissao(usuario, "combustivel.tanques", "ver")}
    />
  );
}
