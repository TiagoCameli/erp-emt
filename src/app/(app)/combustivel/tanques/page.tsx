import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
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
  // O "Esvaziar" do card: a RPC pede combustivel.esvaziamentos/criar.
  const podeEsvaziar = temPermissao(usuario, "combustivel.esvaziamentos", "criar");

  // O dono só aparece no formulário: quem não cria nem edita não paga a leitura dos fornecedores.
  const [tanques, fornecedores] = await Promise.all([
    listarTanques(),
    podeCriar || podeEditar ? listarFornecedoresAtivos() : Promise.resolve<FornecedorOpcao[]>([]),
  ]);

  // O título do módulo e as abas vêm do layout; o título da aba e as ações ficam na lista,
  // porque a contagem acompanha o filtro.
  return (
    <TanquesLista
      tanques={tanques}
      fornecedores={fornecedores}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
      podeEsvaziar={podeEsvaziar}
    />
  );
}
