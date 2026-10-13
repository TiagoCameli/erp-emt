import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TanquesLista } from "@/modules/combustivel/tanques/components/tanques-lista";
import { listarTanques, type FornecedorOpcao } from "@/modules/combustivel/tanques/queries";

const RECURSO = "combustivel.tanques" as const;

export default async function PaginaTanques() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  // Desde 13/10/2026 o tanque é criado e editado no Estoque (`estoque.tanques`); aqui o
  // Combustível só lista, com o atalho para quem pode cuidar do cadastro.
  const podeCriar = false;
  const podeEditar = false;
  const podeExcluir = false;
  const cuidaDoCadastro = temPermissao(usuario, "estoque.tanques", "ver");
  // O "Esvaziar" do card: a RPC pede combustivel.esvaziamentos/criar.
  const podeEsvaziar = temPermissao(usuario, "combustivel.esvaziamentos", "criar");

  // O dono só aparece no formulário: quem não cria nem edita não paga a leitura dos fornecedores.
  const tanques = await listarTanques();
  const fornecedores: FornecedorOpcao[] = [];

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
      descricao={
        cuidaDoCadastro
          ? "Os tanques são criados e editados em Estoque > Tanques"
          : "Os tanques são criados e editados no módulo Estoque"
      }
    />
  );
}
